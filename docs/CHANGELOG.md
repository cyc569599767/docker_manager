# Changelog

本文件记录项目关键功能与行为变更。

## [Unreleased]

### Added
- 待补充

### Changed
- 待补充

### Fixed
- 待补充

---

## [v0.2.0] - 2026-04-12 (Draft)

### Added
- 列表接口支持服务端分页参数：`from`、`limit`（containers/images/volumes/networks）。
- 列表接口响应头补充分页信息：
  - `X-Total-Count`
  - `X-List-From`
  - `X-List-Limit`（传入 limit 时）
  - `X-Next-From`
  - `X-Has-More`
- 审计接口支持分页与筛选：`limit`、`from`、`q`、`result`。
- 容器/镜像接口支持服务端筛选：
  - containers：`q`、`status`（`all/running/stopped/other`）
  - images：`q`
- 前端路由支持筛选参数可分享：
  - `#/containers?...`
  - `#/images?...`
  - `#/audit?...`

### Changed
- 前端容器/镜像页改为“服务端筛选 + 服务端分页”。
- 审计页搜索改为防抖（300ms）并支持过期请求取消。
- 切换 Tab 的数据加载策略优化，减少无差别全量请求。
- README 重写为中文并补充分页/筛选文档说明。

### Fixed
- 修复 `splitListInput` 正则损坏导致的 TS 编译错误。
- 修复多处中文乱码与文案不一致问题。
- 修复容器日志 `tail` 缺少上限导致的大响应风险。

### Backend hardening
- `run_docker` 增加超时控制，超时返回网关超时错误。
- 镜像拉取任务增加日志行数上限与任务池上限，避免内存持续增长。
- 审计查询增加 `limit` 上限约束。

### Compatibility
- 原有列表接口返回结构保持 `JSON 数组`，向后兼容。
- 新增 query 参数均为可选；未传时保持原行为。
- 前端 hash 路由新增 query 串，不影响原 `#/tab` 访问。

