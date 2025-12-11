# Cómo Ejecutar la Aplicación

## Pasos para iniciar la aplicación:

1. **Asegúrate de que no haya procesos de Electron corriendo:**
   ```bash
   # Cierra cualquier ventana de Electron abierta
   # O presiona Ctrl+C en la terminal si hay algo corriendo
   ```

2. **Compila el código TypeScript:**
   ```bash
   npm run build:electron
   ```

3. **Inicia la aplicación:**
   ```bash
   npm run dev
   ```

4. **Deberías ver:**
   - El servidor Vite iniciando (http://localhost:5173)
   - Mensajes de consola en la terminal mostrando el progreso
   - Una ventana de Electron abriéndose con la aplicación

## Si la ventana no aparece o muestra la pantalla por defecto:

1. **Revisa la terminal** - Deberías ver mensajes como:
   - "Electron app ready, initializing..."
   - "Initializing database..."
   - "Database initialized"
   - "Creating window..."

2. **Si ves errores**, compártelos para poder solucionarlos

3. **Si no ves nada**, prueba ejecutar manualmente:
   ```bash
   # Terminal 1:
   npm run dev:react
   
   # Terminal 2 (espera a que Vite esté listo):
   npm run build:electron
   npx electron . --enable-logging
   ```

## Solución de problemas comunes:

- **Error de better-sqlite3**: Ejecuta `npx @electron/rebuild`
- **Ventana en blanco**: Verifica que Vite esté corriendo en http://localhost:5173
- **Pantalla por defecto de Electron**: El archivo main.js no se está ejecutando, revisa errores en la terminal



