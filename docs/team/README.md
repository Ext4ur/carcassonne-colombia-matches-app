# Documentación del equipo — Carcassonne Tournament Manager

Índice de documentación **versionada** para el equipo de desarrollo y organizadores técnicos.

| Documento | Audiencia | Contenido |
|-----------|-----------|-----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Desarrolladores | Stack, procesos Electron, dominio, sync, builds, CI, estructura de carpetas |
| [GUIA_USO.md](./GUIA_USO.md) | Organizadores | Flujo paso a paso: jugadores, lugares, torneos, rondas, reportes, respaldos |
| [SMOKE_TESTS_KO.md](./SMOKE_TESTS_KO.md) | QA / desarrollo | Checklist manual de smoke tests para fase eliminatoria |

## Documentación complementaria en el repo

| Recurso | Ubicación |
|---------|-----------|
| Backlog KO / formatos futuros | [`docs/KNOCKOUT_BACKLOG.md`](../KNOCKOUT_BACKLOG.md) |
| Reglas Cursor compartidas | [`.cursor/rules/`](../../.cursor/rules/) |
| README de desarrollo rápido | [`README.md`](../../README.md) (raíz) |

## Documentación local (no versionada)

Reglas de negocio detalladas, homologación import/export y reglas Cursor adicionales viven en `docs/local/` (**gitignored**).

Cada desarrollador puede enlazar las reglas locales a Cursor:

```bash
# Windows (PowerShell, desde la raíz del repo)
New-Item -ItemType SymbolicLink -Path ".cursor\rules-local" -Target "docs\local\cursor-rules" -Force

# macOS / Linux
ln -sfn "$(pwd)/docs/local/cursor-rules" .cursor/rules-local
```

Las reglas en `.cursor/rules/` del repo aplican a todo el equipo; las de `docs/local/cursor-rules/` son ampliaciones opcionales (copiar o symlink según convención del equipo).

## Versión de referencia

La app sigue la versión en `package.json` (actualmente **1.4.8**).

## Ritual de calidad (desarrollo)

Antes de commit o PR con cambios de código:

```bash
npm run test:run
npm run typecheck
npm run check-translations   # solo si se modificaron locales i18n
```

Ver también `.cursor/rules/agent-workflow.mdc`.
