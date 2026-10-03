# Plan de implementación — Extensiones de V2

Rama: `feat/v2-construction`. Complementa a `docs/V2_CONSTRUCTION_IMPLEMENTATION_PLAN.md` (Incrementos 13–17, ya completos). Las extensiones se numeran **E0–E5** para no chocar con los incrementos del roadmap de la especificación (§199 en adelante).

## 0. Alcance y decisiones cerradas

Decisiones tomadas con el dueño del proyecto (2026-10-03):

1. **Tres rutas de trabajo**, elegidas al crear el proyecto: **Completa** (los 11 pasos con revisión humana; la ruta formal), **Exprés** (un prompt genera toda la planificación, revisada y aprobada en bloque) y **Solo construcción** (un prompt hasta la app validada, sin revisiones intermedias). Se puede **subir** de ruta (Solo construcción → Exprés → Completa), nunca bajar. Cada proyecto muestra una etiqueta visible con su ruta.
2. **La ruta Solo construcción** genera igualmente una planificación mínima oculta (fuente, contexto, requisitos, modelo, navegación, plano de interfaz, planes) para poder subir de ruta después. Conserva sin excepción: sandbox Docker, catálogo de dependencias aprobadas, generación por etapas validada, `GeneratedProjectSnapshot` inmutable y trazabilidad.
3. **Tema claro/oscuro/ambos y paleta de colores elegible**, congelados en la aprobación de diseño y usados tanto por los bocetos como por el frontend generado.
4. **Edición de escritorio con Electron**, código abierto (Apache-2.0), sin pagos. La edición web tampoco tiene pagos.
5. **Iniciar sesión con ChatGPT** (plan usage de OpenAI) **solo en la edición de escritorio**: es una app open-source que corre localmente, así que califica sin formulario. En la web el botón existe, pero lleva al asistente de instalación de la versión de escritorio.
6. **Mensajes flotantes descartables** para ayudas e indicaciones, nunca para alertas que piden una acción (desactualización, bloqueos, errores).

**Fuera de alcance de este plan** (planificado para después de cerrar v2): interfaz bilingüe completa EN/ES y vista previa en vivo del software generado.

**Frontera dura:** ninguna extensión debilita lo que ya protege `AGENTS.md`: aislamiento entre proyectos, inmutabilidad del historial aprobado, ejecución de código generado solo en el sandbox, comandos solo de la plantilla y nada de cobros silenciosos.

---

## E0 — Licencia y decisiones de arquitectura (sin código de producto)

- `LICENSE` en la raíz con **Apache-2.0** y `"license": "Apache-2.0"` en los `package.json`. Cubre todo el monorepo: la edición de escritorio empaqueta la API y la web, así que una licencia solo para `apps/desktop` no bastaría.
- Crear `docs/decisions/` con tres ADR:
  - **ADR-001 — Rutas de trabajo.** Excepción acotada a `AGENTS.md §11` y §63 para la ruta Solo construcción: se permite generar sin aprobaciones humanas intermedias, pero se mantienen las garantías del punto 2 de §0.
  - **ADR-002 — Edición de escritorio y proveedor ChatGPT.** Electron, PostgreSQL embebido, requisito de Docker para construir, plan usage solo en escritorio.
  - **ADR-003 — Tema y paleta del proyecto.** Extensión versionada del `DesignSystemProfile`.
- Actualizar `docs/CASEFLOW_AI_SPEC.md` y `AGENTS.md` para que reflejen los ADR (las secciones 11 y 63 citan la excepción; no se toca §29, que sigue exigiendo la interfaz en español).

**Terminado cuando:** licencia publicada, tres ADR aprobados, especificación y `AGENTS.md` coherentes con ellos.

---

## E1 — Tema y paleta del proyecto

### Modelo

- Nuevo tipo de análisis estructurado **`DESIGN_THEME`** (prefijo `TEM-`), reutilizando versionado, candidatos de IA, revisión y la página genérica, igual que `GENERATION_PLAN`.
- Contenido: `mode` (`LIGHT` | `DARK` | `BOTH`) y una paleta de tokens semánticos (`primary`, `secondary`, `accent`, `background`, `foreground`, `muted`, `destructive`…) para claro y, si aplica, oscuro. Colores en un formato validado por contrato.
- Nuevo rol `DESIGN_THEME` en la línea base de diseño: obligatorio para proyectos nuevos y opcional para los existentes (si no hay tema, se usa el actual `CASEFLOW_STANDARD_WEB_V1`).

