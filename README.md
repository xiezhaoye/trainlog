# trainlog

> 面向个人训练记录的公开 Web App：计划、执行、记录与回顾，部署在 `trainlog.life`。

## 文档地图

| 文档 | 用途 |
| --- | --- |
| [架构.md](架构.md) | 当前系统、数据流与关键决策 |
| [部署.md](部署.md) | 本地开发、Cloudflare 发布与验证 |
| [错题本.md](错题本.md) | 项目级警告与事故复盘 |
| [待办.md](待办.md) | 尚未完成的工作 |
| [交接.md](交接.md) | 当前交接快照 |

## 目录

- `src/`：下一阶段的 React PWA 前端；本阶段保留已确认的 V2 静态页面，避免重写时损失现有交互。
- `worker/`：Cloudflare Worker API、D1 访问与未来认证。
- `shared/`：领域模型、输入校验和公共工具。
- `migrations/`：Cloudflare D1 数据库迁移。
- `tests/`：单元、API 与关键流程测试。
- `public/`：图标、manifest 等静态资源。

## 项目关系

本项目从 `myinfo/services/training-service` 提取训练领域概念和可迁移数据，但不依赖 NAS、myinfo、内部 PIM、私有 Token 或 SQLite 运行时。

## 本地启动

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run db:seed
npm run dev
```

打开 `http://localhost:8788`。`.dev.vars` 只开启本机开发令牌，不得提交或部署。

公开入口为 `/`、`/login`、`/signup`；已有训练功能位于 `/app`。登录与注册设计源文件保存在 `design/`，发布副本在 `public/`，二者必须保持一致；认证行为由 `public/auth-bridge.js` 接入。
