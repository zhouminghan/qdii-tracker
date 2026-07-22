# QDII UI 回归

## 适用场景
- 功能修改后跑回归验收
- 新增回归场景
- 数据变更后的前端验证

## 流程
1. `fundctl.py check` — 数据一致性校验
2. 本地启动 web 服务：`cd web && python3 -m http.server 8765`
3. 浏览器交互验收：对照 `feedback/ui_scenarios/*.yaml` 场景逐条验证
4. 截图 / 日志放 `test/` 目录
5. 通过 → 提交

## 回归目录
`feedback/ui_scenarios/` — 声明式场景（工具无关，Agent 现场发现可用工具驱动）

## 声明式格式
```yaml
origin:
  bug_or_feature: "描述"
  found_by: "来源"
  fixed_in: "改动的文件"
steps:
  - open: "打开哪个页面"
    assert:
      "选择器": "期望值"
```

## 工具无关原则
yaml 文件不锁定 Playwright/Selenium。执行时由 Agent 现场发现环境里可用的浏览器自动化工具。只需声明：打开什么页面 → 做什么交互 → 断言什么值。

## 固化检查
修改后问：这个场景容易再犯吗？是 → 补 yaml；否 → 说明理由
