# Project Structure

## Directory Roles

- `src/client/`: frontend page, style, and browser runtime logic
- `src/server/`: Node.js server entry, routes, services, and server-side libraries
- `assets/icons/`: shared UI icon assets used by frontend controls
- `data/`: runtime JSON data (presets, mappings, whitelist cache)
- `config/`: deploy/config examples
- `docs/`: project documentation
- `tools/`: standalone utility scripts
- `scripts/`: maintenance scripts for data/material processing
- `ui/`: original material assets (kept as-is)

## Frontend Split

- `src/client/index.html`: page structure and script/style includes
- `src/client/styles/main.css`: all page styles
- `src/client/scripts/00-paths-and-constants.js`: app path helpers and global constants

### State

- `src/client/scripts/state/store.js`: shared runtime state, init bootstrap data setup
- `src/client/scripts/state/persistence.js`: localStorage/config import/export persistence

### Features

- `src/client/scripts/features/theme/theme.js`: theme toggle and theme restore
- `src/client/scripts/features/presets/presets.js`: info preset model/state logic
- `src/client/scripts/features/presets/preset-apply.js`: portrait/nameplate preset apply/step switching
- `src/client/scripts/features/info-layers/model.js`: info layer model, normalization, font/options helpers
- `src/client/scripts/features/info-layers/canvas-overlay.js`: canvas hover hit-test and overlay
- `src/client/scripts/features/info-layers/panel-render.js`: info layer panel rendering
- `src/client/scripts/features/info-layers/panel-actions.js`: info layer panel actions and state mutation
- `src/client/scripts/features/info-layers/render-engine.js`: info layer drawing/render pipeline
- `src/client/scripts/features/custom-portrait/custom-portrait.js`: custom portrait upload/crop handling

### Existing Runtime Stages

- `src/client/scripts/render/section-panel.js`: category section UI/pick/switch/clear flows
- `src/client/scripts/render/canvas-core.js`: render loop, render status, layered export collection
- `src/client/scripts/render/portrait-renderer.js`: portrait-only rendering helpers
- `src/client/scripts/render/nameplate-renderer.js`: full canvas/nameplate rendering helpers
- `src/client/scripts/render/image-loader.js`: hd/preview image URL and cache loading
- `src/client/scripts/render/viewport-transform.js`: zoom/viewport transform and action menus
- `src/client/scripts/export/shared.js`: shared export helpers and full-render path prefetch
- `src/client/scripts/export/png-export.js`: PNG/JPG export
- `src/client/scripts/export/psd-export.js`: PSD/JSX export
- `src/client/scripts/export/zip-export.js`: layered ZIP export
- `src/client/scripts/40-bootstrap.js`: startup wiring

### Compatibility Wrappers

- `src/client/scripts/10-state-and-config.js`
- `src/client/scripts/11-info-layer-panel.js`
- `src/client/scripts/20-render-and-transform.js`
- `src/client/scripts/30-export.js`

These wrappers are now placeholders only; logic moved to the files above.

## Server Split

- `server.js`: compatibility entry (delegates to `src/server/index.js`)
- `src/server/index.js`: HTTP server main
- `src/server/routes/api-routes.js`: `/api/*` handlers (metrics, files, presets, export)
- `src/server/routes/image-routes.js`: `/img/*` and `/img-preview/*` handlers
- `src/server/routes/static-routes.js`: static file and index fallback handlers
- `src/server/services/preview-image.js`: preview image resize helpers
- `src/server/services/layered-export.js`: layered export canvas helpers
- `src/server/lib/csv-whitelist.js`: csv whitelist parsing/loading
- `src/server/lib/psd-writer.js`: PSD writer
- `src/server/lib/jsx-writer.js`: JSX writer
