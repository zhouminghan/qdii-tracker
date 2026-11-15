# ADR-0003：Chromium-only 浏览器测试与轻量 CI

## 背景

本机只具备 Chromium/Chrome；额外安装 Firefox/WebKit 没有业务收益，并会拖慢本地测试。
现有数据更新 workflow 最近 12 次平均耗时 662 秒，主要耗时是外部数据采集，不是浏览器测试。

## 候选方案

- 继续维护 Chromium、Firefox、WebKit 三引擎 CI。
- 浏览器验收只使用 Chromium/Chrome，浏览器测试保留在本地。
- 删除所有浏览器交互测试，只保留 DOM 单测。

## 决定

采用 Chromium-only：

- 本地 T1–T3 使用本机 Chrome。
- GitHub Actions 不安装浏览器、不运行 Playwright。
- 保留全部真实交互、IndexedDB、axe 与视觉测试。
- Firefox/WebKit 不属于当前兼容性承诺，不阻塞发布。

## 影响

- GitHub Actions 不运行测试；类型、Lint、Vitest、Python 测试和 Playwright 均在本机按需执行。
- 本地交互回归按 T0–T3 分级，不要求每次小改都跑完整矩阵。
- 如果未来公开承诺 Firefox/WebKit，需要新增 ADR，并恢复本地真实浏览器回归。
