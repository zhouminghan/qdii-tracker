# US Fund Tracker · 美股基金追踪看板

一个本地美股 QDII 基金的追踪看板。数据来自 AKShare + 天天基金公开接口，全部本地运行。

![US Fund Tracker Preview](https://via.placeholder.com/800x400?text=US+Fund+Tracker)

## 功能

- **2 大 Tab**：🏦 场外基金 / 📈 场内 ETF
- **场外 4 分组**（Chips 筛选）：标普500 / 纳指100 / 美股主动（白名单精选）/ 全球其他 QDII
- **场内 ETF 3 分组**：标普500 / 纳指100 / 美国50
- **主动基金**：点击系列可查看 Top10 重仓 + 当日涨跌 + 七姐妹识别
- **份额对比**：同一只基金的 A/C/E/F 费率结构一目了然
- **指标**：规模 / 净值 / 日涨跌 / 近1月 / 今年来(YTD) / 近1年 / 成立来 / 基金经理 / 日限额 / 买卖费率

## 目录结构

```
qdii-tracker/
├── scripts/                   # Python 数据采集与加工
│   ├── scan_funds.py          # 从 AKShare 扫描全量基金，按规则分 5 类
│   ├── enrich_data.py         # 补充规模/费率/基金经理/基础收益
│   ├── fill_missing.py        # 用天天基金 pingzhongdata + F10 补齐缺失字段 + YTD
│   ├── fetch_holdings.py      # 抓取主动基金的 Top10 重仓
│   ├── fetch_stocks.py        # 抓取美股/港股/A 股实时行情（持仓涨跌用）
│   └── requirements.txt
├── web/                       # 前端（纯 HTML + Vanilla JS + Tailwind CDN）
│   ├── index.html
│   └── data/                  # 前端消费的 JSON 数据（git 追踪）
│       ├── sp500.json
│       ├── nasdaq_passive.json
│       ├── active.json        # 🎯 美股主动（18 只精选白名单）
│       ├── global_other.json  # 🌐 全球/其他 QDII
│       ├── etf.json           # 📈 场内 ETF
│       ├── us_stocks.json
│       ├── meta.json
│       └── holdings/{code}.json
├── data/                      # 中间产物（gitignore，脚本工作目录）
├── .gitignore
├── CHANGELOG.md
└── README.md
```

## 快速开始

### 依赖安装

```bash
cd scripts
pip install -r requirements.txt
```

### 数据采集流水线

按顺序跑 4 个脚本（全量耗时 ~20 分钟）：

```bash
cd scripts

# 1. 扫描全量基金（~3000 只 QDII 里筛选目标），生成 5 类 json
python scan_funds.py

# 2. 补充规模/费率/基金经理等基础信息
python enrich_data.py

# 3. 用天天基金 pingzhongdata + F10 补齐漏掉的字段（净值/历史收益/YTD）
python fill_missing.py

# 4. 主动基金的 Top10 重仓
python fetch_holdings.py

# 5. 持仓对应股票的实时行情
python fetch_stocks.py
```

> `fill_missing.py` 和 `fetch_holdings.py` 会自动把 `data/` 的结果同步到 `web/data/`，不用手动 cp。

### 前端查看

```bash
cd web
python3 -m http.server 8765
# 打开 http://localhost:8765/
```

## 数据源

- **AKShare**（主要）：基金列表、规模、费率、累计收益率走势
- **天天基金 pingzhongdata.js**：净值、日涨跌、近 1 月/3 月/6 月/1 年收益
- **天天基金 F10 概况页**：成立日期、基金经理、最新规模
- **雪球**：美股实时行情、基金补充信息

## 分类规则（scan_funds.py）

1. `FORCE_EXCLUDE_CODES` → 直接丢到 exclude（黑名单）
2. `FORCE_INCLUDE_CODES` → 直接归入指定 category（白名单，绕过规则）
3. 不是 QDII → exclude
4. 名字命中 `EXCLUDE_KEYWORDS` → exclude（债/港股/日经/医疗/健康/中概/等）
5. 场内代码（159/513/510 开头）→ etf
6. 命中 `SP500_KEYWORDS` → sp500
7. 命中 `NASDAQ_KEYWORDS` → nasdaq_passive
8. 其他含"美国/美股/全球/海外/科技..."→
   - 名字命中 `ACTIVE_WHITELIST_KEYWORDS`（18 只精选）→ active
   - 否则 → global_other

## License

Private / Personal use.
