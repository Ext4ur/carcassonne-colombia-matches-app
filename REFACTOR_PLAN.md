# Plan de Refactor y Migración a Supabase

## 📋 Resumen Ejecutivo

Este documento detalla el plan completo para refactorizar la aplicación y migrar de SQLite local a Supabase. El plan está organizado en fases que minimizan el riesgo y permiten desarrollo incremental.

---

## 🎯 Objetivos

1. **Mejorar la arquitectura** del código para mayor mantenibilidad
2. **Migrar a Supabase** para acceso remoto y sincronización
3. **Reducir deuda técnica** y mejorar calidad del código
4. **Mantener funcionalidad** durante todo el proceso

---

## 📊 Análisis de Dependencias

### Estado Actual
- **152 usos** de `DatabaseService` en **18 archivos**
- SQLite local con IPC (Electron)
- Servicios monolíticos (DatabaseService con 570+ líneas)
- Sin abstracción de acceso a datos

### Impacto de Migración a Supabase
- Cambiará **todos** los servicios de datos
- Requiere nueva capa de autenticación
- Necesita manejo de sincronización offline/online
- Cambia arquitectura de Electron (ya no necesita IPC para DB)

---

## 🗺️ Fases del Plan

### **FASE 0: Preparación y Fundación** (Crítico - Hacer PRIMERO)
*Objetivo: Crear la base para todos los refactors futuros*

#### 0.1 Crear estructura de carpetas base
- [ ] Crear `src/renderer/hooks/`
- [ ] Crear `src/renderer/constants/`
- [ ] Crear `src/renderer/api/` (para Supabase client)
- [ ] Crear `src/renderer/repositories/` (opcional, para Repository Pattern)
- [ ] Crear `src/renderer/schemas/` (para validación Zod)

**Tiempo estimado:** 30 min  
**Dependencias:** Ninguna  
**Riesgo:** Bajo

#### 0.2 Configurar path aliases y barrel exports
- [ ] Actualizar `tsconfig.json` con paths adicionales
- [ ] Actualizar `vite.config.ts` con aliases
- [ ] Crear `src/renderer/types/index.ts` (barrel export)
- [ ] Crear `src/renderer/services/index.ts` (barrel export)
- [ ] Migrar imports gradualmente a usar aliases

**Tiempo estimado:** 2-3 horas  
**Dependencias:** 0.1  
**Riesgo:** Bajo (puede hacerse gradualmente)

#### 0.3 Crear constantes centralizadas
- [ ] `src/renderer/constants/tournament.ts` (tipos de torneo, estados, etc.)
- [ ] `src/renderer/constants/scoring.ts` (sistemas de puntuación)
- [ ] `src/renderer/constants/tiebreak.ts` (criterios de desempate)
- [ ] `src/renderer/constants/index.ts` (barrel export)
- [ ] Migrar constantes desde utils y componentes

**Tiempo estimado:** 2 horas  
**Dependencias:** 0.1  
**Riesgo:** Bajo

---

### **FASE 1: Abstracción de Acceso a Datos** (Crítico - ANTES de Supabase)
*Objetivo: Crear capa de abstracción que permita cambiar de SQLite a Supabase sin tocar servicios*

#### 1.1 Crear ApiClient/DataAccessLayer
- [ ] Crear `src/renderer/api/client.ts` (interfaz abstracta)
- [ ] Crear `src/renderer/api/sqliteClient.ts` (implementación actual)
- [ ] Crear `src/renderer/api/supabaseClient.ts` (implementación futura - stub)
- [ ] Factory pattern para seleccionar cliente según configuración
- [ ] Migrar `DatabaseService.query/execute/transaction` a usar ApiClient

**Tiempo estimado:** 4-5 horas  
**Dependencias:** 0.2  
**Riesgo:** Medio (afecta todos los servicios)

#### 1.2 Crear Repository Pattern (Opcional pero recomendado)
- [ ] `src/renderer/repositories/BaseRepository.ts` (clase base)
- [ ] `src/renderer/repositories/PlayerRepository.ts`
- [ ] `src/renderer/repositories/TournamentRepository.ts`
- [ ] `src/renderer/repositories/MatchRepository.ts`
- [ ] `src/renderer/repositories/RoundRepository.ts`
- [ ] Migrar operaciones de DatabaseService a repositorios

**Tiempo estimado:** 6-8 horas  
**Dependencias:** 1.1  
**Riesgo:** Medio-Alto (refactor grande)

**Alternativa más simple:** Saltar Repository Pattern y usar ApiClient directamente en servicios

---

### **FASE 2: Separación de Servicios** (Hacer ANTES de Supabase)
*Objetivo: Dividir DatabaseService monolítico en servicios específicos*

