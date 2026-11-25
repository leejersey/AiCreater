import json
import re
import unittest
from unittest.mock import MagicMock, patch

from services.workflow.providers import ProviderError


class ContentSkillTests(unittest.TestCase):
    def test_lines_join_without_a_separator_and_a_hard_break_is_a_newline(self):
        from services.workflow.content_skills import parse
        version, description, template = parse('---\nname: demo\nversion: 3\ndescription: 演示\n---\n\n第一句。\n第二句：  \n{  \n  "a": 1  \n}\n', 'demo')
        self.assertEqual((version, description), (3, '演示'))
        self.assertEqual(template, '第一句。第二句：\n{\n  "a": 1\n}')
        for bad in ('no front matter', '---\nname: other\nversion: 1\ndescription: x\n---\nbody', '---\nname: demo\nversion: one\ndescription: x\n---\nbody',
                    '---\nname: demo\nversion: 1\n---\nbody', '---\nname: demo\nversion: 1\ndescription: x\n---\n\n'):
            with self.assertRaises(ValueError, msg=bad): parse(bad, 'demo')

    def test_placeholders_must_be_filled_exactly(self):
        from services.workflow.content_skills import Skill
        s = Skill('demo', 1, 'd', '每章 10–{{max}} 秒，结构取自 {{list}}。', 'h')
        self.assertEqual(s.prompt(max=110, list='A、B'), '每章 10–110 秒，结构取自 A、B。')
        with self.assertRaises(KeyError): s.prompt(max=110)
        with self.assertRaises(KeyError): s.prompt(max=110, list='A', extra=1)
        self.assertEqual(s.stamp(), {'name': 'demo', 'version': 1, 'sha256': 'h'})

    def test_every_skill_loads_and_fills_with_the_values_its_caller_gives(self):
        from services.workflow import content_skills as cs, ideation
        names = cs.names()
        self.assertGreaterEqual(len(names), 13)
        values = {'ideation-angles': {'structures': 'x'}, 'ideation-outline': {'max_chapter_seconds': ideation.MAX_CHAPTER_SECONDS}}
        for name in names:
            s = cs.skill(name)
            self.assertEqual(s.name, name); self.assertGreaterEqual(s.version, 1); self.assertRegex(s.sha256, '^[0-9a-f]{64}$')
            prompt = s.prompt(**values.get(name, {}))
            self.assertNotIn('{{', prompt, name)
        with self.assertRaises(ValueError): cs.skill('../secrets')

    def test_the_methods_are_read_from_the_skill_files(self):
        from services.workflow import content_skills as cs, ideation, manuscript, research
        self.assertEqual(manuscript._CRITIQUE_SYSTEM, cs.skill('critique').prompt())
        self.assertEqual(research._ANALYZE_SYSTEM, cs.skill('hotspot-brief').prompt())
        self.assertIn('问题驱动', ideation._ANGLES_SYSTEM)                     # structures filled in by the caller
        self.assertIn(f'10–{ideation.MAX_CHAPTER_SECONDS} 的整数', ideation._OUTLINE_SYSTEM)

    def test_an_adapted_skill_is_registered_with_its_license(self):
        from services.workflow import content_skills as cs
        notice = (cs.SKILLS_ROOT / 'NOTICE.md').read_text(encoding='utf-8')
        for name in cs.names():
            head = (cs.SKILLS_ROOT / name / 'SKILL.md').read_text(encoding='utf-8').split('\n---\n', 1)[0]
            source = re.search(r'^adapted_from:\s*(\S+?)@([0-9a-f]{7,40})', head, re.M)
            if source:
                self.assertIn(source.group(1), notice, name); self.assertIn(source.group(2), notice, name)
        self.assertEqual(notice.count('MIT License'), 2)  # full text of both confirmed upstreams


class CallJsonTests(unittest.TestCase):
    def setUp(self):
        patcher = patch('services.workflow.destination.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))])
        patcher.start(); self.addCleanup(patcher.stop)

    def llm(self, **change):
        from services.accounts.model_settings import LLM
        return LLM(**{'base_url': 'https://api.deepseek.com', 'api_key': 'sk', 'model': 'deepseek-flash', 'source': 'env', 'version': None, **change})

    def reply(self, content):
        return MagicMock(status_code=200, content=b'{}', json=lambda: {'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]})

    def check(self, value):
        if value.get('ok') is not True: raise ValueError('ok must be true')
        return value

    def test_a_failed_check_is_asked_once_more_with_the_reason(self):
        from services.workflow.content_skills import call_json
        client = MagicMock(); client.post.side_effect = [self.reply('{"ok": false}'), self.reply('{"ok": true}')]
        self.assertEqual(call_json(self.llm(), client, '系统', '用户', self.check, 'demo', max_tokens=123), {'ok': True})
        body = client.post.call_args.kwargs['json']
        self.assertEqual((body['max_tokens'], body['response_format'], body['thinking']), (123, {'type': 'json_object'}, {'type': 'disabled'}))
        self.assertIn('ok must be true', body['messages'][-1]['content'])

    def test_two_failures_raise_with_the_stage_label_and_no_key_makes_no_call(self):
        from services.workflow.content_skills import call_json
        client = MagicMock(); client.post.side_effect = [self.reply('不是 JSON'), self.reply('{"ok": false}')]
        with self.assertRaises(ProviderError) as ctx:
            call_json(self.llm(), client, 's', 'u', self.check, 'manuscript_critique', stage='manuscript')
        self.assertEqual((ctx.exception.stage, ctx.exception.code), ('manuscript', 'invalid_response'))
        client = MagicMock()
        with self.assertRaises(ProviderError) as ctx: call_json(self.llm(api_key=''), client, 's', 'u', self.check, 'demo')
        self.assertEqual(ctx.exception.code, 'missing_setting'); client.post.assert_not_called()

    def test_the_old_helpers_keep_their_labels_and_budgets(self):
        from services.workflow import ideation, manuscript
        with patch('services.workflow.ideation.call_json', return_value={'ok': True}) as run:
            ideation._chat(self.llm(), None, 's', 'u', self.check, 'ideas_angles', 'u1')
        self.assertEqual(run.call_args.kwargs, {'max_tokens': 4096, 'user_id': 'u1'})
        with patch('services.workflow.manuscript.call_json', return_value={'ok': True}) as run:
            manuscript._call_json_llm(self.llm(), None, 's', 'u', self.check, 'manuscript_critique', max_tokens=2000, user_id='u1')
        self.assertEqual(run.call_args.kwargs, {'stage': 'manuscript', 'max_tokens': 2000, 'user_id': 'u1'})


if __name__ == '__main__':
    unittest.main()
