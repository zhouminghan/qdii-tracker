# constants — 共享常量模块

**文件**：`scripts/core/constants.py`
**上游**：所有 pipeline/sources 脚本（import 使用）
**下游**：无（纯常量定义，无副作用）
**updated**：2026-07-24

## 入口
```python
from core.constants import CATEGORIES, DATA_DIR, STANDARD_SHARE_KEY_ORDER, ...
```
无 main()，纯常量定义模块。

## 核心常量

### 路径 (line 10-14)
| 常量 | 值 | 说明 |
|------|-----|------|
| `ROOT_DIR` | `scripts/../../` | 项目根目录 |
| `SCRIPTS_DIR` | `ROOT_DIR / "scripts"` | 脚本目录 |
| `DATA_DIR` | `ROOT_DIR / "web" / "data"` | 前端数据目录 |
| `CONFIG_DIR` | `ROOT_DIR / "config"` | 配置目录 |
| `HOLDINGS_DIR` | `DATA_DIR / "holdings"` | 持仓数据目录 |

### 分类 (line 19-24)
| 常量 | 值 | 说明 |
|------|-----|------|
| `CATEGORIES` | `["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]` | 6 大分类 |
| `HOLDINGS_CATEGORIES` | `("active", "global_other")` | 需抓持仓的分类 |

### 分类标签 (line 29-37)
`CATEGORY_LABELS` — 各分类的中文标签（用于日志输出）

### 请求头 (line 42-50)
- `HEADERS_EASTMONEY` — 天天基金 F10 请求头
- `HEADERS_FUND` — 天天基金基金页面请求头

### ETF / 字段规则 (line 56-59)
- `ETF_SKIP_FIELDS` — ETF 不覆盖 nav/nav_date/daily_change
- `ALWAYS_OVERWRITE_FIELDS` — 每天变动的字段必须强制覆盖

### 排序规则 (line 64-75)
- `CURRENCY_RANK` — 币种排序优先级
- `SHARE_CLASS_RANK` — 份额类型排序（A>C>E>...，后端收费排末尾）

### Key 标准顺序 (line 82-104)
- `STANDARD_SHARE_KEY_ORDER` — share dict 54 个 key 的标准顺序（避免 diff 噪音）
- `STANDARD_HOLDINGS_KEY_ORDER` — holdings dict 顶层 key 顺序
- `STANDARD_HOLDING_ITEM_KEY_ORDER` — 单个持仓条目 key 顺序

## 关键函数表

| 常量 | 行号 | 作用 |
|------|------|------|
| `CATEGORIES` | 19 | 6 大分类（唯一权威定义） |
| `HOLDINGS_CATEGORIES` | 24 | 需抓持仓的分类（收拢 3 处硬编码） |
| `STANDARD_SHARE_KEY_ORDER` | 82 | share dict 54 key 标准顺序 |
| `STANDARD_HOLDINGS_KEY_ORDER` | 97 | holdings dict 顶层 key 顺序 |
| `SHARE_CLASS_RANK` | 66 | 份额类型排序规则 |

## 约束
- 分类常量仅在此定义，其他模块全部 import — 改一处即全部生效
- `HOLDINGS_CATEGORIES` 原本散落在 fundctl.py/holdings.py/reclassify.py 三处，已收拢
- `STANDARD_SHARE_KEY_ORDER` 确保所有 pipeline 写盘 key 顺序一致
