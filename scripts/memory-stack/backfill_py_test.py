#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path


def load_module():
    module_path = Path(__file__).with_name("backfill.py")
    spec = importlib.util.spec_from_file_location("memory_stack_backfill", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed loading module spec: {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class BackfillTests(unittest.TestCase):
    def test_chunk_markdown_heading_aware(self):
        mod = load_module()

        content = """# Root\n\nintro\n\n## Section A\n\na-1\n\n### Detail\n\na-2\n\n## Section B\n\nb-1\n"""
        chunks = mod.chunk_markdown("memory/people/muqihang.md", content, max_chars=120)

        headings = [chunk["heading"] for chunk in chunks]
        self.assertIn("Root", headings)
        self.assertIn("Root / Section A", headings)
        self.assertIn("Root / Section A / Detail", headings)
        self.assertIn("Root / Section B", headings)

    def test_deterministic_chunk_id(self):
        mod = load_module()
        first = mod.chunk_id(
            "memory/projects/jarvis-os.md",
            "project.jarvis_os / Objective",
            "Build Jarvis OS into a self-improving AI-native organization architecture.",
        )
        second = mod.chunk_id(
            "memory/projects/jarvis-os.md",
            "project.jarvis_os / Objective",
            "Build   Jarvis OS\ninto a self-improving AI-native organization architecture.",
        )
        third = mod.chunk_id(
            "memory/projects/jarvis-os.md",
            "project.jarvis_os / Scope",
            "Build Jarvis OS into a self-improving AI-native organization architecture.",
        )

        self.assertEqual(first, second)
        self.assertNotEqual(first, third)

    def test_phase_file_collection(self):
        mod = load_module()

        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            resolved_root = root.resolve()
            (root / "memory" / "people").mkdir(parents=True)
            (root / "memory" / "projects").mkdir(parents=True)
            (root / "memory" / "decisions").mkdir(parents=True)
            (root / "memory" / "context").mkdir(parents=True)
            (root / "memory" / "topics").mkdir(parents=True)

            (root / "MEMORY.md").write_text("# index\n", encoding="utf-8")
            (root / "memory" / "people" / "u.md").write_text("# u\n", encoding="utf-8")
            (root / "memory" / "projects" / "p.md").write_text("# p\n", encoding="utf-8")
            (root / "memory" / "decisions" / "d.md").write_text("# d\n", encoding="utf-8")
            (root / "memory" / "context" / "c.md").write_text("# c\n", encoding="utf-8")
            (root / "memory" / "topics" / "t.md").write_text("# t\n", encoding="utf-8")
            today_name = f"{date.today().isoformat()}.md"
            (root / "memory" / today_name).write_text("# daily\n", encoding="utf-8")

            canonical = mod.collect_phase_files(root, "canonical", 14)
            topics = mod.collect_phase_files(root, "topics", 14)
            daily = mod.collect_phase_files(root, "daily", 40000)

            canonical_set = {str(path.relative_to(resolved_root)) for path in canonical}
            topics_set = {str(path.relative_to(resolved_root)) for path in topics}
            daily_set = {str(path.relative_to(resolved_root)) for path in daily}

            self.assertIn("MEMORY.md", canonical_set)
            self.assertIn("memory/people/u.md", canonical_set)
            self.assertIn("memory/projects/p.md", canonical_set)
            self.assertIn("memory/decisions/d.md", canonical_set)
            self.assertIn("memory/context/c.md", canonical_set)
            self.assertEqual(topics_set, {"memory/topics/t.md"})
            self.assertIn(f"memory/{today_name}", daily_set)

    def test_reconciliation_precedence(self):
        mod = load_module()

        state = {"semantic_owner": {}}
        mod.apply_semantic_owner(state, "key-x", "canonical", "cid-1")
        mod.apply_semantic_owner(state, "key-x", "topic_derived", "cid-2")

        owner = state["semantic_owner"]["key-x"]
        self.assertEqual(owner["source_tier"], "canonical")
        self.assertEqual(owner["chunk_id"], "cid-1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
