## 修复与改进

- 📁 部署时将 `docker-compose.yml` 和 `.env` 保存到宿主机，默认目录为 `/opt/allinpay`，供面板和命令行读取。
- 🔄 在线升级更新同一份编排文件，重建后的容器继续关联宿主机上的项目路径。
- 🧹 初始化工作已移入镜像和 Redis 启动流程。默认部署只运行 Web、API、Redis 和更新器四个容器。
- 📦 新部署脚本沿用现有项目的监听地址和命名卷，并清理旧版已退出的 `prepare` 容器。
- 🔑 首次部署完成后，终端直接显示一次性安装码，用于验证创建首个管理员的权限。
- 📝 中心和 Windows Agent 的正式发布说明逐项列出本版修复和改进，每项带 emoji。

旧版通过 `docker compose -f -` 部署的实例，请在宿主机沿用原项目名执行一次新版部署命令，使编排文件落盘。[部署说明](https://github.com/likew1nd/allinpay/blob/center-v1.0.10/README.md)
