# Guía de uso — Carcassonne Tournament Manager

Guía práctica para **organizadores** de torneos presenciales. La app funciona sin conexión a internet; la sincronización en la nube es opcional (Ajustes).

---

## 1. Primeros pasos

1. Instala la aplicación (build Colombia o Internacional según tu región).
2. Abre la app: verás la **página de inicio** con accesos a Torneos, Jugadores y Circuitos.
3. En **Ajustes** puedes cambiar tema claro/oscuro, idioma, respaldos y (si aplica) activar sync.

**Orden recomendado antes del primer torneo:** Ciudades → Lugares → Jugadores → (opcional) Circuitos → Torneo.

---

## 2. Jugadores

**Menú: Jugadores**

1. Pulsa **Nuevo jugador**.
2. Completa nombre (obligatorio). Opcional: usuario BGA, teléfono, email, edad.
3. Guarda.

Los jugadores son reutilizables en todos los torneos. Puedes editarlos o buscarlos desde el registro de cada torneo.

---

## 3. Ciudades y lugares

**Menú: Ciudades**

1. Crea las ciudades donde organizas eventos (ej. Bogotá, Medellín).

**Menú: Lugares**

1. Crea cada sede (café, tienda, club).
2. Asóciala a una **ciudad**.

Al crear un torneo elegirás el **lugar**; en listados aparece como «Lugar — Nombre del torneo».

---

## 4. Circuitos (opcional)

**Menú: Circuitos**

Un circuito agrupa varios **clasificatorios** y acumula puntos para un ranking anual o por temporada.

1. **Nuevo circuito**: nombre, fechas inicio/fin, descripción.
2. Al crear un torneo tipo **Clasificatorio**, vincúlalo al circuito correspondiente.
3. Desde el detalle del circuito consulta el **acumulado** y exporta reportes.
4. **Finalizar circuito** cuando no habrá más clasificatorios (estado bloqueado).

---

## 5. Crear un torneo

**Menú: Torneos**

Hay dos formas de crear un torneo:

### Modo rápido (recomendado en el día a día)

1. Pulsa **Torneo rápido**.
2. Asistente en tres pasos: **datos** → **configuración** → **inscripción**.
3. Los valores por defecto vienen de **Ajustes → Torneo rápido** (ver §6).
4. Al finalizar el asistente, entras al detalle listo para generar la 1.ª ronda.

### Modo avanzado

1. Pulsa **Nuevo torneo** (avanzado).
2. Mismo asistente, pero configuras manualmente desempates, rondas, Buchholz, etc., en el paso de configuración.
3. Útil para formatos especiales o torneos fuera del circuito habitual.

### Filtros en la lista

- Busca por nombre.
- Filtra por **lugares** (multiselección) para ver solo eventos de ciertas sedes.

Campos principales del formulario:

| Campo | Descripción |
|-------|-------------|
| Nombre | Ej. «Clasificatorio Junio 2026» |
| Tipo | **Clasificatorio** (puntos a circuito) o torneo de circuito |
| Lugar | Sede del evento |
| Fecha | Día del torneo |
| Jugadores por partida | 2, 3, 4 o 5 (Carcassonne clásico suele ser 2) |
| Circuito | Solo clasificatorios vinculados a un circuito activo |
| Formato | Suizo o Suizo + Eliminatoria |

Tras crear el torneo entras al **detalle del torneo**.

---

## 6. Torneo rápido (valores por defecto)

En **Ajustes → Torneo rápido** puedes guardar preferencias por defecto:

- Criterios de desempate
- Sistema de puntuación
- Evitar revanchas, algoritmo de emparejamiento, modo Buchholz, etc.

Al usar «torneo rápido» desde la lista de torneos, estos valores se aplican automáticamente (puedes ajustarlos antes de la primera ronda).

---

## 7. Inscribir jugadores

En el **detalle del torneo**, antes de generar la primera ronda:

1. Usa el registro / botón **+ Nuevo** para añadir jugadores existentes o crear uno al vuelo.
2. Revisa la **clasificación** (lista de inscritos).
3. Abre **Configuración del torneo** (antes de la 1.ª ronda) para:
   - Número de rondas suizas
   - Desempates y puntuación
   - Opciones de eliminatoria (si aplica)

**Nota:** Tras empezar las rondas, la configuración suiza queda en solo lectura; KO parcialmente editable hasta iniciar fase eliminatoria.

### Inscripción tardía

Puedes añadir jugadores **después** de haber empezado rondas. El sistema los integra en emparejamientos siguientes con la lógica suiza (puntos iniciales según configuración). Evita dar bye innecesarios cuando el número de activos es par.

### Retirar un jugador (dropout)

En la lista de inscritos del torneo, usa **Retirar jugador** si alguien abandona el evento:

- Deja de emparejarse en rondas futuras.
- Los resultados ya jugados se conservan.
- La clasificación refleja el estado inactivo.

---

## 8. Rondas y emparejamientos

### Primera ronda

1. Pulsa **Generar primera ronda** (o **Emparejamientos manuales**).
2. Revisa el **vista previa** (advertencias de revanchas, etc.).
3. Confirma.

### Rondas siguientes

