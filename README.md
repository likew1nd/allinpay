# 易支付多站点运营平台

## 用 Docker Compose 部署中心

从 [GitHub 正式版](https://github.com/likew1nd/allinpay/releases/latest) 下载 `compose.pull.yaml`。部署机使用 Docker Compose 拉取预构建的 `linux/amd64` 镜像。

```bash
docker compose -f compose.pull.yaml up -d --wait
docker compose -f compose.pull.yaml logs api
```

打开 `http://127.0.0.1:8080`，从 API 容器日志复制一次性安装码，在网页向导填写已有 MySQL 的连接信息和管理员账号。MySQL 需要提供一个专用空库，以及初始化和运行所需的权限。连接地址须能从 API 容器访问。

中心默认监听 `127.0.0.1:8080`。可通过 `EPAY_BIND` 自定义监听地址和端口。安装配置和 Redis 数据保存在 Compose 命名卷中，重建容器时应沿用原项目名和数据卷。

## 更新中心和 Windows Agent

- 在后台「系统设置 → 版本更新」查看中心新版并确认升级。更新器使用即将安装的正式版 Compose 文件拉取镜像，备份已安装的中心数据库后再升级。
- 手动重新应用 Compose 时，从当前或目标版本的 Release 下载对应文件，并沿用原项目名和监听地址。
- 已使用正式版 `compose.pull.yaml` 部署的实例可以沿用原项目。使用旧宿主机安装流程的实例需要先迁移现有安装配置和数据卷，再切换到 Compose 部署。
- Windows Agent 在 Windows 上运行。从中心「脚本设置」或 [GitHub Releases](https://github.com/likew1nd/allinpay/releases) 下载完整包，解压并双击 `启动Agent.bat`。在生成的 `.env` 中填入中心 HTTPS 地址、采集端 ID 和 Token，再启动。旧启动器首次接入热更新时，先用完整包或修复包覆盖升级并保留 `.env`。
- 部署中心会自动同步兼容的 Agent 正式版。采集端在心跳时领取更新，完成当前任务后重启。

## 正式发布

发布工具将受影响模块的源码同步到 GitHub 的 `release-source`，并推送对应版本标签。中心标签 `center-vX.Y.Z` 触发 GitHub Actions，构建 API、Web 和更新器镜像，推送至 GHCR，并发布固定镜像摘要的 Compose 文件。Agent 使用独立的 `agent-vX.Y.Z` 标签和 Release 附件。
