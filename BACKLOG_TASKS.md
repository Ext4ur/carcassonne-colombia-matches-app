# Tareas de Backlog - Refactor y Migración

## 📋 Formato de Tareas para Backlog

Cada tarea incluye:
- **ID:** Identificador único
- **Título:** Nombre descriptivo
- **Descripción:** Detalles de lo que hacer
- **Estimación:** Tiempo aproximado
- **Dependencias:** IDs de tareas previas
- **Prioridad:** Alta/Media/Baja
- **Archivos afectados:** Lista de archivos

---

## 🏗️ FASE 0: Preparación y Fundación

### T-001: Crear estructura de carpetas base
**Tipo:** Configuración  
**Prioridad:** Alta  
**Estimación:** 30 min  
**Dependencias:** Ninguna

**Descripción:**
Crear las siguientes carpetas en `src/renderer/`:
- `hooks/` - Para custom hooks
- `constants/` - Para constantes centralizadas
- `api/` - Para clientes de API (Supabase, etc.)
- `repositories/` - Para Repository Pattern (opcional)
- `schemas/` - Para schemas de validación (Zod)

**Archivos nuevos:**
- `src/renderer/hooks/.gitkeep`
- `src/renderer/constants/.gitkeep`
- `src/renderer/api/.gitkeep`
- `src/renderer/repositories/.gitkeep`
- `src/renderer/schemas/.gitkeep`

---

### T-002: Configurar path aliases adicionales
**Tipo:** Configuración  
**Prioridad:** Alta  
**Estimación:** 1 hora  
**Dependencias:** T-001

**Descripción:**
Actualizar configuración para usar path aliases más específicos:
- `@/hooks` → `src/renderer/hooks`
- `@/constants` → `src/renderer/constants`
- `@/api` → `src/renderer/api`
- `@/repositories` → `src/renderer/repositories`
- `@/schemas` → `src/renderer/schemas`

**Archivos afectados:**
- `tsconfig.json`
- `vite.config.ts`

**Cambios:**
```json
// tsconfig.json
"paths": {
  "@/*": ["src/renderer/*"],
  "@/hooks/*": ["src/renderer/hooks/*"],
  "@/constants/*": ["src/renderer/constants/*"],
  "@/api/*": ["src/renderer/api/*"]
}
```

---

### T-003: Crear barrel exports para types
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 30 min  
**Dependencias:** T-001

**Descripción:**
Crear `src/renderer/types/index.ts` que exporte todos los tipos:
- Exportar desde `player.ts`
- Exportar desde `tournament.ts`
- Exportar desde `circuit.ts`
- Exportar desde `electron.d.ts`

**Archivos nuevos:**
- `src/renderer/types/index.ts`

**Archivos afectados:**
- Todos los archivos que importan tipos (migrar gradualmente)

---

### T-004: Crear barrel exports para services
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 30 min  
**Dependencias:** T-001

**Descripción:**
Crear `src/renderer/services/index.ts` que exporte todos los servicios:
- DatabaseService
- SwissPairingService
- ReportService
- CircuitService
- etc.

**Archivos nuevos:**
- `src/renderer/services/index.ts`

---

### T-005: Centralizar constantes de torneos
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 1 hora  
**Dependencias:** T-001

**Descripción:**
Crear `src/renderer/constants/tournament.ts` con:
- Tipos de torneo: `TOURNAMENT_TYPES`
- Estados: `TOURNAMENT_STATUSES`
- Estados de ronda: `ROUND_STATUSES`
- Estados de partida: `MATCH_STATUSES`
- Valores por defecto: `DEFAULT_PLAYERS_PER_MATCH`, etc.

**Archivos nuevos:**
- `src/renderer/constants/tournament.ts`
- `src/renderer/constants/index.ts`

**Archivos afectados:**
- `src/renderer/utils/tournament.ts`
- `src/renderer/components/tournament/*.tsx`
- `src/renderer/pages/Tournaments.tsx`

---

### T-006: Centralizar constantes de scoring
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 1 hora  
**Dependencias:** T-001

**Descripción:**
Crear `src/renderer/constants/scoring.ts` con:
- Sistemas de puntuación por defecto
- Funciones helper para obtener scoring system

