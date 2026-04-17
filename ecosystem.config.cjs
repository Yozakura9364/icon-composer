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
        // 默认已由 server.js 指向 Worker；仅当要强制本机 /img 时再设：ICON_COMPOSER_IMG_BASE: '/img',
        // 素材不在默认 ui/icon 时指定绝对路径：
        // ICON_COMPOSER_MATERIALS: '/www/wwwroot/icon-composer-main/ui/icon',
      },
    },
  ],
};
