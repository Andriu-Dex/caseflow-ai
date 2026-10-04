# ADR-004 — Borradores provisionales en la ruta Exprés

- **Estado:** Aprobado
- **Fecha:** 2026-10-04
- **Decisión registrada como:** DEC-119
- **Modifica:** la regla de que cada generación con IA parte solo de versiones `APPROVED` (§13.2, §14.2, §15, §17.2, §156–§157 y §159), únicamente para proyectos en la ruta `EXPRESS` de DEC-116.
- **Precisa:** ADR-001, fila `EXPRESS`: "Generada completa desde un prompt — En bloque, antes de construir".
- **No modifica:** la aprobación de diseño (§160), el plan de implementación (§161), la generación de código, el sandbox ni las rutas `FULL` y `BUILD_ONLY`.

## Contexto

Cada etapa de la planificación se genera hoy a partir de versiones aprobadas de la etapa anterior: los requisitos parten de un contexto aprobado, los casos de uso de requisitos aprobados, y así sucesivamente.

La ruta Exprés promete otra cosa: generar toda la planificación desde un prompt y aprobarla en bloque al final. Con la regla actual eso es imposible sin que alguien apruebe cada etapa antes de generar la siguiente.

## Decisión

1. **Solo en `EXPRESS`, una generación puede partir de borradores.** La fuente es la última versión no rechazada de la etapa anterior (`DRAFT`, `GENERATED` o `IN_REVIEW`), además de las aprobadas. Esto se llama una fuente provisional.
2. **Nada aprobado puede apoyarse en algo sin aprobar, en ninguna ruta.** Un trigger de la base de datos impide aprobar una versión mientras alguna de las versiones de las que se generó siga sin aprobar. Cuenta toda la procedencia registrada: fuentes del contexto, contexto de origen de los requisitos, fuentes de cada generación, y plano de interfaz y tema de los bocetos. Por eso la aprobación en bloque recorre las etapas en orden.
3. **El bloque se aprueba con origen `HUMAN_BULK`** (DEC-116) y queda registrado de forma permanente.
4. **Lo demás no cambia.** La línea base de diseño, el plan de implementación y la construcción siguen exigiendo versiones aprobadas.
5. **Las ediciones crean versiones nuevas.** Si en la revisión el usuario edita una etapa, nace una versión nueva. Lo generado a partir de la versión anterior queda marcado por el análisis de desactualización existente, sin rehacerse en silencio.

## Consecuencias

- **A favor:** la ruta Exprés cumple lo prometido: un prompt, toda la planificación generada y una sola revisión en bloque antes de construir.
- **En contra:** mientras dura la revisión existen artefactos generados a partir de borradores. Se mitiga de tres formas:
  - el trigger impide aprobarlos fuera de orden;
  - la trazabilidad conserva la versión exacta usada;
  - el análisis de desactualización señala lo que quedó atrás tras una edición.
- **Al subir a `FULL`:** desde ese momento solo se genera a partir de versiones aprobadas. Los borradores provisionales existentes siguen sujetos al trigger.
