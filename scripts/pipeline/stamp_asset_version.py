"""统一改写 web/index.html 中本地 JS 资源的 ?v= 版本戳。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from core.constants import ROOT_DIR

INDEX_HTML = ROOT_DIR / "web" / "index.html"
ASSET_VERSION_PATTERN = re.compile(r"(\./js/[^\"'\n?]+\.js\?v=)([^\"'\n]+)")


def stamp_asset_versions(target_file: Path, version: str) -> int:
    content = target_file.read_text(encoding="utf-8")
    # 用 lambda 避免 version 以数字开头时被 re.subn 误解释为反向引用 \NN
    new_content, count = ASSET_VERSION_PATTERN.subn(lambda m: m.group(1) + version, content)
    if count:
        target_file.write_text(new_content, encoding="utf-8")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="统一改写 index.html 里的 JS 版本戳")
    parser.add_argument("--version", required=True, help="要写入的版本号，例如 git sha")
    parser.add_argument("--target", default=str(INDEX_HTML), help="目标 index.html 路径")
    args = parser.parse_args()

    target = Path(args.target).resolve()
    count = stamp_asset_versions(target, args.version)
    print(f"✅ 已更新 {count} 处资源版本戳 -> {args.version}")


if __name__ == "__main__":
    main()
