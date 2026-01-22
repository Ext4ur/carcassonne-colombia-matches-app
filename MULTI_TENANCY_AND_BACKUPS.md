# Multi-Tenancy y Sistema de Backups

## 🏪 Multi-Tenancy por Tienda/Locación

### Requerimiento
Cada tienda tiene su propia aplicación de escritorio y solo puede:
- Ver/editar sus propios datos (torneos, jugadores, etc.)
- No ver datos de otras tiendas
- Crear torneos únicos por (name, date, location_id)

---

## 📊 Arquitectura Multi-Tenant

### 1. Esquema de Base de Datos

#### Nueva Tabla: `locations` (Tiendas)
```sql
CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Modificaciones a Tablas Existentes

**Tournaments:**
```sql
ALTER TABLE tournaments ADD COLUMN location_id INTEGER NOT NULL;
ALTER TABLE tournaments ADD CONSTRAINT unique_tournament_per_location 
  UNIQUE(name, date, location_id);
CREATE INDEX idx_tournaments_location ON tournaments(location_id);
```

**Players:**
```sql
-- Los jugadores pueden ser compartidos entre tiendas o específicos
-- Opción 1: Jugadores globales (recomendado para circuitos)
-- Opción 2: Jugadores por tienda
ALTER TABLE players ADD COLUMN location_id INTEGER;
CREATE INDEX idx_players_location ON players(location_id);
```

**Circuits:**
```sql
-- Los circuitos son globales, pero las paradas son por tienda
-- Ya existe circuit_id en tournaments, que junto con location_id identifica la parada
```

**Match Results, Rounds, etc.:**
- Heredan el `location_id` del torneo padre
- No necesitan columna propia (se obtiene vía JOIN)

---

### 2. Autenticación y Asignación de Tienda

#### Tabla: `user_locations` (Asignación Usuario-Tienda)
```sql
CREATE TABLE user_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, -- Supabase auth.uid()
  location_id INTEGER NOT NULL,
  role TEXT DEFAULT 'store_manager', -- 'store_manager', 'admin'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, location_id),
  FOREIGN KEY (location_id) REFERENCES locations(id)
);
```

#### Flujo de Autenticación:

1. **Usuario se autentica con Supabase Auth:**
   ```typescript
   // src/renderer/auth/AuthService.ts
   async login(email: string, password: string) {
     const { data, error } = await supabase.auth.signInWithPassword({
       email,
       password
     });
     
     if (error) throw error;
     
     // Obtener location_id del usuario
     const { data: userLocation } = await supabase
       .from('user_locations')
       .select('location_id, role')
       .eq('user_id', data.user.id)
       .single();
     
     // Guardar en contexto/localStorage
     this.setCurrentLocation(userLocation.location_id);
     this.setUserRole(userLocation.role);
     
     return data;
   }
   ```

2. **Configuración Inicial de Tienda:**
   - Primera vez: Usuario admin crea location y asigna usuario
   - O: Usuario se registra y admin aprueba asignación

---

### 3. Row Level Security (RLS) en Supabase

#### Policies para Tournaments:
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

-- Los usuarios solo pueden crear torneos en su tienda
CREATE POLICY "Users create in own location" ON tournaments
  FOR INSERT
  WITH CHECK (
    location_id IN (
      SELECT location_id 
      FROM user_locations 
      WHERE user_id = auth.uid()
    )
  );

-- Los usuarios solo pueden editar torneos de su tienda
CREATE POLICY "Users update own location tournaments" ON tournaments
  FOR UPDATE
  USING (
    location_id IN (
      SELECT location_id 
      FROM user_locations 
      WHERE user_id = auth.uid()
    )
  );
```

#### Policies para Players:
```sql
-- Opción 1: Jugadores globales (todos pueden ver)
CREATE POLICY "All authenticated users see players" ON players
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Opción 2: Jugadores por tienda
CREATE POLICY "Users see own location players" ON players
  FOR SELECT
  USING (
    location_id IS NULL OR 
    location_id IN (
      SELECT location_id 
      FROM user_locations 
      WHERE user_id = auth.uid()
    )
  );
```

#### Policies para Admin:
```sql
-- Admin puede ver todo
CREATE POLICY "Admin sees all" ON tournaments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_locations
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );
```

---

### 4. Unicidad de Torneos

