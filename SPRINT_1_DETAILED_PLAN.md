# Sprint 1: Fundación - Plan Detallado

## 🎯 Objetivo del Sprint

Crear la base arquitectónica para todo el refactor. Establecer estructura de carpetas, interfaces base, y LocalRepository funcionando con SQLite.

**Duración estimada:** 3-4 días  
**Complejidad:** Media

---

## 📋 Tareas del Sprint

### **Tarea 1.1: Crear Estructura de Carpetas** (30 min)

**Objetivo:** Establecer la estructura base del proyecto

**Archivos/Carpetas a crear:**
```
src/renderer/
├── repositories/
│   ├── base/
│   ├── local/
│   └── remote/
├── api/
│   └── clients/
├── auth/
│   └── components/
├── services/
│   ├── sync/
│   └── backup/
├── hooks/
├── constants/
├── schemas/
└── config/
```

**Acciones:**
- [ ] Crear todas las carpetas vacías
- [ ] Crear archivos `.gitkeep` en carpetas vacías (para que Git las trackee)
- [ ] Actualizar `.gitignore` si es necesario

**Criterio de aceptación:**
- ✅ Todas las carpetas existen
- ✅ Estructura documentada en README o comentarios

---

### **Tarea 1.2: Configurar Path Aliases** (1 hora)

**Objetivo:** Facilitar imports con aliases

**Archivos a modificar:**
- `tsconfig.json` o `vite.config.ts`

**Configuración:**
```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@repositories': path.resolve(__dirname, './src/renderer/repositories'),
      '@services': path.resolve(__dirname, './src/renderer/services'),
      '@hooks': path.resolve(__dirname, './src/renderer/hooks'),
      '@components': path.resolve(__dirname, './src/renderer/components'),
      '@types': path.resolve(__dirname, './src/renderer/types'),
      '@constants': path.resolve(__dirname, './src/renderer/constants'),
      '@config': path.resolve(__dirname, './src/renderer/config'),
    }
  }
});
```

**Acciones:**
- [ ] Agregar aliases en `vite.config.ts`
- [ ] Agregar paths en `tsconfig.json`
- [ ] Probar que los imports funcionan

**Criterio de aceptación:**
- ✅ Imports con aliases funcionan
- ✅ No hay errores de TypeScript

---

### **Tarea 1.3: Centralizar Constantes** (1 hora)

**Objetivo:** Mover todas las constantes a un lugar centralizado

**Archivo a crear:**
- `src/renderer/constants/index.ts`

**Constantes a centralizar:**
```typescript
// src/renderer/constants/index.ts
export const DEFAULT_TIEBREAK_CRITERIA = [
  { criterion: 'tournament_points', weight: 1 },
  { criterion: 'match_wins', weight: 0.8 },
  // ...
];

export const DEFAULT_SCORING_SYSTEMS = {
  2: { 1: 1, 2: 0 },
  3: { 1: 2, 2: 1, 3: 0 },
  // ...
};

export const TOURNAMENT_STATUSES = ['draft', 'in_progress', 'completed'] as const;
export const MATCH_STATUSES = ['pending', 'completed'] as const;
export const ROUND_STATUSES = ['pending', 'in_progress', 'completed'] as const;

// Database config
export const DB_CONFIG = {
  mode: 'dual' as 'local' | 'remote' | 'dual',
  syncOnStartup: true,
  syncInterval: 30000,
  conflictResolution: 'last-write-wins' as 'last-write-wins' | 'manual',
};
```

**Archivos a modificar:**
- Buscar todos los usos de constantes hardcodeadas
- Reemplazar con imports desde `@constants`

**Acciones:**
- [ ] Crear archivo de constantes
- [ ] Mover constantes desde `utils/scoring.ts`, `utils/tiebreak.ts`, etc.
- [ ] Actualizar imports en archivos que usan estas constantes
- [ ] Verificar que todo sigue funcionando

**Criterio de aceptación:**
- ✅ Todas las constantes están centralizadas
- ✅ No hay constantes hardcodeadas en el código
- ✅ Imports actualizados correctamente

---

### **Tarea 1.4: Crear Interfaces Base** (2 horas)

**Objetivo:** Definir interfaces para Repository Pattern

**Archivos a crear:**
- `src/renderer/repositories/base/IRepository.ts`
- `src/renderer/repositories/base/IApiClient.ts`
- `src/renderer/repositories/base/types.ts`

**Interfaces:**
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

// src/renderer/repositories/base/IApiClient.ts
export interface IApiClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }>;
  transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]>;
}

