---
name: fund-diagnose
description: QDII Tracker 数据健康检查。当用户说"检查数据""诊断""有没有异常""数据正常吗"时加载。
---

# fund-diagnose — QDII 数据健康巡检

## 执行
```bash
cd scripts && python3 fundctl.py diagnose
```

## 输出解读

| 输出 | 含义 | 行动 |
|------|------|------|
| `✅ 数据正常` | 全部绿 | 不需要动作 |
| `[WARNING] missing_nav: ...` | 某基金净值缺失 | `--auto-fix` 自动补 |
| `[ERROR] nav_stale: ...` | 某分类 >3 天未更新 | 检查 CI pipeline.fill |
| `[INFO] buy_status_no_date: ...` | 申购状态日期缺字段 | 下次 fill 自动补 |
| `[WARNING] missing_fee: ...` | 费率数据缺失 | `fundctl.py sync` 重拉 |

## 自动修复（--auto-fix）
- 只修 missing_nav（执行 refresh）
- 单次尝试，不重试（避免 CI timeout）
- 修复后跑 check 验证

## 相关知识（详见 knowledge/）
- 诊断引擎 4 项检测原理：`knowledge/modules/diagnose-engine.md`
- 数据源异常模式：`knowledge/data-sources.md` 中各 API 的已知限制

## Gotchas
- 入库 ≤3 天的新基金无净值是正常现象，diagnose 不报
- auto-fix 只跑一次，不重试
- nav_stale 不会自己好，需要排查上游 pipeline
