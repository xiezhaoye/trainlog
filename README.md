# TrainLog · 砺志

一个个人用来记录自己训练的简单微博 App：随手写下每一次训练，随手回顾。

**在线体验**：<https://trainlog.life> —— 如果不想自己部署，直接打开这个地址试用即可。

目前没有 native 客户端版本，建议用苹果的 Safari 浏览器打开后，将其添加到主屏幕，以 PWA 的方式运行。

## 目录

- `src/`：下一阶段的 React PWA 前端；本阶段保留已确认的 V2 静态页面，避免重写时损失现有交互。
- `worker/`：Cloudflare Worker API、D1 访问与认证。
- `shared/`：领域模型、输入校验和公共工具。
- `migrations/`：Cloudflare D1 数据库迁移。
- `tests/`：单元、API 与关键流程测试。
- `public/`：页面、图标、manifest 等静态资源。

## 本地启动

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run db:seed # 仅写入本机演示数据
npm run dev
```

打开 `http://localhost:8788`。`npm run db:seed` 仅写入本机的演示账号和训练数据，不会作为线上数据发布。`.dev.vars` 只用于本机开发，不要提交或部署。

公开入口为 `/`、`/login`、`/signup`；已有训练功能位于 `/app`。
