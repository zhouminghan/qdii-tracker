# ➕ 新增基金操作手册

本手册覆盖"手工把一只基金/一个系列加进看板"的完整流程。适用人/AI 皆可照做。

## 📋 TL;DR（最短路径）

```bash
# 1. 编辑 web/data/{分类}.json，按模板追加一个 series（见下文"骨架字段模板"）
# 2. 跑三个脚本自动补齐所有字段
cd scripts
python3 enrich_data.py      # 补规模/申购/费率/基金经理
python3 fill_missing.py     # 补净值/涨跌幅/YTD
python3 fetch_holdings.py   # 补持仓（仅 active / global_other 需要）

# 3. 本地验证
cd ../web && python3 -m http.server 8181 &
open http://localhost:8181

# 4. 提交
git add web/data/
git commit -m "feat(data): 新增 XXX（N 份额）到 {分类}"
```

---

## 1️⃣ 准备阶段：搞清楚要加什么

### 1.1 收集基金代码
一个"系列"通常包含多个"份额"（A/C/人民币/美元现汇/美元现钞等）。有以下几种来源查同系列所有代码：

**方式 A：天天基金接口直接查**
```bash
curl -s "https://fundgz.1234567.com.cn/js/{代码}.js?rt=$(date +%s)"
# 返回 jsonpgz({"fundcode":"...", "name":"...", ...})
# name 里能看到 "A"/"C"/"美元现汇" 等份额标识
```

**方式 B：用 AKShare 一把搜出所有同名基金**
```python
import akshare as ak
df = ak.fund_name_em()
df[df['基金简称'].str.contains('华夏移动互联', na=False)][['基金代码','基金简称','基金类型']]
# 输出：
#   002891  华夏移动互联混合人民币      QDII-混合灵活
#   002892  华夏移动互联混合美元现汇    QDII-混合灵活
#   002893  华夏移动互联混合美元现钞    QDII-混合灵活
```

### 1.2 选分类
按 `scripts/scan_funds.py` 的分类规则，手动指定 `category` 字段，5 选 1：

| category        | 适用                                       |
|-----------------|-------------------------------------------|
| `sp500`         | 跟踪标普 500 的场外指数基金                 |
| `nasdaq_passive`| 跟踪纳指 100 的场外被动指数基金             |
| `active`        | 美股主动基金（白名单精选）                  |
| `global_other`  | 其他全球型 QDII（亚洲/港股/科技/行业 ETF…） |
| `etf`           | 场内跨境 ETF（513/159 等）                 |

判断小技巧：
- **场内还是场外**：代码 159/510/513 开头 = 场内 ETF；其他 = 场外
- **美股还是全球**：看基金实际持仓，不要只看名字
  - 持仓 90%+ 美股 → 可能属于 `active`（但还要看是否在白名单）
  - 持仓含港股 / 日股 / 韩股 / 台股 → `global_other`

### 1.3 选默认份额（`default_share_code`）
- **有 A/C 的**：选 A（规模一般更大）
- **有人民币/美元的**：选人民币（用户基数大，数据源稳）
- **只有一只**：就是它

---

## 2️⃣ 骨架写入 `web/data/{分类}.json`

### 2.1 定位文件并追加
打开 `web/data/{分类}.json`，在 `series` 数组末尾追加一个 series 对象：

```json
{
  "series_id": "{公司名}__{系列名}__{分类}",
  "series_name": "{系列名}",
  "display_name": "{公司名}{系列名}",
  "company": "{公司名}",
  "company_display": "{公司名}",
  "category": "{分类}",
  "etf_target": null,
  "default_share_code": "{默认份额代码}",
  "series_scale": null,
  "shares": [
    {
      "code": "{份额代码}",
      "name": "{份额全名}",
      "fund_type": "{QDII-XXX}",
      "share_class": "{A/C/人民币/美元现汇/...}",
      "currency": "{人民币/美元}"
    }
  ]
}
```

### 2.2 真实示例：华夏移动互联（3 份额）

```json
{
  "series_id": "华夏__移动互联混合__global_other",
  "series_name": "移动互联混合",
  "display_name": "华夏移动互联混合",
  "company": "华夏",
  "company_display": "华夏",
  "category": "global_other",
  "etf_target": null,
  "default_share_code": "002891",
  "series_scale": null,
  "shares": [
    { "code": "002891", "name": "华夏移动互联混合人民币",   "fund_type": "QDII-混合灵活", "share_class": "人民币",   "currency": "人民币" },
    { "code": "002892", "name": "华夏移动互联混合美元现汇", "fund_type": "QDII-混合灵活", "share_class": "美元现汇", "currency": "美元"   },
    { "code": "002893", "name": "华夏移动互联混合美元现钞", "fund_type": "QDII-混合灵活", "share_class": "美元现钞", "currency": "美元"   }
  ]
}
```

### 2.3 追加时记得
- **不要删任何已有 series**
- **JSON 末尾别漏逗号**（每个 series 之间用逗号分隔）
- 建议用 Python 脚本避免手抖：

```python
import json
with open('web/data/global_other.json', encoding='utf-8') as f:
    d = json.load(f)
d['series'].append({...})  # 上面的 series 对象
d['series_count'] = len(d['series'])  # 更新计数
with open('web/data/global_other.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
```

