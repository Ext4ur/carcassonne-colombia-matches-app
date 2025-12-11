# Guía Completa: Generar Ejecutable para Windows

Esta guía te explica paso a paso cómo generar el ejecutable de Windows para la aplicación Carcassonne Tournament Manager.

## 📑 Índice

1. [Requisitos Previos](#-requisitos-previos)
   - Node.js y npm
   - Git (Opcional)
   - Herramientas de Compilación de Windows
   - Python
2. [Pasos para Generar el Ejecutable](#-pasos-para-generar-el-ejecutable)
   - Obtener el código fuente
   - Instalar dependencias
   - Compilar el código
   - Verificar iconos
   - Generar el ejecutable
   - Encontrar el ejecutable
3. [Tipos de Ejecutables Generados](#-tipos-de-ejecutables-generados)
4. [Solución de Problemas Comunes](#-solución-de-problemas-comunes)
5. [Comandos de Referencia Rápida](#-comandos-de-referencia-rápida)
6. [Verificación Final](#-verificación-final)
7. [Distribuir el Ejecutable](#-distribuir-el-ejecutable)
8. [Resumen de Pasos](#-resumen-de-pasos)

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener lo siguiente instalado en tu máquina Windows:

### 1. Node.js y npm

**Versión requerida:** Node.js 18 o superior

**Instalación:**
1. Ve a [https://nodejs.org/](https://nodejs.org/)
2. Descarga la versión LTS (Long Term Support) para Windows
3. Ejecuta el instalador y sigue las instrucciones
4. Asegúrate de marcar la opción "Add to PATH" durante la instalación

**Verificar instalación:**
Abre PowerShell o CMD y ejecuta:
```bash
node --version
npm --version
```

Deberías ver las versiones instaladas. Si no, reinicia la terminal.

### 2. Git (Opcional pero Recomendado)

**Instalación:**
1. Ve a [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. Descarga e instala Git para Windows
3. Durante la instalación, selecciona "Git from the command line and also from 3rd-party software"

**Verificar instalación:**
```bash
git --version
```

### 3. Herramientas de Compilación de Windows

Para compilar módulos nativos como `better-sqlite3`, necesitas las herramientas de compilación de Windows:

#### Opción A: Visual Studio Build Tools (Recomendado)

1. Descarga **Visual Studio Build Tools** desde:
   [https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)

2. Durante la instalación, selecciona:
   - **"Desktop development with C++"** workload
   - Asegúrate de que estén marcados:
     - MSVC v143 - VS 2022 C++ x64/x86 build tools
     - Windows 10/11 SDK (última versión disponible)
     - C++ CMake tools for Windows

3. Completa la instalación (puede tardar varios minutos)

#### Opción B: Visual Studio Community (Alternativa)

Si prefieres instalar Visual Studio completo:

1. Descarga **Visual Studio Community** desde:
   [https://visualstudio.microsoft.com/vs/community/](https://visualstudio.microsoft.com/vs/community/)

2. Durante la instalación, selecciona:
   - **"Desktop development with C++"** workload
   - Las mismas opciones mencionadas arriba

### 4. Python (Para node-gyp)

**Versión requerida:** Python 3.10 o 3.11 (NO 3.12+ para evitar problemas con distutils)

**Instalación:**
1. Ve a [https://www.python.org/downloads/](https://www.python.org/downloads/)
2. Descarga Python 3.11 (última versión estable antes de 3.12)
3. **IMPORTANTE:** Durante la instalación, marca la casilla **"Add Python to PATH"**
4. Completa la instalación

**Verificar instalación:**
```bash
python --version
```

Deberías ver algo como `Python 3.11.x`

**Nota:** Si tienes Python 3.12 o superior instalado, puedes tener problemas. Considera usar Python 3.11.

## 🚀 Pasos para Generar el Ejecutable

### Paso 1: Obtener el Código Fuente

#### Opción A: Si tienes el código en una carpeta local

1. Abre PowerShell o CMD
2. Navega a la carpeta del proyecto:
   
   **PowerShell:**
   ```powershell
   cd "C:\ruta\a\tu\proyecto\carcassonne-colombia-matches-app"
   ```
   
   **CMD:**
   ```cmd
   cd C:\ruta\a\tu\proyecto\carcassonne-colombia-matches-app
   ```

#### Opción B: Si necesitas clonar desde Git

1. Abre PowerShell o CMD
2. Navega a donde quieres guardar el proyecto:
   
   **PowerShell:**
   ```powershell
   cd $env:USERPROFILE\Documents
   ```
   
   **CMD:**
   ```cmd
   cd %USERPROFILE%\Documents
   ```
   
3. Clona el repositorio (si está en Git):
   ```bash
   git clone [URL_DEL_REPOSITORIO]
   cd carcassonne-colombia-matches-app
   ```

#### Opción C: Si tienes el código en un ZIP

1. Extrae el archivo ZIP a una ubicación, por ejemplo:
   ```
   C:\dev\carcassonne-colombia-matches-app
   ```

2. Abre PowerShell o CMD y navega allí:
   ```powershell
   cd C:\dev\carcassonne-colombia-matches-app
   ```

### Paso 2: Instalar Dependencias

1. Asegúrate de estar en la carpeta raíz del proyecto (donde está el archivo `package.json`)

2. Instala las dependencias de Node.js:
   ```bash
   npm install
   ```

   **Nota:** Este proceso puede tardar varios minutos (5-15 minutos dependiendo de tu conexión a internet).

   **Si encuentras errores:**
   - Si hay errores relacionados con `better-sqlite3`, es normal. Continúa con el siguiente paso.
   - Si hay errores de permisos, ejecuta PowerShell como Administrador.

3. Verifica que las dependencias se instalaron correctamente:
   ```bash
   npm list --depth=0
   ```

### Paso 3: Compilar el Código

Antes de generar el ejecutable, necesitas compilar el código TypeScript y React:

1. **Compilar React (Frontend):**
   ```bash
   npm run build:react
   ```

   Esto generará los archivos en la carpeta `dist/renderer/`

2. **Compilar Electron (Backend):**
   ```bash
   npm run build:electron
   ```

   Esto generará los archivos en la carpeta `dist/main/` y `dist/preload/`

3. **Compilar todo de una vez (Alternativa):**
   ```bash
   npm run build
   ```

   Esto ejecuta ambos comandos anteriores.

### Paso 4: Verificar Iconos

Asegúrate de que los iconos estén en su lugar:

1. Verifica que existe la carpeta `build/` en la raíz del proyecto
2. Verifica que existen estos archivos:
   - `build/icon.ico` (para Windows)
   - `build/icon.png` (para Linux, opcional)
   - `build/icon.icns` (para macOS, opcional)

**Si los iconos no existen:**
- Si tienes `image.ico` en la raíz del proyecto, cópialo a `build/icon.ico`
- Si no tienes iconos, el ejecutable se generará con un icono por defecto

### Paso 5: Generar el Ejecutable

Ahora puedes generar el ejecutable de Windows:

```bash
npm run dist:win
```

**Este proceso:**
- Compilará `better-sqlite3` para Windows (puede tardar 5-10 minutos la primera vez)
- Empaquetará toda la aplicación
- Generará dos archivos:
  - **Instalador NSIS** (`.exe`) - Para instalar la aplicación
  - **Portable** (`.exe`) - Versión que no requiere instalación

**Tiempo estimado:** 10-20 minutos (dependiendo de tu máquina)

### Paso 6: Encontrar el Ejecutable

Una vez completado, los ejecutables estarán en:

```
release/
├── Carcassonne Tournament Manager Setup 1.0.0.exe    (Instalador)
└── Carcassonne Tournament Manager 1.0.0.exe           (Portable)
```

**Ubicación completa:**
```
C:\Users\TuUsuario\Documents\carcassonne-colombia-matches-app\release\
```

## 📦 Tipos de Ejecutables Generados

### 1. Instalador NSIS (`.exe`)

**Nombre:** `Carcassonne Tournament Manager Setup 1.0.0.exe`

**Características:**
- Instalador completo con interfaz gráfica
- Permite elegir la carpeta de instalación
- Crea accesos directos en el menú de inicio
- Se instala en `C:\Program Files\` o la ubicación que elijas
- Permite desinstalar desde el Panel de Control

**Uso:**
1. Ejecuta el archivo `.exe`
2. Sigue el asistente de instalación
3. La aplicación estará disponible en el menú de inicio

### 2. Versión Portable (`.exe`)

**Nombre:** `Carcassonne Tournament Manager 1.0.0.exe`

**Características:**
- No requiere instalación
- Puede ejecutarse desde cualquier ubicación (USB, carpeta, etc.)
- No crea entradas en el registro de Windows
- No requiere permisos de administrador

**Uso:**
1. Copia el archivo `.exe` a donde quieras
2. Haz doble clic para ejecutar
3. La base de datos se guardará en: `%APPDATA%\carcassonne-tournament-manager\`

## 🔧 Solución de Problemas Comunes

### Error: "node-gyp rebuild failed"

**Causa:** Faltan herramientas de compilación de Windows

**Solución:**
1. Instala Visual Studio Build Tools (ver Requisitos Previos)
2. Reinicia la terminal
3. Vuelve a intentar:
   ```bash
   npm install
   npm run dist:win
   ```

### Error: "Python not found"

**Causa:** Python no está en el PATH o no está instalado

**Solución:**
1. Verifica que Python esté instalado:
   ```bash
   python --version
   ```

2. Si no funciona, reinstala Python y asegúrate de marcar "Add to PATH"

3. Si Python está instalado pero no se encuentra, agrégalo manualmente al PATH:
   - Busca "Variables de entorno" en el menú de inicio
   - Edita la variable PATH
   - Agrega: `C:\Python311\` (o la ruta donde esté Python)

### Error: "better-sqlite3 failed to build"

**Causa:** Problemas al compilar el módulo nativo

**Soluciones:**

1. **Reconstruir better-sqlite3:**
   ```bash
   npm rebuild better-sqlite3
   ```

2. **Limpiar e instalar de nuevo:**
   
   **PowerShell:**
   ```powershell
   Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
   npm install
   ```
   
   **CMD:**
   ```cmd
   rmdir /s /q node_modules
   npm install
   ```

3. **Instalar dependencias de compilación manualmente:**
   ```bash
   npm install --build-from-source better-sqlite3
   ```

### Error: "electron-builder not found"

**Causa:** Las dependencias no se instalaron correctamente

**Solución:**
```bash
npm install
```

Si persiste:
```bash
npm install electron-builder --save-dev
```

### Error: "Cannot find module 'electron'"

**Causa:** Electron no se instaló correctamente

**Solución:**
```bash
npm install electron --save-dev
```

### El ejecutable es muy grande (>200 MB)

**Esto es normal.** Las aplicaciones Electron incluyen:
- Electron runtime (~100 MB)
- Node.js (~50 MB)
- Todas las dependencias
- La aplicación compilada

### El ejecutable no se ejecuta / Error al iniciar

**Posibles causas y soluciones:**

1. **Faltan dependencias de Visual C++:**
   - Descarga e instala: [Microsoft Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)

2. **Antivirus bloqueando:**
   - Agrega una excepción en tu antivirus para la carpeta `release/`

3. **Permisos insuficientes:**
   - Ejecuta el ejecutable como Administrador (clic derecho > Ejecutar como administrador)

4. **Revisa los logs:**
   - Abre PowerShell en la carpeta del ejecutable
   - Ejecuta: `.\Carcassonne Tournament Manager 1.0.0.exe --enable-logging`
   - Revisa los errores en la consola

### Error: "The system cannot find the path specified"

**Causa:** Rutas muy largas en Windows

**Solución:**
1. Mueve el proyecto a una ruta más corta, por ejemplo:
   ```
   C:\dev\carcassonne-app
   ```
   En lugar de:
   ```
   C:\Users\TuUsuario\Documents\Personal\carcassonne-colombia-matches-app
   ```

2. O habilita rutas largas en Windows:
   - Abre PowerShell como Administrador
   - Ejecuta:
     ```powershell
     New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
     ```
   - Reinicia la computadora

## 📝 Comandos de Referencia Rápida

### PowerShell / CMD

```powershell
# Instalar dependencias
npm install

# Compilar todo
npm run build

# Generar ejecutable de Windows
npm run dist:win

# Limpiar y empezar de nuevo (PowerShell)
Remove-Item -Recurse -Force node_modules, dist, release -ErrorAction SilentlyContinue
npm install
npm run build
npm run dist:win

# Limpiar y empezar de nuevo (CMD)
rmdir /s /q node_modules dist release
npm install
npm run build
npm run dist:win
```

### Verificar Versiones

```powershell
# Verificar Node.js
node --version

# Verificar npm
npm --version

# Verificar Python
python --version

# Verificar Git (opcional)
git --version
```

## ✅ Verificación Final

Antes de distribuir el ejecutable, verifica:

1. **El ejecutable se genera correctamente:**
   - ✅ Existen archivos en `release/`
   - ✅ Los archivos tienen tamaño > 100 MB
   - ✅ No hay errores en la consola

2. **El ejecutable funciona:**
   - ✅ Se ejecuta sin errores
   - ✅ La aplicación se abre correctamente
   - ✅ Puedes crear un torneo de prueba
   - ✅ La base de datos se guarda correctamente

3. **El icono aparece:**
   - ✅ El icono personalizado se muestra en el ejecutable
   - ✅ El icono aparece en el menú de inicio (si usas el instalador)

## 📤 Distribuir el Ejecutable

Una vez que tengas el ejecutable funcionando:

1. **Comprimir el archivo:**
   - Crea un archivo ZIP con el ejecutable
   - Esto facilita la descarga y reduce el tamaño

2. **Opciones de distribución:**
   - **Email:** Si el archivo es < 25 MB
   - **Google Drive / Dropbox:** Para archivos más grandes
   - **GitHub Releases:** Si el proyecto está en GitHub
   - **Servidor propio:** Si tienes un servidor de archivos

3. **Instrucciones para el usuario:**
   - Si es el instalador: "Ejecuta el archivo y sigue las instrucciones"
   - Si es portable: "Ejecuta el archivo directamente, no requiere instalación"

## 🎯 Resumen de Pasos

1. ✅ Instalar Node.js y npm
2. ✅ Instalar Visual Studio Build Tools
3. ✅ Instalar Python 3.11
4. ✅ Obtener el código fuente
5. ✅ Ejecutar `npm install`
6. ✅ Ejecutar `npm run build`
7. ✅ Ejecutar `npm run dist:win`
8. ✅ Encontrar ejecutables en `release/`
9. ✅ Probar el ejecutable
10. ✅ Distribuir

## 📞 Soporte Adicional

Si encuentras problemas que no están cubiertos en esta guía:

1. Revisa los logs de error en la consola
2. Verifica que todas las dependencias estén instaladas
3. Intenta limpiar e instalar de nuevo:
   
   **PowerShell:**
   ```powershell
   Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
   npm install
   ```
   
   **CMD:**
   ```cmd
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   ```

4. Consulta la documentación oficial:
   - [Electron Builder](https://www.electron.build/)
   - [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
   - [Node.js](https://nodejs.org/)

---

**¡Listo!** Con esta guía deberías poder generar el ejecutable de Windows sin problemas. Si tienes alguna duda específica, consulta la sección de Solución de Problemas.

