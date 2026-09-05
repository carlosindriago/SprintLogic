"""Regression test for _build_project_tree_sync, extracted out of audit_doc
while moving its os.walk off the event loop (see docs/audits/action-plan).

Kept as one synchronous function specifically because os.walk's ignored-dir
pruning (`dirs[:] = ...`) only works against the live generator; this test
guards against a future refactor accidentally materializing os.walk() into a
list first, which would walk (and pay the I/O cost of) ignored directories
like node_modules before any pruning could happen.
"""

from pathlib import Path

from app.interfaces.api.v1.doc_studio import _build_project_tree_sync


def test_prunes_ignored_dirs_without_descending_into_them(tmp_path: Path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('hi')")

    ignored = tmp_path / "node_modules"
    ignored.mkdir()
    # If pruning didn't work, os.walk would descend here and this file would
    # show up in the tree.
    (ignored / "should_not_appear.js").write_text("// noise")

    tree = _build_project_tree_sync(tmp_path, ignored_dirs={"node_modules"})

    assert "main.py" in tree
    assert "node_modules" not in tree
    assert "should_not_appear.js" not in tree


def test_truncates_extremely_large_trees(tmp_path: Path):
    for i in range(2000):
        (tmp_path / f"file_{i}.txt").write_text("")

    tree = _build_project_tree_sync(tmp_path, ignored_dirs=set())

    assert len(tree) <= 10000
