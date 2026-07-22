# feedback/ — 反馈层（验收与诊断基础设施）

> 三层：**预防**=`AGENT.md` | **执行**=`fundctl.py` | **反馈**=本目录

## 目录

```
feedback/
├── README.md              ← 本文件
├── golden_fixtures.json   # 数据侧黄金样例（人工标注期望值，verify_data.py 逐条比对）
├── verify_data.py         # 确定性数据校验脚本（已接入 fundctl.py check）
├── scan_scenarios.py      # 改动 ↔ 场景联动扫描（git diff → 提示需要重跑哪些 UI 场景）
└── ui_scenarios/          # UI 回归场景（声明式 YAML，工具无关）
    ├── _TEMPLATE.yaml     # 场景模板（复制改写，不要直接编辑）
    ├── ss-mkt-card-border-visible.yaml       # 指标卡轮廓
    ├── ss-save-no-flicker.yaml               # 保存无闪烁
    ├── jsonpfetch-contract.yaml              # jsonpFetch 契约
    ├── modal-lifecycle-contract.yaml         # Modal 生命周期
    └── buystatus-classification-contract.yaml # 申购状态分类
```

## 核心组件

### verify_data.py
- **做什么**：比对 `golden_fixtures.json` 与 `web/data/*.json`，发现分类错误 / nav 跳变 / default_share_code 漂移
- **怎么用**：`python3 feedback/verify_data.py`（独立）或 `python3 scripts/fundctl.py check`（包含在内）
- **设计**：空 fixtures = 通过；校验失败列出全部 diff

### scan_scenarios.py
- **做什么**：用 `git diff` 拿到改动文件 → 遍历 `ui_scenarios/*.yaml` 的 `origin.fixed_in` 字段 → 命中则提示"你需要重跑这些场景"
- **怎么用**：在 `fundctl.py check` 最后一步自动调用（非阻塞）
- **设计**：解决"改了 screenshot.js 却忘了那里有 3 个已固化的回归场景"的漂移问题

### ui_scenarios/
- **做什么**：声明式 UI 回归场景，描述"打开什么页面 → 做什么交互 → 断言什么"
- **执行**：工具无关——不写死 Playwright，Agent 执行时现场发现可用浏览器工具去驱动
- **添加新场景**：复制 `_TEMPLATE.yaml`，改为新文件名，填好 scenario/origin/steps/assert

## 对接 AGENT.md

- AGENT.md `Harness` 章节：验收 + 任务流程
- AGENT.md `Loop` 章节：诊断 → 自动修复闭环
- 本文件是 feedback/ 目录自身的说明
