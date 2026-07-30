# AGENTS.md

## Cursor Cloud specific instructions

Este proyecto es una app de **escritorio Electron** (React + Vite + TypeScript) para gestión de
torneos de Carcassonne. Persistencia local con **SQLite (`better-sqlite3`, módulo nativo)**. La
sincronización con Supabase es **opcional y está deshabilitada por defecto** (modo local): la app
funciona 100% offline, no requiere secretos ni servicios externos para desarrollar/probar.

Los comandos estándar ya están documentados en `README.md` y `package.json` (`npm run dev`,
`npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run check-translations`). Referirse a
esas fuentes; abajo solo van los caveats no obvios del entorno cloud.

### Ejecutar la GUI Electron en el VM cloud (headless)

`npm run dev` no funciona tal cual en el VM headless: el proceso *renderer* de Chromium **crashea**
porque `/dev/shm` es muy pequeño (~64 MB) y por la falta de GPU. Para levantar la GUI hay que
correr Vite y Electron por separado y pasarle flags de Chromium a Electron (no editar el código):

```bash
# Terminal 1: dev server de React (Vite en http://localhost:5173)
npm run dev:react

# Terminal 2: proceso main de Electron (compilar primero) apuntando al display virtual
npm run build:electron
DISPLAY=:1 APP_ENV=colombia ELECTRON_DISABLE_SANDBOX=1 LIBGL_ALWAYS_SOFTWARE=1 \
  ./node_modules/.bin/electron . \
  --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-software-rasterizer --enable-logging
```

- El flag **`--disable-dev-shm-usage`** es el imprescindible: sin él el renderer queda en blanco / crashea.
- Existe un display virtual en **`DISPLAY=:1`** (usado por computer use). Electron abre además una
  ventana de DevTools *detached* en dev; se puede ignorar/cerrar.
- En dev la app usa un `userData` separado (`...-dev`) y aplica migraciones SQLite automáticamente al
  arrancar; la base vive en `~/.config/carcassonne-tournament-manager-dev/tournament_co.db`.

### Antes de commitear (hook `pre-commit` + reglas del repo)

El hook corre `lint-staged`, `npm run typecheck`, `npm run test:run`, `npm run check-translations` y
`npm run db:check`. `db:check` (`db:audit`) usa Electron y **se salta sin error** si no existe base
de datos local, así que no bloquea. Como mínimo, correr `test:run`, `typecheck` y (si se tocan
strings de UI / `src/renderer/i18n/locales/*.json`) `check-translations` antes de commitear.

### Módulo nativo `better-sqlite3`

`npm install` ejecuta `postinstall` (`electron-builder install-app-deps`), que **recompila
`better-sqlite3` para el ABI de Electron** desde fuente. Si cambian versiones de Electron o
`better-sqlite3`, reinstalar dependencias para regenerar el binario.
