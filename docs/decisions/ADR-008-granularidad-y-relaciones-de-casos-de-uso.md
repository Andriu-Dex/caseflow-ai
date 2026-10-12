# ADR-008 — Granularidad de los casos de uso y relaciones «include» / «extend»

- **Estado:** Aprobado
- **Fecha:** 2026-10-12
- **Decisión registrada como:** DEC-129
- **Modifica:** §217 (Incremento 1F) y §7448: el diagrama de casos de uso dibuja «include» y «extend» cuando están registrados en los casos de uso. El generador sigue sin inventarlos.
- **No modifica:** la herencia entre actores sigue fuera de alcance; los actores son texto libre y no una entidad.

## Contexto

En un proyecto de validación, la IA propuso ocho casos de uso como «Gestionar ciclo de vida de eventos de catering» o «Administrar catálogos y perfiles por sucursal». Cada uno agrupaba varios objetivos distintos. El diagrama resultante tenía una burbuja por caso, sin desglose ni relaciones, y no servía como modelo UML.

Hubo dos causas:

1. **El prompt** `use-cases.generate@1` pedía «consolidar requisitos relacionados». Eso empujaba a crear casos paraguas.
2. **El modelo** de caso de uso no podía expresar «include» ni «extend», así que ni la IA ni una persona podían registrarlos.

## Decisión

1. **Prompt `use-cases.generate@2`.**
   - Un caso de uso es un objetivo concreto de un actor: algo que consigue en una sesión de trabajo y que le da un resultado observable. Se nombra con un verbo en infinitivo y su objeto.
   - No se usan nombres paraguas («Gestionar…», «Administrar…»).
   - Tampoco se baja a pasos sueltos.
   - Los actores salen de los requisitos.
   - Se mantiene el máximo de 20 candidatos.
   - La v1 sigue registrada para reproducir ejecuciones anteriores.
2. **Relaciones como datos estructurados.**
   - Un caso de uso guarda relaciones `INCLUDE` o `EXTEND` hacia otros casos de uso del proyecto, en `use_case_relations`. La relación sale del caso que la declara: el caso base incluye un comportamiento, o el caso que extiende apunta al caso base.
   - El destino es el artefacto lógico, de modo que la relación sobrevive a nuevas versiones del destino.
   - Hay como máximo una relación por par.
   - Las relaciones forman parte de la versión: son inmutables una vez aprobada y un trigger impide que crucen proyectos o apunten al propio caso.
3. **Propuesta de la IA.**
   - Cada candidato lleva `relations` hacia el `candidateId` de otro candidato de la misma respuesta. El esquema rechaza destinos inexistentes, repetidos o al propio candidato.
   - Al aceptar, cada relación se conserva solo si su destino ya fue aceptado en la misma aceptación o en una anterior. Una relación hacia una propuesta descartada se pierde con ella.
4. **Edición manual.** El formulario de caso de uso permite añadir, cambiar y quitar relaciones, de modo que la ruta sin IA tiene la misma capacidad.
5. **Diagrama.**
   - Dibuja `origen ..> destino : <<include>>` o `<<extend>>` solo entre casos presentes en el diagrama.
   - El límite del sistema muestra el nombre del proyecto en lugar de «Sistema».

## Consecuencias

- **A favor:** los casos de uso propuestos tienen el nivel de detalle de un modelo UML real y el diagrama muestra su estructura.
- **En contra:** un proyecto típico tiene ahora más casos de uso, y el plano de interfaz debe cubrir cada uno.
- **Límites conocidos:**
  - No se detectan ciclos de «include».
  - Si un candidato se acepta antes que el candidato al que apunta, esa relación no se añade después a la versión ya creada; hay que añadirla al editar.
