# Decisiones Técnicas - Refactor y Migración

## 📋 Respuestas a las Decisiones

Basado en tus requerimientos y análisis del código actual, aquí están las recomendaciones específicas:

---

## 1. 🔐 Autenticación Multiusuario Simple (Multi-Tenancy)

### Requerimiento
- Cada tienda tiene su propia aplicación de escritorio
- Solo pueden ver/editar datos de su propia tienda
- Autenticación simple (usuario/contraseña)
- Mantener BD segura con aislamiento por tienda

### Recomendación: **Autenticación con RLS por Location (Tienda)**

**IMPORTANTE:** Ver documento completo `MULTI_TENANCY_AND_BACKUPS.md` para detalles de implementación.

**Opción A: Autenticación Simple con Supabase Auth (Recomendada)**

```typescript
// Estructura propuesta
src/renderer/
  ├── auth/
  │   ├── AuthService.ts          // Manejo de autenticación
  │   ├── AuthContext.tsx         // Context para estado de auth
  │   └── LoginForm.tsx           // Componente de login simple
  └── api/
      └── supabaseClient.ts       // Cliente con auth integrado
```

**Implementación:**
1. **Supabase Auth** con email/password simple
   - No requiere OAuth ni providers externos
   - Supabase maneja hash de contraseñas automáticamente
   - JWT tokens automáticos

2. **RLS Policies en Supabase (Multi-Tenant):**
   ```sql
   -- Los usuarios solo ven torneos de su tienda
   CREATE POLICY "Users see own location tournaments" ON tournaments
     FOR SELECT
     USING (
       location_id IN (
         SELECT location_id 
         FROM user_locations 
         WHERE user_id = auth.uid()
       )
     );
   
   -- Solo pueden crear torneos en su tienda
   CREATE POLICY "Users create in own location" ON tournaments
     FOR INSERT
     WITH CHECK (
       location_id IN (
         SELECT location_id 
         FROM user_locations 
         WHERE user_id = auth.uid()
       )
     );
   ```
   
   **Ver `MULTI_TENANCY_AND_BACKUPS.md` para políticas completas.**

3. **Modo "Sin Login" (Opcional):**
   - Crear usuario anónimo automático en Supabase
   - O usar RLS que permita operaciones sin auth pero con rate limiting
   - Configurable desde settings

**Archivos a crear:**
- `src/renderer/auth/AuthService.ts` - Lógica de autenticación
- `src/renderer/auth/AuthContext.tsx` - Estado global de auth
- `src/renderer/components/auth/LoginForm.tsx` - Formulario simple
- `src/renderer/pages/Login.tsx` - Página de login (opcional)

**Ventajas:**
- ✅ Seguridad robusta (Supabase maneja todo)
- ✅ Simple de implementar
- ✅ Escalable si necesitas más seguridad después
- ✅ Puede ser opcional (modo anónimo)

**Desventajas:**
- ⚠️ Requiere conexión para autenticar (pero puede cachear token)

---

## 2. 📴 Modo Offline

### Requerimiento
- Poder crear torneos sin internet
- No depender de conexión para operaciones básicas

### Recomendación: **Dual Database con Sincronización**

**Arquitectura Propuesta:**

```
┌─────────────────────────────────────────┐
│         Renderer Process                │
│                                         │
│  ┌──────────────────────────────────┐ │
│  │   SyncService (Orquestador)       │ │
│  └──────────────────────────────────┘ │
│           │                    │       │
│           ▼                    ▼       │
│  ┌──────────────┐    ┌──────────────┐ │
│  │ LocalRepo    │    │ RemoteRepo   │ │
│  │ (SQLite)     │    │ (Supabase)   │ │
│  └──────────────┘    └──────────────┘ │
│           │                    │       │
└───────────┼────────────────────┼───────┘
            │                    │
            ▼                    ▼
    ┌──────────────┐    ┌──────────────┐
    │ SQLite Local │    │  Supabase    │
    │ (Siempre)    │    │  (Si online) │
    └──────────────┘    └──────────────┘
```

**Implementación:**

