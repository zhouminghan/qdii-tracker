# US Fund Tracker · 美股基金追踪看板

一个专注于**美股 QDII 基金**的追踪看板。数据来自 AKShare + 天天基金 + 雪球公开接口，纯静态部署，零后端。

![US Fund Tracker](https://img.shields.io/badge/status-running-success) ![Data](https://img.shields.io/badge/data-static-blue) ![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-black)

> 🚀 **没有服务器也想用？** 直接跳到 [👉 部署方式](#-推荐部署方式github-pages--actions-自动更新)：用 GitHub Pages 免费托管 + GitHub Actions 自动每天更新数据，零命令行日常维护。

---

## ✨ 核心功能

- **2 大 Tab**：🏦 场外基金 / 📈 场内 ETF
- **场外 4 分组**（Chips 筛选）：标普500 / 纳指100 / 美股主动（精选 18 只白名单）/ 全球其他 QDII
- **场内 ETF 3 分组**（Chips 筛选）：标普500 / 纳指100 / 美国50
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
│   ├── holdings/{code}.json    # 53 只基金的持仓     │
│   ├── us_stocks.json          # 持仓股票实时行情    │
│   └── meta.json               # 扫描元信息         │
└──────────▲──────────────────────────┬──────────────┘
           │ 生成                     │ 读取
┌──────────┴──────────────┐    ┌──────▼──────────────┐
│  数据流水线 (Python)     │    │  前端 (HTML/JS)      │
│  scripts/               │    │  web/index.html     │
│  ├── scan_funds.py      │    │                     │
│  ├── enrich_data.py     │    │  - 纯 Vanilla JS    │
│  ├── fill_missing.py    │    │  - Tailwind CDN     │
│  ├── fetch_holdings.py  │    │  - fetch() 读 JSON  │
│  └── fetch_stocks.py    │    │                     │
└──────────▲──────────────┘    └─────────────────────┘
           │ 拉取
┌──────────┴───────────────────────────────────────┐
│               公开数据源                           │
│  AKShare（基金列表 / 排行 / 累计收益走势）         │
│  天天基金（pingzhongdata.js / F10 概况页）         │
│  雪球（美股实时行情 / 基金基础信息）              │
└──────────────────────────────────────────────────┘
```

### ⚡ 数据更新方式：**静态 + 手动**

**不是实时的**。数据在运行 Python 脚本时被抓取并固化到 `web/data/*.json`，前端只是读本地 JSON。

| 数据类型 | 新鲜度 | 靠什么脚本更新 |
|---|---|---|
| 基金列表、分类 | 脚本运行时 | `scan_funds.py` |
| 基金规模、费率、基金经理、净值 | 脚本运行时 | `enrich_data.py` + `fill_missing.py` |
| 持仓（Top10 重仓） | **季报周期**（Q1/Q2/Q3/Q4 披露后） | `fetch_holdings.py` |
| 美股实时行情 | 脚本运行时（开盘才有意义） | `fetch_stocks.py` |
| 基金今日净值 | 脚本运行时（T+1 出净值） | `enrich_data.py` |
| 场内 ETF 盘中价 | 脚本运行时 | `scan_funds.py` 里顺带抓 |

**建议更新频率**：
- 交易日 17:00 后跑一次（净值已出）
- 季报披露后（4 月 / 7 月 / 10 月 / 1 月底）跑一次 `fetch_holdings.py` 更新持仓
- 交易日盘中如果想看实时股价，只跑 `fetch_stocks.py`（秒级完成）

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
│       └── holdings/{code}.json  # 基金持仓详情（53 只）
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

## 🚀 快速开始

### 环境要求

- Python 3.9+
- 科学上网（可选，AKShare 部分接口偶尔超时时有用）

### 安装

```bash
cd scripts
pip install -r requirements.txt
```

### 完整流水线（首次运行）

按顺序跑 5 个脚本，全量耗时约 **20 分钟**：

```bash
cd scripts
python scan_funds.py        # 1. 扫描 + 分类
python enrich_data.py       # 2. 补基础信息
python fill_missing.py      # 3. 补漏字段（自动同步到 web/data/）
python fetch_holdings.py    # 4. 主动基金持仓
python fetch_stocks.py      # 5. 持仓股票实时行情
```

> 💡 `fill_missing.py` 和 `fetch_holdings.py` **会自动把结果同步到 `web/data/`**，不用手动 cp。

### 增量更新（日常）

```bash
# 交易日 17:00 后跑（净值出后）
python fill_missing.py          # 更新净值 + YTD + 近期收益 + 规模（~10 分钟）
python fetch_stocks.py          # 更新持仓股价（~1 分钟）

# 季报披露后（4/7/10/1 月底）
python fetch_holdings.py        # 更新 Top10 持仓
```

### 启动前端

```bash
cd web
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/
```

---

## 🌐 推荐部署方式：GitHub Pages + Actions 自动更新

**一次配置，永久免费、全自动**。适合没有服务器的人。

### 你将得到什么

- 一个公网可访问的网址：`https://<你的用户名>.github.io/qdii-tracker/`
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

# 关联远程仓库（把 <你的用户名> 换成你的 GitHub 用户名）
git remote add origin https://github.com/<你的用户名>/qdii-tracker.git

# 推送
git push -u origin main
```

推送过程中会弹出登录窗口，用浏览器授权一下即可。

#### 步骤 4 · 启用 GitHub Pages

1. 打开仓库页面（`https://github.com/<你的用户名>/qdii-tracker`）
2. 顶部 **Settings** → 左侧 **Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 左边选 `main`，**右边选 `/web`** ⚠️（重要，前端就在这个目录）
5. 点 **Save**

等 1~2 分钟，页面顶部会出现 `✅ Your site is live at https://<你的用户名>.github.io/qdii-tracker/`。点开就能看到看板。

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

访问 `https://<你的用户名>.github.io/qdii-tracker/`，数据应该已经是最新的。

**完成！此后你什么都不用做**，它会自己更新。

---

### 🎯 之后怎么用？

日常只做两件事：

1. **打开书签看**：`https://<你的用户名>.github.io/qdii-tracker/`
2. **想立刻更新数据**：
   - 进仓库 → **Actions** → **Update Fund Data** → **Run workflow** → 选 `incremental` → 等几分钟刷新网页

**手机 / iPad / 朋友也能看**：把网址发出去即可。

---

### ⏰ 自动更新的时间表

workflow 文件已写好（`.github/workflows/update-data.yml`），开箱即用。它的规则：

| 触发时机 | 模式 | 做什么 | 耗时 |
|---|---|---|---|
| 🗓️ **工作日 17:30**（北京时间） | 增量 | 更新净值 / YTD / 股价 | ~10 分钟 |
| 🗓️ **每月 1 日 02:00** | 完整 | 额外更新：基金列表、持仓、费率 | ~20 分钟 |
| 🖱️ 手动点 Run workflow | 可选 | 按你选 | 按模式 |

需要改时间？修改 yaml 里的 `cron` 表达式即可。不会写？用 <https://crontab.guru/> 可视化生成。

---

### 📝 改了本地代码之后

```bash
# 本地修改（比如 scan_funds.py 加新基金关键词）
git add -A
git commit -m "feat: 新增 xxx 基金"
git push
```

GitHub 收到新代码后：
- **改的是前端（index.html）**：Pages 自动重新部署，1~2 分钟后网页更新
- **改的是 Python 脚本**：下次 Actions 自动跑时就用新代码了；想立刻生效就手动 Run workflow

---

## 🔧 其他部署方式（可选）

### 本地只读（不需要公网）

不想让别人看到？完全本地跑也行：

```bash
cd web && python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/
```

数据更新靠手动跑 Python 脚本。适合只想自己看的场景。

### Cloudflare Pages（国内访问更快）

GitHub Pages 在国内偶尔访问慢，Cloudflare Pages 是同样原理但 CDN 国内友好。

1. 仓库推到 GitHub（同上面的步骤 1~3）
2. 登录 <https://dash.cloudflare.com> → **Pages** → **Create application**
3. 连接 GitHub 仓库
4. **Build output directory** 填 `web`，其他留空
5. **Deploy**

访问 `https://<project>.pages.dev/`，和 GitHub Pages 效果一样，但国内延迟低很多。

**数据更新仍由 GitHub Actions 跑**（push 数据后 Cloudflare 自动重新发布）。

### 自己的 VPS / 云服务器（进阶）

如果你已经有或打算买一台云服务器（阿里云轻量 / 腾讯云轻量 / 华为云 / Lighthouse / 海外 VPS 等），可以完全脱离 GitHub 独立运行。

**适合场景**：
- 想要自定义域名 + HTTPS + 访问密码
- 想给微信小程序、iOS App 当后端（需要备案）
- 有性能需求（批量抓取 / 更多历史数据）

#### 步骤 1 · 选机器

**最低配置足够**：1 核 / 2G / 40GB SSD。年费约 60~200 元（国内轻量）或 $3~5/月（海外 VPS）。

| 推荐 | 理由 |
|---|---|
| **腾讯云轻量 / 阿里云轻量**（国内） | 国内访问快；想做微信小程序必选（备案前提） |
| **Cloudflare / Vercel 托管 + 海外 VPS 跑脚本** | 免备案，全球访问快 |
| Racknerd / BandwagonHost 等海外 VPS | 便宜，适合只给自己看 |

⚠️ **国内服务器必须做备案**（10~20 天流程，要身份证照片和备案服务号，个人也能做）。没备案 Nginx 起不来 80/443 端口。

#### 步骤 2 · 初始化服务器

SSH 登入服务器（用腾讯云/阿里云的网页终端也行）：

```bash
# Ubuntu 22.04 / Debian 12 示例，CentOS 自行换 yum
sudo apt update && sudo apt upgrade -y

# 装 Python 3.11 + pip + git + Nginx
sudo apt install -y python3 python3-pip python3-venv git nginx

# 装证书工具（自动 HTTPS）
sudo apt install -y certbot python3-certbot-nginx
```

#### 步骤 3 · 拉代码 + 装依赖

```bash
# 建议用专门的用户，不用 root 跑脚本
sudo useradd -m -s /bin/bash fund
sudo su - fund

cd ~
git clone https://github.com/<你的用户名>/qdii-tracker.git
cd qdii-tracker

# 用虚拟环境隔离依赖
python3 -m venv venv
source venv/bin/activate
pip install -r scripts/requirements.txt

# 首次跑一次完整流水线（~20 分钟，耐心等）
cd scripts
python scan_funds.py
python enrich_data.py
python fill_missing.py
python fetch_holdings.py
python fetch_stocks.py
```

#### 步骤 4 · 配 Nginx 托管前端

```bash
sudo vim /etc/nginx/sites-available/fund-tracker
```

贴入：

```nginx
server {
    listen 80;
    server_name fund.example.com;   # 换成你的域名

    root /home/fund/qdii-tracker/web;
    index index.html;

    # 可选：加访问密码（不想让所有人看）
    # auth_basic "Restricted";
    # auth_basic_user_file /etc/nginx/.htpasswd;

    # 数据文件缓存 5 分钟（Actions 更新后也能及时刷新）
    location ~ \.(json|txt)$ {
        expires 5m;
        add_header Cache-Control "public, must-revalidate";
    }

    # HTML 不缓存（改了代码立刻看到）
    location ~ \.html$ {
        expires -1;
        add_header Cache-Control "no-store";
    }

    # 跨域（方便微信小程序/其他 App 调用）
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
}
```

激活配置：

```bash
sudo ln -s /etc/nginx/sites-available/fund-tracker /etc/nginx/sites-enabled/
sudo nginx -t       # 检查语法
sudo systemctl reload nginx
```

访问 `http://fund.example.com` 应该能看到看板。

#### 步骤 5 · 配 HTTPS（免费）

```bash
sudo certbot --nginx -d fund.example.com
# 按提示输入邮箱，选 2（自动跳转 HTTPS）
# 会自动改 Nginx 配置并申请证书，90 天自动续期
```

完成后访问 `https://fund.example.com`，浏览器显示绿锁。

#### 步骤 6 · 配 crontab 定时更新数据

```bash
# 切回 fund 用户
sudo su - fund
crontab -e
```

加入：

```cron
# 工作日 17:30 增量更新（北京时间；若服务器用 UTC 改成 09:30）
30 17 * * 1-5 cd /home/fund/qdii-tracker && source venv/bin/activate && cd scripts && python fill_missing.py >> /home/fund/qdii-tracker/logs/cron.log 2>&1

# 每月 1 日 02:00 完整流水线
0 2 1 * * cd /home/fund/qdii-tracker && source venv/bin/activate && cd scripts && python scan_funds.py && python enrich_data.py && python fill_missing.py && python fetch_holdings.py && python fetch_stocks.py >> /home/fund/qdii-tracker/logs/cron.log 2>&1

# 每天盘中 22:00（美股开盘）更新股票行情，持仓颜色变红绿
0 22 * * 1-5 cd /home/fund/qdii-tracker && source venv/bin/activate && cd scripts && python fetch_stocks.py >> /home/fund/qdii-tracker/logs/cron.log 2>&1
```

⚠️ 如果服务器时区是 UTC，cron 时间要减 8 小时。检查时区：

```bash
timedatectl status       # 看 Time zone
sudo timedatectl set-timezone Asia/Shanghai   # 改成北京时间
```

#### 步骤 7 · 安全加固（强烈建议）

```bash
# 1. 禁用密码登录，只用 SSH key
sudo vim /etc/ssh/sshd_config
# 改：PasswordAuthentication no
sudo systemctl restart ssh

# 2. 装防火墙
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 3. 装 fail2ban 防 SSH 暴力破解
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

#### 🎁 方案对比一览

| 指标 | GitHub Pages | 云服务器 |
|---|---|---|
| 成本 | 免费 | 60~200 元/年 |
| 访问速度（国内） | 一般（偶尔慢） | 快 |
| 备案 | 不需要 | 国内服务器必须 |
| 自动更新 | Actions | crontab |
| 给小程序/App 当后端 | ❌ | ✅ |
| 自定义域名 | ✅ | ✅ |
| HTTPS | 自动 | 需自己配（certbot） |
| 维护成本 | 0 | 偶尔检查日志 |

---

## 📱 移动端访问（手机/iPad）

Web 版**已经是响应式设计**，手机浏览器打开网址就能看。三种更好的体验：

### 方式 1：Safari / Chrome 添加到桌面（推荐）

iOS Safari：打开网址 → 底部分享按钮 → **添加到主屏幕**
Android Chrome：打开网址 → 右上角菜单 → **添加到主屏幕**

效果：桌面多一个图标，点开像 App 一样（全屏、无地址栏）。本质是 **PWA（渐进式 Web 应用）**。

### 方式 2：浏览器书签 + 省流量

`https://<你的用户名>.github.io/qdii-tracker/` 存书签即可。整站 HTML+JSON 不到 500 KB，流量几乎可忽略。

### 方式 3：微信小程序？

**不推荐**，原因见下一节。

---

## 🤔 为什么不推荐做微信小程序？

很多人第一反应是"能不能搞个小程序方便微信里看"。答案是**技术上可以，但对个人开发者成本 / 收益不匹配**。

### 核心卡点

| 问题 | 详情 |
|---|---|
| **1. 域名必须备案** | 小程序 `wx.request` 只能请求**已通过工信部备案的域名**。GitHub Pages / Cloudflare Pages / Vercel **全部不行**（不在中国境内无法备案）。必须先有国内云服务器 + 备案（2 周流程） |
| **2. 前端代码要重写** | 小程序用 WXML + WXSS + JS，**不能直接用 HTML + Tailwind**。即便移植也要重构约 60% 的代码 |
| **3. 个人主体审核限制** | 小程序审核对"金融类"有严格限制。个人主体做基金/股票相关**大概率被拒**，需要企业主体 + 证券/基金销售资质 |
| **4. 运营成本** | 小程序域名要**年年续签 ICP 备案**；企业主体每年 300+ 元；代码更新要经过微信审核（几小时到几天） |

### 如果你还是想做：技术路径

先满足以下前置条件（一样都不能少）：
1. ✅ 有国内云服务器（已备案）
2. ✅ 接受用企业主体注册小程序（个人主体会被拒）
3. ✅ 有证券/基金销售资质（否则无法通过金融类审核）
4. ✅ 愿意重写前端为小程序语法

满足了之后流程大致：

```
① 注册小程序账号 → 拿到 appid
② 微信开发者工具新建小程序项目
③ 把 web/data/*.json 上传到云服务器
④ 在小程序里 wx.request 调用 https://fund.你的域名.com/data/xxx.json
⑤ 把 index.html 的 HTML+JS 翻译成 WXML + Page()
⑥ 提交审核
```

**工作量评估**：2~3 周全职工作。对一个自用工具来说性价比极低。

### 替代方案（强烈推荐）

**直接把 PWA Web 版当小程序用**：

- 在 Safari/Chrome 里打开网址 → 添加到主屏幕
- 桌面出现图标，点开和小程序一样的体验（全屏、启动快）
- **完全免费、免备案、即改即用、无审核**

实际体验差别几乎没有。除非你的目标是"给外部用户提供服务"而不是"自己用"，否则小程序没必要。

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

| 来源 | URL / 接口 | 提供什么 | 稳定性 |
|---|---|---|---|
| **AKShare** | `ak.fund_name_em()` | 全量基金列表 | ⭐⭐⭐⭐⭐ |
| AKShare | `ak.fund_em_open_fund_rank()` | 排行榜数据（净值、各期收益、今年来、成立来） | ⭐⭐⭐⭐ |
| AKShare | `ak.fund_purchase_em()` | 申购状态、日限额 | ⭐⭐⭐⭐ |
| AKShare | `ak.fund_portfolio_hold_em()` | Top10 重仓 | ⭐⭐⭐⭐ |
| AKShare | `ak.fund_open_fund_info_em(indicator='累计收益率走势')` | 成立日起每日累计收益（用来算 YTD） | ⭐⭐⭐⭐ |
| AKShare | `ak.fund_etf_spot_em()` | 场内 ETF 实时价 | ⭐⭐⭐⭐⭐ |
| AKShare | `ak.stock_us_spot_em()` | 美股实时行情（大批量） | ⭐⭐⭐⭐ |
| **天天基金** | `pingzhongdata/{code}.js` | 净值曲线、近期收益、资产配置 | ⭐⭐⭐⭐ |
| 天天基金 | `fundf10.eastmoney.com/jbgk_{code}.html` | 规模、成立日、基金经理 | ⭐⭐⭐ |
| **雪球** | 基金页 HTML | 规模、管理费、费率详情 | ⭐⭐⭐ |
| 雪球 | `stock_individual_spot_xq` | 港股 / A 股实时 | ⭐⭐⭐ |

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
A: 前端数据是**上次脚本运行时的快照**，不是实时。看 `web/data/meta.json` 的 `generated_at` / `enriched_at` 字段确认数据时间。

**Q: 能做到实时吗？**
A: 理论上可以（前端直接调 AKShare / 天天基金），但：
- 会被限频（接口通常 OPTIONS 跨域 + 限频）
- 页面加载慢（200+ 请求）
- 需要 CORS 代理或后端中转

**不如定时跑脚本，静态化部署**。如果你一定要实时，考虑改造成 FastAPI + 前端轮询。

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
