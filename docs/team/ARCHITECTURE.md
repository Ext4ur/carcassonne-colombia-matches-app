# Arquitectura — Carcassonne Tournament Manager

Aplicación de escritorio **Electron + React + TypeScript** para gestionar torneos presenciales de Carcassonne. Diseño **local-first**: SQLite en el equipo del organizador; sincronización remota opcional vía Supabase.

**Audiencia:** desarrolladores del equipo. Para organizadores de eventos, ver [GUIA_USO.md](./GUIA_USO.md).

---

## Vista general

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
│  main.ts · database.ts (better-sqlite3) · ipc.ts           │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────▼──────────────────────────────────┐
│                     Preload (preload.ts)                     │
│  electronAPI: db · saveFile · openFile · getVersion        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Renderer (React + Vite)                      │
│  Pages · Components · Services · i18n · Tailwind CSS         │
└──────────────────────────┬──────────────────────────────────┘
                           │ opcional, si está configurado
┌──────────────────────────▼──────────────────────────────────┐
│              Supabase (sync bidireccional)                    │
└───────────────────────────────────────────────────────────────┘
```

---

## Estructura del repositorio

```
carcassonne-colombia-matches-app/
├── src/
│   ├── main/              # Proceso Electron: ventana, SQLite, IPC
│   ├── preload/           # contextBridge → electronAPI
│   └── renderer/          # React SPA (pages, components, services, i18n)
├── supabase/migrations/   # Esquema remoto para sync (no es la BD local)
├── scripts/               # Utilidades: traducciones, bump version, audit DB
├── build/                 # Iconos para electron-builder
├── docs/
│   ├── team/              # Esta documentación (versionada)
│   ├── KNOCKOUT_BACKLOG.md
│   └── local/             # Gitignored: reglas negocio + cursor-rules locales
├── .cursor/rules/         # Reglas Cursor compartidas del equipo
├── electron-builder.cjs
└── package.json
```

### Rutas de la SPA (HashRouter)

| Ruta | Página | Rol |
|------|--------|-----|
| `/` | `Home.tsx` | Inicio con accesos rápidos |
| `/tournaments` | `Tournaments.tsx` | Lista, creación rápida/avanzada, filtros |
| `/tournament/:id` | `TournamentDetail.tsx` | Rondas, resultados, KO, reportes |
| `/circuits` | `Circuits.tsx` | Circuitos y acumulado |
| `/players` | `Players.tsx` | Registro global de jugadores |
| `/places` | `Places.tsx` | Sedes vinculadas a ciudades |
| `/cities` | `Cities.tsx` | Ciudades |
| `/settings` | `Settings.tsx` | Tema, idioma, sync, backup, torneo rápido |

Navegación principal en `Layout.tsx`. Estado global ligero vía React Context (`ThemeContext`, `NotificationContext`); no hay store global de dominio (los datos viven en SQLite).

### Canales IPC (preload → main)

| Canal | Uso |
|-------|-----|
| `db:query` | SELECT parametrizado |
| `db:execute` | INSERT/UPDATE/DELETE |
| `db:transaction` | Lote de executes atómicos |
| `file:save` | Diálogo guardar: excel, csv, pdf, image, json |
| `app:getVersion` | Versión de la app |

Definidos en `src/main/ipc.ts`, expuestos en `src/preload/preload.ts`, tipados en `src/renderer/types/electron.d.ts`.

---

## Onboarding desarrollador

### Requisitos

- Node.js 18+ (CI usa 20)
- npm
- En Windows: herramientas de build para `better-sqlite3` (Visual Studio Build Tools o equivalente)

### Primer arranque

```bash
npm install          # postinstall: electron-builder install-app-deps
npm run dev          # Colombia (APP_ENV=colombia)
# o
npm run dev:int      # Internacional
```

Variables opcionales en `.env.colombia` / `.env.international` (gitignored) para Supabase. Plantilla: `.env.example`.

### Scripts npm frecuentes

| Script | Descripción |
|--------|-------------|
| `dev` / `dev:int` | Desarrollo con hot reload |
| `build` / `build:int` | Compila renderer + main |
| `dist` / `dist:win` | Instalador electron-builder |
| `test:run` | Vitest una pasada |
| `typecheck` | TS renderer + main |
| `lint` / `format` | ESLint + Prettier |
| `check-translations` | Paridad es/en/hu |
| `rebuild-sqlite` | Tras cambiar versión de Electron |
| `db:audit` / `db:validate` | Auditoría esquema local vs remoto |

### CI (GitHub Actions)

Workflow `.github/workflows/ci.yml` en push/PR a `main`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:run`