---

## 3️⃣ 跑脚本自动补齐剩余字段

骨架里只有 9 个基础字段。跑完下面三个脚本，会自动补满剩下 28 个字段（规模/净值/申购/费率/涨跌幅/持仓等）。

### 3.1 `enrich_data.py`（规模/申购/费率/基金经理）
耗时：约 3-5 分钟（对所有基金逐只抓雪球接口）
输出：
- `series_scale`（系列规模，亿）
- `shares[].scale / scale_raw`（单份额规模）
- `shares[].buy_status / daily_limit`（申购状态、单日限额）
- `shares[].established`（成立日期）
- `shares[].manager`（基金经理）
- `shares[].mgmt_fee / custody_fee / first_buy_rate / free_hold_days`（各种费率）
- `shares[].chg_1w / chg_ytd / chg_1y / chg_2y / chg_3y / chg_since_inception`（涨跌幅）

```bash
cd scripts && python3 enrich_data.py
```

### 3.2 `fill_missing.py`（净值/涨跌幅/YTD）
耗时：约 1-2 分钟
输出：
- `shares[].nav / nav_date`（最新净值、日期）
- `shares[].daily_change`（当日涨跌幅 %）
- `shares[].chg_1m / chg_3m / chg_6m / chg_1y`（近几月涨跌幅）
- 对"YTD 缺失"的基金额外走 AKShare 推算

```bash
cd scripts && python3 fill_missing.py
```

### 3.3 `fetch_holdings.py`（仅 active / global_other 需要）
耗时：约 1-2 分钟（只抓默认份额，同系列其他份额共享持仓）
输出：`web/data/holdings/{默认代码}.json`（TOP10 持仓股 + 权重）

```bash
cd scripts && python3 fetch_holdings.py
```

⚠️ 如果只想抓新加的基金（不全量重跑），可以临时写个小脚本：

```python
import sys, json, time
sys.path.insert(0, 'scripts')
from fetch_holdings import fetch_holdings
from pathlib import Path

for code, name in [('002891', '华夏移动互联'), ('457001', '国富亚洲机会A')]:
    result = fetch_holdings(code)
    if result and 'error' not in result:
        with open(f'web/data/holdings/{code}.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    time.sleep(0.5)
```

### 3.4 `fetch_stocks.py`（持仓股票实时行情）
如果加了新的 `active`/`global_other` 基金，对应持仓里可能出现新股票，跑一次刷新行情：
```bash
cd scripts && python3 fetch_stocks.py
```
耗时：约 2-3 分钟（拉美股全量 + 单只股票接口补齐）

---

## 4️⃣ 本地验证

```bash
cd web && python3 -m http.server 8181
# 浏览器打开 http://localhost:8181
```

核对清单：
- [ ] 新基金在对应板块（场外 或 ETF）的表格里能看到
- [ ] 外层行显示**默认份额**的净值/涨跌幅
- [ ] 点箭头展开，看到所有份额
- [ ] 规模 / 申购状态 / 成立时间 / 基金经理 都不是"--"
- [ ] 走势图能正常加载（按钮 → 弹出图表）
- [ ] 持仓（如果是 active/global_other）点开有 TOP10 股票

**如果字段有空值**：
- 规模/经理为空 → 雪球接口有时抽风，重跑 `enrich_data.py`
- 净值为空 → 基金太新还没披露，或 fundgz 限频，等一会重跑 `fill_missing.py`
- 持仓为空 → 主动基金季报刚发可能抓不到，过几天重跑 `fetch_holdings.py`

---

## 5️⃣ 提交

```bash
git add web/data/
# 典型 commit message
git commit -m "feat(data): 新增 华夏移动互联（3 份额）+ 国富亚洲机会A（1 份额）到 global_other"
git push
```

Actions 的日常 cron（工作日 17:30 + 22:30）会继续自动刷新净值，不用手动干预。

---

## 🐛 踩坑速查

| 现象 | 可能原因 | 修复 |
|---|---|---|
| fundgz 返回 HTTP 514 | 本地 IP 被限频（浏览器测试打多了） | 换 WiFi / 开关手机热点 / 等 5-10 分钟；Actions 里不会出现（云 IP 不同） |
| 脚本跑完字段仍空 | 雪球/天天基金接口该只基金没数据 | 人工填 `web/data/{分类}.json` 对应字段，或等基金披露 |
| 新基金不显示 | JSON 格式有误（漏逗号/引号） | `python3 -c "import json; json.load(open('web/data/xxx.json'))"` 验证 |
| 持仓全为 0 权重 | 基金还没公布季报 | 等下一季报发布后重跑 `fetch_holdings.py` |
| 走势图打不开 | 天天基金 pingzhongdata 失败 | 浏览器 Console 看 Network 报错；限频同上 |

---

## 🔗 相关

- [主数据文件](../web/data/) — 5 个分类 json + holdings/ 目录
- [脚本目录](../scripts/) — scan/enrich/fill/holdings/stocks 五件套
- [分类规则](../README.md#-分类规则scan_fundspy) — 自动分类时的关键词和白名单
- [数据流水线原理](../README.md#-数据流水线原理) — 各脚本的输入/输出
