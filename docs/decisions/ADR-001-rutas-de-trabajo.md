# ADR-001 — Rutas de trabajo: Completa, Exprés y Solo construcción

- **Estado:** Aprobado
- **Fecha:** 2026-10-03
- **Decisión registrada como:** DEC-116
- **Modifica:** `CASEFLOW_AI_SPEC.md` §160 (Human Design Review), §179 (DoD de Construction) y la regla de revisión humana previa a la generación; `AGENTS.md` §4.5, §11, §16 y §63.
- **No modifica:** DEC-111 (generación incremental por etapas), DEC-112 (validación obligatoria), §155 (catálogo de dependencias), §172 (snapshots inmutables), §174 (sandbox).

## Contexto

CASEFlow solo ofrece hoy un camino: los 11 pasos de planificación con revisión humana en cada etapa y, después, la construcción controlada. Es el camino correcto para entregables formales, pero es lento para quien quiere probar una idea, y esos usuarios terminan en herramientas de "prompt a aplicación" (bolt.new, Lovable) que no dejan requisitos, trazabilidad ni historial.

## Decisión

Cada proyecto se crea en una de tres **rutas de trabajo** (`Project.workflowRoute`):

| Ruta                             | Planificación                     | Revisión humana                 | Construcción                         |
| -------------------------------- | --------------------------------- | ------------------------------- | ------------------------------------ |
| `FULL` — Completa                | 11 pasos, uno por uno             | En cada artefacto               | Controlada, con aprobación de diseño |
| `EXPRESS` — Exprés               | Generada completa desde un prompt | En bloque, antes de construir   | Controlada, con aprobación de diseño |
| `BUILD_ONLY` — Solo construcción | Generada completa y oculta        | Ninguna (aprobación automática) | Automática                           |

1. **La ruta se elige al crear el proyecto** y solo puede **subir** (`BUILD_ONLY` → `EXPRESS` → `FULL`), nunca bajar. Bajar ocultaría una revisión que ya ocurrió. Un trigger de la base de datos lo garantiza y cada cambio se audita.
2. **Excepción acotada para `BUILD_ONLY`:** se permite generar código sin aprobaciones humanas intermedias. Es la única ruta que exime de §160 y de `AGENTS.md` §16; `FULL` y `EXPRESS` las conservan íntegras.
3. **Garantías que ninguna ruta puede omitir:**
   - El prompt inicial se guarda como fuente del proyecto (`PROJECT_SOURCE`) y toda la planificación es trazable a él.
   - Se genera la planificación completa también en `BUILD_ONLY`, con los mismos servicios y esquemas que la ruta Completa, para que el proyecto pueda subir de ruta.
   - Generación incremental por etapas (DEC-111): un job por etapa, validado, que se detiene en la primera falla sin regenerar todo.
   - Validación en el sandbox Docker (§174–§175), catálogo de dependencias aprobadas (§155), `GeneratedProjectSnapshot` inmutable (§172) y auto-repair acotado (§176).
4. **El origen de cada aprobación es explícito y permanente:** `HUMAN`, `HUMAN_BULK` (aprobado en bloque, ruta Exprés) o `AUTOMATIC` (ruta Solo construcción). Al subir de ruta, lo aprobado automáticamente se muestra como "aprobado automáticamente — pendiente de revisión humana".
5. **La ruta es visible:** cada proyecto muestra una etiqueta con su ruta, para que un prototipo nunca se confunda con un entregable revisado.

## Consecuencias

- **A favor:** CASEFlow cubre también el caso de uso de prototipado rápido, y un prototipo puede convertirse después en un proyecto formal sin perder su historia.
- **En contra:** en `BUILD_ONLY` los artefactos aprobados no fueron revisados por una persona. Se mitiga con el origen de aprobación visible, la etiqueta de ruta y la regla de solo subir.
- **"No one-shot" se mantiene:** desde la perspectiva del usuario es "un prompt y sale la app", pero internamente la generación sigue siendo por etapas y validada (DEC-111 no cambia).