1. **Repository Pattern con Dual Implementation:**
   ```typescript
   // src/renderer/repositories/BaseRepository.ts
   interface IRepository<T> {
     findAll(): Promise<T[]>;
     findById(id: number): Promise<T | null>;
     create(data: Partial<T>): Promise<number>;
     update(id: number, data: Partial<T>): Promise<void>;
     delete(id: number): Promise<void>;
   }
   
   // src/renderer/repositories/LocalRepository.ts
   class LocalRepository<T> implements IRepository<T> {
     // Usa SQLite local
   }
   
   // src/renderer/repositories/RemoteRepository.ts
   class RemoteRepository<T> implements IRepository<T> {
     // Usa Supabase
   }
   
   // src/renderer/repositories/DualRepository.ts
   class DualRepository<T> implements IRepository<T> {
     private local: LocalRepository<T>;
     private remote: RemoteRepository<T>;
     private syncService: SyncService;
     
     async create(data: Partial<T>): Promise<number> {
       // 1. Guardar en local primero (siempre funciona)
       const localId = await this.local.create(data);
       
       // 2. Si hay internet, guardar en remoto
       if (await this.isOnline()) {
         try {
           const remoteId = await this.remote.create(data);
           // 3. Guardar mapping local_id -> remote_id
           await this.syncService.mapIds(localId, remoteId);
         } catch (error) {
           // Marcar para sincronizar después
           await this.syncService.queueForSync('create', localId, data);
         }
       } else {
         // Marcar para sincronizar cuando haya internet
         await this.syncService.queueForSync('create', localId, data);
       }
       
       return localId;
     }
   }
   ```

2. **SyncService para Sincronización:**
   ```typescript
   // src/renderer/services/SyncService.ts
   class SyncService {
     // Cola de operaciones pendientes
     private syncQueue: SyncOperation[] = [];
     
     // Detectar cuando hay internet
     async isOnline(): Promise<boolean> { }
     
     // Sincronizar cola cuando hay internet
     async syncQueue(): Promise<void> { }
     
     // Resolver conflictos (last-write-wins o manual)
     async resolveConflicts(): Promise<void> { }
     
     // Mapear IDs locales a remotos
     async mapIds(localId: number, remoteId: number): Promise<void> { }
   }
   ```

3. **Tabla de Sincronización en SQLite:**
   ```sql
   CREATE TABLE sync_queue (
     id INTEGER PRIMARY KEY,
     operation_type TEXT, -- 'create', 'update', 'delete'
     table_name TEXT,
     local_id INTEGER,
     remote_id INTEGER,
     data TEXT, -- JSON de los datos
     status TEXT, -- 'pending', 'synced', 'error'
     created_at DATETIME,
     synced_at DATETIME
   );
   
   CREATE TABLE id_mapping (
     id INTEGER PRIMARY KEY,
     table_name TEXT,
     local_id INTEGER,
     remote_id INTEGER,
     UNIQUE(table_name, local_id)
   );
   ```

**Flujo de Trabajo Offline:**

1. **Usuario crea torneo sin internet:**
   - Se guarda en SQLite local ✅
   - Se marca en `sync_queue` como pendiente
   - Usuario puede continuar trabajando normalmente

2. **Cuando hay internet:**
   - `SyncService` detecta conexión
   - Procesa cola de sincronización
   - Sube datos a Supabase
   - Actualiza `id_mapping`
   - Marca como sincronizado

3. **Resolución de conflictos:**
   - Si mismo registro fue editado en local y remoto:
     - Opción 1: Last-write-wins (más reciente gana)
     - Opción 2: Mostrar conflicto al usuario para resolver manualmente

**Archivos a crear:**
- `src/renderer/repositories/BaseRepository.ts`
- `src/renderer/repositories/LocalRepository.ts`
- `src/renderer/repositories/RemoteRepository.ts`
- `src/renderer/repositories/DualRepository.ts`
- `src/renderer/services/SyncService.ts`
- `src/renderer/services/NetworkService.ts` (detectar online/offline)
- `src/renderer/hooks/useSync.ts` (hook para manejar sync)

**Ventajas:**
- ✅ Funciona completamente offline
- ✅ Sincronización automática cuando hay internet
- ✅ No pierde datos si falla conexión
- ✅ Experiencia fluida para el usuario

**Desventajas:**
- ⚠️ Más complejo de implementar
- ⚠️ Requiere manejo de conflictos
- ⚠️ Más código que mantener

---

## 3. 🏗️ Repository Pattern

### Requerimiento
- Mejor estructura a largo plazo

### Recomendación: **Repository Pattern Completo**

**Estructura Propuesta:**

```
src/renderer/repositories/
├── base/
│   ├── IRepository.ts           # Interface base
│   ├── BaseRepository.ts        # Implementación base
│   └── DualRepository.ts        # Wrapper para local+remote
├── local/
│   ├── LocalPlayerRepository.ts
│   ├── LocalTournamentRepository.ts
│   └── LocalMatchRepository.ts
├── remote/
│   ├── RemotePlayerRepository.ts
│   ├── RemoteTournamentRepository.ts
│   └── RemoteMatchRepository.ts
└── index.ts                      # Factory para crear repositorios
```

