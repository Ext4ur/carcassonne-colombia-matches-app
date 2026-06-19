# Fase B — Web offline clasificatorio (roadmap)

**Estado:** planificado · no implementado en Fase A.

## Objetivo

Permitir que tiendas Devir gestionen el clasificatorio asignado desde navegador (PWA) con SQLite WASM, sin instalador Electron.

## Alcance previsto

- Misma RPC `redeem_store_activation` / `complete_store_activation`.
- Admin sigue creando torneos en Electron y publicando vía sync.
- Entrypoint web: canje → pull del torneo asignado → jornada offline → sync/export al cierre.

## Spike técnico sugerido

1. **WebSqliteClient** — adaptador que reutilice la capa de servicios sobre `sql.js` o `wa-sqlite`.
2. **PWA** — service worker para assets; persistencia IndexedDB para la BD WASM.
3. **Auth** — usuario técnico Supabase embebido (igual que build tienda Electron).
4. **Guards** — reutilizar `storeMode` / `storeActivation` con flag `VITE_DEVIR_STORE_MODE` en build web.

## Dependencias de Fase A

- Tabla `store_activations` y RPC en Supabase (AC-090).
- Filtro de pull por `tournament_uuid` (AC-090).
- Export automático al finalizar (AC-090).

## Estimación orientativa

MVP web offline: +3–5 semanas tras primer clasificatorio presencial con build Electron tienda.

## Fuera de alcance inicial

- Creación de torneos desde web.
- Multi-torneo por tienda.
- Login por usuario/contraseña de tienda.
