# Docker Manage Web

本项目是一个本地 Docker 管理面板，采用前后端分离架构：

- 前端：React + Vite + TypeScript + Tailwind
- 后端：Rust + Axum + Docker CLI

## 功能概览

- 容器列表、启动/停止/重启/删除
- 容器创建（含参数校验）
- 镜像列表、镜像拉取、拉取进度查看
- 卷列表、网络列表
- 容器日志查看
- 审计日志（关键操作记录）
- 前端 Hash 路由 + 可分享筛选 URL
- 列表接口服务端分页与筛选

## 文档

- 变更记录：`docs/CHANGELOG.md`
- 规划路线：`docs/ROADMAP.md`
- 发版说明（草案）：`docs/releases/v0.2.0.md`

## 快速启动

### 1) 启动后端

```powershell
cd backend
cargo run
```

默认监听地址：`0.0.0.0:8080`（访问时用服务器 IP 或 `127.0.0.1`）

可通过环境变量 `BIND_ADDR` 覆盖监听地址。

### 2) 启动前端

```powershell
cd frontend
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173`

前端默认请求当前主机的 `:8080` 后端，可通过 `VITE_API_BASE` 覆盖。

### 3) docker-compose 一键启动

```powershell
docker compose up --build -d
```

- 前端：`http://127.0.0.1:5173`
- 后端：`http://<服务器IP>:8080`

停止：

```powershell
docker compose down
```

## 主要 API

- `GET /api/health`
- `GET /api/containers`
- `POST /api/containers/create`
- `POST /api/containers/:id/start`
- `POST /api/containers/:id/stop`
- `POST /api/containers/:id/restart`
- `DELETE /api/containers/:id?force=true`
- `GET /api/containers/:id/logs?tail=200`
- `GET /api/images`
- `POST /api/images/pull`
- `GET /api/images/pull/:task_id?from=0`
- `GET /api/volumes`
- `GET /api/networks`
- `GET /api/audit`

## 列表接口：分页与筛选

以下接口支持 `from` / `limit` 分页参数：

- `/api/containers`
- `/api/images`
- `/api/volumes`
- `/api/networks`

示例：

- `/api/containers?from=0&limit=20`
- `/api/images?from=20&limit=20`

### 服务端筛选

- `/api/containers`
  - `q`：按 `name/image/status/id` 模糊匹配
  - `status`：`all | running | stopped | other`
- `/api/images`
  - `q`：按 `repository/tag/id` 模糊匹配

示例：

- `/api/containers?from=0&limit=20&q=nginx&status=running`
- `/api/images?from=0&limit=20&q=alpine`

### 分页响应头

列表接口在响应头中返回分页信息：

- `X-Total-Count`
- `X-List-From`
- `X-List-Limit`（传了 limit 时）
- `X-Next-From`
- `X-Has-More`（`true/false`）

## 前端 Hash 路由与可分享筛选

支持直接通过 URL 打开并保留筛选状态：

- 容器：`#/containers?q=nginx&status=running`
- 镜像：`#/images?q=alpine`
- 审计：`#/audit?q=create&result=failed`

刷新页面、复制链接分享时，筛选参数会保留。

## 容器创建参数校验

- `image`：必填，不能包含空白
- `name`：可选，需匹配 `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`
- `ports`：可选，格式 `host:container`，端口范围 `1-65535`
- `env`：可选，格式 `KEY=VALUE`，`KEY` 仅支持字母/数字/下划线且不能数字开头
- `volumes`：可选，格式 `source:target` 或 `source:target:mode`
- `network`：可选，命名规则同 `name`

## 目录结构

```text
.
├─ frontend/   # React + Vite + Tailwind
└─ backend/    # Rust API
```

## 注意事项

- 后端依赖本机 Docker Engine（Linux Socket 或 Windows Named Pipe）。
- 审计日志写入：`backend/data/audit.log`。
- 当前 compose 默认挂载 Linux Socket：`/var/run/docker.sock`。
  Windows Named Pipe 场景请按环境修改挂载配置。
- 如果直接从外网访问 `5173/8080`，记得放行防火墙/安全组端口；不想暴露 `8080` 时，建议加一层反向代理转发 `/api`。

## 构建网络超时排查（Cargo / npm）

若 `docker compose up --build -d` 期间出现依赖拉取超时（如 crates.io index 或 npm registry）：

1. 先单独构建查看详细阶段：
   - `docker compose build --no-cache backend`
   - `docker compose build --no-cache frontend`
2. 本项目 Dockerfile 已配置镜像源与重试/超时参数（Rust 使用 rsproxy，npm 使用 npmmirror）。
3. 若仍失败，优先检查：
   - Docker Desktop 代理配置
   - 公司网络防火墙策略
   - DNS（可尝试公共 DNS）