**Implementación:**

```typescript
// src/renderer/repositories/base/IRepository.ts
export interface IRepository<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  findAll(filters?: any): Promise<T[]>;
  findById(id: number): Promise<T | null>;
  create(data: TCreate): Promise<number>;
  update(id: number, data: TUpdate): Promise<void>;
  delete(id: number): Promise<void>;
  count(filters?: any): Promise<number>;
}

// src/renderer/repositories/base/BaseRepository.ts
export abstract class BaseRepository<T> implements IRepository<T> {
  protected abstract tableName: string;
  protected abstract apiClient: ApiClient;
  
  async findAll(filters?: any): Promise<T[]> {
    // Implementación genérica
  }
  
  // Métodos abstractos para operaciones específicas
  abstract findById(id: number): Promise<T | null>;
  abstract create(data: Partial<T>): Promise<number>;
}

// src/renderer/repositories/PlayerRepository.ts
export class PlayerRepository extends BaseRepository<Player> {
  protected tableName = 'players';
  
  async search(term: string): Promise<Player[]> {
    // Lógica específica de búsqueda
  }
  
  async getTournamentPlayers(tournamentId: number): Promise<Player[]> {
    // Lógica específica
  }
}

// src/renderer/repositories/index.ts (Factory)
export function createPlayerRepository(): IRepository<Player> {
  if (useDualMode) {
    return new DualRepository(
      new LocalPlayerRepository(),
      new RemotePlayerRepository()
    );
  }
  return isOnline() 
    ? new RemotePlayerRepository() 
    : new LocalPlayerRepository();
}
```

**Migración de Servicios:**

Los servicios actuales (`PlayerService`, `TournamentService`, etc.) usarán los repositorios:

```typescript
// src/renderer/services/PlayerService.ts
export class PlayerService {
  private repository: IRepository<Player>;
  
  constructor() {
    this.repository = createPlayerRepository();
  }
  
  async getAll(): Promise<Player[]> {
    return this.repository.findAll();
  }
  
  async create(player: CreatePlayerDto): Promise<number> {
    // Validación con Zod
    const validated = playerSchema.parse(player);
    return this.repository.create(validated);
  }
}
```

**Ventajas:**
- ✅ Separación clara de responsabilidades
- ✅ Fácil de testear (mock repositories)
- ✅ Fácil cambiar implementación (local/remote/dual)
- ✅ Código más mantenible
- ✅ Reutilizable

**Desventajas:**
- ⚠️ Más archivos y estructura
- ⚠️ Más código inicial

---

## 4. 🔄 Dual Mode: Local + Cloud Sync

### Requerimiento
- Mantener SQLite local
- Sincronizar con Supabase cuando hay internet

### Recomendación: **Implementar Dual Mode Completo**

**Arquitectura Detallada:**

```
┌─────────────────────────────────────────────────┐
│              Application Layer                   │
│  (Services, Components, Hooks)                  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│           Repository Factory                     │
│  (Decide: Local, Remote, or Dual)                │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ Dual Mode    │    │  Single Mode     │
│ (Default)    │    │  (Configurable)  │
└──────┬───────┘    └──────────────────┘
       │
   ┌───┴───┐
   │       │
   ▼       ▼
┌─────┐ ┌──────┐
│Local│ │Remote│
│Repo │ │Repo  │
└─────┘ └──────┘
   │       │
   ▼       ▼
┌─────┐ ┌──────┐
│SQLite││Supabase│
└─────┘ └──────┘
```

**Implementación del Dual Mode:**

1. **Configuración:**
   ```typescript
   // src/renderer/config/database.ts
   export const DB_CONFIG = {
     mode: 'dual' as 'local' | 'remote' | 'dual',
     syncOnStartup: true,
     syncInterval: 30000, // 30 segundos
     conflictResolution: 'last-write-wins' as 'last-write-wins' | 'manual',
   };
   ```

2. **DualRepository Implementation:**
   ```typescript
   // src/renderer/repositories/base/DualRepository.ts
   export class DualRepository<T> implements IRepository<T> {
     constructor(
       private local: LocalRepository<T>,
       private remote: RemoteRepository<T>,
       private syncService: SyncService
     ) {}
     
     async create(data: Partial<T>): Promise<number> {
       // Estrategia: Write-through local, async remote
       const localId = await this.local.create(data);
       
       // Intentar sync remoto en background
       this.syncService.syncCreate(this.tableName, localId, data)
         .catch(err => console.error('Sync failed:', err));
       
       return localId;
     }
     
     async findAll(): Promise<T[]> {
       // Estrategia: Read from local (más rápido)
       // Si hay internet, actualizar en background
       const localData = await this.local.findAll();
       
       if (await this.syncService.isOnline()) {
         this.syncService.syncRead(this.tableName)
           .catch(err => console.error('Sync read failed:', err));
       }
       
       return localData;
     }
   }
   ```

