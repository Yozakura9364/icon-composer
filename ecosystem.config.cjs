/**
 * PM2 配置（宝塔 / 生产常用）
 * 启动：cd /www/wwwroot/icon-composer-main && pm2 start ecosystem.config.cjs
 * 保存：pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'icon-composer',
      cwd: '/www/wwwroot/icon-composer-main',
      script: 'server.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        ICON_COMPOSER_PORT: '3456',
        // 若使用 Cloudflare 图床，取消下行注释并改成你的 Worker 根 URL（无末尾 /）
        // ICON_COMPOSER_IMG_BASE: 'https://portable-icon.xxxxx.workers.dev',
        // 素材不在默认 ui/icon 时指定绝对路径：
        // ICON_COMPOSER_MATERIALS: '/www/wwwroot/icon-composer-main/ui/icon',
      },
    },
  ],
};
