# US Fund Tracker · 美股基金追踪看板

一个专注于**美股 QDII 基金**的追踪看板。数据来自 AKShare + 天天基金 + 雪球公开接口，纯静态部署，零后端。

🌐 **在线看板**：<https://zhouminghan.github.io/qdii-tracker/>
📦 **源码仓库**：<https://github.com/zhouminghan/qdii-tracker>
⚙️ **自动更新**：[![Update Fund Data](https://github.com/zhouminghan/qdii-tracker/actions/workflows/update-data.yml/badge.svg)](https://github.com/zhouminghan/qdii-tracker/actions/workflows/update-data.yml)

![US Fund Tracker](https://img.shields.io/badge/status-running-success) ![Data](https://img.shields.io/badge/data-static-blue) ![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages%20%7C%20Docker-black)

> 🚀 **想快速用起来？** 直接跳到 [👉 部署方式](#-部署方式)：GitHub Pages 零服务器 or Docker 一键容器化，任选其一。

---

## ✨ 核心功能

- **2 大 Tab**：🏦 场外基金 / 📈 场内 ETF
- **场外 4 分组**（Chips 筛选）：标普500 / 纳指100 / 美股主动（精选 18 只白名单）/ 全球其他 QDII
- **场内 ETF 3 分组**（Chips 筛选）：标普500 / 纳指100 / 全球·其他 ETF（含美国50 等）
- **主动基金详情页**：Top10 重仓 + 当日涨跌 + 基金经理 + 业绩表现（近1月/今年来/近1年/...）+ 费率结构
- **A/C/E/F/I 份额对比**：同一只基金不同份额的费率结构一目了然
- **展示指标**：规模 / 净值 / 日涨跌 / 近1月 / 今年来(YTD) / 近1年 / 成立来 / 基金经理 / 日限额 / 买卖费率 / 七姐妹含量

---

## 🏗️ 整体架构

```
┌────────────────────────────────────────────────────┐
│                   数据层（静态文件）                 │
│   web/data/                                        │
│   ├── sp500.json / nasdaq_passive.json             │
│   ├── active.json / global_other.json / etf.json   │
│   ├── holdings/{code}.json    # 52 只基金的持仓     │
│   ├── us_stocks.json          # 持仓股票实时行情    │
│   └── meta.json               # 扫描元信息         │
└──────────▲──────────────────────────┬──────────────┘
           │ 生成                     │ 读取（首屏）
┌──────────┴──────────────┐    ┌──────▼──────────────┐
│  数据流水线 (Python)     │    │  前端 (HTML/JS)      │
│  scripts/               │    │  web/index.html     │
│  ├── scan_funds.py      │    │                     │
│  ├── enrich_data.py     │    │  - 纯 Vanilla JS    │
│  ├── fill_missing.py    │◄───┼─ - Tailwind CDN     │
│  ├── fetch_holdings.py  │    │  - JSONP 动态拉净值 ─┐
│  └── fetch_stocks.py    │    │  - 腾讯 ETF 实时价 ─┤
└──────────▲──────────────┘    └─────────────────────┘
           │ 拉取                           动态刷新 │
┌──────────┴──────────────────────────────────────┬──┘
│               公开数据源                          │
│  AKShare（基金列表 / 排行 / 累计收益走势）        │
│  天天基金（pingzhongdata.js / F10 概况页）        │
│  雪球（美股实时行情 / 基金基础信息）             │
│  ★ fundgz.1234567.com.cn（前端 JSONP 拉最新净值）│
│  ★ qt.gtimg.cn（前端批量拉 ETF 最新价）          │
└──────────────────────────────────────────────────┘
```

**双数据源策略**：
- 🔵 **静态层**：后端脚本每日定时跑（GitHub Actions / 容器 cron），产出 JSON 快照
- 🟢 **动态层**：前端打开页面时**直连**天天基金 / 腾讯财经的 JSONP 接口，刷新"最新真实净值 + ETF 最新价"

### ⚡ 数据更新方式：**静态 JSON + 前端动态补净值**

- **静态部分**：后端脚本跑完把结果写到 `web/data/*.json`，前端读本地 JSON
- **动态部分**：页面打开时前端直接调公开接口刷新**最新真实净值 / ETF 实时价**

| 数据类型 | 刷新方式 | 新鲜度 |
|---|---|---|
| 场外基金**最新净值 + 日期** | 🟢 前端动态拉 `fundgz.1234567.com.cn` | 打开页面即最新 |
| 场内 ETF **最新价 + 涨跌** | 🟢 前端动态拉 `qt.gtimg.cn`（腾讯行情） | 打开页面即最新（盘中 T+0） |
| 基金规模、基金经理、费率 | 🔵 脚本 | 每日定时 |
| 历史收益（近1月/YTD/1年/成立来） | 🔵 脚本 | 每日定时 |
| 申购状态、日限额 | 🔵 脚本 | 每日定时 |
| 持仓（Top10 重仓） | 🔵 脚本 | 季报周期（Q1/Q2/Q3/Q4 披露后） |
| 持仓股票当日涨跌（红绿色） | 🔵 脚本 | 每日定时 |

**脚本建议跑多频**：
- 交易日 17:30 跑一次 `fill_missing.py + fetch_stocks.py`（净值 / 股价刷新）
- 每月 1 日跑一次完整流水线（含持仓 + 费率）

> 上面两种部署方案已经把这个时间表默认配好（GitHub Actions / 容器内 cron），不用手动。

---

## 📂 目录结构

```
qdii-tracker/
├── README.md
├── .gitignore
│
├── scripts/                      # 数据流水线（Python）
│   ├── scan_funds.py             # [1] 扫描全量基金、分类
│   ├── enrich_data.py            # [2] 补充规模/费率/基金经理
│   ├── fill_missing.py           # [3] 补齐漏掉的净值/YTD/历史收益
│   ├── fetch_holdings.py         # [4] 抓主动基金 Top10 重仓
│   ├── fetch_stocks.py           # [5] 抓持仓股票实时行情
│   └── requirements.txt
│
├── web/                          # 前端（纯静态）
│   ├── index.html                # 单文件应用
│   └── data/                     # 前端消费的 JSON（git 追踪）
│       ├── sp500.json            # 🏦 场外 · 标普500（7 系列）
│       ├── nasdaq_passive.json   # 🏦 场外 · 纳指100（17 系列）
│       ├── active.json           # 🏦 场外 · 美股主动精选（18 系列，白名单）
│       ├── global_other.json     # 🏦 场外 · 全球/其他 QDII（22 系列）
│       ├── etf.json              # 📈 场内 ETF（18 系列）
│       ├── us_stocks.json        # 持仓股票实时行情
│       ├── meta.json             # 扫描元信息
│       └── holdings/{code}.json  # 基金持仓详情（52 只）
│
├── .github/workflows/
│   └── update-data.yml           # GitHub Actions 自动更新
│
├── Dockerfile                    # Docker 镜像定义（一键容器化）
├── docker-compose.yml            # docker compose 启动配置
├── docker/
│   ├── nginx.conf                # 容器内 Nginx 站点配置
│   ├── crontab                   # 容器内 cron 计划（supercronic）
│   └── entrypoint.sh             # 容器启动脚本
│
└── data/                         # 脚本中间产物（gitignore 不追踪）
```

---

## 🧪 数据流水线原理

### [1] `scan_funds.py` — 扫描 + 分类

**输入**：AKShare `fund_name_em()` 返回的全量基金名称表（26000+ 只）

**做什么**：
1. 先判断是否 QDII（`QDII` 在基金类型里、或名字含 `(QDII`）
2. 按 **EXCLUDE_KEYWORDS** 过滤（债 / 港股 / 医疗 / 中概 / 等）
3. 按代码前缀判断场内 ETF（`159xxx / 513xxx / 510xxx`）
4. 按关键词匹配分类：
   - `标普500` → sp500
   - `纳斯达克100 / 纳指100` → nasdaq_passive
   - 其他含 `美国 / 美股 / 全球 / 海外 / 科技`：
     - 命中 **ACTIVE_WHITELIST_KEYWORDS**（18 个精选关键词）→ `active`
     - 否则 → `global_other`
5. **手动白/黑名单兜底**：`FORCE_INCLUDE_CODES` / `FORCE_EXCLUDE_CODES`（应对规则误伤的个案）
6. 按"基金公司 + 产品名"归组成"系列"（A/C/E/F 份额自动合并）

**输出**：`data/sp500.json` / `nasdaq_passive.json` / `active.json` / `global_other.json` / `etf.json`（框架，字段不全）

**耗时**：~30 秒（主要是 AKShare 初次抓 ETF 实时价）

---

### [2] `enrich_data.py` — 补基础信息

**输入**：上一步生成的 5 个分类 JSON

**做什么**：
1. 批量拉 `fund_em_open_fund_rank` → 获取净值、近 1 月/1 年/今年来/成立来收益
2. 批量拉 `fund_purchase_em` → 获取申购状态、日限额
3. 每只基金单独调雪球 API → 规模、基金经理、成立日、**费率详情**（A 类申购费分档、C 类销售服务费、免赎回费天数等）
4. 排序 + 计算默认份额（A 类优先，同级按规模）

**输出**：覆盖上一步的 5 个 JSON，字段填充完整

**耗时**：~5 分钟（每只基金 1 次雪球调用，150+ 只，0.2s 限速）

---

### [3] `fill_missing.py` — 补遗漏字段（3 Pass）

排行榜接口对新发基金/小众基金常有缺字段，这个脚本做三阶段补全：

| Pass | 数据源 | 补哪些字段 |
|---|---|---|
| **Pass 1** | 天天基金 `pingzhongdata.js` | 净值、日涨跌、近1月/3月/6月/1年 |
| **Pass 2** | 天天基金 `F10` 概况页 HTML | 规模、成立日期、基金经理 |
| **Pass 3** | AKShare `累计收益率走势` | **今年来 YTD**（按复利公式算：`(1+last)/(1+year_start) - 1`） |

**关键 bug 修复**：三个 Pass 共享**同一组内存 dict**（避免多次磁盘读写导致覆盖）

**自动同步**：写完 `data/` 后自动 `copy2` 到 `web/data/`

**耗时**：~10 分钟

---

### [4] `fetch_holdings.py` — 主动基金持仓

**输入**：`active.json` + `global_other.json` 的默认份额代码

**做什么**：调 AKShare `fund_portfolio_hold_em` 抓每只基金最新一期的 Top10 重仓股

**输出**：`data/holdings/{code}.json`，格式：
```json
{
  "fund_code": "161128",
  "latest_quarter": "2025Q4",
  "holdings_count": 10,
  "total_weight": 48.5,
  "heavy_count": 3,
  "holdings": [
    {"rank": 1, "stock_code": "AAPL", "stock_name": "苹果", "weight": 9.5, "market_value": 31500}
  ]
}
```

**自动同步**：写完 `data/holdings/` 后自动 `copy2` 到 `web/data/holdings/`

**耗时**：~3 分钟（40 只 × 0.3s 限速）

---

### [5] `fetch_stocks.py` — 持仓股票实时行情

**输入**：所有持仓 JSON 去重后的股票代码

**做什么**：
- 美股：AKShare `stock_us_spot_em`（分页拉全量，然后索引）
- 港股、A 股：`stock_individual_spot_xq`（雪球接口，逐只调）
- 输出 `{stock_code: {change_pct, market, price, ...}}`

**输出**：`data/us_stocks.json`（前端加载时用作"持仓当日涨跌"的红绿标色）

---

## 💻 本地开发（改代码 / 调试）

如果只是**想在本地跑跑试试**、改改前端代码调试，最简单：

```bash
# 1. 装依赖
cd scripts
pip install -r requirements.txt

# 2. 跑一次数据流水线（首次，~20 分钟）
python scan_funds.py
python enrich_data.py
python fill_missing.py        # 会自动同步到 web/data/
python fetch_holdings.py
python fetch_stocks.py

# 3. 启动前端
cd ../web
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/
```

**日常增量更新**（交易日 17:00 后净值出来了）：

```bash
cd scripts
python fill_missing.py        # 更新净值 + YTD + 收益（~10 分钟）
python fetch_stocks.py        # 更新股价（~1 分钟）
```

> 💡 真正的长期使用请看下面两种**部署方式**——让它自动跑，人不用管。

---

## 🚀 部署方式

两种方案，按需选一种 **或组合使用**：

| 方案 | 成本 | 自动更新 | 适合谁 |
|---|---|---|---|
| **① GitHub Pages + Actions** | 免费 | ✅ Actions 定时跑 | 想完全零运维、零服务器 |
| **② Docker（一键容器化）** | 有服务器/Mac/NAS 都行 | ✅ 容器内 supercronic | 有机器想自己掌控 / 内网使用 / 不想依赖 GitHub |

> 💡 **两种可以组合**：GitHub Pages 给外网看板，Docker 跑在家里 NAS 当备份——都读同一份代码，数据不冲突。

---

## 🌐 方案 ① GitHub Pages + Actions 自动更新

**适合**：没有服务器、希望全部免费、完全不碰命令行日常维护。

### 你将得到什么

- 一个公网可访问的网址：`https://zhouminghan.github.io/qdii-tracker/`
- **工作日每天下午 17:30 自动更新数据**（净值出来之后）
- **每月 1 日凌晨自动跑完整流水线**（更新持仓等慢数据）
- **想立刻更新** → GitHub 网页上点一个按钮就触发
- 配置完之后 **完全不用再碰命令行**，日常在浏览器里用即可

### 📋 首次配置步骤（一次性搞定）

#### 步骤 1 · 注册 GitHub 账号

没有就去 <https://github.com/signup> 注册，邮箱验证即可。

#### 步骤 2 · 创建仓库

1. 登录 GitHub → 右上角 "+" → **New repository**
2. 填写：
   - **Repository name**：`qdii-tracker`
   - 选择 **Public**（必须公开，私有仓库的 Pages 要付费）
   - ❌ 不勾 `Add a README file`（本地已经有了）
3. 点 **Create repository**

#### 步骤 3 · 把本地代码推到 GitHub

如果你没用过 Git，强烈建议装 [GitHub Desktop](https://desktop.github.com/)，图形化操作最简单。

**命令行版**（项目根目录 `qdii-tracker/` 打开终端）：

```bash
# 配一次身份（以后 commit 用）
git config --global user.name "你的名字"
git config --global user.email "你的邮箱@xx.com"

# 关联远程仓库（把 zhouminghan 换成你的 GitHub 用户名）
git remote add origin https://github.com/zhouminghan/qdii-tracker.git

# 推送
git push -u origin main
```

推送过程中会弹出登录窗口，用浏览器授权一下即可。

#### 步骤 4 · 启用 GitHub Pages

1. 打开仓库页面（`https://github.com/zhouminghan/qdii-tracker`）
2. 顶部 **Settings** → 左侧 **Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 左边选 `main`，**右边选 `/web`** ⚠️（重要，前端就在这个目录）
5. 点 **Save**

等 1~2 分钟，页面顶部会出现 `✅ Your site is live at https://zhouminghan.github.io/qdii-tracker/`。点开就能看到看板。

#### 步骤 5 · 授予 Actions 写权限（关键！）

**这步不做，自动更新会失败**（Actions 跑完发现没权限推回代码）。

1. **Settings** → 左侧 **Actions** → **General**
2. 滚到最底部 **Workflow permissions**
3. 选 ✅ **Read and write permissions**
4. 勾选 ✅ **Allow GitHub Actions to create and approve pull requests**
5. 点 **Save**

#### 步骤 6 · 手动触发一次验证

1. 仓库顶部 **Actions** 标签
2. 左侧选 **🔄 Update Fund Data**
3. 右边点 **Run workflow** 下拉按钮 → 选择 `incremental` → **Run workflow**
4. 等 3~5 分钟。看到绿色 ✅ 就表示成功了

点进跑完的这次任务可以看到每一步的日志。

#### 步骤 7 · 打开看板

访问 `https://zhouminghan.github.io/qdii-tracker/`，数据应该已经是最新的。

**完成！此后你什么都不用做**，它会自己更新。

---

### 🎯 GitHub Pages 方案的日常使用

只做两件事：

1. **打开书签看**：`https://zhouminghan.github.io/qdii-tracker/`
2. **想立刻更新数据**：
   - 进仓库 → **Actions** → **Update Fund Data** → **Run workflow** → 选 `incremental` → 等几分钟刷新网页

**手机 / iPad / 朋友也能看**：把网址发出去即可。

### ⏰ 自动更新的时间表

workflow 文件已写好（`.github/workflows/update-data.yml`），开箱即用：

| 触发时机 | 模式 | 做什么 | 耗时 |
|---|---|---|---|
| 🗓️ **工作日 17:30**（北京时间） | 增量 | 更新净值 / YTD / 股价 | ~10 分钟 |
| 🗓️ **每月 1 日 02:00** | 完整 | 额外更新：基金列表、持仓、费率 | ~20 分钟 |
| 🖱️ 手动点 Run workflow | 可选 | 按你选 | 按模式 |

需要改时间？修改 yaml 里的 `cron` 表达式即可（<https://crontab.guru/> 可视化生成）。

### 📝 改了本地代码之后

```bash
git add -A
git commit -m "feat: 新增 xxx 基金"
git push
```

- **改的是前端（index.html）**：Pages 自动重新部署，1~2 分钟后网页更新
- **改的是 Python 脚本**：下次 Actions 自动跑时就用新代码了；想立刻生效就手动 Run workflow

---

## 🐳 方案 ② Docker（一键容器化，自有机器）

**适合**：有 Mac / Linux 服务器 / 群晖 NAS / 树莓派 / 公司内网机，想完全掌控、不依赖 GitHub 也能跑。

### 你将得到什么

- 容器里自带 **Python 脚本 + Nginx + 定时任务**，一键起一个完整应用
- **浏览器访问** `http://<机器 IP>:8080` 就能看
- **首次启动自动跑一次完整流水线**（容器发现 `web/data/` 空就跑）
- **工作日 17:30 + 每月 1 日** 自动刷新数据（用容器里的 supercronic）
- 升级镜像或重启容器都**不丢数据**（数据挂到宿主机 `./web/data/`）

### 🧰 前置准备

| 要装的东西 | 说明 |
|---|---|
| **Docker Desktop**（Mac/Win） 或 **docker + docker-compose**（Linux） | <https://www.docker.com/products/docker-desktop> 直接下载 |
| Git（拉代码用，可选） | Mac 默认有，Linux `sudo apt install git` |

### 📋 首次配置步骤

#### 步骤 1 · 拉代码

```bash
git clone https://github.com/zhouminghan/qdii-tracker.git
cd qdii-tracker
```

> 没用 GitHub 也行，把项目文件夹直接拷到机器上也一样。

#### 步骤 2 · 一键起容器

```bash
docker compose up -d --build
```

第一次会构建镜像（约 3~5 分钟，下 Python 镜像 + 装依赖）。

构建完成后容器立刻启动，并**在后台跑一次完整流水线**（约 15~20 分钟）。跑完就能看到数据。

#### 步骤 3 · 查看运行日志

```bash
docker compose logs -f qdii-tracker
```

你会看到：

```
🚀 [entrypoint] starting QDII Tracker container...
📥 [entrypoint] web/data/ 为空，先跑一次完整流水线（预计 15~20 分钟，请耐心）...
🔍 [scan] 扫描全量基金...
...
✅ [entrypoint] 首次流水线完成
🌐 [entrypoint] starting nginx...
⏰ [entrypoint] starting supercronic...
```

按 `Ctrl+C` 退出 logs（容器仍在后台跑）。

#### 步骤 4 · 打开看板

浏览器访问：

```
http://<机器 IP>:8080
```

- 本机跑：`http://localhost:8080`
- 服务器 / NAS：查 IP 后 `http://192.168.x.x:8080`

看到看板就说明成功了。

#### 步骤 5 · 验证自动刷新（可选）

容器里已经装好 cron，不需要额外配置。想手动触发一次：

```bash
# 进容器
docker compose exec qdii-tracker bash

# 跑增量刷新
cd /app/scripts && python fill_missing.py

# 退出
exit
```

刷新网页就能看到最新数据。

---

### 🎯 Docker 方案的日常使用

| 操作 | 命令 |
|---|---|
| 启动 | `docker compose up -d` |
| 停止 | `docker compose stop` |
| 重启 | `docker compose restart` |
| 看日志 | `docker compose logs -f qdii-tracker` |
| 手动触发增量更新 | `docker compose exec qdii-tracker python /app/scripts/fill_missing.py` |
| 手动触发完整流水线 | `docker compose exec qdii-tracker bash -c "cd /app/scripts && python scan_funds.py && python enrich_data.py && python fill_missing.py && python fetch_holdings.py && python fetch_stocks.py"` |
| 进容器排查 | `docker compose exec qdii-tracker bash` |
| 更新代码后重建镜像 | `git pull && docker compose up -d --build` |

### ⏰ 容器内的自动更新

定时规则在 `docker/crontab`：

```cron
# 工作日 17:30 增量更新（北京时间）
30 17 * * 1-5 cd /app/scripts && python fill_missing.py && python fetch_stocks.py

# 每月 1 日 02:00 完整流水线
0 2 1 * * cd /app/scripts && python scan_funds.py && python enrich_data.py && ...
```

改时间直接编辑 `docker/crontab` 然后 `docker compose up -d --build`。

### 📁 数据持久化

`docker-compose.yml` 里挂了卷：

```yaml
volumes:
  - ./web/data:/app/web/data
```

所有 JSON 数据实际落在**宿主机的 `./web/data/`**。含义：

- 删容器 / 重建镜像**不丢数据**
- 手动看数据：`cat web/data/sp500.json`
- 想重新跑一次首次流水线：`rm -rf web/data/*.json && docker compose restart`

### 🌍 对外暴露 / 自定义域名（可选）

**改端口**：默认绑 `8080`，改 `docker-compose.yml` 里 `"8080:80"` 为 `"80:80"` 就用标准 80 端口。

**加域名 + HTTPS**：在前面套一层 Nginx 反向代理 / Caddy / Traefik：

```nginx
# 宿主机 Nginx 示例
server {
    listen 443 ssl;
    server_name fund.example.com;
    ssl_certificate     /etc/letsencrypt/live/fund.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fund.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
    }
}
```

或直接用 **Caddy**（一行配置自动 HTTPS）：

```caddy
fund.example.com {
    reverse_proxy localhost:8080
}
```

### 🔧 镜像仓库（进阶）

想把镜像推到 Docker Hub / 私有仓库，方便其它机器拉：

```bash
docker tag qdii-tracker:latest <你的账号>/qdii-tracker:latest
docker push <你的账号>/qdii-tracker:latest

# 别的机器上
docker pull <你的账号>/qdii-tracker:latest
docker compose up -d
```

---

### 🎁 两种方案对比

| 指标 | GitHub Pages | Docker |
|---|---|---|
| 成本 | 免费 | 电费 / 云服务器租金 |
| 需要机器 | ❌ | ✅（Mac / NAS / 树莓派都行） |
| 访问速度（国内） | 一般（偶尔慢） | 内网极快 |
| 公网访问 | ✅ 自带 | 需自己配端口映射 / 反代 |
| 备案（国内公网） | 不需要 | 公网暴露需要 |
| HTTPS | 自动 | 需自己配（Caddy 一行搞定） |
| 改代码后生效 | git push 几分钟 | `docker compose up -d --build` |
| 数据隐私 | 仓库公开可见 | 完全在自己机器 |
| 离线可用 | ❌ | ✅ |

---

## 📱 移动端访问（手机/iPad）

Web 版**已经是响应式设计**，手机浏览器打开网址就能看。两种更好的体验：

### 方式 1：Safari / Chrome 添加到桌面（推荐）

iOS Safari：打开网址 → 底部分享按钮 → **添加到主屏幕**
Android Chrome：打开网址 → 右上角菜单 → **添加到主屏幕**

效果：桌面多一个图标，点开像 App 一样（全屏、无地址栏）。本质是 **PWA（渐进式 Web 应用）**。

### 方式 2：浏览器书签 + 省流量

看板体积不到 500 KB（HTML + JSON 总和），书签就够用。

---

## 🔭 将来想做更多？

如果这个工具你用顺了，将来能扩展的方向：

- **加数据库**：PostgreSQL / DuckDB 存历史净值，做真正的图表（而不是单时间点快照）
- **加策略回测**：给每只基金算年化、夏普比率、最大回撤
- **加提醒**：通过 Server 酱 / Telegram Bot 推送"某基金今日跌超 3%"
- **加对比**：两只基金叠加曲线对比
- **加七姐妹浓度打分**：现在只识别"有没有"，可以做加权评分
- **做成公众号菜单**：公众号的 H5 链接不受小程序的域名限制，可以直接跳 Web 版（这是比小程序靠谱的"微信生态"方案）

这些不急，现在这版先稳定用半年再说。

---

## 🔑 数据源详解

| 来源 | URL / 接口 | 提供什么 | 稳定性 | 谁用 |
|---|---|---|---|---|
| **AKShare** | `ak.fund_name_em()` | 全量基金列表 | ⭐⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_em_open_fund_rank()` | 排行榜数据（净值、各期收益、今年来、成立来） | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_purchase_em()` | 申购状态、日限额 | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_portfolio_hold_em()` | Top10 重仓 | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_open_fund_info_em(indicator='累计收益率走势')` | 成立日起每日累计收益（用来算 YTD） | ⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.fund_etf_spot_em()` | 场内 ETF 实时价（快照） | ⭐⭐⭐⭐⭐ | 后端脚本 |
| AKShare | `ak.stock_us_spot_em()` | 美股实时行情（大批量） | ⭐⭐⭐⭐ | 后端脚本 |
| **天天基金** | `pingzhongdata/{code}.js` | 净值曲线、近期收益、资产配置 | ⭐⭐⭐⭐ | 后端脚本 |
| 天天基金 | `fundf10.eastmoney.com/jbgk_{code}.html` | 规模、成立日、基金经理 | ⭐⭐⭐ | 后端脚本 |
| 天天基金 | `fundgz.1234567.com.cn/js/{code}.js` | 最新真实净值 / 日期 | ⭐⭐⭐⭐⭐ | **前端动态**（JSONP） |
| **雪球** | 基金页 HTML | 规模、管理费、费率详情 | ⭐⭐⭐ | 后端脚本 |
| 雪球 | `stock_individual_spot_xq` | 港股 / A 股实时 | ⭐⭐⭐ | 后端脚本 |
| **腾讯财经** | `qt.gtimg.cn/q=sh510300,sz159941,...` | ETF 最新价 / 涨跌 / 交易日 | ⭐⭐⭐⭐⭐ | **前端动态**（批量） |

> ⚠️ **限频注意**：天天基金对高频请求有 IP 级限频（403 / 返回空）。脚本里统一设 `time.sleep(0.15~0.3)` 限速，部署到海外服务器要注意代理。

---

## 🔍 分类规则（scan_funds.py）

```
QDII 基金入口
├── FORCE_EXCLUDE_CODES 命中  → exclude          # 黑名单（持仓跑偏的个案）
├── FORCE_INCLUDE_CODES 命中  → 指定分类           # 白名单（规则误伤的精品）
├── 不是 QDII                 → exclude
├── 名字命中 EXCLUDE_KEYWORDS → exclude          # 债 / 港股 / 医疗 / 中概 …
├── 场内代码（159/513/510）   → etf
├── 名字含"标普500"           → sp500
├── 名字含"纳斯达克100"        → nasdaq_passive
├── 名字含"美国/美股/全球/科技…"
│   ├── 命中 ACTIVE_WHITELIST → active           # 精选 18 只美股主动
│   └── 否则                  → global_other     # 其他全球型 QDII
└── 否则                      → exclude
```

具体关键词和代码清单见 `scripts/scan_funds.py` 顶部常量区。

---

## 🛠 常见问题

**Q: 前端看到数据和基金 APP 不一致？**
A: 分两类看：
- **净值 / ETF 最新价**：前端打开页面时实时拉，应该和天天基金/腾讯自选股一致。不一致先看 footer 提示（"🟢 实时净值已刷新于 xx:xx" or "⚠️ 实时拉取失败"）
- **规模 / 费率 / 历史收益 / 持仓等**：脚本快照，看 `web/data/meta.json` 的 `generated_at` / `enriched_at` 确认数据时间

**Q: 能做到 100% 实时吗（每秒刷新）？**
A: 基金不像股票有秒级盘口。`fundgz` 是按分钟粒度的盘中估值 / 收盘后真实净值，ETF 腾讯行情是 T+0 但个人开发者没必要秒级轮询。当前方案（"打开页面即最新"）已经覆盖 99% 使用场景。

**Q: 某只基金数据不对？**
A: 依次检查：
1. `web/data/{cat}.json` 里的字段是不是 null
2. 跑 `python scripts/fill_missing.py`（会针对性补缺）
3. 还是 null 说明数据源本身没有（通常是新基金，等 Q 报披露）

**Q: 想加/删基金怎么办？**
A: 编辑 `scripts/scan_funds.py` 的 3 个字典：
- `EXCLUDE_KEYWORDS`：批量排除（关键词）
- `FORCE_EXCLUDE_CODES`：精准排除（代码）
- `FORCE_INCLUDE_CODES`：精准保留
- `ACTIVE_WHITELIST_KEYWORDS`：进入"精选美股主动"白名单

改完重跑完整流水线。

---

## 📜 License

Private / Personal use only.