3. **SyncService Detallado:**
   ```typescript
   // src/renderer/services/SyncService.ts
   export class SyncService {
     private syncQueue: Map<string, SyncOperation[]> = new Map();
     private isSyncing = false;
     
     // Detectar estado de red
     async isOnline(): Promise<boolean> {
       return navigator.onLine && await this.pingSupabase();
     }
     
     // Procesar cola de sincronización
     async processQueue(): Promise<void> {
       if (this.isSyncing) return;
       if (!await this.isOnline()) return;
       
       this.isSyncing = true;
       
       try {
         const operations = await this.getPendingOperations();
         
         for (const op of operations) {
           try {
             await this.executeOperation(op);
             await this.markAsSynced(op.id);
           } catch (error) {
             await this.markAsError(op.id, error);
           }
         }
       } finally {
         this.isSyncing = false;
       }
     }
     
     // Sincronización bidireccional
     async bidirectionalSync(): Promise<void> {
       // 1. Push local changes to remote
       await this.pushLocalToRemote();
       
       // 2. Pull remote changes to local
       await this.pullRemoteToLocal();
       
       // 3. Resolve conflicts
       await this.resolveConflicts();
     }
   }
   ```

4. **Tablas de Sincronización:**
   ```sql
   -- En SQLite local
   CREATE TABLE sync_queue (
     id INTEGER PRIMARY KEY,
     operation_type TEXT NOT NULL,
     table_name TEXT NOT NULL,
     local_id INTEGER,
     remote_id INTEGER,
     data TEXT NOT NULL, -- JSON
     status TEXT DEFAULT 'pending',
     retry_count INTEGER DEFAULT 0,
     error_message TEXT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     synced_at DATETIME
   );
   
   CREATE TABLE id_mapping (
     id INTEGER PRIMARY KEY,
     table_name TEXT NOT NULL,
     local_id INTEGER NOT NULL,
     remote_id INTEGER NOT NULL,
     UNIQUE(table_name, local_id),
     UNIQUE(table_name, remote_id)
   );
   
   CREATE TABLE sync_metadata (
     id INTEGER PRIMARY KEY,
     table_name TEXT NOT NULL UNIQUE,
     last_sync_at DATETIME,
     last_remote_update_at DATETIME
   );
   ```

**Estrategias de Sincronización:**

1. **Write Strategy: Write-Through Local, Async Remote**
   - Escribe en local inmediatamente (siempre funciona)
   - Escribe en remoto en background (si hay internet)
   - Si falla remoto, encola para después

2. **Read Strategy: Read from Local, Update in Background**
   - Lee de local (rápido, funciona offline)
   - Si hay internet, actualiza local en background
   - Usuario siempre ve datos locales (más recientes)

3. **Conflict Resolution:**
   - **Last-Write-Wins:** Timestamp más reciente gana
   - **Manual:** Mostrar conflicto al usuario
   - **Field-level:** Resolver campo por campo

**Archivos a crear:**
- `src/renderer/repositories/base/DualRepository.ts`
- `src/renderer/services/SyncService.ts`
- `src/renderer/services/NetworkService.ts`
- `src/renderer/services/ConflictResolver.ts`
- `src/renderer/hooks/useSync.ts`
- `src/renderer/hooks/useOnlineStatus.ts`
- `src/renderer/config/database.ts`

**Ventajas:**
- ✅ Funciona offline completamente
- ✅ Sincronización automática
- ✅ No pierde datos
- ✅ Mejor experiencia de usuario
- ✅ Backup automático en la nube

**Desventajas:**
- ⚠️ Complejidad de implementación
- ⚠️ Manejo de conflictos necesario
- ⚠️ Más código que mantener

---

## 📊 Resumen de Arquitectura Final

### Estructura de Carpetas Propuesta:

