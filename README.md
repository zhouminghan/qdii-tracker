# QDII Tracker

个人 QDII 基金追踪、市场研究、投资组合与本地研究工作区。

线上地址：<https://zhouminghan.github.io/qdii-tracker/>

前端为 Vue 3 + TypeScript + Vite；Python 负责数据采集、丰富与质量门禁。站点保持纯静态部署，无后端、无账号、无云端个人数据同步。

## 界面

![Funds desktop](docs/evidence/funds-desktop-light.png)

| Market dark | Portfolio |
|-------------|-----------|
| ![Market dark](docs/evidence/market-desktop-dark.png) | ![Portfolio](docs/evidence/portfolio-desktop-light.png) |

## 功能

### Market

- 全球指数、科技七姐妹、外汇、黄金多市场与品牌金价。
- 美债 2/10/30 年、VIX、美元指数、纳指 PE。
- 纳指年度收益、回撤、月度热力图和情绪历史。
- 市场温度与 VIX/PE 阶梯定投观察。

### Funds

- 场外 QDII / 场内 ETF 分类切换。
- 跨分类搜索、多字段排序、缺失值置底、收藏置顶。
- 基金系列展开、A/C/美元份额、申购状态与历史状态。
- 详情抽屉、历史净值、Top10 持仓、费率规则。
- CSV 和 PNG 分享。

### Portfolio

- IndexedDB 本地持仓与交易流水。
- 本金、市值、持有收益、收益率和资产分布。
- 当前份额的近似收益趋势。
- 交易新增、修改、删除与刷新后持久化。
- 旧 `localStorage` 数据自动迁移。

### Research

- 场内/场外、份额、溢价、选基、额度与汇率知识库。
- 基金研究笔记、观察清单、策略记录。
- 笔记修改历史。
- JSON 备份与校验恢复。

## 架构

```text
公开数据源
  → Python pipeline/
  → web/data/*.json
  → public_catalog.py
  → catalog.json + market-snapshot.json
  → Vue pages / Pinia stores
  → IndexedDB 个人数据
```

- 公共数据只读、静态 JSON、GitHub Actions 定时更新。
- 个人数据只保存在浏览器 Dexie `qdii-tracker` 数据库。
- 数据契约见 [docs/data-contract.md](./docs/data-contract.md)。
- 模块边界见 [docs/architecture.md](./docs/architecture.md)。
- 技术决策见 [docs/decisions/](./docs/decisions/)。

## 技术栈

- Vue 3、TypeScript、Vite、Vue Router、Pinia。
- TanStack Table PoC 与纯函数排序层。
- Apache ECharts。
- Dexie / IndexedDB。
- Vitest、Vue Test Utils、Playwright、axe-core。
- Python、AKShare、静态 JSON、GitHub Pages。

## 本地开发

```bash
npm ci
npm run dev                    # http://127.0.0.1:8765/

python3 -m venv .venv          # 首次
source .venv/bin/activate
pip install -r scripts/requirements.txt -r scripts/requirements-dev.txt

cd scripts
python3 fundctl.py sync        # 全量数据同步
python3 fundctl.py check       # 数据质量门禁
```

默认打开 Funds。hash 路由支持 `#/market`、`#/funds`、`#/portfolio`、`#/research`。

## 测试

```bash
npm ci
npm run test:t0       # 类型 + ESLint + Vitest
npm run test:t1       # 当前变更涉及的 Chromium 桌面交互
npm run test:t2       # Chromium 桌面集成 + 视觉基准
npm run test:t3       # Chromium 桌面 + 移动完整回归
npm run build
python3 -m pytest test/ -q
cd scripts && python3 fundctl.py check --offline
```

浏览器测试只使用本机 Chromium/Chrome；不要求安装 Firefox/WebKit。
小修改执行 T0，交互修改执行 T0 + T1，公共组件/存储/契约扩大范围，发布前执行 T3。
完整结果与证据记录在 [docs/test-report.md](./docs/test-report.md)。

## 个人数据

