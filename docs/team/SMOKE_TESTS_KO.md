# Smoke tests — Fase eliminatoria (Suizo + KO)

Checklist manual de QA antes de un release o tras cambios en la fase eliminatoria. Marca cada ítem al validarlo.

**Versión de referencia:** ver `package.json` (actualmente 1.4.8).

---

## 1. Configuración inicial

- [ ] Crear torneo con formato **Suizo + eliminatoria** (`swiss_knockout`).
- [ ] Probar **top 2** clasificados (cuadro directo a final).
- [ ] Probar **top 4** (semifinales + final).
- [ ] Probar **top 8** (cuartos + semifinales + final).
- [ ] Probar serie **al mejor de 1** y **al mejor de 3**.
- [ ] Probar con **partido por el tercer puesto** activado y desactivado.

---

## 2. Fase suiza

- [ ] Inscribir jugadores suficientes para el top N configurado.
- [ ] Completar todas las rondas suizas configuradas.
- [ ] Verificar que aparece el botón **Iniciar fase eliminatoria** (no antes de terminar el suizo).
- [ ] Confirmar que la clasificación en vivo refleja puntos y desempates correctos.

---

## 3. Inicio de la fase eliminatoria

- [ ] Pulsar **Iniciar fase eliminatoria** y confirmar.
- [ ] Verificar que se genera la primera ronda KO con emparejamientos correctos (seeds estándar).
- [ ] Verificar que el torneo queda con fase KO iniciada (timestamp persistido).
- [ ] Verificar que la configuración KO queda bloqueada (no editable tras iniciar).

---

## 4. Cuadro en la interfaz

- [ ] Alternar vistas **Final**, **Suizo congelado** y **Bracket**.
- [ ] En vista **Bracket**, el cuadro muestra nombres, ganadores y marcador de series (si aplica).
- [ ] La clasificación **suizo congelada** coincide con el snapshot al iniciar KO.

---

## 5. Rondas eliminatorias siguientes

- [ ] Registrar resultados de todos los cruces de una ronda KO.
- [ ] Generar la siguiente ronda KO solo cuando la anterior está completa.
- [ ] Semifinal → final (y partido de bronce si está configurado).
- [ ] Intentar generar ronda con cruces abiertos: debe mostrar error claro (no avanzar).
- [ ] Al completar la final, no debe permitirse otra ronda KO.

---

## 6. Exportaciones e informes

- [ ] **PNG — Clasificación completa**: tabla con todos los jugadores y desempates.
- [ ] **PNG — Cuadro eliminatorio**: imagen no vacía, con cruces y ganadores.
- [ ] **Excel**: hojas incluyen partidos de fase KO.
- [ ] **CSV partidas**: incluye rondas con `phase: knockout`.
- [ ] En **clasificatorios**, podio PNG (top 4) sigue disponible además de la clasificación completa.

---

## 7. Respaldo e importación

- [ ] Exportar backup JSON del torneo con KO en curso o completado.
- [ ] Importar en otra instancia (o tras borrar local).
- [ ] Verificar integridad: seeds KO, rondas `phase: knockout`, partidas, resultados y series.
- [ ] Tras importar, el cuadro y las exportaciones PNG funcionan igual.

---

## 8. Finalizar torneo

- [ ] Pulsar **Finalizar torneo** cuando el bracket esté completo.
- [ ] El torneo pasa a **Completado**; no se editan resultados ni rondas.
- [ ] Clasificación, estadísticas y reportes siguen disponibles.

---

## 9. Regresión rápida

- [ ] Torneo **suizo puro** (sin KO): no debe aparecer opción de cuadro eliminatorio ni inicio de KO.
- [ ] Torneo **importado** con KO ya iniciada: cuadro y export PNG del cuadro visibles sin re-iniciar fase.
- [ ] Lista de torneos: export JSON por fila sigue funcionando en torneo con KO.

---

## Notas

- Top N que no sea potencia de 2 (play-in, byes) **no está en v1** — ver [`KNOCKOUT_BACKLOG.md`](../KNOCKOUT_BACKLOG.md).
- Si un ítem falla, anotar versión de la app, formato del torneo, top N y pasos exactos para reproducir.
