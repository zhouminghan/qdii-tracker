# QDII Tracker

> 约束 + 踩坑速查。架构 + 功能 + 命令见 [README](./README.md)。决策细节见 [MEMORY.md](./MEMORY.md)。

## Commands

```bash
cd scripts && python3 fundctl.py sync    # scan→enrich→fill→holdings
cd scripts && python3 fundctl.py refresh  # fill 增量
cd scripts && python3 fundctl.py add --code 008888 --to active --keyword "基金名"
cd scripts && python3 fundctl.py check    # 一致性校验（含 golden fixtures）
python3 feedback/verify_data.py           # 单独跑数据验收
cd ../web && python3 -m http.server 8765  # 本地开发
```

## Critical Rules

### 数据流水线
- **scan 后必须接 enrich + fill**，否则覆盖丢失已有数据
- **数据文件不写时间戳**：仅 `meta.json` 保留 `generated_at`
- **写盘前 normalize**：`{cat}.json` → `normalize_share_keys()`
- **nav_date 永不回退**：lsjz 失败保留旧值，禁用 `datetime.now()` 推算
- **force_include 不继承子类**：A/C/美元逐一加入；跨分类挪动：(a) 全量子类加 → (b) scan 检查残留 → (c) enrich+fill
- **LOF chg_ytd 兜底**：取同系列兄弟份额（A/C 差异 <1%）
- **ETF 无申购历史**：`_update_history()` 跳过 `"场内"`

### 部署
- **禁止 CI 内嵌部署**：仅 commit+push → `gh workflow run deploy-pages.yml --ref main`
- **不改既有 UI**：红涨绿跌、主动基红色警告
- **版本戳**：`deploy-pages.yml` 自动 bump，新 JS/CSS 写 `?v=placeholder`
- **目录纪律**：`web/` 仅 `data/*.json` / `js/*.js` / `css/*.css` / `.nojekyll`

### 截图分享（全部约束）
- **screenshot.js**：IIFE，`html-to-image` CDN 懒加载；CSS 独立 `app.css`
- **卡片结构**：外层 `.ss-phone-wrap`（唯一带边框）+ 内层 `.ss-inner` × 2（无边框）→ 不改结构
- **宽度自适应**：wrap `fit-content` + dialog `rAF` 同步 `style.width`
- **窄屏**：`.ss-chip-group`/`.ss-col-grid` `min-width:0`；`.ss-tbl-wrap { overflow-x: auto }`
- **净值列**：日期内联 `<span>·MM-DD</span>`，不换行
- **列筛选**：`locked:true` 不显示面板；`sortable:true` 可排序
- **表头对齐**：申购居中 / 数字右对齐 / 其余左对齐
- **iPhone**：截前在克隆体上移除 `backdrop-filter`，`navigator.share()` 存相册
- **玻璃态 UI**：Chip/Tab/分享按钮激活态中性渐变跟随主题（亮=深底白字，暗=浅底深字）；市场卡/弹窗 `backdrop-filter:blur`；`-webkit-` 前缀必配
- **申购历史**：`_update_history()` → `buy_status_history[]`；状态+额度都没变则保持原日期；任一变化追加新条目
- **指标卡**：轮廓用 `border`，不用 `box-shadow`；7 风格覆盖 `border-color`，`box-shadow:none`
- **`snapPng()`**：`cloneNode` 离屏渲染 → 不改可见 DOM；克隆体 `position:absolute` + `#ss-preview{position:relative}`（必须挂 preview 下）；截前 `clone.style.boxShadow='none'` 去外框阴影 + `classList.remove('dark')` 强制亮色 → 截后恢复暗色。踩坑详情见 [MEMORY.md](./MEMORY.md)

### 实时轮询
- **idle-scheduler** 统一调度（隐藏/空闲暂停）；**offshore-live-nav** lsjz→pzd 兜底；**etf-premium** 盘中60s；**market-indices** 盘中60s/盘后5min

## Harness（改 → 测 → 固）

> 三层：**预防**=本文件 | **执行**=`fundctl.py check` | **反馈**=`feedback/`（详见 `feedback/README.md`）

```
feedback/   # golden_fixtures.json + verify_data.py + scan_scenarios.py + ui_scenarios/ (5场景)
```

**① 改** — 检查 `.codebuddy/plans/` 续接 → 读 AGENT/README/MEMORY → 每步勾计划文件

**② 测** — 数据侧：`fundctl.py check`（含 verify + lint + scan_scenarios）；UI 侧：启 web → Playwright (`test/`，gitignored)；一个手段不行就换一个
> Agent 执行路径：先跑 `fundctl.py check`（无浏览器依赖，秒级），再 `python3 -m http.server` 启服务 → `node test/self-check.js` 跑全量 UI 回归。

**③ 固** — 提交 → `scan_scenarios.py` 会提示哪些 UI 场景需要重跑 → 自问是否补回归项 → 同步 MEMORY.md

### 设计约束
- **数据侧确定性、UI 侧工具无关**：`verify_data.py` 纯 Python；`ui_scenarios/*.yaml` 声明式
- **空 fixtures/无场景 = 通过**；**只固化验证通过的结果**

## 可执行清单（Agent 照做）

### 每次修改后
```bash
cd scripts && python3 fundctl.py check          # 数据侧（秒级，无浏览器）
cd ../web && python3 -m http.server 8899 &      # 启服务
NODE_PATH=~/.npm/_npx/<cache>/node_modules node test/self-check.js  # UI 全量
kill $(lsof -t -i :8899)                        # 关服务
```

### 改截图分享额外检查
- 保存 PNG 无外框阴影 → `snapPng()` 截前 `clone.style.boxShadow = 'none'`
- 克隆体 `position:absolute` + 挂 `#ss-preview` → 不丢 CSS 上下文
- 指标卡 border + no box-shadow → 7 风格全覆盖
- 手机端表格 → `.ss-tbl-wrap { overflow-x: auto }`

### 新增文件放哪
- JS → `web/js/`；CSS → `web/css/`；测试 → `test/`（gitignored）
- Python → `scripts/pipeline/` 或 `scripts/core/`
- 回归场景 → `feedback/ui_scenarios/`（复制 `_TEMPLATE.yaml`）
- 新 JS/CSS 必须在 `index.html` 加 `?v=placeholder`

## Loop（异常自动修复闭环）

每次触发数据更新（`fundctl.py sync` 或 `refresh`）后，自动运行诊断并在能力范围内修复。

**触发点**：数据更新完成后、CI 流水线末尾、或手动 `fundctl.py diagnose`。

**闭环路径**：
- 诊断 `fundctl.py diagnose` → 输出异常列表
- 自动修复：`missing_nav` 类异常 → 执行对应基金的 `refresh --code`；`missing_fee` → `sync`
- 无法自动修复（`auto_fix: false`）→ 追加到 `feedback/anomalies.md`，下次运行检测是否已修复
- 修复后重跑数据更新（最多 3 轮），再次诊断确认

**状态文件**：`feedback/.fund_add_state.json` 记录 add 操作的进度（避免中断重来）。

## Evolve（演进控制）

完成功能 / 修复 bug 后：

- Loop 捕捉到的规律性异常 → 提炼成 AGENT.md 新规则
- 踩过的坑 → 记入 MEMORY.md
- CI 耗时攀升 / 步骤增多 → 考虑合并或精简
- 回复/技能拆分臃肿 → 按 reviewer / implement 维度拆分 Skill
- 每季度检查一次：以上条目是否还有效？已过时的规则直接删除