### Generación

- La IA propone **3 paletas candidatas** a partir del contexto del proyecto. El usuario elige una o la ajusta con un prompt ("más cálida", "verde corporativo"), y cada ajuste es una nueva versión.
- Validación determinística del **contraste WCAG AA** entre texto y fondo: una paleta que no cumple se marca y no puede aprobarse sin corregirse.
- Vista previa con una mini maqueta de la interfaz pintada con la paleta, en claro y oscuro.

### Consumo

- El proveedor de bocetos (Stitch y el renderizador interno) recibe el tema como contexto estructurado.
- El generador del frontend emite los tokens como variables CSS de Tailwind y, si el modo es `BOTH`, un selector de tema en la app generada.

**Pruebas:** contrato y contraste (unitarias), congelado en la línea base e inmutabilidad (integración), selección y ajuste en la web, y app generada con `BOTH` validada en el sandbox.

---

## E2 — Tres rutas de trabajo

### Modelo

- `Project.workflowRoute`: enum `FULL` | `EXPRESS` | `BUILD_ONLY`, fijado al crear. Un trigger en la base de datos solo permite subir (`BUILD_ONLY` → `EXPRESS` → `FULL`), nunca bajar. Cada cambio se audita.
- Las versiones aprobadas por el sistema quedan marcadas con un **origen de aprobación** explícito (`HUMAN`, `HUMAN_BULK` o `AUTOMATIC`) en un campo dedicado, auditable y nunca reescrito. Al subir de ruta, lo aprobado automáticamente aparece como "aprobado automáticamente — pendiente de revisión humana".

### Orquestación (un job por etapa, nunca un prompt gigante)

- El prompt inicial del usuario se guarda como **fuente del proyecto** (`PROJECT_SOURCE`), así toda la planificación queda trazable a él.
- Un orquestador recorre la cadena existente en orden de dependencias: contexto → requisitos → casos de uso → modelo de datos → navegación → arquitecturas → plano de interfaz → tema → bocetos → plan de generación → modelo conceptual → línea base → plan de implementación. **Cada etapa usa el servicio que ya existe**, valida su salida con los mismos esquemas y se detiene en la primera falla con un mensaje claro, sin regenerar todo.
- **Exprés:** al terminar la planificación, un asistente muestra todo agrupado por etapa para revisar, editar y aprobar en bloque (`HUMAN_BULK`). La construcción no arranca hasta que el usuario aprueba.
- **Solo construcción:** el sistema aprueba cada etapa automáticamente (`AUTOMATIC`), congela la línea base y lanza la generación y la validación en el sandbox ya existentes, sin cambios. El usuario ve el progreso por etapas y el resultado.

### Interfaz

- Selector de ruta al crear el proyecto, con una explicación corta de cada una y la recomendación de la Completa para entregables formales.
- Etiqueta de ruta en el selector de proyectos y en el encabezado.
- El sidebar se adapta: la ruta Completa muestra los 11 pasos, la Exprés muestra el asistente y luego Construcción, y la de Solo construcción muestra el prompt, el progreso y el resultado. Acción "Subir a ruta…" con confirmación.

**Pruebas:** trigger de solo subida, orquestador con IA falsa (orden de etapas, parada en la primera falla, no duplica al reintentar), aislamiento entre proyectos, marcas de origen de aprobación, ruta Solo construcción hasta `READY` en Docker real (opcional, fuera de CI), y subir de ruta conservando el historial.

---

## E3 — Mensajes flotantes descartables

- Componente `DismissibleHint` (popover anclado, con botón X y cierre al hacer clic fuera). Lo cerrado se recuerda por usuario.
- **Se usa para:** ayudas de cada página (Líneas Base, "si la IA no está disponible…"), novedades ("esto cambió de lugar") y una guía de primer uso.
- **Nunca para:** desactualización, bloqueos, errores ni validaciones. Esas siguen fijas hasta resolverse.
- Accesible: foco correcto, se cierra con Escape y tiene `aria-describedby`.

**Pruebas:** se muestra, se descarta, no reaparece y no oculta alertas críticas.

---

## E4 — Edición de escritorio (Electron)

### Arquitectura

