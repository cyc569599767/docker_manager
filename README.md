# Docker Manage Web

前后端分离的本地 Docker 管理工具：

- 前端：React + Tailwind CSS + Vite
- 后端：Rust + Axum + Docker CLI

## 功能

- 镜像列表
- 镜像拉取
- 镜像拉取进度轮询（后端任务日志）
- 容器列表 + 启动/停止/重启/删除
- 容器创建
- 卷列表
- 网络列表
- 容器日志查看
- 审计日志（记录关键操作）
- 前端 Hash 路由（`#/containers` 等）+ Context/Reducer 状态管理

## 新增 API

- `POST /api/images/pull`：启动镜像拉取任务，返回 `task_id`
- `GET /api/images/pull/:task_id?from=0`：按偏移量获取增量日志与任务状态

## 容器创建参数校验

- `image`：必填，不能包含空白字符
- `name`：可选，需匹配 `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`
- `ports`：可选，格式 `host:container`，端口范围 `1-65535`
- `env`：可选，格式 `KEY=VALUE`，`KEY` 仅允许字母/数字/下划线且不能数字开头

## 目录结构

```text
.
├─ frontend/   # React + Vite + Tailwind
└─ backend/    # Rust API
```

## 本地运行

### 1) 启动后端

```powershell
cd backend
cargo run
```

默认监听：`http://127.0.0.1:8080`

### 2) 启动前端

```powershell
cd frontend
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173`

前端默认调用 `http://127.0.0.1:8080`，可通过 `VITE_API_BASE` 覆盖。

## docker-compose 一键启动

```powershell
docker compose up --build -d
```

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8080`

停止：

```powershell
docker compose down
```

## 注意事项

- 后端依赖本机 Docker Engine（Linux Socket 或 Windows Named Pipe）。
- 审计日志写入 `backend/data/audit.log`。
- 当前 compose 挂载的是 Linux Socket：`/var/run/docker.sock`。Windows Named Pipe 场景需改为对应挂载配置。
