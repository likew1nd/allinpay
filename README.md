# 易支付多站点运营平台

## 用 Docker Compose 部署中心

部署机使用 Docker Compose 拉取预构建的 `linux/amd64` 镜像。以下命令将 `docker-compose.yml` 和 `.env` 保存到 `/opt/allinpay`，供面板、命令行和在线更新使用。自定义部署目录可设置 `EPAY_PROJECT_DIR`。

### 国内部署

```bash
curl -fsSL https://git.5588.la/https://github.com/likew1nd/allinpay/releases/latest/download/deploy.sh | sh -s -- cn
```

国内线路通过 `git.5588.la` 获取正式版附件和容器镜像。

### GitHub 直连部署

```bash
curl -fsSL https://github.com/likew1nd/allinpay/releases/latest/download/deploy.sh | sh -s -- global
```

### 完成网页安装

部署成功后终端会显示一次性安装码，用于确认创建首个管理员的人拥有服务器访问权。需要重新查看时，在部署目录读取 API 日志。

```bash
cd /opt/allinpay && docker compose logs --tail 30 api
```

打开 `http://127.0.0.1:8080`，从 API 容器日志复制一次性安装码，在网页向导填写已有 MySQL 的连接信息和管理员账号。安装向导支持 MySQL 5.7.44 和 8.4。填写自选名称的专用空库，安装器会准备所需字符集和排序规则。账号需要该库的建表、修改表、外键和数据读写权限。新安装由 API 在策略调整的同一事务中写入审计日志。连接地址须能从 API 容器访问。

默认常驻四个容器：Web 提供管理页面，API 处理业务请求，Redis 保存缓存，更新器检查版本并执行升级。通过面板导入时，将正式版 Compose 文件保存为项目目录下的 `docker-compose.yml`，并在面板的项目环境变量中把 `EPAY_PROJECT_DIR` 设置为这个目录的宿主机绝对路径。

中心默认监听 `127.0.0.1:8080`。可通过 `EPAY_BIND` 自定义监听地址和端口。安装配置和 Redis 数据保存在 Compose 命名卷中，重建容器时应沿用原项目名和数据卷。

## 更新中心和 Windows Agent

- 中心启动后检查正式版，此后每 30 分钟检查一次。也可在「系统设置 → 版本更新」点击「检查更新」或切换「更新服务器」。选择的线路同时用于获取发布附件和拉取新版镜像。
- 发现新版后，由管理员点击「升级中心」确认。更新器校验正式版附件，拉取镜像，备份已安装的中心数据库并更新容器。安装配置和 Redis 数据继续使用原数据卷。
- 在线升级会更新部署目录中的编排文件。旧版通过标准输入部署的实例首次切换时，请在宿主机执行上面的部署命令，沿用原项目名。脚本复用原监听地址和命名卷，并清理已退出的 prepare 容器。
- 使用 `1.0.6` 的实例要启用全程加速，可在新版发布后用上方国内命令重新应用 Compose，并沿用原项目名和数据卷。使用旧宿主机安装流程的实例需要先迁移现有安装配置和数据卷，再切换到 Compose 部署。
- Windows Agent 在 Windows 上运行。从中心「脚本设置」或 [GitHub Releases](https://github.com/likew1nd/allinpay/releases) 下载完整包，解压并双击 `启动Agent.bat`。在生成的 `.env` 中填入中心 HTTPS 地址、采集端 ID 和 Token，再启动。旧启动器首次接入热更新时，先用完整包或修复包覆盖升级并保留 `.env`。
- 部署中心会自动同步兼容的 Agent 正式版。采集端在心跳时领取更新，完成当前任务后重启。

## 正式发布

发布工具将受影响模块的源码同步到 GitHub 的 `release-source`，并推送对应版本标签。中心标签 `center-vX.Y.Z` 触发 GitHub Actions，构建 API、Web 和更新器镜像，推送至 GHCR，并发布固定镜像摘要的 Compose 文件。Agent 使用独立的 `agent-vX.Y.Z` 标签和 Release 附件。