No empaqueta instaladores en CI; el release local usa `npm run dist`.

### Reglas Cursor

| Ubicación | Alcance |
|-----------|---------|
| `.cursor/rules/` | Versionadas: i18n, dominio torneo, ritual agente, commits |
| `docs/local/cursor-rules/` | Locales (gitignored): import-export, builds, PR, sync… |

---

## Procesos Electron

### Main (`src/main/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `main.ts` | Ventana, ciclo de vida, carga del renderer (dev: Vite; prod: `dist/renderer`) |
| `database.ts` | Instancia única de **better-sqlite3**, esquema, migraciones inline, UUIDs para sync |
| `ipc.ts` | Handlers IPC: consultas SQL, transacciones, guardado de archivos (Excel, CSV, PDF, PNG, JSON) |

La base de datos vive en `userData` del sistema:

- Colombia: `tournament_co.db`
- Internacional: `tournament_int.db`

Modo WAL activado. En desarrollo, `userData` usa sufijo `-dev` para no mezclar datos con builds instalados.

### Preload (`src/preload/preload.ts`)

Expone `window.electronAPI` con **context isolation** (sin `nodeIntegration` en el renderer). El renderer nunca accede a SQLite directamente: usa `electronAPI.db.query|execute|transaction`.

### Renderer (`src/renderer/`)

SPA React con **HashRouter** (`App.tsx`). Capas principales:

| Capa | Ubicación | Rol |
|------|-----------|-----|
| Páginas | `pages/` | Pantallas: torneos, jugadores, circuitos, lugares, ciudades, ajustes |
| Componentes | `components/` | UI reutilizable y bloques de torneo (emparejamientos, KO, resultados) |
| Servicios | `services/` | Lógica de dominio y acceso a datos vía `DatabaseService` |
| Tipos | `types/` | Modelos TypeScript (torneo, KO, circuito, jugador…) |
| Utilidades | `utils/` | Scoring, desempates, fechas, export helpers, html→PNG |
| API clients | `api/clients/` | Abstracción SQLite (renderer) y Supabase |
| i18n | `i18n/` | es, en, hu |

---

## Persistencia local-first

### DatabaseService

`src/renderer/services/database.ts` es la fachada principal del renderer. Ejecuta SQL parametrizado a través de IPC. Incluye operaciones de torneos, rondas, partidas, jugadores, circuitos, configuración y seeds de knockout.

### Esquema

Definido y evolucionado en `src/main/database.ts` (CREATE TABLE + ALTER incremental). Entidades clave:

- **players**, **cities**, **places**
- **circuits**, **tournaments**, **tournament_configs**, **tournament_players**
- **rounds**, **matches**, **match_players**, **match_results**
- Tablas de sync: cola, audit log, metadatos de schema

Cada fila sincronizable lleva `uuid` para reconciliación remota.

---

## Sincronización opcional (Supabase)

`src/renderer/services/syncService.ts` orquesta push/pull cuando Supabase está configurado (`supabaseConfig.ts`, variables de entorno).

Flujo resumido:

1. Cambios locales → cola de sync (`sync_queue`) vía triggers/audit.
2. **Push**: envía operaciones pendientes al remoto.
3. **Pull**: lee audit remoto, hidrata FKs en orden de dependencia, aplica en SQLite.
4. Intervalos periódicos + detección online/offline.

El renderer usa `SqliteClient` para lecturas/escrituras locales y `SupabaseClient` para el remoto. La sync **no es obligatoria**: la app funciona offline al 100 % con SQLite.

UI: componentes `SyncStatus`, `DatabaseStatus` y toggles en Ajustes.

---

## Módulos de dominio

### Suizo (`services/swiss.ts`)

- Emparejamiento primera ronda y siguientes (greedy / backtracking).
- Cálculo de clasificación, Buchholz, byes, rematches, estadísticas de salida.
- Integración con criterios de desempate configurables.

### Generación de rondas (`services/roundGeneration.ts`)

Orquesta preview/confirmación de rondas suizas y transición a fase KO cuando aplica.

### Knockout (`types/knockout.ts`, `services/knockout.ts`, `knockoutStandings.ts`)

- Formatos: suizo puro, suizo + eliminatoria (`swiss_knockout`).
- Bracket, series best-of-N, bronce, seeds desde snapshot suizo.
- Clasificación final combinada (`computeKnockoutFinalStandingsForTournament`).

Backlog de features KO: `docs/KNOCKOUT_BACKLOG.md`.

### Desempates (`services/tiebreak.ts`, `utils/tiebreak.ts`, `headToHead.ts`)