// src/renderer/repositories/base/types.ts
export type RepositoryMode = 'local' | 'remote' | 'dual';
export type ConflictResolution = 'last-write-wins' | 'manual';
```

**Acciones:**
- [ ] Crear archivo `IRepository.ts` con interface base
- [ ] Crear archivo `IApiClient.ts` con interface para clientes de BD
- [ ] Crear archivo `types.ts` con tipos comunes
- [ ] Agregar comentarios JSDoc a las interfaces

**Criterio de aceptación:**
- ✅ Interfaces definidas y documentadas
- ✅ TypeScript compila sin errores
- ✅ Interfaces son genéricas y reutilizables

---

### **Tarea 1.5: Crear ApiClient para SQLite** (2 horas)

**Objetivo:** Wrapper para acceso a SQLite a través de IPC

**Archivo a crear:**
- `src/renderer/api/clients/SqliteClient.ts`

**Implementación:**
```typescript
// src/renderer/api/clients/SqliteClient.ts
import { IApiClient } from '@repositories/base/IApiClient';

export class SqliteClient implements IApiClient {
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.query(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.execute(sql, params);
  }

  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.transaction(queries);
  }
}
```

**Acciones:**
- [ ] Crear clase `SqliteClient` implementando `IApiClient`
- [ ] Usar `window.electronAPI.db` para todas las operaciones
- [ ] Agregar manejo de errores
- [ ] Agregar logging (opcional, para debugging)

**Criterio de aceptación:**
- ✅ SqliteClient implementa IApiClient correctamente
- ✅ Funciona con el código existente
- ✅ Maneja errores apropiadamente

---

### **Tarea 1.6: Crear BaseRepository** (3 horas)

**Objetivo:** Clase base abstracta para repositorios

**Archivo a crear:**
- `src/renderer/repositories/base/BaseRepository.ts`

**Implementación:**
```typescript
// src/renderer/repositories/base/BaseRepository.ts
import { IRepository } from './IRepository';
import { IApiClient } from '../api/clients/IApiClient';

export abstract class BaseRepository<T> implements IRepository<T> {
  protected abstract tableName: string;
  protected abstract apiClient: IApiClient;
  
  async findAll(filters?: any): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (filters) {
      const conditions = this.buildWhereClause(filters, params);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }
    
    sql += ` ORDER BY id DESC`;
    