#### 2.1 Separar DatabaseService en servicios específicos
- [ ] `src/renderer/services/PlayerService.ts` (operaciones de jugadores)
- [ ] `src/renderer/services/TournamentService.ts` (operaciones de torneos)
- [ ] `src/renderer/services/MatchService.ts` (operaciones de partidas)
- [ ] `src/renderer/services/RoundService.ts` (operaciones de rondas)
- [ ] Mantener `DatabaseService` solo para operaciones de bajo nivel (query/execute)
- [ ] Migrar usos de DatabaseService a servicios específicos

**Tiempo estimado:** 8-10 horas  
**Dependencias:** 1.1 (o 1.2 si se hace Repository Pattern)  
**Riesgo:** Medio (muchos archivos afectados, pero incremental)

#### 2.2 Crear servicios de validación y error handling
- [ ] `src/renderer/services/ValidationService.ts` (validaciones comunes)
- [ ] `src/renderer/services/ErrorHandler.ts` (manejo centralizado de errores)
- [ ] `src/renderer/services/Logger.ts` (logging service)
- [ ] Integrar en servicios existentes

**Tiempo estimado:** 3-4 horas  
**Dependencias:** 2.1  
**Riesgo:** Bajo

---

### **FASE 3: Migración a Supabase** (Punto crítico)
*Objetivo: Migrar de SQLite local a Supabase*

#### 3.1 Configuración inicial de Supabase
- [ ] Crear proyecto en Supabase
- [ ] Configurar esquema de base de datos (migrar desde SQLite)
- [ ] Configurar Row Level Security (RLS)
- [ ] Crear políticas de seguridad
- [ ] Instalar `@supabase/supabase-js`

**Tiempo estimado:** 4-6 horas  
**Dependencias:** Ninguna (puede hacerse en paralelo)  
**Riesgo:** Medio

#### 3.2 Implementar Supabase Client
- [ ] Crear `src/renderer/api/supabaseClient.ts` (implementación completa)
- [ ] Configurar autenticación (si es necesaria)
- [ ] Implementar métodos de ApiClient para Supabase
- [ ] Testing de conexión básica

**Tiempo estimado:** 3-4 horas  
**Dependencias:** 3.1, 1.1  
**Riesgo:** Medio

#### 3.3 Migración de datos (si hay datos existentes)
- [ ] Script de migración SQLite → Supabase
- [ ] Validación de integridad de datos
- [ ] Backup de datos locales

**Tiempo estimado:** 2-3 horas  
**Dependencias:** 3.1, 3.2  
**Riesgo:** Alto (pérdida de datos)

#### 3.4 Cambiar implementación de ApiClient
- [ ] Cambiar factory para usar `supabaseClient` en lugar de `sqliteClient`
- [ ] Remover IPC handlers de database (ya no necesarios)
- [ ] Actualizar preload.ts (remover db handlers)
- [ ] Testing completo de funcionalidad

**Tiempo estimado:** 2-3 horas  
**Dependencias:** 3.2, 3.3  
**Riesgo:** Alto (afecta toda la app)

#### 3.5 Limpieza post-migración
- [ ] Remover `better-sqlite3` de dependencias
- [ ] Remover `src/main/database.ts` (o mantener para backup)
- [ ] Remover IPC handlers de database
- [ ] Actualizar documentación

**Tiempo estimado:** 1-2 horas  
**Dependencias:** 3.4  
**Riesgo:** Bajo

---

### **FASE 4: Mejoras en Componentes y Hooks** (Después de Supabase)
*Objetivo: Mejorar UI y extraer lógica reutilizable*

#### 4.1 Crear custom hooks
- [ ] `src/renderer/hooks/useAsync.ts` (hook genérico para async)
- [ ] `src/renderer/hooks/usePlayers.ts` (hook para jugadores)
- [ ] `src/renderer/hooks/useTournaments.ts` (hook para torneos)
- [ ] `src/renderer/hooks/useMatchResults.ts` (hook para resultados)
- [ ] `src/renderer/hooks/useForm.ts` (hook genérico para formularios)

**Tiempo estimado:** 6-8 horas  
**Dependencias:** 2.1, 3.4  
**Riesgo:** Bajo-Medio

#### 4.2 Refactorizar formularios
- [ ] Extraer lógica de `TournamentForm` a `useTournamentForm`
- [ ] Extraer lógica de `PlayerRegistration` a hooks
- [ ] Extraer lógica de `MatchResultForm` a hooks
- [ ] Simplificar componentes (solo UI)

**Tiempo estimado:** 4-6 horas  
**Dependencias:** 4.1  
**Riesgo:** Medio

#### 4.3 Mejorar componentes comunes
- [ ] Mejorar `Table.tsx` con tipos genéricos
- [ ] Crear componentes de formulario más específicos
- [ ] Mejorar `ErrorBoundary` (crear si no existe)

