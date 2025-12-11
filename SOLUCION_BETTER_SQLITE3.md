# Solución para el Error de better-sqlite3

## Problema

Al generar el ejecutable, aparecen dos tipos de errores:

1. **Error de Python/distutils** (macOS):
```
ModuleNotFoundError: No module named 'distutils'
```
Esto ocurre porque Python 3.12+ no incluye `distutils` por defecto.

2. **Error de binarios precompilados** (Windows desde macOS):
```
⨯ cannot build native dependency  reason=prebuild-install failed with error and build from sources not possible because platform or arch not compatible
```
Esto ocurre porque `better-sqlite3` no tiene binarios precompilados para Electron 28.3.3 en Windows, y compilar desde macOS para Windows requiere herramientas de compilación cruzada.

## Solución Aplicada

✅ **Instalado setuptools** para resolver el problema de `distutils` en Python 3.14:
```bash
python3.14 -m pip install --break-system-packages setuptools
```

Ahora deberías poder generar ejecutables para macOS sin problemas.

## Soluciones para Windows

### Opción 1: Generar desde Windows (Recomendado)

La forma más sencilla es generar el ejecutable de Windows desde una máquina Windows:

1. Clona el proyecto en Windows
2. Ejecuta:
   ```bash
   npm install
   npm run dist:win
   ```

### Opción 2: Usar GitHub Actions / CI/CD

Puedes configurar GitHub Actions para generar automáticamente los ejecutables para todas las plataformas. Esto es útil si planeas distribuir la aplicación regularmente.

### Opción 3: Compilar desde macOS (Requiere configuración adicional)

Si necesitas generar para Windows desde macOS, necesitas:

1. **Instalar Wine** (para emular el entorno de Windows):
   ```bash
   brew install wine-stable
   ```

2. **Instalar herramientas de compilación cruzada**:
   ```bash
   # Esto puede ser complejo y no siempre funciona bien
   ```

3. **O usar Docker** con una imagen de Windows

### Opción 4: Actualizar better-sqlite3

Puedes intentar actualizar a la versión más reciente de `better-sqlite3`:

```bash
npm install better-sqlite3@latest
```

Luego intenta generar el ejecutable nuevamente.

### Opción 5: Usar una versión anterior de Electron

Si ninguna de las opciones anteriores funciona, puedes usar una versión de Electron que tenga binarios precompilados disponibles:

```bash
npm install electron@27 --save-dev
```

Luego actualiza `package.json` y vuelve a intentar.

## Configuración Actual

He configurado:
- ✅ Iconos personalizados en `build/`
- ✅ `postinstall` script actualizado para usar `electron-builder install-app-deps`
- ✅ Configuración de electron-builder con rutas de iconos

## Próximos Pasos

1. **Para macOS**: Debería funcionar sin problemas:
   ```bash
   npm run dist:mac
   ```

2. **Para Windows**: 
   - Si estás en macOS, considera usar una máquina Windows o CI/CD
   - Si estás en Windows, simplemente ejecuta `npm run dist:win`

3. **Para Linux**: Debería funcionar desde macOS:
   ```bash
   npm run dist:linux
   ```

## Verificación

Después de generar el ejecutable, verifica:
- ✅ El icono aparece correctamente
- ✅ La aplicación se ejecuta sin errores
- ✅ La base de datos funciona correctamente

