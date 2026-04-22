# Web Deploy Notes

Repository: https://github.com/Yozakura9364/icon-composer-web

## Minimum files to keep

- `server.js` (compat entry)
- `src/server/index.js`
- `src/server/lib/`
- `src/client/index.html`
- `src/client/styles/main.css`
- `src/client/scripts/`
- `assets/icons/`
- `data/`
- `font/`
- `ui/`
- `vendor/`
- `package.json`
- `package-lock.json`
- `README.md`

## Start locally

```bash
npm install
node server.js
```

## Optional environment variables

- `ICON_COMPOSER_PORT`
- `ICON_COMPOSER_BASE`
- `ICON_COMPOSER_IMG_BASE`
- `ICON_COMPOSER_MATERIALS`
- `ICON_COMPOSER_FILES_JSON`
- `METRICS_SECRET`

## PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
```
