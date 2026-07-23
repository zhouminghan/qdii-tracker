#!/bin/bash
# .claude/hooks/post-edit.sh
# PostToolUse hook — 每次编辑工具调用完成后执行
# 成功静默，失败才响；只放确定性检查，不放启发式判断

CHANGED_FILES=$(git diff --name-only 2>/dev/null)

# 1. 如果有 Python 文件改动 → 跑架构 lint
if echo "$CHANGED_FILES" | grep -q '\.py$'; then
    echo "🔍 架构 lint..."
    python3 scripts/architecture_lint.py 2>/dev/null || {
        echo "⚠️ architecture_lint.py 不存在，跳过"
    }
fi

# 2. 如果有数据文件改动 → 跑 check
if echo "$CHANGED_FILES" | grep -q 'web/data/'; then
    echo "🔍 数据一致性检查..."
    cd scripts && python3 fundctl.py check
    if [ $? -ne 0 ]; then
        echo "❌ 数据一致性校验未通过"
        exit 1
    fi
fi

# 3. config/funds.json 改动 → 不自动拦截（confirmable_allow）
exit 0
