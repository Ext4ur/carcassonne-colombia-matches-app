# Guía para Generar Ejecutables

Esta guía te explica cómo crear ejecutables de la aplicación para distribuirla a otros usuarios.

## 📦 Requisitos Previos

Asegúrate de tener todas las dependencias instaladas:

```bash
npm install
```

## 🚀 Generar Ejecutables

### Opción 1: Generar para tu plataforma actual (macOS)

Si estás en macOS, ejecuta:

```bash
npm run dist:mac
```

Esto generará:
- **DMG** (disco de instalación) para macOS Intel (x64) y Apple Silicon (arm64)
- Ubicación: `release/` en la raíz del proyecto

### Opción 2: Generar para Windows

Para generar ejecutables de Windows (desde cualquier plataforma):

```bash
npm run dist:win
```

Esto generará:
- **Instalador NSIS** (`.exe`) - Instalador con opciones
- **Portable** (`.exe`) - Versión portable que no requiere instalación
- Ubicación: `release/` en la raíz del proyecto

### Opción 3: Generar para Linux

Para generar ejecutables de Linux:

```bash
npm run dist:linux
```

Esto generará:
- **AppImage** (`.AppImage`) - Ejecutable portable
- **DEB** (`.deb`) - Paquete para distribuciones basadas en Debian/Ubuntu
- Ubicación: `release/` en la raíz del proyecto

### Opción 4: Generar para todas las plataformas

```bash
npm run dist
```

Esto generará ejecutables para todas las plataformas configuradas.

## 📁 Ubicación de los Ejecutables

Todos los ejecutables se guardan en la carpeta `release/` en la raíz del proyecto:

```
release/
├── Carcassonne Tournament Manager-1.0.0.dmg          (macOS)
├── Carcassonne Tournament Manager-1.0.0-x64.exe     (Windows - Instalador)
├── Carcassonne Tournament Manager-1.0.0-x64-portable.exe  (Windows - Portable)
├── Carcassonne Tournament Manager-1.0.0-x64.AppImage (Linux)
└── Carcassonne Tournament Manager-1.0.0-x64.deb      (Linux)
```

## 🎯 Qué Enviar a los Usuarios

### Para usuarios de macOS:
- Envía el archivo `.dmg`
- El usuario solo necesita hacer doble clic y arrastrar la app a la carpeta Aplicaciones

### Para usuarios de Windows:
- **Opción 1 (Recomendada)**: Envía el instalador `.exe` (NSIS)
  - El usuario ejecuta el instalador y sigue los pasos
  - Se instala en Program Files
  - Crea accesos directos en el menú de inicio
  
- **Opción 2**: Envía el ejecutable portable `.exe`
  - El usuario solo ejecuta el archivo
  - No requiere instalación
  - Puede ejecutarse desde cualquier ubicación

### Para usuarios de Linux:
- **Opción 1**: Envía el `.AppImage`
  - Ejecutable portable
  - Solo necesita permisos de ejecución: `chmod +x archivo.AppImage`
  
- **Opción 2**: Envía el `.deb`
  - Instalación: `sudo dpkg -i archivo.deb`
  - O con gestor de paquetes gráfico

## ⚠️ Notas Importantes

### Iconos
- La configuración actual espera iconos en `build/icon.ico` (Windows), `build/icon.icns` (macOS), y `build/icon.png` (Linux)
- Si no existen, electron-builder usará iconos por defecto
- Para crear iconos personalizados:
  - **Windows**: Necesitas un `.ico` (256x256 o múltiples tamaños)
  - **macOS**: Necesitas un `.icns` (puedes crearlo desde un `.png` con herramientas como `iconutil`)
  - **Linux**: Necesitas un `.png` (512x512 recomendado)

### Tamaño de los Ejecutables
- Los ejecutables pueden ser grandes (100-200 MB) porque incluyen:
  - Electron runtime
  - Node.js
  - Todas las dependencias
  - La aplicación compilada

### Firma de Código (Opcional pero Recomendado)
Para distribuir la aplicación sin advertencias de seguridad:

**macOS:**
- Necesitas un certificado de desarrollador de Apple
- Agrega en `electron-builder.json`:
```json
"mac": {
  "identity": "Developer ID Application: Tu Nombre"
}
```

**Windows:**
- Necesitas un certificado de firma de código
- Agrega en `electron-builder.json`:
```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "password"
}
```

Sin firma, los usuarios pueden ver advertencias de seguridad al ejecutar la aplicación.

## 🔧 Solución de Problemas

### Error: "electron-builder not found"
```bash
npm install electron-builder --save-dev
```

### Error al generar para otra plataforma
- En macOS, puedes generar para Windows y Linux
- En Windows, puedes generar para Windows y Linux
- En Linux, puedes generar para todas las plataformas
- Si falla, considera usar GitHub Actions o CI/CD para generar en todas las plataformas

### El ejecutable es muy grande
- Esto es normal para aplicaciones Electron
- Puedes usar herramientas como `electron-builder` con opciones de compresión
- Considera usar `asar` (ya está habilitado por defecto)

### El ejecutable no funciona en otra máquina
- Asegúrate de generar para la arquitectura correcta (x64, arm64)
- Verifica que todas las dependencias nativas estén incluidas
- Revisa los logs de error en la consola

## 📝 Ejemplo de Uso Completo

```bash
# 1. Asegúrate de que todo esté compilado
npm run build

# 2. Genera el ejecutable para tu plataforma
npm run dist:mac    # o dist:win, dist:linux

# 3. Espera a que termine (puede tardar varios minutos)

# 4. Encuentra el ejecutable en release/

# 5. Prueba el ejecutable antes de enviarlo
# En macOS: Abre el .dmg y ejecuta la app
# En Windows: Ejecuta el .exe
# En Linux: chmod +x archivo.AppImage && ./archivo.AppImage
```

## 🎁 Distribución

Una vez que tengas el ejecutable:

1. **Prueba el ejecutable** en una máquina limpia si es posible
2. **Comprime el archivo** (ZIP) para facilitar la descarga
3. **Comparte el archivo**:
   - Por email (si es pequeño)
   - Por Google Drive / Dropbox
   - Por un servidor de archivos
   - Por GitHub Releases (si el proyecto es público)

## 📊 Tamaños Aproximados Esperados

- **macOS DMG**: ~150-200 MB
- **Windows Installer**: ~150-200 MB
- **Windows Portable**: ~150-200 MB
- **Linux AppImage**: ~150-200 MB
- **Linux DEB**: ~150-200 MB

Estos tamaños son normales para aplicaciones Electron.