**Tiempo estimado:** 3-4 horas  
**Dependencias:** 4.2  
**Riesgo:** Bajo

---

### **FASE 5: Validación y Type Safety** (Mejora continua)
*Objetivo: Agregar validación robusta y mejorar type safety*

#### 5.1 Implementar validación con Zod
- [ ] Instalar `zod`
- [ ] Crear schemas en `src/renderer/schemas/`
  - [ ] `player.schema.ts`
  - [ ] `tournament.schema.ts`
  - [ ] `match.schema.ts`
- [ ] Integrar validación en servicios y formularios

**Tiempo estimado:** 4-5 horas  
**Dependencias:** 2.2, 4.2  
**Riesgo:** Bajo

#### 5.2 Mejorar tipos TypeScript
- [ ] Eliminar usos de `any`
- [ ] Agregar tipos más específicos
- [ ] Crear tipos genéricos donde sea apropiado
- [ ] Consolidar exports en `types/index.ts`

**Tiempo estimado:** 3-4 horas  
**Dependencias:** 5.1  
**Riesgo:** Bajo

---

### **FASE 6: Estado Global y Optimizaciones** (Opcional)
*Objetivo: Mejorar rendimiento y experiencia de usuario*

#### 6.1 Implementar Zustand (ya en dependencias)
- [ ] Crear stores en `src/renderer/stores/`
  - [ ] `tournamentStore.ts` (torneos activos, cache)
  - [ ] `playerStore.ts` (cache de jugadores)
- [ ] Migrar estado complejo de Context a Zustand
- [ ] Mantener Context solo para Theme y Notifications

**Tiempo estimado:** 4-5 horas  
**Dependencias:** 4.1  
**Riesgo:** Bajo-Medio

#### 6.2 Implementar cache layer
- [ ] Crear `src/renderer/services/cache.ts`
- [ ] Integrar cache en servicios
- [ ] Implementar TTL y invalidación

**Tiempo estimado:** 3-4 horas  
**Dependencias:** 2.1, 6.1  
**Riesgo:** Medio

---

## 📅 Orden Recomendado de Implementación

### **Opción A: Migración Rápida a Supabase** (Recomendada)
*Prioriza migración primero, luego refactors*

```
1. FASE 0: Preparación (1-2 días)
2. FASE 1: Abstracción ApiClient (1 día)
3. FASE 3: Migración a Supabase (2-3 días) ⚡
4. FASE 2: Separación de Servicios (2 días)
5. FASE 4: Hooks y Componentes (2-3 días)
6. FASE 5: Validación (1-2 días)
7. FASE 6: Optimizaciones (opcional, 1-2 días)
```

**Total estimado:** 10-15 días de desarrollo

### **Opción B: Refactor Primero, Migración Después**
*Hace refactors completos antes de migrar*

```
1. FASE 0: Preparación (1-2 días)
2. FASE 1: Abstracción ApiClient (1 día)
3. FASE 2: Separación de Servicios (2 días)
4. FASE 4: Hooks y Componentes (2-3 días)
5. FASE 3: Migración a Supabase (2-3 días) ⚡
6. FASE 5: Validación (1-2 días)
7. FASE 6: Optimizaciones (opcional, 1-2 días)
```

**Total estimado:** 12-17 días de desarrollo

### **Opción C: Híbrida - Incremental** (Más segura)
*Hace cambios pequeños e incrementales*

```
1. FASE 0.1-0.3: Preparación base (1 día)
2. FASE 1.1: ApiClient básico (1 día)
3. FASE 2.1: Separar solo PlayerService (1 día)
4. FASE 3.1-3.2: Setup Supabase (1 día)
5. FASE 3.3-3.4: Migrar solo jugadores a Supabase (1 día)
6. Continuar migrando servicio por servicio...
```

**Total estimado:** 15-20 días (más seguro, menos riesgo)

---

## 🎯 Recomendación Final

**Recomiendo la Opción A (Migración Rápida)** porque:

1. ✅ **Supabase es el cambio más grande** - mejor hacerlo temprano
2. ✅ **ApiClient abstrae el cambio** - permite migración sin tocar servicios
3. ✅ **Refactors después son más fáciles** - con Supabase ya funcionando
4. ✅ **Menos tiempo total** - evita hacer refactors dos veces
5. ✅ **Permite testing real** - Supabase funciona desde el inicio

### Plan de Acción Específico (Opción A)

#### **Sprint 1: Fundación (3-4 días)**
- [ ] FASE 0: Preparación completa
- [ ] FASE 1: ApiClient con SQLite y Supabase stub

#### **Sprint 2: Migración (3-4 días)**
- [ ] FASE 3: Migración completa a Supabase
- [ ] Testing exhaustivo

