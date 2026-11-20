"""Offline unit tests for Stage 1–3 hotspot research, trends, video extraction, social adapters & prompt injection."""
import json
import unittest
from unittest.mock import patch

import httpx

from services.accounts.model_settings import LLM
from services.workflow import ideation, manuscript, research, social_providers, trends
from services.workflow.providers import ProviderError


def _fake_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler), trust_env=False)


class ResearchTests(unittest.TestCase):
    def test_tavily_search_filters_platforms_and_detects_domains(self):
        captured = {}

        def handler(req: httpx.Request):
            captured['url'] = str(req.url)
            captured['body'] = json.loads(req.content)
            return httpx.Response(200, json={
                'answer': 'RAG 近期焦点在混合检索与重排。',
                'results': [
                    {'title': '一文搞懂 RAG 混合检索', 'url': 'https://mp.weixin.qq.com/s/abc123',
                     'content': '实测显示 BM25 + 向量召回更稳。', 'score': 0.92, 'published_date': '2026-11-18'},
                    {'title': 'Why RAG fails in prod', 'url': 'https://x.com/ai_builder/status/1',
                     'content': 'Chunking matters more than model size.', 'score': 0.85},
                ],
            })

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                out = research.search_hot_sources(
                    'RAG 优化', platforms=['wechat', 'x'], time_range='week',
                    max_results=5, client=client, api_key='tvly-test', env={'TAVILY_API_KEY': 'tvly-test'})
        self.assertIn('mp.weixin.qq.com', captured['body']['include_domains'])
        self.assertIn('x.com', captured['body']['include_domains'])
        self.assertEqual(len(out['items']), 2)
        self.assertEqual(out['items'][0]['platform'], 'wechat')
        self.assertEqual(out['items'][0]['platform_label'], '公众号')
        self.assertEqual(out['items'][1]['platform'], 'x')
        self.assertEqual(out['providers'], ['tavily'])

    def test_search_requires_tavily_key_when_no_social_provider(self):
        with _fake_client(lambda req: httpx.Response(200, json={})) as client:
            with self.assertRaises(ProviderError) as ctx:
                research.search_hot_sources('RAG', client=client, api_key='', env={})
        self.assertEqual(ctx.exception.code, 'missing_setting')

    def test_extract_url_prefers_bilibili_view_api_and_youtube_captions(self):
        def bili_handler(req: httpx.Request):
            self.assertIn('bvid=BV1xx411c7mD', str(req.url))
            return httpx.Response(200, json={
                'data': {
                    'title': '10分钟讲透 Agent 工作流',
                    'owner': {'name': '技术UP'},
                    'desc': '从 Tool Calling 到反思循环。',
                    'stat': {'view': 125000, 'like': 8900, 'coin': 3200, 'favorite': 5400},
                    'pages': [{'part': '背景'}, {'part': '实战'}],
                }
            })

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(bili_handler) as client:
                item = research.extract_url_content('https://www.bilibili.com/video/BV1xx411c7mD', client=client, env={})
        self.assertEqual(item['platform'], 'bilibili')
        self.assertEqual(item['provider'], 'bilibili_view')
        self.assertIn('12.5万', item['metrics'])
        self.assertIn('背景 / 实战', item['content'])

        def yt_handler(req: httpx.Request):
            if 'timedtext' in str(req.url):
                return httpx.Response(200, text='<transcript><text>First hook sentence.</text><text>Second point.</text></transcript>')
            payload = json.dumps({
                'videoDetails': {'title': 'Agent Design', 'author': 'Builder', 'shortDescription': 'Overview', 'viewCount': '50000'},
                'captions': {'playerCaptionsTracklistRenderer': {'captionTracks': [
                    {'languageCode': 'en', 'baseUrl': 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ'}
                ]}},
            })
            return httpx.Response(200, text=f'<html><script>var ytInitialPlayerResponse = {payload};</script></html>')

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(yt_handler) as client:
                yt = research.extract_url_content('https://youtu.be/dQw4w9WgXcQ', client=client, env={})
        self.assertEqual(yt['provider'], 'youtube_captions')
        self.assertIn('First hook sentence.', yt['content'])

    def test_analyze_viral_brief_and_inject_into_ideation_and_manuscript(self):
        llm = LLM(base_url='https://api.deepseek.com', api_key='sk-test', model='deepseek-flash', source='env', version=0)
        brief_json = {
            'facts': ['实测混合检索比纯向量召回稳定（公众号：一文搞懂 RAG）', '切分策略比换大模型影响更大（X）'],
            'hooks': ['为什么你搭的 RAG 总是答非所问？90% 的人第一步就做错了。', '别再盲目换大模型了，问题出在检索！'],
            'pain_points': ['文档切太碎导致上下文断裂', '召回结果顺序混乱'],
            'pacing': '前 3 秒抛出答非所问痛点 → 对比纯向量 vs 混合检索 → 展示 3 步优化实操 → 总结避坑清单。',
        }
        seen_prompts = []

        def handler(req: httpx.Request):
            body = json.loads(req.content)
            seen_prompts.append(body['messages'][-1]['content'])
            if '爆款参考简报' in body['messages'][0]['content']:
                content = json.dumps(brief_json, ensure_ascii=False)
            elif '教学视频的选题策划' in body['messages'][0]['content']:
                content = json.dumps({'angles': [{
                    'title': 'RAG 总答错？3 步混合检索搞定', 'hook': '为什么你的 RAG 总答非所问？',
                    'audience': '开发者', 'takeaway': '掌握混合检索与重排',
                    'structure': 'problem', 'depth': 'intermediate', 'duration_min': 3,
                    'chapters': ['痛点引入', '混合检索原理', '实操避坑'],
                }]}, ensure_ascii=False)
            else:
                content = '为什么你的 RAG 总答非所问？其实问题往往不在大模型，而在切分和混合检索。'
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]})

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                brief = research.analyze_viral_brief(
                    llm, client, topic='RAG 避坑', viral_style='short_video',
                    sources=[{'title': '一文搞懂 RAG', 'platform': 'wechat', 'content': 'BM25 加向量召回'}])
                self.assertEqual(brief['viral_style'], 'short_video')
                self.assertEqual(len(brief['facts']), 2)
                angles = ideation.generate_angles(llm, client, topic='RAG 避坑', count=1, research=brief)
                self.assertEqual(len(angles), 1)
                text = manuscript.generate_manuscript('RAG 避坑', llm, client, research=brief)
                self.assertIn('混合检索', text)
        # Both ideation and manuscript prompts received the deconstructed viral brief.
        self.assertIn('强钩子短视频节奏', seen_prompts[1])
        self.assertIn('真实事实与案例弹药', seen_prompts[2])

    def test_trends_aggregates_bilibili_hn_github_gracefully(self):
        def handler(req: httpx.Request):
            u = str(req.url)
            if 'popular' in u:
                return httpx.Response(200, json={'data': {'list': [
                    {'bvid': 'BV1aa411c7mD', 'title': '热门AI视频', 'owner': {'name': 'UP'}, 'desc': '简介', 'stat': {'view': 20000, 'like': 500}}
                ]}})
            if 'topstories' in u:
                return httpx.Response(200, json=[42])
            if '/item/42.json' in u:
                return httpx.Response(200, json={'title': 'Show HN: Fast Video Engine', 'url': 'https://example.com/hn', 'score': 320, 'descendants': 88})
            if 'repositories' in u:
                return httpx.Response(200, json={'items': [
                    {'full_name': 'org/repo', 'description': 'AI tool', 'html_url': 'https://github.com/org/repo', 'stargazers_count': 1200, 'language': 'Python', 'created_at': '2026-11-18T00:00:00Z'}
                ]})
            return httpx.Response(500)

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                res = trends.fetch_trends('all', client=client, limit=10, env={})
        self.assertEqual(len(res['items']), 3)
        self.assertEqual(set(res['sources']), {'bilibili', 'hackernews', 'github'})

    def test_tikhub_adapter_parses_douyin_and_xhs_when_configured(self):
        def handler(req: httpx.Request):
            u = str(req.url)
            if 'douyin' in u:
                return httpx.Response(200, json={'data': {'data': [{'aweme_info': {
                    'aweme_id': '7001', 'desc': '3分钟搞懂MCP协议 #AI',
                    'author': {'nickname': '极客'}, 'statistics': {'digg_count': 45000, 'comment_count': 600, 'collect_count': 12000},
                }}]}})
            return httpx.Response(200, json={'data': {'items': [{'id': 'n1', 'note_card': {
                'display_title': '小红书爆款AI笔记', 'desc': '保姆级教程',
                'user': {'nickname': '博主'}, 'interact_info': {'liked_count': '3200', 'collected_count': '1800', 'comment_count': '90'},
            }}]}})

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                items, providers = social_providers.search_social_platforms(
                    'MCP', ['douyin', 'xiaohongshu'], max_results=4, client=client, env={'TIKHUB_API_KEY': 'tk-test'})
        self.assertEqual(len(items), 2)
        self.assertEqual(providers, ['tikhub_douyin', 'tikhub_xhs'])
        self.assertIn('4.5万', items[0]['metrics'])
        self.assertEqual(items[1]['platform'], 'xiaohongshu')

    def test_platform_pitches_hooks_and_de_ai_polish(self):
        llm = LLM(base_url='https://api.deepseek.com', api_key='sk-test', model='deepseek-flash', source='env', version=0)
        brief = {
            'facts': ['混合检索比纯向量召回稳定'],
            'hooks': ['为什么你的 RAG 总是答非所问？'],
            'pain_points': ['切分破坏上下文'],
            'pacing': '痛点开场 → 对比 → 实操',
            'viral_style': 'short_video',
            'sources': [],
        }
        md_source = '## [s1] 开场\n\n### 口播\n综上所述，首先我们来看看 RAG。\n\n### 画面素材\n纯向量 vs 混合检索\n\n### 画面意图\n说到混合检索时展示对比卡片。'

        def handler(req: httpx.Request):
            sys_prompt = json.loads(req.content)['messages'][0]['content']
            if '多平台爆款内容策划总监' in sys_prompt:
                content = json.dumps({'pitches': [
                    {'platform': 'douyin', 'platform_name': '抖音 · 60秒', 'duration_hint': '1分钟', 'teaching_style': 'popular',
                     'title': '60秒看懂 RAG 避坑', 'cover_text': 'RAG 90%做错了', 'hook': '你搭的 RAG 为什么总答错？',
                     'angle_summary': '强反差开场直接给答案', 'notes': '按抖音快节奏写，强调切分痛点'},
                    {'platform': 'xiaohongshu', 'platform_name': '小红书 · 2.5分钟', 'duration_hint': '2.5分钟', 'teaching_style': 'popular',
                     'title': 'RAG 避坑清单', 'cover_text': '3步救活RAG', 'hook': '做 RAG 别再踩这 3 个坑了',
                     'angle_summary': '清单式干货避坑', 'notes': '突出 3 条可抄作业的步骤'},
                    {'platform': 'bilibili', 'platform_name': 'B站 · 5分钟深讲', 'duration_hint': '5分钟', 'teaching_style': 'technical',
                     'title': '从原理到实战：RAG 混合检索拆解', 'cover_text': '混合检索深拆', 'hook': '换了最强模型 RAG 还是不准？',
                     'angle_summary': '深挖 BM25 + 向量 + Rerank', 'notes': '讲清召回与重排机制'},
                ]}, ensure_ascii=False)
            elif '开场钩子专家' in sys_prompt:
                content = json.dumps({'hooks': [
                    {'type': 'contrarian', 'label': '反常识冲击', 'cover_line': '别再换大模型了', 'opening': '你以为 RAG 答错是模型太笨？其实九成问题出在检索第一步。', 'why': '直接打破惯性认知'},
                    {'type': 'pain', 'label': '痛点扎心', 'cover_line': 'RAG 总答非所问', 'opening': '辛辛苦苦喂了几百份文档，一问还是胡说八道，你是不是也遇到过？', 'why': '精准命中一线痛点'},
                    {'type': 'suspense', 'label': '悬念提问', 'cover_line': '多加一步准3倍', 'opening': '同样一份知识库，为什么别人只多加了一个动作，准确率就翻倍？', 'why': '用结果差制造悬念'},
                ]}, ensure_ascii=False)
            else:
                content = json.dumps({'sections': [{
                    'id': 's1', 'title': '开场',
                    'narration': '你搭的 RAG 是不是总答非所问？咱们直接看原因。',
                    'materials': '纯向量 vs 混合检索',
                    'visual_intent': '说到混合检索时展示对比卡片。',
                }]}, ensure_ascii=False)
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]})

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                pitches = research.generate_platform_pitches(llm, client, topic='RAG 避坑', brief=brief)
                self.assertEqual([p['platform'] for p in pitches], ['douyin', 'xiaohongshu', 'bilibili'])
                hooks = manuscript.generate_hooks('RAG 避坑', md_source, llm, client, research=brief)
                self.assertEqual(len(hooks), 3)
                polished = manuscript.polish_manuscript(md_source, llm, client, manuscript_format='markdown')
                self.assertIn('答非所问', polished)
                self.assertIn('### 画面素材', polished)
                self.assertNotIn('综上所述', polished)

    def test_rewrite_section_critique_publish_kit_and_persona_injection(self):
        llm = LLM(base_url='https://api.deepseek.com', api_key='sk-test', model='deepseek-flash', source='env', version=0)
        persona = {'name': '犀利架构师', 'audience_call': '各位工程师', 'tone': '直接犀利、短句为主', 'banned_words': '总而言之'}
        md = (
            '## [s1] 痛点\n\n### 口播\n第一段原口播。\n\n### 画面素材\n对比图\n\n### 画面意图\n展示对比图。\n\n'
            '## [s2] 原理\n\n### 口播\n第二段原口播。\n\n### 画面素材\n无\n\n### 画面意图\n展示原理。'
        )
        seen = []

        def handler(req: httpx.Request):
            body = json.loads(req.content)
            sys_p = body['messages'][0]['content']
            seen.append(body['messages'][-1]['content'])
            if '局部修改的那一段' in sys_p:
                out = {'id': 's2', 'title': '原理拆解', 'narration': '各位工程师，核心就在两步检索。', 'materials': 'Step1 BM25 -> Step2 向量', 'visual_intent': '说到两步检索时依次点亮两步流程。'}
            elif '毒舌审稿' in sys_p:
                out = {'overall_score': 86, 'scores': {'hook': 80, 'density': 90, 'pacing': 88, 'visual': 86},
                       'verdict': '干货扎实，但第2段画面素材需要补强。',
                       'issues': [{'section': '第2段', 'problem': '画面素材为空', 'fix': '补充流程图节点'}]}
            else:
                out = {'titles': ['标题1', '标题2', '标题3', '标题4', '标题5'], 'cover_main': 'RAG 避坑指南',
                       'cover_sub': '3步准确率翻倍', 'summary': '一文讲透混合检索与重排。',
                       'tags': ['AI', 'RAG', '大模型'], 'pinned_comment': '你用 RAG 踩过最大的坑是什么？评论区聊聊！'}
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(out, ensure_ascii=False)}}]})

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                rewritten = manuscript.rewrite_section('RAG', md, 's2', '加流程图素材', llm, client, persona=persona)
                self.assertIn('第一段原口播。', rewritten)
                self.assertIn('Step1 BM25 -> Step2 向量', rewritten)
                self.assertIn('犀利架构师', seen[0])
                critique = manuscript.critique_manuscript('RAG', rewritten, llm, client)
                self.assertEqual(critique['overall_score'], 86)
                kit = manuscript.generate_publish_kit('RAG', rewritten, llm, client, platform='bilibili')
                self.assertEqual(len(kit['titles']), 5)
                self.assertEqual(kit['cover_main'], 'RAG 避坑指南')

    def test_convert_long_article_to_storyboard_manuscript(self):
        llm = LLM(base_url='https://api.deepseek.com', api_key='sk-test', model='deepseek-flash', source='env', version=0)
        article = '深度解析 MCP 协议：为什么所有 AI Agent 都在接入它？传统函数调用需要为每个工具单独写胶水代码，而 MCP 统一了上下文协议。'

        def handler(req: httpx.Request):
            out = {'sections': [{
                'id': 's1', 'title': '为什么全行业都在接 MCP',
                'narration': '还在给每个工具手写胶水代码？MCP 一招把接口全统一了。',
                'materials': '传统 N×M 胶水代码 vs MCP 统一协议',
                'visual_intent': '说到胶水代码时展示杂乱连线，切到 MCP 时收束为统一总线。',
            }]}
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(out, ensure_ascii=False)}}]})

        with patch('services.workflow.destination.checked_address', return_value='1.1.1.1'):
            with _fake_client(handler) as client:
                res = manuscript.convert_article_to_manuscript(
                    article, llm, client, duration_hint='2分钟', teaching_style='popular', manuscript_format='markdown')
        self.assertEqual(res['title'], '为什么全行业都在接 MCP')
        self.assertIn('## [s1] 为什么全行业都在接 MCP', res['text'])
        self.assertIn('传统 N×M 胶水代码 vs MCP 统一协议', res['text'])


if __name__ == '__main__':
    unittest.main()
