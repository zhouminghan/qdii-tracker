# codegen — 前端配置代码生成

**文件**：`scripts/pipeline/codegen.py`
**上游**：`fundctl.py add/move/sync` 之后调用（确保前端配置与后端 SSOT 同步）
**下游**：`web/js/config.js`（AUTO-GENERATED CONFIG 段）
**updated**：2026-07-24

## 入口
```python
from pipeline import codegen
codegen.main()
```
主入口：`codegen.py:main()` (line 38-58)

## 核心流程

1. **加载 SSOT** (line 39)：`config/funds.json` → 读取 `starred`、`company_brand`、`passive_override`
2. **生成 JS 代码** (line 20-35)：`build_generated_block(cfg)` → 生成 3 个前端常量：
   - `OFFSHORE_STARRED` — 星标基金代码 Set
   - `COMPANY_BRAND` — 45 家基金公司品牌色 + 缩写
   - `PASSIVE_HOLDINGS_OVERRIDE` — 被动基金持仓覆盖
3. **注入 config.js** (line 41-53)：
   - 替换现有 `AUTO-GENERATED CONFIG START` ... `END` 段
   - 或首次运行时找到 `SHARE_CLASS_ORDER` 锚点插入

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `main()` | 38 | CLI 入口 |
| `build_generated_block()` | 20 | 生成 AUTO-GENERATED 代码段 |
| `_js_obj()` | 16 | Python dict → JSON string（JS 兼容格式） |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `config/funds.json` | `web/js/config.js` | — |

## 约束
- 生成的 `COMPANY_BRAND` 对象含 45 家基金公司
- `PASSIVE_HOLDINGS_OVERRIDE` 仅被动基金但类型标记为 active 的少量基金（如 096001）
- 代码段以 `// DO NOT EDIT` 开头，编辑 config/funds.json 后重跑 codegen 即可
