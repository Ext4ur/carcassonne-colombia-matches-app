# Debugging - Cómo ver la aplicación

## Si no ves la ventana de Electron:

1. **Verifica que el servidor Vite esté corriendo:**
   - Deberías ver "Local: http://localhost:5173/" en la terminal
   - Si no, espera unos segundos o revisa errores

2. **Verifica que Electron se haya iniciado:**
   - Busca en la terminal mensajes de Electron
   - En macOS, busca "Electron" en el Dock o Cmd+Tab

3. **Ejecuta manualmente para ver errores:**
   ```bash
   # Terminal 1: Inicia Vite
   npm run dev:react
   
   # Terminal 2: Espera a que Vite esté listo, luego ejecuta:
   npm run build:electron
   npx electron . --enable-logging
   ```

4. **Verifica que los archivos estén compilados:**
   ```bash
   ls -la dist/main/main.js
   ls -la dist/preload/preload.js
   ```

5. **Si hay errores de base de datos:**
   - La base de datos se crea automáticamente en el directorio de datos del usuario
   - En macOS: `~/Library/Application Support/carcassonne-tournament-manager/tournament.db`