- 不上传个人数据。
- 备份文件包含持仓、交易、笔记、观察清单和策略记录。
- 导入先校验 schema 与结构，再在单个 IndexedDB 事务中恢复；失败时保留原数据。
- 删除持仓、交易和研究数据均需要明确操作。

## Actions 与部署

- `update-data.yml`：工作日更新数据，月度执行完整流水线。
- `ci.yml`：Python 测试、数据门禁、前端类型/Lint/Vitest/Build，不安装浏览器。
- `deploy-pages.yml`：`npm ci → npm run build → upload web/ → GitHub Pages`。
- Vite 资源使用内容哈希，不再手工维护 `?v=dev`。

## 数据来源

AKShare、天天基金、东方财富、雪球、Yahoo Finance、CNN dataviz、证券之星等公开数据。
具体链路与失败策略见 [docs/data-sources.md](./docs/data-sources.md)。

## 目录

<!-- DOCSYNC START: tree -->
```text
qdii-tracker/
├── .github/    # CI 工作流（deploy-pages / update-data / ci）
│   └── workflows/
├── .githooks/    # 本地 git hooks（pre-commit doc_sync + pre-push 门禁）
│   ├── pre-commit
│   └── pre-push
├── scripts/    # 数据流水线（Python）
│   ├── checks/
│   ├── core/
│   ├── pipeline/
│   ├── sources/
│   ├── fundctl.py
│   ├── requirements-dev.txt
│   ├── requirements.txt
│   └── setup_hooks.sh
├── config/    # 基金分类 SSOT 配置
│   └── funds.json
├── web/    # 前端（纯静态）
│   ├── data/
│   ├── .nojekyll
│   ├── feed.rss
│   ├── icon.svg
│   ├── index.html
│   ├── manifest.json
│   ├── robots.txt
│   ├── sitemap.xml
│   └── sw.js
├── docs/    # 人读文档 — 踩坑 / 架构
│   ├── decisions/
│   ├── evidence/
│   ├── architecture.md
│   ├── audit.md
│   ├── data-contract.md
│   ├── data-sources.md
│   ├── gotchas.md
│   └── test-report.md
├── test/    # 测试与 UI 回归（pytest + Playwright）
│   ├── e2e/
│   ├── frontend/
│   ├── test_akshare_source.py
│   ├── test_brand_gold.py
│   ├── test_classify.py
│   ├── test_cnn_sentiment.py
│   ├── test_dca_strategy.py
│   ├── test_gold.py
│   ├── test_kline_history.py
│   ├── test_market_temperature.py
│   ├── test_nasdaq_history.py
│   ├── test_nav_history.py
│   ├── test_premium_history.py
│   ├── test_public_catalog.py
│   ├── test_purchase_history.py
│   ├── test_ths_source.py
│   └── test_utils.py
├── design-system/
│   └── qdii-tracker/
├── frontend/
│   ├── public/
│   ├── src/
│   └── index.html
├── harness/
│   └── state.json
├── .gitignore
├── .nvmrc
├── AGENTS.md
├── LICENSE
├── README.md
├── eslint.config.js
├── package-lock.json
├── package.json
├── playwright.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```
<!-- DOCSYNC END: tree -->

## Commands

<!-- DOCSYNC START: commands -->
```bash
python3 fundctl.py add          # 新增/强制纳入一只基金
python3 fundctl.py move         # 移动分类
python3 fundctl.py brand        # 设置公司品牌 logo 文字
python3 fundctl.py remove       # 删除一只基金（从配置和数据中移除）
python3 fundctl.py refresh      # 增量刷新
python3 fundctl.py sync         # 全量同步
python3 fundctl.py nasdaq       # 刷新纳指 40 年历史图谱数据
python3 fundctl.py sentiment    # 刷新 CNN 恐慌贪婪指数
python3 fundctl.py catalog      # 生成前端公共基金目录契约
python3 fundctl.py diagnose     # 诊断数据异常
python3 fundctl.py check        # 一致性校验
python3 fundctl.py probe        # 数据源适配层探针（导入级）
```
<!-- DOCSYNC END: commands -->

## License

[MIT License](./LICENSE)。数据仅供个人研究参考，不构成投资建议。
