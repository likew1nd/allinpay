#!/bin/sh
set -eu

region=${1:-global}
case "$region" in
  cn) proxy=https://git.5588.la/; mirror=git.5588.la/ ;;
  global) proxy=; mirror= ;;
  *) echo '用法：sh deploy.sh cn 或 sh deploy.sh global' >&2; exit 2 ;;
esac
mkdir -p "${EPAY_PROJECT_DIR:-/opt/allinpay}"
cd "${EPAY_PROJECT_DIR:-/opt/allinpay}"
project_dir=$(pwd -P)
project=${COMPOSE_PROJECT_NAME:-}
if [ -z "$project" ] && [ -f .env ]; then
  project=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env | tail -n 1)
fi
project=${project:-epay-external}
config=$(mktemp "$project_dir/.compose.XXXXXX")
settings=$(mktemp "$project_dir/.env.XXXXXX")
trap 'rm -f "$config" "$settings"' EXIT

# 迁移从标准输入启动的项目时，沿用现有的监听地址和命名卷。
if [ -z "${EPAY_BIND:-}" ] && ! grep -qs '^EPAY_BIND=' .env; then
  updater=$(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=updater | head -n 1)
  if [ -n "$updater" ]; then
    EPAY_BIND=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$updater" | sed -n 's/^EPAY_BIND=//p')
  fi
fi
if [ -f .env ]; then
  sed '/^EPAY_PROJECT_DIR=/d; /^COMPOSE_PROJECT_NAME=/d; /^EPAY_UPDATE_REGION=/d; /^EPAY_IMAGE_MIRROR=/d' .env > "$settings"
fi
if [ -n "${EPAY_BIND:-}" ]; then
  sed -i '/^EPAY_BIND=/d' "$settings"
  printf '\nEPAY_BIND=%s\n' "$EPAY_BIND" >> "$settings"
fi
printf '\nCOMPOSE_PROJECT_NAME=%s\nEPAY_PROJECT_DIR="%s"\nEPAY_UPDATE_REGION=%s\nEPAY_IMAGE_MIRROR=%s\n' \
  "$project" "$project_dir" "$region" "$mirror" >> "$settings"
export EPAY_PROJECT_DIR="$project_dir" EPAY_UPDATE_REGION="$region" EPAY_IMAGE_MIRROR="$mirror"
curl -fsSL "${proxy}https://github.com/${EPAY_REPOSITORY:-likew1nd/allinpay}/releases/latest/download/compose.pull.yaml" -o "$config"
docker compose -p "$project" --env-file "$settings" -f "$config" config --quiet
chmod 644 "$config"
mv -f "$settings" .env
mv -f "$config" docker-compose.yml
compose() { docker compose -p "$project" --env-file "$project_dir/.env" -f "$project_dir/docker-compose.yml" "$@"; }
compose up -d --wait
# 只清理旧版的一次性服务；安装配置、Redis 和业务数据卷继续复用。
compose --profile legacy-updater rm -f prepare
printf '编排配置已保存至 %s/docker-compose.yml\n' "$project_dir"
if compose exec -T api test ! -f /run/epay-setup/installed.json; then
  api=$(compose ps -q api)
  since=$(docker inspect --format '{{.State.StartedAt}}' "$api")
  docker logs --since "$since" "$api" 2>&1 | sed -n '/\[安装\].*一次性安装码/p' | tail -n 1
fi
