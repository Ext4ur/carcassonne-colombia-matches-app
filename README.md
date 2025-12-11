# Carcassonne Tournament Manager

Aplicación de escritorio multiplataforma para la gestión de torneos presenciales de Carcassonne Colombia.

## Características

- Gestión de torneos clasificatorios y circuitos
- Sistema suizo configurable
- Base de datos de jugadores
- Generación de reportes (Excel, CSV, PDF)
- Estadísticas y visualizaciones
- Interfaz moderna y fácil de usar

## Desarrollo

### Requisitos

- Node.js 18+
- npm o yarn

### Instalación

```bash
npm install
```

### Ejecutar en desarrollo

```bash
npm run dev
```

Esto iniciará:
- Vite dev server en http://localhost:5173
- Electron con hot reload

### Construir

```bash
npm run build
```

### Generar instaladores

```bash
# Todos los sistemas
npm run dist

# Solo Windows
npm run dist:win

# Solo macOS
npm run dist:mac

# Solo Linux
npm run dist:linux
```

## Estructura del Proyecto

- `src/main/` - Proceso principal de Electron
- `src/preload/` - Preload scripts
- `src/renderer/` - Frontend React
- `database/` - Migraciones de base de datos

## Tecnologías

- Electron
- React + TypeScript
- Tailwind CSS
- SQLite (better-sqlite3)
- ExcelJS, jsPDF, html2canvas