**Archivos nuevos:**
- `src/renderer/constants/scoring.ts`

**Archivos afectados:**
- `src/renderer/utils/scoring.ts`
- `src/renderer/components/tournament/TournamentConfig.tsx`

---

### T-007: Centralizar constantes de tiebreak
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 1 hora  
**Dependencias:** T-001

**Descripción:**
Crear `src/renderer/constants/tiebreak.ts` con:
- `DEFAULT_TIEBREAK_CRITERIA`
- Labels y descripciones de criterios

**Archivos nuevos:**
- `src/renderer/constants/tiebreak.ts`

**Archivos afectados:**
- `src/renderer/utils/tiebreak.ts`
- `src/renderer/pages/Tournaments.tsx`

---

## 🔌 FASE 1: Abstracción de Acceso a Datos

### T-008: Crear interfaz ApiClient
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-001, T-002

**Descripción:**
Crear `src/renderer/api/types.ts` con interfaces:
```typescript
interface ApiClient {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }>;
  transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]>;
}
```

**Archivos nuevos:**
- `src/renderer/api/types.ts`

---

### T-009: Implementar SQLiteClient
**Tipo:** Refactor  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-008

**Descripción:**
Crear `src/renderer/api/sqliteClient.ts` que:
- Implemente `ApiClient` interface
- Use `window.electronAPI.db` internamente
- Mantenga compatibilidad con código actual

**Archivos nuevos:**
- `src/renderer/api/sqliteClient.ts`

---

### T-010: Crear stub de SupabaseClient
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 1 hora  
**Dependencias:** T-008

**Descripción:**
Crear `src/renderer/api/supabaseClient.ts` con:
- Implementación stub de `ApiClient`
- Métodos que lanzan "Not implemented" por ahora
- Estructura lista para implementación real

**Archivos nuevos:**
- `src/renderer/api/supabaseClient.ts`

---

### T-011: Crear factory para ApiClient
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 1 hora  
**Dependencias:** T-009, T-010

**Descripción:**
Crear `src/renderer/api/clientFactory.ts` que:
- Exporte función `getApiClient(): ApiClient`
- Use configuración para decidir SQLite vs Supabase
- Por defecto use SQLite (compatibilidad)

**Archivos nuevos:**
- `src/renderer/api/clientFactory.ts`
- `src/renderer/api/index.ts` (barrel export)

---

### T-012: Migrar DatabaseService a usar ApiClient
**Tipo:** Refactor  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-011

**Descripción:**
Refactorizar `DatabaseService` para:
- Usar `getApiClient()` en lugar de `window.electronAPI.db` directo
- Mantener misma API pública
- No romper código existente

**Archivos afectados:**
- `src/renderer/services/database.ts`

---

## 🗄️ FASE 3: Migración a Supabase

### T-013: Setup proyecto Supabase
**Tipo:** Configuración  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** Ninguna (puede hacerse en paralelo)

**Descripción:**
- Crear proyecto en Supabase
- Configurar base de datos
- Obtener URL y anon key
- Configurar variables de entorno

**Archivos nuevos:**
- `.env.example` (con variables de Supabase)
- Documentación de setup

---

### T-014: Migrar esquema SQLite a PostgreSQL
**Tipo:** Migración  
**Prioridad:** Alta  
**Estimación:** 3-4 horas  
**Dependencias:** T-013

**Descripción:**
- Analizar esquema actual en `src/main/database.ts`
- Crear migraciones SQL para Supabase
- Adaptar tipos de datos (SQLite → PostgreSQL)
- Configurar RLS (Row Level Security)
- Crear políticas de seguridad