- Nuevo `apps/desktop`. El proceso principal de Electron arranca la API y el worker como procesos hijos de Node y sirve la web compilada (Next.js `standalone`) en `localhost`.
- **Base de datos:** PostgreSQL embebido (binarios portables por sistema operativo), con migraciones de Prisma al arrancar y datos en la carpeta de datos del usuario.
- **Cola:** BullMQ necesita Redis. Recomendado: empaquetar un binario portable de Redis (sin cambios en el código de colas). La alternativa, un adaptador de cola en proceso, se descarta por tocar todo el código asíncrono.
- **Almacenamiento:** nueva implementación `FilesystemStorageProvider` de la interfaz `StorageProvider` existente. Correo desactivado en local.
- **Sandbox:** sigue siendo Docker, sin excepción. Al iniciar la app se detecta si Docker está disponible; si no, la planificación funciona igual y la construcción muestra el **asistente interactivo de instalación de Docker** (paso a paso por sistema operativo, con verificación automática al final).
- **Distribución:** instaladores con `electron-builder` para Windows, macOS y Linux. La firma de código y la actualización automática quedan fuera de este alcance.
- Cada dependencia nueva (Electron, electron-builder, Postgres embebido) se justifica según `AGENTS.md §51`.

**Pruebas:** arranque y apagado limpio, migraciones en una base nueva, `FilesystemStorageProvider` con las mismas pruebas de contrato que S3, flujo con Docker presente y ausente, y una validación manual del instalador en Windows.

---

## E5 — Proveedor "ChatGPT" (solo escritorio)

- Nuevo `AIProvider` sobre la **Responses API**, dentro de la abstracción existente (`AIOrchestrator` → `ModelRouter` → proveedor). Ningún módulo de dominio llama a OpenAI directamente.
- **OAuth** con el permiso `chatgpt.tokens.use.direct` desde el proceso principal de Electron (redirección a `localhost`), con un `ext_agent_host_id` persistente por equipo. Las credenciales se guardan cifradas con el almacén seguro del sistema operativo (`safeStorage`), nunca en la base de datos ni en `localStorage`.
- **Descubrimiento de modelos** y selección por el usuario.
- **Manejo de errores acordado:**
  - **429 (cuota):** pausar las llamadas con el plan, avisar al usuario y ofrecer pasar a otro modelo configurado solo con su confirmación. Nunca un cambio silencioso a uno de pago.
  - **403 (no elegible):** explicar el motivo sin reintentar.
  - **Sesión revocada:** detectarla al fallar, limpiar las credenciales y pedir reconectar.
  - Al cerrar sesión, revocar el token de refresco antes de borrar las credenciales locales.
- Pantalla de cuenta conectada con "Administrar uso" (abre los ajustes de ChatGPT).
- **Edición web:** el mismo botón "Continuar con ChatGPT" abre el asistente de descarga e instalación de la edición de escritorio.

**Pruebas:** contrato del proveedor con respuestas simuladas, incluidos 429, 403 y revocación (en CI). Una evaluación con una cuenta Plus real queda separada y nunca entra al CI (`AGENTS.md §44`).

---

## 6. Orden de trabajo

1. **E0** — licencia y ADR (base legal y de especificación de todo lo demás).
2. **E1** — tema y paleta (lo usan las rutas Exprés y Solo construcción).
3. **E2** — tres rutas.
4. **E3** — mensajes flotantes.
5. **E4** — edición de escritorio.
6. **E5** — proveedor ChatGPT (necesita E4).

Un commit por extensión (o por sub-extensión si es grande). Sin PR hasta cerrar v2 completa, igual que el plan anterior.

## 7. Batería de verificación (al final de cada extensión)

`pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:integration` (tras `db:test:migrate`), las pruebas de `apps/web` y `build`. Para las extensiones que tocan construcción o el sandbox, además la validación real en Docker (opcional, fuera de CI). Antes de cada commit, se escanean los cambios en busca de líneas de atribución.

## 8. Riesgos

- **Términos de OpenAI.** El plan usage es reciente (septiembre 2026) y está en preview: puede cambiar. E5 queda detrás de una bandera de edición y nunca es el único proveedor posible.
- **Tamaño de la edición de escritorio.** Electron más Postgres y Redis embebidos produce instaladores grandes. Es aceptable, pero hay que medirlo.
- **Aprobación automática en la ruta Solo construcción.** El riesgo es que se confunda con un entregable revisado. Se mitiga con la etiqueta de ruta, el origen de aprobación visible y la regla de solo subir de ruta.
- **Costo de IA de las rutas Exprés y Solo construcción.** Muchas etapas por prompt: hay que mostrar el progreso y respetar los límites de proveedor ya existentes.