1. Introduce **resultados** de todas las partidas de la ronda actual.
2. Cuando todas estén completadas, la ronda se marca como terminada.
3. Pulsa **Generar siguiente ronda**.

### Eliminatoria (Suizo + KO)

1. Completa todas las rondas suizas configuradas.
2. Pulsa **Iniciar fase eliminatoria**.
3. Genera rondas KO y registra resultados (incluye series al mejor de N si está configurado).
4. Finaliza el torneo cuando el bracket esté completo.

### Emparejamientos manuales

Si prefieres no usar el algoritmo automático:

1. Elige **Emparejamientos manuales** en lugar de generar ronda.
2. Arrastra jugadores a mesas (soporta 2–5 por partida según configuración).
3. Confirma cuando el reparto sea correcto.

### Borrar última ronda

Si la última ronda está **pendiente** y **sin resultados guardados**, puedes eliminarla desde el panel de rondas.

---

## 9. Registrar resultados

1. En la tabla de **Partidas** de la ronda actual, pulsa **Jugar** o **Editar**.
2. Indica posiciones y puntos según el sistema configurado (2–5 jugadores).
3. Guarda.

Indicadores útiles:

- Colores por posición (1.º verde, 2.º amarillo…)
- **Bye** (naranja): victoria automática, no editable
- 🎲 marca al jugador que **sale primero** en la partida

---

## 10. Clasificación y estadísticas

- **Clasificación**: tabla en vivo con desempates configurados; filtros por jugador.
- **Estadísticas** (botón 📊): podio, gráficos y métricas.
- **Matriz** (📊 Matriz): enfrentamientos por rival o por ronda.

En torneos Suizo+KO puedes alternar vista **final**, **suizo congelado** y **bracket**.

---

## 11. Reportes y exportaciones

En el detalle del torneo, menú **Generar reporte**:

| Opción | Uso |
|--------|-----|
| Excel | Clasificación, partidas por ronda, estadísticas (varias hojas) |
| CSV | Clasificación, partidas o estadísticas por separado |
| **Imagen PNG** | Solo **clasificatorios**: podio listo para compartir en redes sociales |

Elige ubicación y nombre de archivo en el diálogo del sistema.

Desde **Circuitos** también puedes exportar el acumulado del circuito.

---

## 12. Finalizar torneo

Cuando terminen todas las rondas (suizo o KO):

1. Pulsa **Finalizar torneo**.
2. Confirma.

El torneo pasa a estado **Completado**. Ya no se editan resultados ni rondas. Las clasificaciones y reportes siguen disponibles.

### Eliminar un torneo

Desde la lista de torneos, **Eliminar** exige escribir el nombre exacto del torneo como confirmación. Operación irreversible: borra rondas, partidas y datos asociados de ese torneo (no borra jugadores globales ni el circuito).

---

## 13. Respaldo e importación

**Menú: Ajustes → Datos**

### Exportar (backup JSON)

1. **Exportar datos**.
2. Marca los torneos a incluir (por defecto todos).
3. Guarda el `.json`.

El archivo incluye jugadores necesarios, circuitos relacionados, ciudades y lugares referenciados.

### Importar

1. **Importar datos** y selecciona un JSON de respaldo.
2. Revisa duplicados y elige qué torneos importar.
3. Confirma.

Útil para migrar de equipo, recuperar datos o compartir torneos entre organizadores.

---

## 14. Ajustes adicionales

- **Apariencia**: modo claro / oscuro.
- **Idioma**: español, inglés, húngaro (si no coincide con el build por defecto).
- **Sincronización**: activar solo si tienes credenciales Supabase configuradas; permite respaldo multi-dispositivo.
- **Torneo rápido**: defaults de configuración (ver §6).
- **Acerca de**: versión de la app y enlaces útiles.

---

## 15. Consejos para el día del torneo

1. Crea el torneo con antelación e inscribe jugadores antes de llegar a la sede.
2. Verifica **número de rondas** y **desempates** en configuración antes de la 1.ª ronda.
3. Completa resultados ronda a ronda; la clasificación se actualiza sola.
4. Al terminar, exporta **Excel** para archivo y **PNG** (clasificatorios) para redes sociales.
5. Haz **backup JSON** periódico desde Ajustes.

---

## 16. Problemas frecuentes

| Situación | Qué hacer |
|-----------|-----------|
| No puedo editar la configuración del torneo | Ya empezaron las rondas suizas; solo KO editable antes de iniciar eliminatoria |
| No aparece «Generar siguiente ronda» | Faltan resultados en partidas de la ronda actual |
| Jugador con bye inesperado | Revisa número de activos, retiros y entrada tardía; regenera solo si la ronda aún no tiene resultados |
| Sync en error | La app funciona offline; revisa credenciales en Ajustes y conexión. Los datos locales en SQLite son la fuente de verdad |
| Instalador no abre (Windows) | Usa build Colombia vs Internacional según tu región; reinstala desde el instalador oficial del equipo |
| Importación detecta duplicados | Elige torneos/entidades a fusionar en el modal; no sobrescribe sin confirmación |

---

## Soporte técnico interno

- Arquitectura: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Reglas de negocio detalladas: `docs/local/TOURNAMENT_RULES.md` (equipo de desarrollo)
