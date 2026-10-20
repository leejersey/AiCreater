"""Offline content checks, not claims of model factual accuracy or real duration."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2] / 'examples/lessons/full'


class FullLessonTests(unittest.TestCase):
    def script(self, name):
        path = ROOT / name
        self.assertTrue(path.is_file(), 'Missing full lesson: ' + name)
        text = path.read_text()
        self.assertTrue(text.strip())
        self.assertLessEqual(len(text), 4000)
        return text

    def test_python_course_covers_state_result_and_common_mistakes(self):
        text = self.script('python-loop.txt')
        for point in ['为什么', '总和设为零', '取出二', '总和变成二', '取出三', '总和变成五',
                      '输出五', '循环外', '缩进', '空列表']:
            with self.subTest(point=point): self.assertIn(point, text)
        self.assertNotIn('会执行用户代码', text)

    def test_rag_course_keeps_conditions_and_retrieval_failure_boundary(self):
        text = self.script('rag.txt')
        for point in ['为什么', '未拆封', '七天', '配送', '不相关', '上下文', '来源',
                      '不是重新训练', '无法确定', '不保证', '示例规则']:
            with self.subTest(point=point): self.assertIn(point, text)


if __name__ == '__main__': unittest.main()