#### **Sprint 3: Refactors (3-4 días)**
- [ ] FASE 2: Separación de servicios
- [ ] FASE 4: Hooks básicos

#### **Sprint 4: Mejoras (2-3 días)**
- [ ] FASE 4: Componentes mejorados
- [ ] FASE 5: Validación

#### **Sprint 5: Optimizaciones (Opcional, 2-3 días)**
- [ ] FASE 6: Zustand y cache

---

## 📝 Tareas Específicas para Backlog

### Tareas de Alto Nivel (Epics)

1. **Epic: Preparación de Infraestructura**
   - Crear estructura de carpetas
   - Configurar path aliases
   - Centralizar constantes

2. **Epic: Abstracción de Acceso a Datos**
   - Crear ApiClient interface
   - Implementar SQLite client
   - Implementar Supabase client stub

3. **Epic: Migración a Supabase**
   - Setup proyecto Supabase
   - Migrar esquema de base de datos
   - Implementar Supabase client completo
   - Migrar datos existentes
   - Cambiar implementación a Supabase
   - Testing y limpieza

4. **Epic: Separación de Servicios**
   - Crear PlayerService
   - Crear TournamentService
   - Crear MatchService
   - Crear RoundService
   - Migrar usos de DatabaseService

5. **Epic: Custom Hooks y Mejoras de UI**
   - Crear hooks genéricos
   - Crear hooks específicos de dominio
   - Refactorizar formularios
   - Mejorar componentes comunes

6. **Epic: Validación y Type Safety**
   - Implementar Zod schemas
   - Mejorar tipos TypeScript
   - Eliminar usos de `any`

7. **Epic: Optimizaciones (Opcional)**
   - Implementar Zustand stores
   - Agregar cache layer
   - Mejorar rendimiento

---

## ⚠️ Consideraciones Importantes

### Riesgos
1. **Migración de datos:** Riesgo de pérdida de datos
   - **Mitigación:** Backup completo antes de migrar
   
2. **Cambio de arquitectura:** IPC ya no necesario para DB
   - **Mitigación:** Mantener IPC para archivos, solo remover DB handlers

3. **Autenticación:** Supabase requiere autenticación
   - **Mitigación:** Evaluar si es necesaria o usar RLS anónimo

4. **Offline/Online:** Supabase requiere conexión
   - **Mitigación:** Considerar modo offline con cache local

### Decisiones Técnicas (DECIDIDAS)

1. **Autenticación:** ✅ Autenticación opcional simple (email/password) con Supabase Auth
   - Puede ser opcional (modo anónimo disponible)
   - RLS policies para seguridad
   - Ver `TECHNICAL_DECISIONS.md` para detalles

2. **Modo offline:** ✅ REQUERIDO - Dual mode con sincronización
   - SQLite local siempre disponible
   - Supabase para sincronización cuando hay internet
   - SyncService para manejar cola de sincronización
   - Ver `TECHNICAL_DECISIONS.md` para arquitectura

3. **Repository Pattern:** ✅ IMPLEMENTAR - Mejor estructura a largo plazo
   - BaseRepository, LocalRepository, RemoteRepository
   - DualRepository para modo dual
   - Factory pattern para crear repositorios
   - Ver `TECHNICAL_DECISIONS.md` para estructura

4. **SQLite + Supabase:** ✅ DUAL MODE - Mantener ambos con sincronización
   - SQLite local como fuente primaria (offline)
   - Supabase como backup y sincronización
   - Sincronización automática cuando hay internet
   - Ver `TECHNICAL_DECISIONS.md` para implementación

---

## 📊 Métricas de Éxito

- [ ] 0 usos directos de `DatabaseService` en componentes
- [ ] 100% de servicios usando ApiClient
- [ ] 0 usos de `any` en código de producción
- [ ] 100% de validación con Zod en formularios
- [ ] Migración completa a Supabase funcionando
- [ ] Tests pasando (cuando se agreguen)

---

## 🔄 Estrategia de Migración Incremental

Si se prefiere migración más segura, se puede hacer servicio por servicio:

1. Migrar solo `PlayerService` a Supabase
2. Testing completo
3. Migrar `TournamentService`
4. Testing completo
5. Continuar con resto...

Esto permite rollback fácil si hay problemas.

---

## 📚 Recursos Necesarios

- Acceso a Supabase (cuenta gratuita suficiente para empezar)
- Documentación de Supabase
- Scripts de migración SQLite → PostgreSQL
- Herramientas de backup de datos

---

## ✅ Checklist de Inicio

Antes de comenzar, asegurar:
- [ ] Backup completo de base de datos actual
- [ ] Entorno de desarrollo configurado
- [ ] Acceso a Supabase creado
- [ ] Plan de rollback definido
- [ ] Testing strategy definida
