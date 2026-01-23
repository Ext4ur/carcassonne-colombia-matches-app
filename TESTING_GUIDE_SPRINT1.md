# Guía de Pruebas - Sprint 1

## 🎯 Objetivo

Verificar que todas las implementaciones del Sprint 1 funcionan correctamente y que no se han introducido regresiones en la aplicación existente.

---

## ✅ Checklist de Verificación

### **1. Verificación de Build**

#### 1.1 Build de React
```bash
npm run build:react
```
**Resultado esperado:**
- ✅ Build exitoso sin errores
- ✅ Archivos generados en `dist/renderer/`
- ⚠️ Warnings sobre chunk size son normales (no críticos)

#### 1.2 Build de Electron
```bash
npm run build:electron
```
**Resultado esperado:**
- ✅ Compilación TypeScript exitosa
- ✅ Archivos generados en `dist/main/` y `dist/preload/`

#### 1.3 Build Completo
```bash
npm run build
```
**Resultado esperado:**
- ✅ Ambos builds (React y Electron) exitosos
- ✅ Sin errores de compilación

---

### **2. Verificación de Estructura**

#### 2.1 Carpetas Creadas
Verificar que existen las siguientes carpetas:
```
src/renderer/
├── api/clients/          ✅
├── repositories/
│   ├── base/            ✅
│   ├── local/           ✅
│   └── remote/          ✅
├── auth/components/     ✅
├── services/sync/       ✅
├── services/backup/     ✅
├── hooks/               ✅
├── constants/           ✅
├── schemas/             ✅
└── config/              ✅
```

#### 2.2 Archivos Creados
Verificar que existen los siguientes archivos:
- ✅ `src/renderer/api/clients/IApiClient.ts`
- ✅ `src/renderer/api/clients/SqliteClient.ts`
- ✅ `src/renderer/repositories/base/IRepository.ts`
- ✅ `src/renderer/repositories/base/BaseRepository.ts`
- ✅ `src/renderer/repositories/base/types.ts`
- ✅ `src/renderer/repositories/local/LocalPlayerRepository.ts`
- ✅ `src/renderer/repositories/index.ts`
- ✅ `src/renderer/constants/index.ts`

---

### **3. Verificación de Imports y Path Aliases**

#### 3.1 Verificar que los path aliases funcionan
Crear un archivo de prueba temporal:

```typescript
// test-imports.ts (temporal, para verificar)
import { IRepository } from '@repositories/base/IRepository';
import { IApiClient } from '@api/clients/IApiClient';
import { SqliteClient } from '@api/clients/SqliteClient';
import { BaseRepository } from '@repositories/base/BaseRepository';
import { LocalPlayerRepository } from '@repositories/local/LocalPlayerRepository';
import { createPlayerRepository } from '@repositories/index';
import { DEFAULT_TIEBREAK_CRITERIA, DB_CONFIG } from '@constants';
import { Player } from '@types/player';
```

**Resultado esperado:**
- ✅ TypeScript compila sin errores
- ✅ Todos los imports se resuelven correctamente

#### 3.2 Verificar en la aplicación
Ejecutar:
```bash
npm run build:react
```

**Resultado esperado:**
- ✅ No hay errores de imports
- ✅ Todos los path aliases se resuelven

---

### **4. Verificación de Funcionalidad de la Aplicación**

#### 4.1 Ejecutar la Aplicación
```bash
npm run dev
```

**Resultado esperado:**
- ✅ La aplicación se abre correctamente
- ✅ No hay errores en la consola del navegador
- ✅ No hay errores en la consola de Electron
- ✅ La interfaz se muestra correctamente

#### 4.2 Probar Funcionalidades Existentes
Verificar que las siguientes funcionalidades siguen funcionando:

**Página de Inicio:**
- ✅ Se carga correctamente
- ✅ Muestra estadísticas (si hay datos)

**Página de Torneos:**
- ✅ Lista de torneos se muestra
- ✅ Crear nuevo torneo funciona
- ✅ Ver detalles de torneo funciona

**Página de Jugadores:**
- ✅ Lista de jugadores se muestra
- ✅ Buscar jugadores funciona
- ✅ Crear nuevo jugador funciona

**Página de Circuitos:**
- ✅ Lista de circuitos se muestra
- ✅ Crear nuevo circuito funciona

**Página de Configuración:**
- ✅ Se carga correctamente

---

### **5. Prueba del LocalPlayerRepository (Opcional)**

#### 5.1 Crear Script de Prueba
Crear un archivo temporal para probar el repositorio:

