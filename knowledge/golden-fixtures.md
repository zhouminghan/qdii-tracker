# Golden Fixtures — 数据侧黄金样例

> 人工标注「这只基金应该长什么样」，用于防止分类规则/pipeline 改动误伤数据。
> `scripts/checks/verify_data.py` 读取本文档内嵌的 JSON 数据块，逐条比对 `web/data/*.json`。

## Fixture 格式

```json
{
  "code": "基金代码，如 096001",
  "expected_category": "应归属的分类，取值见 scripts/core/constants.py 的 CATEGORIES",
  "note": "为什么这是值得固化的边界案例",
  "checks": {
    "nav_range": "[最小值, 最大值]，可选，净值合理区间",
    "chg_ytd_range": "[最小值, 最大值]，可选，今年涨跌幅合理区间",
    "default_share_code": "该系列默认展示的份额代码，可选",
    "required_fields": "[\"nav\", \"buy_status\", ...]，可选，这些字段不得为空（ETF 无 nav，勿列入）"
  }
}
```

## 添加原则

- 每条 fixture 的检查值必须来自「已验证通过」的真实场景，不接受凭空编造
- 优先固化的场景：force_include 强制纳入 / passive_override 类型改写 / 曾经被误分类过
- fixtures 为空时视为通过（骨架阶段允许空跑，不阻塞现有流程）

## 数据

```json
{
  "fixtures": [
    {
      "code": "096001",
      "expected_category": "sp500",
      "note": "被动基金被 passive_override 改写为 active 的边界案例",
      "checks": {
        "nav_range": [2.0, 4.0],
        "chg_ytd_range": [-50, 50],
        "required_fields": ["nav", "buy_status", "scale"]
      }
    },
    {
      "code": "270023",
      "expected_category": "active",
      "note": "主动基金 force_include 边界案例——广发全球精选",
      "checks": {
        "nav_range": [3.0, 10.0],
        "chg_ytd_range": [-50, 100],
        "required_fields": ["nav", "buy_status", "scale"]
      }
    },
    {
      "code": "513500",
      "expected_category": "etf",
      "note": "ETF 边界案例——博时标普500ETF，场内交易基金（ETF 无 nav 字段）",
      "checks": {
        "chg_ytd_range": [-50, 50],
        "required_fields": ["buy_status", "scale", "chg_ytd"]
      }
    },
    {
      "code": "160644",
      "expected_category": "global_other",
      "note": "offshore 基金边界案例——鹏华港美互联",
      "checks": {
        "nav_range": [0.5, 3.0],
        "chg_ytd_range": [-50, 100],
        "required_fields": ["nav", "buy_status", "scale"]
      }
    }
  ]
}
```
