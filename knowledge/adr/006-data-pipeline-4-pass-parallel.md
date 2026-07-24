# ADR-006: 数据流水线 4-Pass 并行设计

**状态**：accepted
**日期**：2026-07-13
**决策者**：@zhouminghan

## 背景
数据补全（fill.py）需要从多个源拉取净值、收益、费率、YTD 等数据。面临串行调用（简单但慢）与并行调用（快但需考虑反爬/API 限流）的选择。

## 决策
**Pass 1/2/3/4 分阶段，每阶段内 ThreadPoolExecutor 并行（MAX_WORKERS=4）**，Pass 2b（买卖规则）保持串行（频率低，不值得额外复杂度）。

阶段划分：
- Pass 1: lsjz + pzd（4 线程并行，限速信号量 `BoundedSemaphore(4)`）
- Pass 2: F10 补充规模/成立/经理/费率（4 线程并行）
- Pass 2b: 买卖规则（串行，逐只调 API）
- Pass 3: chg_ytd（4 线程并行）
- Pass 4: chg_since_inception（4 线程并行）

原因：
- I/O 密集瓶颈（网络请求）而非 CPU 密集 — 并行收益显著
- 4 线程平衡速度与反爬风险 — BoundedSemaphore 防止瞬间打爆 API
- Pass 2b 逐只调一个低频率 API，串行开销可接受

## 后果
- ✅ 全量 fill 从 ~8min 降到 ~2min
- ✅ 限速信号量 `_sem` 防反爬
- ❌ Pass 2b 串行 → 成为整个 fill 的瓶颈之一（约 30-60 秒）
- ❌ CI 环境 4 线程需要合理超时设置

## 源码引用
- `scripts/pipeline/fill.py:37-39` — `MAX_WORKERS = 4` + `_sem = threading.BoundedSemaphore(MAX_WORKERS)`
- `scripts/pipeline/fill.py:92-98` — `_fetch_lsjz_pzd()` 两次信号量上下文
- `scripts/pipeline/fill.py:123-365` — main()：s1/s2/s3/f3/s4/f4 分阶段调用
- `scripts/pipeline/fill.py:242-261` — Pass 2b 串行循环（`for i, (cat, code, sh) in enumerate(fee_targets, 1)`）