#### Constraint en Base de Datos:
```sql
-- En SQLite local
CREATE UNIQUE INDEX idx_tournament_unique 
  ON tournaments(name, date, location_id);

-- En Supabase (PostgreSQL)
ALTER TABLE tournaments 
  ADD CONSTRAINT unique_tournament_per_location 
  UNIQUE(name, date, location_id);
```

#### Validación en Código:
```typescript
// src/renderer/repositories/TournamentRepository.ts
async create(data: CreateTournamentDto): Promise<number> {
  // Validar unicidad antes de insertar
  const existing = await this.findByLocationAndDate(
    data.location_id,
    data.name,
    data.date
  );
  
  if (existing) {
    throw new Error(
      `Ya existe un torneo con el nombre "${data.name}" ` +
      `en la fecha ${data.date} para esta tienda`
    );
  }
  
  return super.create(data);
}
```

---

## 🔄 Resolución de Conflictos Mejorada

### Requerimiento
- Last-write-wins automático para usuarios
- Logging completo para admin
- Alertas al admin con datos exactos

---

### 1. Tabla de Conflict Logs

```sql
CREATE TABLE conflict_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  local_data TEXT NOT NULL, -- JSON del dato local
  remote_data TEXT NOT NULL, -- JSON del dato remoto
  conflict_type TEXT NOT NULL, -- 'update_update', 'delete_update', etc.
  resolution TEXT NOT NULL, -- 'local_won', 'remote_won', 'merged'
  resolved_by TEXT, -- user_id o 'system'
  resolved_at DATETIME,
  admin_notified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conflict_logs_table_record ON conflict_logs(table_name, record_id);
CREATE INDEX idx_conflict_logs_unresolved ON conflict_logs(resolved_at) WHERE resolved_at IS NULL;
```

---

### 2. ConflictResolver Mejorado

