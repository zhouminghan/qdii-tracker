# ADR 0003：Markdown 笔记的远端存储

## 状态

已评估，等待发布方式确认。

## 背景

当前站点由 GitHub Pages 静态托管。浏览器可以直接读取公开文件，但不能在没有凭据的情况下写入 GitHub 仓库。

研究笔记需求为：

- Markdown 格式。
- 支持普通链接、外部图谱链接和图片链接。
- 每个笔记是独立文件，便于版本历史和直接阅读。
- 用户倾向远端保存，不依赖浏览器本地数据库。

## 可选方案

### A. 浏览器保存 GitHub PAT

站点提供 GitHub 仓库、分支和 fine-grained PAT 配置，通过 GitHub Contents API 写入 `notes/*.md`。

优点：

- 不需要新增服务端。
- 可以立即实现提交、更新和读取。

风险：

- PAT 存于浏览器存储后，任何同源脚本漏洞都可能读取它。
- 浏览器清缓存、换设备或撤销 token 后需要重新配置。
- 不适合作为长期公开发布方案。

### B. GitHub OAuth + Serverless Worker

使用 Cloudflare Worker、Vercel Function 或同类轻量服务完成 GitHub OAuth。Access token 只保存在服务端加密会话或 HttpOnly Cookie 中。

优点：

- 浏览器不接触长期凭据。
- 可以使用最小仓库权限。
- 支持明确的登录、退出、冲突处理和发布审计。

成本：

- 新增一个小型后端和 OAuth App。
- 需要配置回调地址、会话密钥和部署环境变量。

### C. 纯本地 + 手动 Markdown 导出

当前实现采用 Markdown 文本编辑、安全链接渲染和 `.md` 下载。用户可以自行移动到 Git 仓库。

优点：

- 无账号、无密钥、无后端。
- 离线可用。

限制：

- 不能直接在站点内提交到 GitHub。
- “本地单独文件夹”受浏览器下载目录限制，无法无提示写入任意目录。

## 决策

不采用在 localStorage 中长期保存 GitHub PAT 的方案。

建议的正式同步方案是：

1. 浏览器保留短期草稿和离线缓存，避免网络异常导致内容丢失。
2. 通过 Serverless Worker 完成 GitHub OAuth。
3. 每篇笔记写入独立 `notes/<slug>.md`，正文使用 Markdown，文件头记录标题、基金代码、标签和更新时间。
4. 更新时携带 GitHub `sha` 做乐观并发校验，冲突时要求用户选择覆盖或合并。
5. 发布动作必须明确显示目标仓库、分支和文件路径。

远端保存可以作为主要入口，但不建议让运行中的浏览器在没有任何本地临时副本的情况下直接编辑远端唯一副本。

## 当前实现

- 仓库内种子笔记按 `notes/<slug>.md` 一篇一文件保存，文件头记录标题、基金代码、标签和时间。
- 前端通过 Vite 的 raw glob 载入全部 Markdown 文件，并播种到本地 IndexedDB。
- 笔记正文按 Markdown 保存。
- 笔记正文支持安全渲染 HTTP/HTTPS 链接。
- 每篇笔记可下载为独立 `.md` 文件。
- 当前仍未接入 GitHub 写入、OAuth 或远程同步。
