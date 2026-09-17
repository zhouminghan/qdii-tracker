#!/bin/sh
# 启用本地 pre-commit 钩子：每次 commit 前自动运行 doc_sync，防止文档滞后。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git config core.hooksPath .githooks
echo "✅ core.hooksPath = .githooks"
echo "   现在每次 git commit 前都会自动执行 .githooks/pre-commit（doc_sync）"
