# 项目架构全景图

## 总体架构

```
公开数据源 (AKShare/天天基金/雪球)
        │
        ▼
Python 数据流水线 (scripts/)
  ├── sources/  数据源抽象层（3 个源）
  ├── core/     共享基础设施（常量/工具/配置加载）
  ├── pipeline/ 数据处理（scan→enrich→fill→holdings）
  └── fundctl.py 统一 CLI 入口
        │
        ▼
JSON 数据层 (web/data/)
  ├── sp500.json / nasdaq_passive.json / active.json
  ├── global_index.json / global_other.json / etf.json
  ├── meta.json
  └── holdings/*.json
        │
        ▼
Vanilla JS 前端 (web/)
  ├── index.html  主入口
  ├── js/main.js  主逻辑（~1700 行）
  ├── js/utils.js 深层公共模块
  ├── js/config.js 纯常量
  ├── js/screenshot.js 截图分享
  ├── js/offshore-live-nav.js 场外实时净值
  ├── js/etf-premium.js ETF 溢价率
  ├── js/market-indices.js 市场参照系
  ├── js/market-trend.js 走势图
  ├── js/idle-scheduler.js 智能调度
  ├── js/theme.js 主题切换
  ├── js/bj-time.js 北京时间工具
  └── css/  app.css + tailwind.css
        │
        ▼
  GitHub Pages 静态托管
```

## 数据流水线（4 步）

| 步骤 | 脚本 | 功能 | 关键文件 |
|------|------|------|----------|
| ① scan | `pipeline/scan.py` | AKShare 全量 QDII 基金名册 → 按规则分类 → 归组系列 → 写 `{cat}.json` | `scan.py:289-417` |
| ② enrich | `pipeline/enrich.py` | 批量涨跌幅+申购 → 逐只调雪球补规模/费率/经理 → 份额排序 → 系列按规模排序 | `enrich.py:28-140` |
| ③ fill | `pipeline/fill.py` | Pass1: lsjz+pzd 净值 (ThreadPool 并行) → Pass2: F10 基础信息 → Pass2b: 买卖规则 → Pass3: YTD → Pass4: 成立来 → ETF 场内价 → 申购状态+历史追踪 | `fill.py:123-365` |
| ④ holdings | `pipeline/holdings.py` | 抓取主动基金 Top10 重仓股 → 写 `holdings/{code}.json` | `holdings.py:14-72` |

## 前端模块依赖

```
index.html
  ├─ tailwind.css (CDN)
  ├─ app.css
  ├─ config.js (纯常量，无依赖)
  ├─ utils.js (纯函数，依赖 config.js)
  ├─ bj-time.js (北京时间工具)
  ├─ theme.js (主题切换)
  ├─ idle-scheduler.js (调度器)
  ├─ offshore-live-nav.js (ES Module, 依赖 idle-scheduler)
  ├─ etf-premium.js (ES Module, 依赖 idle-scheduler)
  ├─ market-indices.js (ES Module, 依赖 idle-scheduler)
  ├─ market-trend.js (ES Module)
  ├─ screenshot.js (IIFE, 依赖 html-to-image CDN)
  └─ main.js (ES Module, 依赖以上所有)
```

## 配置流

```
config/funds.json (SSOT — 人类编辑)
        │
        ▼
scripts/core/config_loader.py (Python 加载)
        │
        ├──▶ scan.py (分类规则)
        ├──▶ fundctl.py check (force_include/passive_override 校验)
        │
        ▼
scripts/pipeline/codegen.py (生成前端派生配置)
        │
        ▼
web/js/config.js (AUTO-GENERATED CONFIG 段)
```

## 反馈/验证闭环

```
scripts/pipeline/diagnose.py (数据诊断引擎)
        │
        ├──▶ missing_nav → fundctl.py refresh --code (自动修复)
        ├──▶ missing_fee → fundctl.py sync (自动修复)
        └──▶ 不可修复 → feedback/anomalies.md (人工介入)

feedback/verify_data.py (黄金样例校验)
        │
        └──▶ fundctl.py check 自动调用

feedback/scan_scenarios.py (改动→场景联动)
        │
        └──▶ fundctl.py check 自动调用
```

## 部署流

```
GitHub Actions update-data.yml
  ├── 工作日 22:00 → fundctl.py refresh (增量)
  ├── 每月 2 日 02:00 → fundctl.py sync (全量)
  └── workflow_dispatch → 手动触发

GitHub Actions deploy-pages.yml
  ├── 数据 push 触发
  ├── stamp_asset_version.py (版本戳 bump)
  └── upload artifact → deploy
```