```typescript
// test-repository.ts (temporal)
import { createPlayerRepository } from '@repositories/index';
import { Player } from '@types/player';

async function testRepository() {
  const repository = createPlayerRepository();
  
  // Test 1: findAll
  console.log('Test 1: findAll');
  const allPlayers = await repository.findAll();
  console.log(`Encontrados ${allPlayers.length} jugadores`);
  
  // Test 2: findById (si hay jugadores)
  if (allPlayers.length > 0) {
    console.log('Test 2: findById');
    const player = await repository.findById(allPlayers[0].id!);
    console.log(`Jugador encontrado: ${player?.name}`);
  }
  
  // Test 3: search
  console.log('Test 3: search');
  const searchResults = await repository.search('test');
  console.log(`Búsqueda retornó ${searchResults.length} resultados`);
  
  // Test 4: count
  console.log('Test 4: count');
  const count = await repository.count();
  console.log(`Total de jugadores: ${count}`);
  
  console.log('✅ Todos los tests del repositorio pasaron');
}

// Ejecutar solo si estamos en desarrollo
if (process.env.NODE_ENV === 'development') {
  testRepository().catch(console.error);
}
```

**Nota:** Este script es solo para verificación. No es necesario mantenerlo en producción.

#### 5.2 Verificar que el repositorio funciona
**Resultado esperado:**
- ✅ `findAll()` retorna array de jugadores
- ✅ `findById()` retorna jugador o null
- ✅ `search()` retorna resultados filtrados
- ✅ `count()` retorna número correcto

---

### **6. Verificación de Constantes**

#### 6.1 Verificar que las constantes están disponibles
En la consola del navegador (DevTools), verificar:

```javascript
// Esto debería funcionar si exponemos las constantes (opcional)
// Por ahora, verificar que los imports funcionan
```

#### 6.2 Verificar que los imports de constantes funcionan
En cualquier componente, verificar:

```typescript
import { DEFAULT_TIEBREAK_CRITERIA, getDefaultScoringSystem } from '@constants';
```

**Resultado esperado:**
- ✅ Imports funcionan sin errores
- ✅ Constantes tienen los valores correctos

---

### **7. Verificación de Linting**

#### 7.1 Ejecutar Linter
```bash
# Si tienes un linter configurado
npm run lint
```

**Resultado esperado:**
- ✅ Sin errores de linting
- ⚠️ Warnings menores son aceptables

---

### **8. Verificación de TypeScript**

#### 8.1 Verificar tipos
```bash
npx tsc --noEmit
```

**Resultado esperado:**
- ✅ Sin errores de tipos
- ✅ Todas las interfaces se resuelven correctamente

---

## 🐛 Problemas Comunes y Soluciones

### Problema 1: Error "Cannot find module '@repositories/...'"
**Solución:**
- Verificar que `vite.config.ts` tiene los aliases configurados
- Verificar que `tsconfig.json` tiene los paths configurados
- Reiniciar el servidor de desarrollo

### Problema 2: Error "Electron API not available"
**Solución:**
- Esto es normal si se ejecuta fuera de Electron
- Verificar que `window.electronAPI` existe en el contexto de Electron
- El error solo debería aparecer si se intenta usar SqliteClient fuera de Electron

### Problema 3: Build falla con errores de imports
**Solución:**
- Verificar que todos los archivos existen
- Verificar que los path aliases están correctos
- Limpiar cache: `rm -rf node_modules/.vite` (o `node_modules\.vite` en Windows)

### Problema 4: La aplicación no se abre
**Solución:**
- Verificar que `npm run build:electron` se ejecutó correctamente
- Verificar que no hay errores en la consola
- Revisar `src/main/main.ts` para errores

---

## 📋 Checklist Rápido

Antes de continuar con Sprint 2, verificar:

- [ ] `npm run build` ejecuta sin errores
- [ ] `npm run dev` abre la aplicación correctamente
- [ ] No hay errores en la consola del navegador
- [ ] No hay errores en la consola de Electron
- [ ] Las funcionalidades existentes siguen funcionando
- [ ] Los path aliases funcionan correctamente
- [ ] Las constantes se importan correctamente
- [ ] El código TypeScript compila sin errores

---

## 🎯 Próximos Pasos Después de las Pruebas

Si todas las pruebas pasan:

1. **Hacer commit de cualquier ajuste menor** (si es necesario)
2. **Continuar con Sprint 2:**
   - Setup de Supabase
   - Migración de esquema
   - RemoteRepository base
   - Configuración de RLS

Si hay problemas:

1. **Documentar los problemas encontrados**
2. **Corregir los problemas antes de continuar**
3. **Repetir las pruebas hasta que todo funcione**

---

## 📝 Notas

- Las pruebas son principalmente de verificación, no de integración completa
- El LocalPlayerRepository no se está usando todavía en la aplicación (eso será en Sprint 2)
- El objetivo es verificar que la base está sólida antes de continuar

---

## ✅ Criterio de Éxito

El Sprint 1 se considera exitoso si:
- ✅ Todo compila sin errores
- ✅ La aplicación se ejecuta normalmente
- ✅ No hay regresiones en funcionalidad existente
- ✅ La estructura está lista para Sprint 2

---

**¡Buena suerte con las pruebas!** 🚀
