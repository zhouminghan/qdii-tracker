"""architecture_lint 目录纪律 + import 方向回归单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from checks.architecture_lint import run_import_lint, run_lint  # noqa: E402


def test_import_direction_has_no_violations():
    """当前树不应存在违反分层方向的 import（防未来回归）。"""
    assert run_import_lint() == []


def test_directory_and_import_lint_pass():
    """web/ 目录纪律与 scripts/ 依赖方向联合校验应全绿。"""
    assert run_lint() == []
