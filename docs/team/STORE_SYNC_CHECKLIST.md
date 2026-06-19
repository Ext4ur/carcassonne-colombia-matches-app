# Checklist — modo tienda Devir (kiosk local)

Prueba operativa antes de entregar instaladores a sedes.

## Resumen

El build **tienda** (`npm run dist:win:store`) es **100 % local**: SQLite en el equipo, **sin Supabase**, **sin código de activación**. La sede crea **un** clasificatorio con el wizard rápido, lo juega y al finalizar exporta **JSON + Excel** en secuencia. Tras finalizar la app queda en **solo lectura**.

El build **sede central Devir** (`npm run dist:win:hq`) es **app completa solo local**: torneos, circuitos, import/export, **sin Supabase**. Usa **`tournament_devir.db`**. Consolidación vía **Ajustes → Importar** JSON de tiendas.

El build **admin** (`npm run dist:win`) sigue con sync opcional en la nube.

## Requisitos previos

- Build tienda usa **`tournament_store.db`** (separada del admin). Al compilar store, la DB se resetea.
- Al abrir por primera vez: **sin torneos, sin jugadores, sin ciudades/lugares** (no se siembran Online/Offline).
- Botón **Clasificatorio rápido** visible si no hay clasificatorio.
- En el wizard: indicar **Ciudad** y **Lugar (tienda)**; se crean en SQLite local y aparecen en el export JSON.

## Pasos (1 PC tienda)

1. Instalar build tienda.
2. Abrir app → si no hay torneo, botón **Clasificatorio rápido**.
3. Completar wizard (nombre, fecha, jugadores, rondas).
4. Jugar rondas y registrar resultados.
5. **Finalizar torneo** → modal bloqueante:
   - Paso 1: guardar **JSON** (backup completo del torneo).
   - Paso 2: guardar **Excel** (reporte).
6. Enviar ambos archivos al organizador (Devir / admin).
7. Verificar: app en **solo lectura** — no crear otro torneo, no editar resultados, no eliminar.

## Pasos (sede central Devir — `dist:win:hq`)

1. Instalar build HQ (`npm run dist:win:hq`).
2. **Ajustes → Datos → Importar** cada JSON exportado por una tienda.
3. Ver torneos en **Torneos** (varios clasificatorios, ciudades/lugares del import).
4. Export Excel o backup JSON si hace falta.
5. Verificar: **sin SyncStatus** en nav; sync desactivado en Ajustes.

## Pasos (admin con nube — opcional)

1. **Ajustes → Importar** el JSON de cada tienda.
2. Ver torneos importados en la lista admin.
3. Export Excel consolidado manual si hace falta.

## Qué validar

| Comportamiento | Esperado |
|----------------|----------|
| Sync / Supabase (tienda) | Desactivado; sin SyncStatus en nav |
| Ajustes sync (tienda) | Texto modo local; sin toggle ni re-sync |
| Lista torneos (tienda) | 0 filas al inicio; 1 fila tras crear |
| Crear torneo (tienda) | Solo wizard rápido; oculto si ya hay torneo o finalizado |
| Eliminar torneo (tienda) | No disponible (UI + error en servicio) |
| Nav (tienda) | Sin Circuitos, Ciudades, Sedes; con Jugadores y Torneos |
| Post-finalize | Modal JSON → Excel; solo lectura + flag kiosk |
| Nav (HQ) | Completa (incl. Ajustes con import); sin SyncStatus |
| DB HQ | `tournament_devir.db` |

## Rollback / soporte

- **Reinstalar app:** datos locales se pierden salvo que el JSON exportado se reimporte en admin o se restaure manualmente la DB.
- **Olvidó exportar:** si el torneo quedó `completed` en SQLite, admin puede pedir copia de `%APPDATA%/…/tournament_co.db` o re-export desde solo lectura si la app aún tiene el torneo.

## Nota histórica

Versiones anteriores usaban sync Supabase + código Devir. Ese flujo ya no aplica al build tienda actual (AC-090).
