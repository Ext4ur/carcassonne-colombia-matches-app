# 🚀 Quick Start - Sprint 1

## Resumen Rápido

Este documento es una guía rápida para empezar con el Sprint 1. Para detalles completos, ver `SPRINT_1_DETAILED_PLAN.md`.

---

## ✅ Checklist de Inicio

Antes de empezar, asegúrate de tener:
- [ ] Código actual funcionando (`npm run dev`)
- [ ] Git branch nuevo: `git checkout -b sprint-1-foundation`
- [ ] Documentación leída: `SPRINT_1_DETAILED_PLAN.md`

---

## 📋 Tareas en Orden

### 1. Estructura de Carpetas (30 min)
```bash
# Crear carpetas
mkdir -p src/renderer/repositories/base
mkdir -p src/renderer/repositories/local
mkdir -p src/renderer/repositories/remote
mkdir -p src/renderer/api/clients
mkdir -p src/renderer/auth/components
mkdir -p src/renderer/services/sync
mkdir -p src/renderer/services/backup
mkdir -p src/renderer/hooks
mkdir -p src/renderer/constants
mkdir -p src/renderer/schemas
mkdir -p src/renderer/config

# Crear .gitkeep
touch src/renderer/repositories/base/.gitkeep
touch src/renderer/repositories/local/.gitkeep
touch src/renderer/repositories/remote/.gitkeep
# ... (repetir para todas)
```

### 2. Path Aliases (1 hora)
Editar `vite.config.ts` y `tsconfig.json` - ver `SPRINT_1_DETAILED_PLAN.md` Tarea 1.2

### 3. Constantes (1 hora)
Crear `src/renderer/constants/index.ts` - mover constantes desde `utils/`

### 4. Interfaces Base (2 horas)
Crear:
- `src/renderer/repositories/base/IRepository.ts`
- `src/renderer/repositories/base/IApiClient.ts`
- `src/renderer/repositories/base/types.ts`

### 5. SqliteClient (2 horas)
Crear `src/renderer/api/clients/SqliteClient.ts`

### 6. BaseRepository (3 horas)
Crear `src/renderer/repositories/base/BaseRepository.ts`

### 7. LocalPlayerRepository (2 horas)
Crear `src/renderer/repositories/local/LocalPlayerRepository.ts`

### 8. Factory (1 hora)
Crear `src/renderer/repositories/index.ts`

### 9. Testing (2 horas)
Probar que todo funciona

---

## 🎯 Objetivo Final

Al terminar el Sprint 1 deberías tener:
- ✅ Estructura de carpetas completa
- ✅ Path aliases funcionando
- ✅ Constantes centralizadas
- ✅ Interfaces base definidas
- ✅ `LocalPlayerRepository` funcionando
- ✅ Factory básico funcionando
- ✅ Todo el código existente sigue funcionando

---

## 📚 Referencias

- `SPRINT_1_DETAILED_PLAN.md` - Plan detallado con código de ejemplo
- `TECHNICAL_DECISIONS.md` - Decisiones técnicas
- `MULTI_TENANCY_AND_BACKUPS.md` - Multi-tenancy y backups (para sprints futuros)

---

## ⚠️ Notas Importantes

1. **No romper funcionalidad existente** - El código actual debe seguir funcionando
2. **Hacer commits frecuentes** - Un commit por tarea completada
3. **Probar después de cada tarea** - Asegurarse de que `npm run dev` sigue funcionando
4. **Documentar dudas** - Si algo no está claro, documentarlo

---

## 🆘 Si Algo Sale Mal

1. Revisar `SPRINT_1_DETAILED_PLAN.md` para detalles
2. Verificar que los imports están correctos
3. Verificar que TypeScript compila sin errores
4. Revisar la consola del navegador para errores

---

¡Éxito con el Sprint 1! 🎉
