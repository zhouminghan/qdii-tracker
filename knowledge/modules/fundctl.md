# fundctl — 统一 CLI 入口

**文件**：`scripts/fundctl.py`
**上游**：用户/AI Agent 命令行调用
**下游**：`pipeline.scan` / `pipeline.enrich` / `pipeline.fill` / `pipeline.holdings` / `pipeline.reclassify` / `pipeline.codegen` / `pipeline.diagnose` / `feedback.verify_data` / `feedback.scan_scenarios` / `architecture_lint`
**updated**：2026-07-24

## 入口
```bash
python3 fundctl.py {add|move|refresh|sync|check|diagnose}
```

主入口：`fundctl.py:main()` (line 184-223)，argparse 6 个子命令。

## 核心流程

1. **add** (line 40-63)：更新 `config/funds.json` force_include → `codegen.main()` 生成前端配置 → `scan.main()` → `enrich.main(--codes)` → `fill.main(--codes)` → 若为主动分类则 `holdings.main(--codes)`
2. **move** (line 66-74)：调用 `reclassify.main()` 做增量分类调整 → `codegen.main()` 更新前端配置
3. **refresh** (line 77-82)：增量 `fill.main()`（含净值+申购状态+历史追踪）
4. **sync** (line 85-90)：全量流水线 scan→enrich→fill→holdings→codegen 串行
5. **check** (line 108-161)：5 项一致性校验 + 联动提示（non-blocking）：
   - force_include 代码存在性
   - passive_override holdings 文件
   - default_share_code 有效性
   - golden fixtures 校验（`verify_data.py`）
   - 目录纪律 lint（`architecture_lint.py`）
   - 联动提示（`scan_scenarios.py`）
6. **diagnose** (line 164-181)：调 `diagnose.diagnose_all()` → 可选 `--auto-fix`

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `main()` | 184 | argparse 入口 + 子命令路由 |
| `cmd_add()` | 40 | 新增基金（配置 + 局部后处理） |
| `cmd_move()` | 66 | 增量移动分类 |
| `cmd_refresh()` | 77 | 增量刷新 |
| `cmd_sync()` | 85 | 全量流水线 |
| `cmd_check()` | 108 | 6 项一致性校验 |
| `cmd_diagnose()` | 164 | 数据诊断（含 auto_fix） |
| `_all_share_codes()` | 93 | 收集所有数据文件中出现的基金代码 |
| `_run()` | 30 | 通过临时修改 sys.argv 调用 pipeline 模块 main() |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `config/funds.json` | `config/funds.json` (add/move) | 间接（通过 pipeline 模块） |
| `web/data/{cat}.json` (check) | `web/js/config.js` (via codegen) | — |
| `feedback/golden_fixtures.json` | `web/data/meta.json` (via pipeline) | — |

## 约束
- 来自 AGENT.md：「scan 后必须接 enrich + fill」（sync 和 add 已遵守）
- `fundctl.py check` 必须全绿才 commit
