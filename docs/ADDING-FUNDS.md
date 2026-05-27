# ➕ 新增基金操作手册

本手册覆盖"手工把一只基金/一个系列加进看板"的完整流程。

## 📋 TL;DR（最短路径）

**方式 A：通过白名单自动扫描（推荐）**

```bash
# 1. 编辑 scripts/scan_funds.py，在 FORCE_INCLUDE_CODES 或 ACTIVE_WHITELIST_KEYWORDS 中加入
# 2. 跑完整流水线
cd scripts
python3 scan_funds.py          # 扫描 + 分类（会生成骨架覆盖 JSON！）
python3 enrich_data.py         # 补规模/申购/费率/基金经理/收益
python3 fill_missing.py        # 补净值/涨跌幅/YTD
python3 refresh_purchase.py    # 补申购状态
python3 fetch_holdings.py      # 补持仓（仅 active / global_other）

# 3. 本地验证
cd ../web && python3 -m http.server 8080 &
open http://localhost:8080

# 4. 提交
git add .
git commit -m "feat: 新增 XXX 到 {分类}"
```

**方式 B：手动编辑 JSON 骨架 + 跑补数据脚本**

```bash
# 1. 编辑 web/data/{分类}.json，按模板追加 series（见下文"骨架字段模板"）
# 2. 跑补数据脚本（不会重新覆盖 JSON，只补空字段）
cd scripts
python3 enrich_data.py
python3 fill_missing.py
python3 refresh_purchase.py
python3 fetch_holdings.py      # 仅 active / global_other

# 3. 本地验证 + 提交（同上）
```

> ⚠️ **注意**：`scan_funds.py` 会**完全覆盖** `web/data/*.json`！如果已有 enriched 数据，跑 scan 后必须重跑 enrich + fill_missing 补回。方式 A 适合从零开始，方式 B 适合在已有数据基础上追加。

---

## 1️⃣ 准备阶段：搞清楚要加什么

### 1.1 收集基金代码

一个"系列"通常包含多个"份额"（A/C/人民币/美元现汇/美元现钞等）。

**用 AKShare 搜出所有同名基金**
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

| category        | 适用                                |
|-----------------|-------------------------------------|
| `sp500`         | 跟踪标普 500 的场外指数基金          |
| `nasdaq_passive`| 跟踪纳指 100 的场外被动指数基金      |
| `active`        | 美股主动基金（白名单精选）           |
| `global_other`  | 其他全球型 QDII                     |
| `etf`           | 场内跨境 ETF（513/159 等）          |

### 1.3 选默认份额（`default_share_code`）

- **有 A/C 的**：选 A 类人民币份额
- **有人民币/美元的**：选人民币
- **只有一只**：就是它

---

## 2️⃣ 方式 A：加白名单（推荐）

编辑 `scripts/scan_funds.py`，根据情况选一种：

### 精准白名单（by 代码）

```python
FORCE_INCLUDE_CODES = {
    # 华夏移动互联混合
    "002891": "active",  # 人民币
    "002892": "active",  # 美元现汇
    "002893": "active",  # 美元现钞
}
```

### 关键词白名单（by 名字，自动匹配同系列）

```python
ACTIVE_WHITELIST_KEYWORDS = [
    "华夏移动互联",
]
```

然后跑完整流水线即可。

---

## 3️⃣ 方式 B：手动编辑 JSON 骨架

### 骨架模板

在 `web/data/{分类}.json` 的 `series` 数组末尾追加：

```json
{
  "series_id": "{公司名}__{系列名}__{分类}",
  "series_name": "{系列名}",
  "display_name": "{公司名}{系列名}",
  "company": "{公司名}",
  "company_display": "{公司名}",
  "category": "{分类}",
  "etf_target": null,
  "default_share_code": "{A类人民币代码}",
  "series_scale": null,
  "shares": [
    {
      "code": "{份额代码}",
      "name": "{份额全名}",
      "fund_type": "{QDII-XXX}",
      "share_class": "A",
      "currency": "人民币"
    }
  ]
}
```

### 份额排序规则

shares 数组必须按以下顺序排列：
1. 人民币 A → 人民币 C → 人民币 E → ...
2. 美元 A → 美元 C → ...

### 注意事项

- 不要删任何已有 series
- JSON 格式别错（用 `python3 -c "import json; json.load(open('web/data/xxx.json'))"` 验证）
- `series_scale` 留 null，脚本会自动取 A 类人民币份额的规模

---

## 4️⃣ 补数据脚本说明

| 脚本 | 补什么字段 | 耗时 |
|---|---|---|
| `enrich_data.py` | 规模/费率/基金经理/收益/申购状态 | ~5min |
| `fill_missing.py` | 净值/日涨跌/近1月/YTD/近1年 | ~2min |
| `refresh_purchase.py` | 申购状态/日限额（批量快接口） | ~30s |
| `fetch_holdings.py` | Top10 持仓（仅 active/global_other） | ~2min |

---

## 5️⃣ 本地验证

```bash
cd web && python3 -m http.server 8080
```

核对清单：
- [ ] 新基金在对应板块表格里能看到
- [ ] 外层行显示 A 类人民币份额的净值/规模
- [ ] 点箭头展开，看到所有份额（先人民币后美元，A 在前）
- [ ] 规模 / 申购状态 / 成立时间 / 基金经理 都不是"--"
- [ ] 走势图能正常加载
- [ ] 费率 Tooltip 显示综合费率（C 类含销售服务费）

---

## 6️⃣ 提交

```bash
git add .
git commit -m "feat(data): 新增 华夏移动互联（3 份额）到 active"
```

Actions 日常 cron 会继续自动刷新净值。

---

## 🐛 踩坑速查

| 现象 | 可能原因 | 修复 |
|---|---|---|
| scan 后数据全丢了 | scan 覆盖了 enriched 数据 | 重跑 enrich + fill_missing |
| display_name 末尾多"汇"字 | 基金名含"美元汇"，去"美元"后"汇"残留 | 已修复（make_display_name 加了 `[汇钞]$` 清理） |
| series_scale 异常大 | 多份额规模加和 | 已修复（只取 A 类人民币规模） |
| C 类综合费率不显示 | sale_service_fee 为 null | 跑脚本从费率页补（或手动填） |
| 子分类份额排序乱 | JSON 中 shares 没按规则排 | enrich_data 的 share_sort_key + 前端 shareSort() 双重保证 |
| nav_date 回退了 | 接口返回旧缓存数据 | 所有脚本已有防回退检查（只允许日期前进） |

---

## 🔗 相关

- [主数据文件](../web/data/) — 5 个分类 JSON + holdings/ 目录
- [脚本目录](../scripts/) — scan/enrich/fill/purchase/holdings 五件套
- [分类规则](../README.md#-分类规则scan_fundspy)
- [项目规范](../CLAUDE.md) — AI 协作上下文