**Archivos nuevos:**
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`

**Archivos afectados:**
- `src/main/database.ts` (como referencia)

---

### T-015: Instalar y configurar Supabase client
**Tipo:** Configuración  
**Prioridad:** Alta  
**Estimación:** 1 hora  
**Dependencias:** T-013

**Descripción:**
- Instalar `@supabase/supabase-js`
- Crear `src/renderer/api/supabaseConfig.ts`
- Configurar cliente con URL y key
- Agregar a `package.json`

**Archivos nuevos:**
- `src/renderer/api/supabaseConfig.ts`

**Archivos afectados:**
- `package.json`

---

### T-016: Implementar SupabaseClient completo
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 4-5 horas  
**Dependencias:** T-010, T-014, T-015

**Descripción:**
Implementar métodos de `ApiClient` en `SupabaseClient`:
- `query()` - Usar `.from().select()`
- `execute()` - Usar `.insert()`, `.update()`, `.delete()`
- `transaction()` - Usar transacciones de Supabase
- Manejar errores apropiadamente

**Archivos afectados:**
- `src/renderer/api/supabaseClient.ts`

---

### T-017: Crear script de migración de datos
**Tipo:** Herramienta  
**Prioridad:** Alta  
**Estimación:** 2-3 horas  
**Dependencias:** T-014, T-016

**Descripción:**
Crear script que:
- Lee datos de SQLite local
- Convierte a formato compatible con Supabase
- Inserta datos en Supabase
- Valida integridad

**Archivos nuevos:**
- `scripts/migrate-to-supabase.ts` o `.js`

---

### T-018: Cambiar implementación a Supabase
**Tipo:** Migración  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-016, T-017

**Descripción:**
- Actualizar `clientFactory.ts` para usar Supabase por defecto
- Testing completo de funcionalidad
- Verificar que todo funciona

**Archivos afectados:**
- `src/renderer/api/clientFactory.ts`

---

### T-019: Remover IPC handlers de database
**Tipo:** Limpieza  
**Prioridad:** Media  
**Estimación:** 1 hora  
**Dependencias:** T-018

**Descripción:**
- Remover handlers `db:query`, `db:execute`, `db:transaction` de `src/main/ipc.ts`
- Remover exposición de `db` en `src/preload/preload.ts`
- Actualizar tipos en `src/renderer/types/electron.d.ts`

**Archivos afectados:**
- `src/main/ipc.ts`
- `src/preload/preload.ts`
- `src/renderer/types/electron.d.ts`

---

### T-020: Limpieza post-migración
**Tipo:** Limpieza  
**Prioridad:** Baja  
**Estimación:** 1 hora  
**Dependencias:** T-019

**Descripción:**
- Remover `better-sqlite3` de `package.json` (o mantener como opcional)
- Documentar cambios
- Actualizar README

**Archivos afectados:**
- `package.json`
- `README.md`

---

## 🔧 FASE 2: Separación de Servicios

### T-021: Crear PlayerService
**Tipo:** Refactor  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-012

**Descripción:**
Extraer todas las operaciones de jugadores de `DatabaseService` a:
- `src/renderer/services/PlayerService.ts`
- Métodos: `getAll()`, `getById()`, `create()`, `update()`, `delete()`, `search()`

**Archivos nuevos:**
- `src/renderer/services/PlayerService.ts`

**Archivos afectados:**
- `src/renderer/services/database.ts` (remover métodos de players)
- `src/renderer/pages/Players.tsx` (migrar usos)
- `src/renderer/components/common/PlayerSearch.tsx` (migrar usos)

---

### T-022: Crear TournamentService
**Tipo:** Refactor  
**Prioridad:** Alta  
**Estimación:** 3 horas  
**Dependencias:** T-012

**Descripción:**
Extraer operaciones de torneos:
- `src/renderer/services/TournamentService.ts`
- Métodos: `getAll()`, `getById()`, `create()`, `update()`, `delete()`, `getRounds()`, etc.

**Archivos nuevos:**
- `src/renderer/services/TournamentService.ts`

**Archivos afectados:**
- `src/renderer/services/database.ts`
- `src/renderer/pages/Tournaments.tsx`
- `src/renderer/pages/TournamentDetail.tsx`

---

### T-023: Crear MatchService
**Tipo:** Refactor  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-012

**Descripción:**
Extraer operaciones de partidas:
- `src/renderer/services/MatchService.ts`
- Métodos: `getByRound()`, `getById()`, `create()`, `update()`, `getResults()`, etc.

**Archivos nuevos:**
- `src/renderer/services/MatchService.ts`

**Archivos afectados:**
- `src/renderer/services/database.ts`
- `src/renderer/pages/TournamentDetail.tsx`
- `src/renderer/components/tournament/MatchResultForm.tsx`

---

### T-024: Crear RoundService
**Tipo:** Refactor  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-012

**Descripción:**
Extraer operaciones de rondas:
- `src/renderer/services/RoundService.ts`
- Métodos: `getByTournament()`, `getById()`, `create()`, `update()`, etc.

**Archivos nuevos:**
- `src/renderer/services/RoundService.ts`

**Archivos afectados:**
- `src/renderer/services/database.ts`
- `src/renderer/pages/TournamentDetail.tsx`

---

### T-025: Crear ValidationService
**Tipo:** Nueva funcionalidad  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-021, T-022

**Descripción:**
Crear servicio de validación común:
- `src/renderer/services/ValidationService.ts`
- Métodos: `validatePlayer()`, `validateTournament()`, `validateMatch()`, etc.
- Validaciones reutilizables

**Archivos nuevos:**
- `src/renderer/services/ValidationService.ts`

---

### T-026: Crear ErrorHandler service
**Tipo:** Nueva funcionalidad  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** Ninguna

**Descripción:**
Crear servicio centralizado de manejo de errores:
- `src/renderer/services/ErrorHandler.ts`
- Métodos: `handle()`, `log()`, `notify()`
- Integrar con NotificationContext

**Archivos nuevos:**
- `src/renderer/services/ErrorHandler.ts`

---

### T-027: Crear Logger service
**Tipo:** Nueva funcionalidad  
**Prioridad:** Baja  
**Estimación:** 1 hora  
**Dependencias:** Ninguna

**Descripción:**
Crear servicio de logging:
- `src/renderer/services/Logger.ts`
- Niveles: debug, info, warn, error
- Reemplazar console.log dispersos

**Archivos nuevos:**
- `src/renderer/services/Logger.ts`

---

## 🎣 FASE 4: Custom Hooks

### T-028: Crear useAsync hook
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 1 hora  
**Dependencias:** T-001

**Descripción:**
Hook genérico para operaciones async:
- `src/renderer/hooks/useAsync.ts`
- Maneja loading, error, data states
- Reutilizable para cualquier async operation

**Archivos nuevos:**
- `src/renderer/hooks/useAsync.ts`

---

### T-029: Crear usePlayers hook
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-021, T-028

**Descripción:**
Hook específico para jugadores:
- `src/renderer/hooks/usePlayers.ts`
- Métodos: `loadPlayers()`, `createPlayer()`, `updatePlayer()`, etc.
- Usa `PlayerService` internamente

**Archivos nuevos:**
- `src/renderer/hooks/usePlayers.ts`

**Archivos afectados:**
- `src/renderer/pages/Players.tsx` (migrar a usar hook)

---

### T-030: Crear useTournaments hook
**Tipo:** Nueva funcionalidad  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-022, T-028

**Descripción:**
Hook específico para torneos:
- `src/renderer/hooks/useTournaments.ts`
- Métodos: `loadTournaments()`, `getTournament()`, `createTournament()`, etc.

**Archivos nuevos:**
- `src/renderer/hooks/useTournaments.ts`

**Archivos afectados:**
- `src/renderer/pages/Tournaments.tsx`
- `src/renderer/pages/TournamentDetail.tsx`

---

### T-031: Crear useMatchResults hook
**Tipo:** Nueva funcionalidad  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-023, T-028

**Descripción:**
Hook para resultados de partidas:
- `src/renderer/hooks/useMatchResults.ts`
- Maneja carga y actualización de resultados

**Archivos nuevos:**
- `src/renderer/hooks/useMatchResults.ts`

**Archivos afectados:**
- `src/renderer/components/tournament/MatchResultForm.tsx`

---

### T-032: Crear useForm hook genérico
**Tipo:** Nueva funcionalidad  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-028

**Descripción:**
Hook genérico para formularios:
- `src/renderer/hooks/useForm.ts`
- Maneja form state, validation, errors
- Reutilizable para cualquier formulario

**Archivos nuevos:**
- `src/renderer/hooks/useForm.ts`

---

### T-033: Refactorizar TournamentForm con hooks
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-032

**Descripción:**
- Extraer lógica a `useTournamentForm` hook
- Simplificar componente (solo UI)
- Usar `useForm` internamente

**Archivos afectados:**
- `src/renderer/components/tournament/TournamentForm.tsx`
- `src/renderer/hooks/useTournamentForm.ts` (nuevo)

---

### T-034: Refactorizar MatchResultForm con hooks
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-031, T-032

**Descripción:**
- Extraer lógica a hooks
- Simplificar componente

**Archivos afectados:**
- `src/renderer/components/tournament/MatchResultForm.tsx`

---

## ✅ FASE 5: Validación

### T-035: Instalar y configurar Zod
**Tipo:** Configuración  
**Prioridad:** Media  
**Estimación:** 30 min  
**Dependencias:** T-001

**Descripción:**
- Instalar `zod`
- Configurar en proyecto

**Archivos afectados:**
- `package.json`

---

### T-036: Crear schemas de validación
**Tipo:** Nueva funcionalidad  
**Prioridad:** Media  
**Estimación:** 3 horas  
**Dependencias:** T-035

**Descripción:**
Crear schemas en `src/renderer/schemas/`:
- `player.schema.ts`
- `tournament.schema.ts`
- `match.schema.ts`
- `round.schema.ts`

**Archivos nuevos:**
- `src/renderer/schemas/*.ts`

---

### T-037: Integrar validación en servicios
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-036, T-025

**Descripción:**
- Usar schemas Zod en servicios
- Validar datos antes de guardar

**Archivos afectados:**
- `src/renderer/services/PlayerService.ts`
- `src/renderer/services/TournamentService.ts`
- etc.

---

### T-038: Integrar validación en formularios
**Tipo:** Refactor  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-036, T-033

**Descripción:**
- Usar schemas en formularios
- Validación en tiempo real

**Archivos afectados:**
- Todos los componentes de formulario

---

## 🎨 FASE 6: Optimizaciones (Opcional)

### T-039: Implementar Zustand stores
**Tipo:** Nueva funcionalidad  
**Prioridad:** Baja  
**Estimación:** 4 horas  
**Dependencias:** T-030

**Descripción:**
Crear stores:
- `src/renderer/stores/tournamentStore.ts`
- `src/renderer/stores/playerStore.ts`
- Cache y estado global

**Archivos nuevos:**
- `src/renderer/stores/*.ts`

---

### T-040: Implementar cache layer
**Tipo:** Nueva funcionalidad  
**Prioridad:** Baja  
**Estimación:** 3 horas  
**Dependencias:** T-039

**Descripción:**
- `src/renderer/services/cache.ts`
- TTL y invalidación
- Integrar en servicios

**Archivos nuevos:**
- `src/renderer/services/cache.ts`

---

## 📊 Resumen de Tareas

**Total de tareas:** 40  
**Tiempo estimado total:** ~60-80 horas  
**Tareas críticas (Alta prioridad):** 20  
**Tareas opcionales (Baja prioridad):** 2

### Distribución por fase:
- **FASE 0:** 7 tareas (~5 horas)
- **FASE 1:** 5 tareas (~8 horas)
- **FASE 3:** 8 tareas (~15-18 horas)
- **FASE 2:** 7 tareas (~12 horas)
- **FASE 4:** 7 tareas (~12 horas)
- **FASE 5:** 4 tareas (~7 horas)
- **FASE 6:** 2 tareas (~7 horas, opcionales)

---

## 🎯 Orden Recomendado de Implementación

### Sprint 1 (Semana 1): Fundación
- T-001 a T-007 (FASE 0 completa)
- T-008 a T-012 (FASE 1 completa)

### Sprint 2 (Semana 2): Migración a Supabase
- T-013 a T-020 (FASE 3 completa)

### Sprint 3 (Semana 3): Separación de Servicios
- T-021 a T-027 (FASE 2 completa)

### Sprint 4 (Semana 4): Hooks y Mejoras
- T-028 a T-034 (FASE 4 completa)

### Sprint 5 (Semana 5): Validación y Finalización
- T-035 a T-038 (FASE 5 completa)
- T-039, T-040 (FASE 6, opcional)

### Sprint 6 (Semana 6): Multi-Tenancy y Funcionalidades Avanzadas
- T-041 a T-044 (Multi-tenancy base)
- T-045 a T-046 (Conflict resolution mejorado)
- T-047 a T-049 (Excel templates)
- T-050 a T-053 (Backups)
- T-054 (Actualizar repositorios para location_id)

---

## 🏪 FASE 6: Multi-Tenancy y Funcionalidades Avanzadas

### T-041: Crear tabla locations y user_locations
**Tipo:** Base de Datos  
**Prioridad:** Alta  
**Estimación:** 2 horas  
**Dependencias:** T-020 (Supabase setup)

**Descripción:**
Crear tablas para multi-tenancy:
- Tabla `locations` (tiendas/locaciones)
- Tabla `user_locations` (asignación usuario-tienda)
- Migración en SQLite local
- Migración en Supabase

**Archivos nuevos:**
- `src/main/migrations/add_locations.sql`
- `src/main/migrations/add_user_locations.sql`

**Archivos modificados:**
- `src/main/database.ts` (agregar tablas al schema)

---

### T-042: Agregar location_id a tournaments
**Tipo:** Base de Datos  
**Prioridad:** Alta  
**Estimación:** 1 hora  
**Dependencias:** T-041

**Descripción:**
- Agregar columna `location_id` a tabla `tournaments`
- Agregar constraint único `(name, date, location_id)`
- Crear índices necesarios
- Migración para datos existentes

**Archivos modificados:**
- `src/main/database.ts`
- `src/main/migrations/add_location_to_tournaments.sql`

---

### T-043: Implementar RLS policies en Supabase
**Tipo:** Seguridad  
**Prioridad:** Alta  
**Estimación:** 3 horas  
**Dependencias:** T-042

**Descripción:**
Crear políticas RLS en Supabase para:
- Tournaments: solo ver/editar de su location
- Players: ver todos o solo de su location (configurable)
- Admin: ver todo
- Ver `MULTI_TENANCY_AND_BACKUPS.md` para detalles

**Archivos nuevos:**
- `supabase/migrations/rls_policies.sql`

---

### T-044: Crear AuthService con asignación de location
**Tipo:** Autenticación  
**Prioridad:** Alta  
**Estimación:** 3 horas  
**Dependencias:** T-043

**Descripción:**
- Crear `AuthService` con login/logout
- Obtener `location_id` del usuario después de login
- Guardar en contexto/localStorage
- Ver `MULTI_TENANCY_AND_BACKUPS.md` para implementación

**Archivos nuevos:**
- `src/renderer/auth/AuthService.ts`
- `src/renderer/auth/AuthContext.tsx`
- `src/renderer/components/auth/LoginForm.tsx`

---

### T-045: Crear tabla conflict_logs
**Tipo:** Base de Datos  
**Prioridad:** Media  
**Estimación:** 1 hora  
**Dependencias:** T-020

**Descripción:**
Crear tabla para registrar conflictos de sincronización:
- Campos: table_name, record_id, local_data, remote_data, conflict_type, resolution, etc.
- Índices para búsquedas
- Ver `MULTI_TENANCY_AND_BACKUPS.md` para esquema completo

**Archivos nuevos:**
- `src/main/migrations/add_conflict_logs.sql`

---

### T-046: Implementar ConflictResolver mejorado
**Tipo:** Sincronización  
**Prioridad:** Alta  
**Estimación:** 4 horas  
**Dependencias:** T-045, T-030 (SyncService)

**Descripción:**
- Last-write-wins automático
- Logging completo en `conflict_logs`
- Notificación al admin
- UI para mostrar conflictos al usuario
- Ver `MULTI_TENANCY_AND_BACKUPS.md` para detalles

**Archivos nuevos:**
- `src/renderer/services/ConflictResolver.ts`
- `src/renderer/components/sync/ConflictNotification.tsx`

**Archivos modificados:**
- `src/renderer/services/SyncService.ts`

---

### T-047: Crear ExcelTemplateService
**Tipo:** Exportación/Importación  
**Prioridad:** Media  
**Estimación:** 4 horas  
**Dependencias:** T-015 (ExportService)

**Descripción:**
- Exportar plantillas Excel para tournament, player, match_results
- Incluir validaciones y ejemplos
- Hoja de instrucciones
- Ver `MULTI_TENANCY_AND_BACKUPS.md` para estructura

**Archivos nuevos:**
- `src/renderer/services/ExcelTemplateService.ts`

**Dependencias externas:**
- `exceljs` o `xlsx` package

---

### T-048: Crear ExcelImportService
**Tipo:** Importación  
**Prioridad:** Media  
**Estimación:** 3 horas  
**Dependencias:** T-047

**Descripción:**
- Importar datos desde Excel
- Validar estructura
- Procesar filas y manejar errores
- Retornar resultados con éxito/errores

**Archivos nuevos:**
- `src/renderer/services/ExcelImportService.ts`

---

### T-049: Crear UI para exportar/importar plantillas Excel
**Tipo:** UI  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-048

**Descripción:**
- Componente para exportar plantillas
- Componente para importar desde Excel
- Mostrar resultados de importación
- Agregar a página Settings

**Archivos nuevos:**
- `src/renderer/components/backup/ExcelTemplateExport.tsx`
- `src/renderer/components/backup/ExcelTemplateImport.tsx`

**Archivos modificados:**
- `src/renderer/pages/Settings.tsx`

---

### T-050: Crear BackupService
**Tipo:** Backups  
**Prioridad:** Alta  
**Estimación:** 4 horas  
**Dependencias:** T-020

**Descripción:**
- Exportar todos los datos a JSON
- Comprimir (opcional)
- Subir a Supabase Storage o Google Drive
- Registrar en `backup_logs`
- Ver `MULTI_TENANCY_AND_BACKUPS.md` para implementación

**Archivos nuevos:**
- `src/renderer/services/BackupService.ts`
- `src/main/migrations/add_backup_logs.sql`

---

### T-051: Implementar scheduling de backups
**Tipo:** Backups  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-050

**Descripción:**
- Backup diario a las 2 AM
- Backup semanal los domingos a las 3 AM
- Usar setTimeout/setInterval
- Manejar reinicios de app

**Archivos modificados:**
- `src/renderer/services/BackupService.ts`

---

### T-052: Integrar con Google Drive o Supabase Storage
**Tipo:** Backups  
**Prioridad:** Media  
**Estimación:** 3 horas  
**Dependencias:** T-050

**Descripción:**
- Opción A: Usar Supabase Storage (más simple)
- Opción B: Google Drive API (requiere OAuth)
- Subir archivos comprimidos
- Obtener URLs públicas

**Archivos modificados:**
- `src/renderer/services/BackupService.ts`

---

### T-053: Crear UI para gestionar backups
**Tipo:** UI  
**Prioridad:** Media  
**Estimación:** 2 horas  
**Dependencias:** T-051

**Descripción:**
- Listar backups en tabla
- Crear backup manual
- Ver detalles de backup
- Agregar a página Settings

**Archivos nuevos:**
- `src/renderer/components/backup/BackupSettings.tsx`

**Archivos modificados:**
- `src/renderer/pages/Settings.tsx`

---

### T-054: Actualizar repositorios para filtrar por location_id
**Tipo:** Repositorios  
**Prioridad:** Alta  
**Estimación:** 3 horas  
**Dependencias:** T-044

**Descripción:**
- Agregar filtro automático por `location_id` en todos los repositorios
- Obtener `location_id` del contexto de auth
- Aplicar en queries SELECT, INSERT, UPDATE
- Admin puede ver todo (sin filtro)

**Archivos modificados:**
- `src/renderer/repositories/local/*Repository.ts`
- `src/renderer/repositories/remote/*Repository.ts`
- `src/renderer/repositories/base/BaseRepository.ts`

---

## 📝 Notas para Backlog

- Cada tarea puede dividirse en subtareas más pequeñas si es necesario
- Las tareas de "Alta prioridad" son críticas para la migración
- Las tareas de "Baja prioridad" pueden posponerse
- Considerar hacer testing después de cada fase mayor
- Mantener branch separado para migración a Supabase hasta que esté estable
