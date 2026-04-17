#!/usr/bin/env bash
# 宝塔 / Linux：将仓库放到 /www/wwwroot/icon-composer-main
# 用法：在「宝塔终端」或 SSH 中执行（建议 root 或有 www 权限的用户）：
#   bash /www/wwwroot/icon-composer-main/scripts/deploy-baota.sh
# 首次若目录不存在，请先从本仓库任意机器复制本脚本到服务器执行，或：
#   sudo mkdir -p /www/wwwroot && cd /www/wwwroot && git clone https://github.com/Yozakura9364/icon-composer.git icon-composer-main && bash icon-composer-main/scripts/deploy-baota.sh

set -euo pipefail

ROOT="/www/wwwroot/icon-composer-main"
REPO="https://github.com/Yozakura9364/icon-composer.git"
BRANCH="${ICON_COMPOSER_GIT_BRANCH:-main}"

if [[ ! -d "/www/wwwroot" ]]; then
  echo "[错误] 未找到 /www/wwwroot（非宝塔常见路径？）请自行修改脚本中的 ROOT。"
  exit 1
fi

if [[ -d "${ROOT}/.git" ]]; then
  echo "[更新] ${ROOT} 已存在，git pull..."
  cd "${ROOT}"
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git pull origin "${BRANCH}"
elif [[ -e "${ROOT}" ]]; then
  echo "[错误] ${ROOT} 已存在但不是 git 仓库。请备份后删除该目录，或改用其他 ROOT。"
  exit 1
else
  echo "[克隆] ${REPO} -> ${ROOT}"
  git clone --branch "${BRANCH}" "${REPO}" "${ROOT}"
  cd "${ROOT}"
fi

cd "${ROOT}"
echo "[依赖] npm install ..."
npm install

echo
echo "[完成] 项目路径: ${ROOT}"
echo "  手动前台运行: cd ${ROOT} && node server.js"
echo "  推荐 PM2 常驻:  cd ${ROOT} && pm2 start ecosystem.config.cjs && pm2 save"
echo "  端口默认 3456，可在 ecosystem.config.cjs 或环境变量 ICON_COMPOSER_PORT 修改。"
echo "  腾讯云安全组 / 宝塔防火墙需放行对应 TCP 端口。"