    return this.apiClient.query<T>(sql, params);
  }
  
  async findById(id: number): Promise<T | null> {
    const results = await this.apiClient.query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    return results[0] || null;
  }
  
  async create(data: Partial<T>): Promise<number> {
    const { columns, values, params } = this.buildInsertData(data);
    const result = await this.apiClient.execute(
      `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${values.join(', ')})`,
      params
    );
    return result.lastInsertRowid;
  }
  
  async update(id: number, data: Partial<T>): Promise<void> {
    const { updates, params } = this.buildUpdateData(data);
    if (updates.length === 0) return;
    
    params.push(id);
    await this.apiClient.execute(
      `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }
  
  async delete(id: number): Promise<void> {
    await this.apiClient.execute(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
  }
  
  async count(filters?: any): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (filters) {
      const conditions = this.buildWhereClause(filters, params);
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }
    
    const results = await this.apiClient.query<{ count: number }>(sql, params);
    return results[0]?.count || 0;
  }
  
  // Métodos auxiliares protegidos
  protected buildWhereClause(filters: any, params: any[]): string[] {
    const conditions: string[] = [];
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }
    return conditions;
  }
  
  protected buildInsertData(data: Partial<T>): { columns: string[]; values: string[]; params: any[] } {
    const columns: string[] = [];
    const values: string[] = [];
    const params: any[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        columns.push(key);
        values.push('?');
        params.push(value);
      }
    }
    
    return { columns, values, params };
  }
  
  protected buildUpdateData(data: Partial<T>): { updates: string[]; params: any[] } {
    const updates: string[] = [];
    const params: any[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }
    
    return { updates, params };
  }
}
```

**Acciones:**
- [ ] Crear clase abstracta `BaseRepository`
- [ ] Implementar métodos CRUD básicos
- [ ] Agregar métodos auxiliares para construir queries
- [ ] Agregar manejo de errores
- [ ] Agregar comentarios JSDoc

**Criterio de aceptación:**
- ✅ BaseRepository es abstracta y genérica
- ✅ Métodos CRUD funcionan correctamente
- ✅ Queries SQL son seguras (usando parámetros)
- ✅ Código está bien documentado

---

### **Tarea 1.7: Implementar LocalPlayerRepository** (2 horas)

**Objetivo:** Primer repositorio específico usando BaseRepository

**Archivo a crear:**
- `src/renderer/repositories/local/LocalPlayerRepository.ts`

**Implementación:**
```typescript
// src/renderer/repositories/local/LocalPlayerRepository.ts
import { BaseRepository } from '../base/BaseRepository';
import { SqliteClient } from '@api/clients/SqliteClient';
import { Player } from '@types/player';

export class LocalPlayerRepository extends BaseRepository<Player> {
  protected tableName = 'players';
  protected apiClient = new SqliteClient();
  
  async search(searchTerm: string): Promise<Player[]> {
    const term = `%${searchTerm}%`;
    return this.apiClient.query<Player>(
      'SELECT * FROM players WHERE name LIKE ? OR bga_username LIKE ? ORDER BY name',
      [term, term]
    );
  }
  
  async getTournamentPlayers(tournamentId: number): Promise<Player[]> {
    return this.apiClient.query<Player>(
      `SELECT p.* FROM players p
       INNER JOIN tournament_players tp ON p.id = tp.player_id
       WHERE tp.tournament_id = ?
       ORDER BY p.name`,
      [tournamentId]
    );
  }
}
```

**Acciones:**
- [ ] Crear `LocalPlayerRepository` extendiendo `BaseRepository`
- [ ] Implementar métodos específicos (`search`, `getTournamentPlayers`)
- [ ] Probar que funciona con datos reales
- [ ] Comparar resultados con `DatabaseService` actual

**Criterio de aceptación:**
- ✅ LocalPlayerRepository funciona correctamente
- ✅ Métodos específicos implementados
- ✅ Resultados son idénticos a DatabaseService actual

---

### **Tarea 1.8: Crear Factory Básico** (1 hora)

**Objetivo:** Factory para crear repositorios según configuración

**Archivo a crear:**
- `src/renderer/repositories/index.ts`

**Implementación:**
```typescript
// src/renderer/repositories/index.ts
import { IRepository } from './base/IRepository';
import { LocalPlayerRepository } from './local/LocalPlayerRepository';
import { Player } from '@types/player';
import { DB_CONFIG } from '@constants';

export function createPlayerRepository(): IRepository<Player> {
  // Por ahora solo retornamos LocalRepository
  // En Sprint 3 agregaremos DualRepository
  return new LocalPlayerRepository();
}

// Factory genérico (para futuro)
export function createRepository<T>(
  type: 'player' | 'tournament' | 'match' | 'round',
  mode: 'local' | 'remote' | 'dual' = DB_CONFIG.mode
): IRepository<T> {
  switch (type) {
    case 'player':
      return createPlayerRepository() as IRepository<T>;
    // Agregar más casos en sprints siguientes
    default:
      throw new Error(`Repository type ${type} not implemented`);
  }
}
```

**Acciones:**
- [ ] Crear factory básico
- [ ] Implementar `createPlayerRepository`
- [ ] Agregar factory genérico (para futuro)
- [ ] Probar que funciona

**Criterio de aceptación:**
- ✅ Factory crea repositorios correctamente
- ✅ Código está preparado para expansión futura

---

### **Tarea 1.9: Testing y Documentación** (2 horas)

**Objetivo:** Verificar que todo funciona y documentar

**Acciones:**
- [ ] Crear tests básicos (o al menos pruebas manuales)
- [ ] Verificar que no se rompió funcionalidad existente
- [ ] Documentar estructura en README o comentarios
- [ ] Crear ejemplo de uso

**Criterio de aceptación:**
- ✅ Todo funciona correctamente
- ✅ Documentación actualizada
- ✅ No hay regresiones

---

## 📊 Resumen del Sprint

| Tarea | Tiempo | Prioridad | Dependencias |
|-------|--------|-----------|--------------|
| 1.1 Estructura de carpetas | 30 min | Alta | Ninguna |
| 1.2 Path aliases | 1 hora | Alta | 1.1 |
| 1.3 Constantes | 1 hora | Media | 1.1 |
| 1.4 Interfaces base | 2 horas | Alta | 1.1 |
| 1.5 SqliteClient | 2 horas | Alta | 1.4 |
| 1.6 BaseRepository | 3 horas | Alta | 1.4, 1.5 |
| 1.7 LocalPlayerRepository | 2 horas | Alta | 1.6 |
| 1.8 Factory | 1 hora | Media | 1.7 |
| 1.9 Testing | 2 horas | Alta | Todas |

**Total estimado:** ~14.5 horas (2 días de trabajo)

---

## ✅ Criterios de Aceptación del Sprint

- [ ] Estructura de carpetas completa
- [ ] Path aliases funcionando
- [ ] Constantes centralizadas
- [ ] Interfaces base definidas
- [ ] SqliteClient implementado
- [ ] BaseRepository funcionando
- [ ] LocalPlayerRepository funcionando
- [ ] Factory básico funcionando
- [ ] No hay regresiones en funcionalidad existente
- [ ] Código documentado

---

## 🚀 Próximos Pasos (Sprint 2)

Después de completar Sprint 1:
1. Setup de Supabase
2. Migración de esquema
3. RemoteRepository base
4. Configuración de RLS

---

## 📝 Notas

- Este sprint es **crítico** - es la base de todo
- No apresurarse - mejor hacerlo bien desde el inicio
- Si algo no está claro, documentar y preguntar
- Mantener compatibilidad con código existente durante la transición
