#!/usr/bin/env bash
# 在服务器上从 Gitee 克隆或更新到 /www/wwwroot/icon-composer-main
#
# 用法（把地址换成你的 Gitee HTTPS 或 SSH）：
#   export GITEE_REPO_URL='https://gitee.com/你的用户名/icon-composer.git'
#   bash scripts/clone-from-gitee.sh
#
# 私有仓库 HTTPS：会提示输入 Gitee 用户名与密码（密码处填「私人令牌」）
# 私有仓库 SSH：请先在服务器生成 ssh-key 并把公钥加到 Gitee → SSH公钥

set -euo pipefail

ROOT="/www/wwwroot/icon-composer-main"
REPO="${GITEE_REPO_URL:-}"
BRANCH="${GITEE_GIT_BRANCH:-main}"

if [[ -z "${REPO}" ]]; then
  echo "[错误] 请先设置环境变量，例如："
  echo "  export GITEE_REPO_URL='https://gitee.com/你的用户名/icon-composer.git'"
  echo "  bash scripts/clone-from-gitee.sh"
  exit 1
fi

if [[ ! -d "/www/wwwroot" ]]; then
  echo "[错误] 未找到 /www/wwwroot，请修改脚本中的 ROOT。"
  exit 1
fi

if [[ -d "${ROOT}/.git" ]]; then
  echo "[更新] ${ROOT} 已存在，git pull..."
  cd "${ROOT}"
  git remote set-url origin "${REPO}" 2>/dev/null || git remote add origin "${REPO}" 2>/dev/null || true
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git pull origin "${BRANCH}"
elif [[ -e "${ROOT}" ]]; then
  echo "[错误] ${ROOT} 已存在但不是 git 仓库。请备份后删除或改 ROOT。"
  exit 1
else
  echo "[克隆] ${REPO} -> ${ROOT}"
  git clone --branch "${BRANCH}" "${REPO}" "${ROOT}"
fi

cd "${ROOT}"
echo "[依赖] npm install ..."
npm install

echo
echo "[完成] 项目路径: ${ROOT}"
echo "  启动: cd ${ROOT} && node server.js"
echo "  或:  cd ${ROOT} && pm2 start ecosystem.config.cjs && pm2 save"