```typescript
// src/renderer/services/ConflictResolver.ts
export class ConflictResolver {
  async resolveConflict(
    tableName: string,
    localId: number,
    remoteId: number,
    localData: any,
    remoteData: any
  ): Promise<any> {
    // Comparar timestamps
    const localTime = new Date(localData.updated_at || localData.created_at);
    const remoteTime = new Date(remoteData.updated_at || remoteData.created_at);
    
    let winner: 'local' | 'remote';
    let resolvedData: any;
    
    if (localTime > remoteTime) {
      winner = 'local';
      resolvedData = localData;
    } else {
      winner = 'remote';
      resolvedData = remoteData;
    }
    
    // Log del conflicto
    await this.logConflict({
      table_name: tableName,
      record_id: localId,
      local_data: JSON.stringify(localData),
      remote_data: JSON.stringify(remoteData),
      conflict_type: 'update_update',
      resolution: winner === 'local' ? 'local_won' : 'remote_won',
      resolved_by: 'system',
      resolved_at: new Date().toISOString()
    });
    
    // Notificar al admin
    await this.notifyAdmin({
      table: tableName,
      recordId: localId,
      localData,
      remoteData,
      resolution: winner
    });
    
    return resolvedData;
  }
  
  private async logConflict(log: ConflictLog): Promise<void> {
    // Guardar en SQLite local
    await localDb.execute(
      `INSERT INTO conflict_logs 
       (table_name, record_id, local_data, remote_data, conflict_type, resolution, resolved_by, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.table_name, log.record_id, log.local_data, log.remote_data, 
       log.conflict_type, log.resolution, log.resolved_by, log.resolved_at]
    );
    
    // También guardar en Supabase (si hay internet)
    if (await this.isOnline()) {
      try {
        await supabase.from('conflict_logs').insert(log);
      } catch (error) {
        console.error('Error saving conflict log to Supabase:', error);
      }
    }
  }
  
  private async notifyAdmin(conflict: ConflictNotification): Promise<void> {
    // Enviar email/notificación al admin
    // Opción 1: Email via Supabase Edge Function
    // Opción 2: Guardar en tabla de notificaciones
    // Opción 3: Webhook
    
    try {
      await supabase.functions.invoke('notify-admin-conflict', {
        body: conflict
      });
    } catch (error) {
      console.error('Error notifying admin:', error);
      // Fallback: guardar en cola local
      await this.queueAdminNotification(conflict);
    }
  }
}
```

---

### 3. UI para Mostrar Conflictos al Usuario

```typescript
// src/renderer/components/sync/ConflictNotification.tsx
export function ConflictNotification({ conflict }: { conflict: Conflict }) {
  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
      <div className="flex items-start">
        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Conflicto de Sincronización Detectado
          </h3>
          <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
            Se detectó un conflicto al sincronizar los datos. 
            El sistema ha resuelto automáticamente usando la versión más reciente.
          </p>
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            El administrador ha sido notificado para revisar este conflicto.
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## 📄 Plantilla Excel para Casos Extremos

### Requerimiento
- Exportar plantilla Excel con estructura de datos
- Usuarios llenan manualmente
- Enviar por correo para importación manual

---

### 1. Exportar Plantilla

```typescript
// src/renderer/services/ExcelTemplateService.ts
export class ExcelTemplateService {
  async exportTemplate(type: 'tournament' | 'player' | 'match_results'): Promise<void> {
    const template = this.getTemplateStructure(type);
    
    // Crear Excel usando xlsx o exceljs
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Datos');
    
    // Agregar headers
    worksheet.columns = template.columns.map(col => ({
      header: col.label,
      key: col.key,
      width: col.width || 15
    }));
    
    // Agregar fila de ejemplo
    const exampleRow = template.example;
    worksheet.addRow(exampleRow);
    
    // Agregar validaciones
    template.validations?.forEach(validation => {
      worksheet.getColumn(validation.column).eachCell((cell, rowNumber) => {
        if (rowNumber > 1) { // Skip header
          cell.dataValidation = validation.rule;
        }
      });
    });
    
    // Agregar instrucciones en segunda hoja
    const instructionsSheet = workbook.addWorksheet('Instrucciones');
    instructionsSheet.addRow(['INSTRUCCIONES']);
    instructionsSheet.addRow([]);
    template.instructions.forEach(instruction => {
      instructionsSheet.addRow([instruction]);
    });
    
    // Guardar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    await window.electronAPI.saveFile(
      buffer,
      `plantilla_${type}_${new Date().toISOString().split('T')[0]}.xlsx`,
      'excel'
    );
  }
  
  private getTemplateStructure(type: string) {
    switch (type) {
      case 'tournament':
        return {
          columns: [
            { key: 'name', label: 'Nombre del Torneo', width: 30 },
            { key: 'date', label: 'Fecha (YYYY-MM-DD)', width: 15 },
            { key: 'type', label: 'Tipo (qualifier/circuit)', width: 15 },
            { key: 'players_per_match', label: 'Jugadores por Partida', width: 20 },
            { key: 'number_of_rounds', label: 'Número de Rondas', width: 18 }
          ],
          example: {
            name: 'Ejemplo: Torneo Enero 2024',
            date: '2024-01-15',
            type: 'qualifier',
            players_per_match: 2,
            number_of_rounds: 3
          },
          instructions: [
            '1. Complete todos los campos marcados como requeridos',
            '2. La fecha debe estar en formato YYYY-MM-DD',
            '3. El tipo debe ser "qualifier" o "circuit"',
            '4. Guarde el archivo y envíelo por correo a: admin@carcassonne-colombia.com'
          ],
          validations: [
            {
              column: 'type',
              rule: {
                type: 'list',
                allowBlank: false,
                formulae: ['"qualifier,circuit"']
              }
            }
          ]
        };
      
      case 'match_results':
        return {
          columns: [
            { key: 'tournament_name', label: 'Nombre del Torneo', width: 30 },
            { key: 'tournament_date', label: 'Fecha del Torneo', width: 15 },
            { key: 'round_number', label: 'Número de Ronda', width: 15 },
            { key: 'match_number', label: 'Número de Partida', width: 15 },
            { key: 'player_name', label: 'Nombre del Jugador', width: 25 },
            { key: 'points', label: 'Puntos', width: 10 },
            { key: 'position', label: 'Posición', width: 10 }
          ],
          example: {
            tournament_name: 'Torneo Enero 2024',
            tournament_date: '2024-01-15',
            round_number: 1,
            match_number: 1,
            player_name: 'Juan Pérez',
            points: 50,
            position: 1
          },
          instructions: [
            '1. Complete todos los campos',
            '2. Asegúrese de que el nombre del torneo y fecha coincidan exactamente',
            '3. Los puntos deben ser números enteros',
            '4. La posición debe ser 1, 2, 3, etc. según el orden de llegada'
          ]
        };
      
      // ... más tipos
    }
  }
}
```

---

### 2. Importar desde Excel

```typescript
// src/renderer/services/ExcelImportService.ts
export class ExcelImportService {
  async importFromExcel(file: File, type: string): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    
    const worksheet = workbook.getWorksheet(1);
    const rows = worksheet.getRows(2); // Skip header
    
    const results: ImportResult = {
      success: [],
      errors: []
    };
    
    for (const row of rows) {
      try {
        const data = this.parseRow(row, type);
        const validated = this.validate(data, type);
        
        // Importar usando el servicio correspondiente
        const id = await this.importData(validated, type);
        results.success.push({ id, data: validated });
      } catch (error) {
        results.errors.push({
          row: row.number,
          error: error.message,
          data: row.values
        });
      }
    }
    
    return results;
  }
  
  private async importData(data: any, type: string): Promise<number> {
    switch (type) {
      case 'tournament':
        return await TournamentService.create(data);
      case 'match_results':
        return await MatchService.importResults(data);
      // ...
    }
  }
}
```

---

### 3. UI para Exportar/Importar

```typescript
// src/renderer/components/backup/ExcelTemplateExport.tsx
export function ExcelTemplateExport() {
  const handleExport = async (type: string) => {
    try {
      await ExcelTemplateService.exportTemplate(type);
      addNotification('Plantilla exportada correctamente', 'success');
    } catch (error) {
      addNotification('Error al exportar plantilla', 'error');
    }
  };
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Exportar Plantilla Excel</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Descargue una plantilla Excel para llenar manualmente en caso de pérdida de datos.
      </p>
      
      <div className="grid grid-cols-2 gap-4">
        <Button onClick={() => handleExport('tournament')}>
          Exportar Plantilla de Torneos
        </Button>
        <Button onClick={() => handleExport('match_results')}>
          Exportar Plantilla de Resultados
        </Button>
        <Button onClick={() => handleExport('player')}>
          Exportar Plantilla de Jugadores
        </Button>
      </div>
    </div>
  );
}
```

---

## 💾 Sistema de Backups Automáticos

### Requerimiento
- Backup diario y semanal
- Guardar en Google Drive del admin
- Restaurar en caso de fallos

---

### 1. Backup Service

```typescript
// src/renderer/services/BackupService.ts
export class BackupService {
  private backupInterval: NodeJS.Timeout | null = null;
  
  async createBackup(type: 'daily' | 'weekly'): Promise<BackupResult> {
    try {
      // 1. Exportar todos los datos a JSON
      const data = await this.exportAllData();
      
      // 2. Comprimir (opcional)
      const compressed = await this.compress(data);
      
      // 3. Subir a Supabase Storage (o Google Drive via API)
      const filename = `backup_${type}_${new Date().toISOString().split('T')[0]}.json.gz`;
      const url = await this.uploadToStorage(compressed, filename);
      
      // 4. Registrar backup en base de datos
      await this.logBackup({
        type,
        filename,
        url,
        size: compressed.length,
        created_at: new Date().toISOString()
      });
      
      return { success: true, url, filename };
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  private async exportAllData(): Promise<BackupData> {
    return {
      players: await PlayerRepository.findAll(),
      tournaments: await TournamentRepository.findAll(),
      matches: await MatchRepository.findAll(),
      results: await MatchResultRepository.findAll(),
      circuits: await CircuitRepository.findAll(),
      // ... todos los datos
      metadata: {
        export_date: new Date().toISOString(),
        version: app.getVersion(),
        location_id: getCurrentLocation()
      }
    };
  }
  
  async scheduleBackups(): Promise<void> {
    // Backup diario a las 2 AM
    this.scheduleDailyBackup();
    
    // Backup semanal los domingos a las 3 AM
    this.scheduleWeeklyBackup();
  }
  
  private scheduleDailyBackup(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);
    
    const msUntilBackup = tomorrow.getTime() - now.getTime();
    
    setTimeout(async () => {
      await this.createBackup('daily');
      // Programar siguiente backup
      this.scheduleDailyBackup();
    }, msUntilBackup);
  }
  
  private scheduleWeeklyBackup(): void {
    const now = new Date();
    const nextSunday = new Date(now);
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(3, 0, 0, 0);
    
    const msUntilBackup = nextSunday.getTime() - now.getTime();
    
    setTimeout(async () => {
      await this.createBackup('weekly');
      // Programar siguiente backup
      this.scheduleWeeklyBackup();
    }, msUntilBackup);
  }
}
```

---

### 2. Integración con Google Drive

#### Opción A: Supabase Storage (Más Simple)
```typescript
// Usar Supabase Storage como intermediario
async uploadToStorage(data: Buffer, filename: string): Promise<string> {
  const { data: uploadData, error } = await supabase.storage
    .from('backups')
    .upload(`admin/${filename}`, data, {
      contentType: 'application/gzip',
      upsert: false
    });
  
  if (error) throw error;
  
  // Obtener URL pública
  const { data: urlData } = supabase.storage
    .from('backups')
    .getPublicUrl(uploadData.path);
  
  return urlData.publicUrl;
}
```

#### Opción B: Google Drive API Directo
```typescript
// Requiere OAuth y Google Drive API
async uploadToGoogleDrive(data: Buffer, filename: string): Promise<string> {
  // 1. Autenticar con Google OAuth
  const auth = await this.getGoogleAuth();
  
  // 2. Subir archivo
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = {
    name: filename,
    parents: [BACKUP_FOLDER_ID]
  };
  
  const media = {
    mimeType: 'application/gzip',
    body: data
  };
  
  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink'
  });
  
  return file.data.webViewLink!;
}
```

---

### 3. Tabla de Backup Logs

```sql
CREATE TABLE backup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'daily' | 'weekly' | 'manual'
  filename TEXT NOT NULL,
  url TEXT,
  size INTEGER, -- bytes
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX idx_backup_logs_type_date ON backup_logs(type, created_at);
```

---

### 4. UI para Backups

```typescript
// src/renderer/pages/Settings.tsx (agregar sección)
export function BackupSettings() {
  const [backups, setBackups] = useState<BackupLog[]>([]);
  
  useEffect(() => {
    loadBackups();
  }, []);
  
  const handleCreateBackup = async (type: 'daily' | 'weekly' | 'manual') => {
    try {
      const result = await BackupService.createBackup(type);
      if (result.success) {
        addNotification('Backup creado correctamente', 'success');
        loadBackups();
      }
    } catch (error) {
      addNotification('Error al crear backup', 'error');
    }
  };
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Backups Automáticos</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Los backups se crean automáticamente diariamente y semanalmente.
      </p>
      
      <div className="flex space-x-4">
        <Button onClick={() => handleCreateBackup('manual')}>
          Crear Backup Manual
        </Button>
      </div>
      
      <Table
        columns={backupColumns}
        data={backups}
        emptyMessage="No hay backups registrados"
      />
    </div>
  );
}
```

---

## 📋 Resumen de Cambios en Esquema

### Nuevas Tablas:
1. `locations` - Tiendas/locaciones
2. `user_locations` - Asignación usuario-tienda
3. `conflict_logs` - Logs de conflictos
4. `backup_logs` - Logs de backups

### Modificaciones:
1. `tournaments` - Agregar `location_id`, constraint único (name, date, location_id)
2. `players` - Agregar `location_id` (opcional, para jugadores por tienda)

### Índices:
- `idx_tournaments_location` en `tournaments(location_id)`
- `idx_tournament_unique` en `tournaments(name, date, location_id)`
- `idx_players_location` en `players(location_id)`

---

## ✅ Checklist de Implementación

### Multi-Tenancy:
- [ ] Crear tabla `locations`
- [ ] Crear tabla `user_locations`
- [ ] Agregar `location_id` a `tournaments`
- [ ] Agregar constraint único (name, date, location_id)
- [ ] Implementar RLS policies en Supabase
- [ ] Crear AuthService con asignación de location
- [ ] Crear LocationContext
- [ ] Actualizar todos los repositorios para filtrar por location_id

### Conflict Resolution:
- [ ] Crear tabla `conflict_logs`
- [ ] Implementar ConflictResolver mejorado
- [ ] Crear sistema de notificaciones al admin
- [ ] Crear UI para mostrar conflictos al usuario
- [ ] Testing de resolución de conflictos

### Excel Templates:
- [ ] Crear ExcelTemplateService
- [ ] Crear plantillas para tournament, player, match_results
- [ ] Crear ExcelImportService
- [ ] Crear UI para exportar/importar
- [ ] Agregar validaciones en plantillas

### Backups:
- [ ] Crear BackupService
- [ ] Implementar exportación de datos
- [ ] Integrar con Supabase Storage o Google Drive
- [ ] Crear sistema de scheduling
- [ ] Crear tabla `backup_logs`
- [ ] Crear UI para gestionar backups
- [ ] Testing de restauración