Criterios ordenables (victorias, Buchholz variants, H2H, diferencia de puntos…). Configuración por torneo en `tournament_configs.tiebreak_criteria`.

### Circuitos (`services/circuit.ts`, `utils/circuitScoring.ts`)

Acumulado de puntos entre torneos clasificatorios vinculados a un circuito. Reportes de circuito en `Circuits.tsx`.

### Import / export (`services/export.ts`, `services/import.ts`)

- **Backup JSON**: torneos seleccionados + jugadores/ciudades/lugares/circuitos referenciados.
- **Import**: merge selectivo con detección de duplicados.
- Helpers: `utils/exportImportHelpers.ts`.

Reglas de homologación detalladas: `docs/local/IMPORT_EXPORT.md` (local, no versionado).

### Reportes (`services/reports.ts`)

Excel/CSV (ExcelJS vía main), PDF (HTML → jsPDF), **imagen PNG** (HTML podio → html2canvas → IPC `file:save` tipo `image`). Clasificatorios pueden exportar imagen para redes sociales.

---

## Dual entorno: Colombia / Internacional

| Aspecto | Colombia | Internacional |
|---------|----------|---------------|
| Variable | `APP_ENV=colombia` | `APP_ENV=international` |
| Vite mode | `colombia` | `international` |
| BD | `tournament_co.db` | `tournament_int.db` |
| Idioma por defecto | es | en |
| Scripts npm | `dev`, `build`, `dist` | `dev:int`, `build:int`, `dist:int` |

Build Electron: `tsc -p tsconfig.main.json` → `dist/main/`. Frontend: Vite → `dist/renderer/`. Empaquetado: `electron-builder.cjs`.

---

## Internacionalización (i18n)

- Librería: **i18next** + **react-i18next**.
- Locales: `src/renderer/i18n/locales/{es,en,hu}.json`.
- Todas las cadenas visibles usan `t('clave')`.
- Tras cambiar traducciones: `npm run check-translations`.
- Regla Cursor: `.cursor/rules/i18n.mdc`.

---

## Testing

- Framework: **Vitest** (`vitest run`).
- Tests en `src/renderer/__tests__/` (dominio suizo, KO, circuitos, sync, reports, import helpers…).
- Entorno de test: `node` (mocks de DB/electron).
- Ritual pre-commit/entrega (`.cursor/rules/agent-workflow.mdc`):

  ```bash
  npm run test:run
  npm run typecheck
  npm run check-translations   # si se tocaron locales
  ```

Typecheck cubre renderer (`tsconfig.json`) y main (`tsconfig.main.json`).

---

## Seguridad y límites

- Renderer aislado; solo APIs expuestas en preload.
- SQL solo en main process (better-sqlite3 nativo).
- `webSecurity: true` en BrowserWindow.
- Secretos (`.env.colombia`, `.env.international`) gitignored; Supabase opcional.

---

## Flujo típico de una operación

1. Usuario interactúa con página React.
2. Página llama a un **Service** (`SwissPairingService`, `DatabaseService`, etc.).
3. `DatabaseService` → `electronAPI.db` → IPC → `better-sqlite3`.
4. Si sync activa, cambios entran en cola y `SyncService` los propaga.
5. Exportaciones pesadas (Excel, PNG) serializan datos en renderer y delegan escritura a `file:save` en main.

---

## Modelo de datos (resumen)

Relaciones principales (SQLite local):

```
cities ──< places ──< tournaments ──< rounds ──< matches ──< match_results
                         │
                         ├── tournament_configs (1:1)
                         ├── tournament_players >── players
                         └── circuits (clasificatorios)
```

Campos de sync: `uuid` en entidades sincronizables; cola `sync_queue` y `sync_audit_log` para reconciliación con Supabase.

Estados de torneo relevantes: borrador/inscripción → en curso (rondas suizas) → fase KO (opcional) → completado.

---

## Referencias rápidas

| Tema | Dónde mirar |
|------|-------------|
| Reglas de torneo (negocio) | `docs/local/TOURNAMENT_RULES.md` |
| Import/export detallado | `docs/local/IMPORT_EXPORT.md` |
| Backlog KO | `docs/KNOCKOUT_BACKLOG.md` |
| IPC archivos | `src/main/ipc.ts` |
| Tipos torneo | `src/renderer/types/tournament.ts` |
| Config rápida torneo | `utils/quickTournamentDefaults.ts`, Ajustes |
| Guía organizadores | `docs/team/GUIA_USO.md` |
| CI / calidad | `.github/workflows/ci.yml`, Husky lint-staged |