```
src/renderer/
├── api/
│   ├── supabaseClient.ts        # Cliente Supabase
│   ├── sqliteClient.ts          # Cliente SQLite (IPC)
│   ├── clientFactory.ts          # Factory para seleccionar cliente
│   └── types.ts                 # Interfaces ApiClient
├── auth/
│   ├── AuthService.ts           # Lógica de autenticación
│   ├── AuthContext.tsx          # Context de auth
│   └── components/
│       └── LoginForm.tsx        # Formulario de login
├── repositories/
│   ├── base/
│   │   ├── IRepository.ts
│   │   ├── BaseRepository.ts
│   │   └── DualRepository.ts
│   ├── local/
│   │   ├── LocalPlayerRepository.ts
│   │   ├── LocalTournamentRepository.ts
│   │   └── ...
│   ├── remote/
│   │   ├── RemotePlayerRepository.ts
│   │   ├── RemoteTournamentRepository.ts
│   │   └── ...
│   └── index.ts                 # Factory
├── services/
│   ├── PlayerService.ts         # Usa repositorios
│   ├── TournamentService.ts
│   ├── SyncService.ts           # Sincronización
│   ├── NetworkService.ts        # Detectar online/offline
│   └── ConflictResolver.ts      # Resolver conflictos
├── hooks/
│   ├── useSync.ts
│   ├── useOnlineStatus.ts
│   ├── usePlayers.ts
│   └── ...
└── config/
    └── database.ts              # Configuración DB
```

---

## 🎯 Plan de Implementación Ajustado

### Fase 0: Preparación (Sin cambios)
- Crear estructura de carpetas
- Configurar path aliases
- Centralizar constantes

### Fase 1: Repository Pattern Base
- Crear interfaces y clases base
- Implementar LocalRepository (SQLite)
- Implementar RemoteRepository (Supabase stub)
- Crear factory básico

### Fase 2: Setup Supabase
- Crear proyecto Supabase
- Migrar esquema
- Configurar RLS
- Implementar RemoteRepository completo

### Fase 3: Dual Mode y Sincronización
- Implementar DualRepository
- Crear SyncService
- Implementar cola de sincronización
- Crear NetworkService

### Fase 4: Autenticación
- Implementar AuthService
- Crear AuthContext
- Configurar RLS policies
- Crear LoginForm (opcional)

### Fase 5: Migrar Servicios
- Refactorizar servicios para usar repositorios
- Migrar componentes gradualmente

### Fase 6: Testing y Optimización
- Testing de sincronización
- Resolución de conflictos
- Optimizaciones

---

## ⚙️ Configuración Recomendada

### Variables de Entorno:

```env
# Supabase
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key

# Database Mode
VITE_DB_MODE=dual  # 'local' | 'remote' | 'dual'

# Sync Configuration
VITE_SYNC_ENABLED=true
VITE_SYNC_INTERVAL=30000
VITE_CONFLICT_RESOLUTION=last-write-wins

# Auth Configuration
VITE_AUTH_REQUIRED=false  # true para requerir login
VITE_AUTH_PROVIDER=email  # 'email' | 'anonymous'
```

---

## 🔍 Consideraciones Adicionales

### Performance:
- Cache local para queries frecuentes
- Lazy loading de datos remotos
- Debounce en sincronización

### Seguridad:
- Encriptar datos sensibles localmente
- Validar datos antes de sync
- Rate limiting en Supabase

### UX:
- Indicador de estado de sync
- Notificaciones de conflictos
- Modo offline visible

---

## ✅ Checklist de Implementación

- [ ] Repository Pattern base implementado
- [ ] LocalRepository funcionando con SQLite
- [ ] RemoteRepository funcionando con Supabase
- [ ] DualRepository implementado
- [ ] SyncService con cola de sincronización
- [ ] NetworkService detectando online/offline
- [ ] ConflictResolver implementado
- [ ] AuthService (opcional) implementado
- [ ] Testing de sincronización
- [ ] Documentación de uso

---

## 📝 Notas Finales

Esta arquitectura permite:
1. ✅ Trabajar completamente offline
2. ✅ Sincronización automática cuando hay internet
3. ✅ Autenticación simple (opcional)
4. ✅ Estructura escalable y mantenible
5. ✅ No perder datos en caso de fallos

La complejidad inicial se compensa con:
- Mejor experiencia de usuario
- Mayor confiabilidad
- Escalabilidad futura
- Mantenibilidad a largo plazo

---

## 📚 Documentación de Referencia

- `REFACTOR_PLAN.md` - Plan estratégico completo
- `BACKLOG_TASKS.md` - Tareas específicas detalladas
- `TECHNICAL_DECISIONS.md` - Este documento (decisiones técnicas y arquitectura)
- **`MULTI_TENANCY_AND_BACKUPS.md`** - **NUEVO:** Multi-tenancy, conflictos mejorados, backups y Excel templates
- `IMPLEMENTATION_SUMMARY.md` - Resumen ejecutivo del plan
- `SPRINT_1_DETAILED_PLAN.md` - Plan detallado del Sprint 1
