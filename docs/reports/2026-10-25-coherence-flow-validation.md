# Validación aislada del flujo y la coherencia

Fecha local: 25 de octubre de 2026 (America/Guayaquil). Las marcas UTC de ejecución corresponden al 26 de octubre, aproximadamente 04:48 UTC.

## Resultado

Se ejecutó un proyecto ficticio desde fuentes hasta una línea base de diseño y un plan de implementación aprobado, seguido de controles negativos. El ensayo final terminó correctamente: **1 prueba de integración aprobada, 0 fallidas**. Esto significa que el ensayo se completó; no significa que todos los comportamientos del producto fueran correctos. Se reprodujeron contradicciones semánticas que pueden aprobarse y una discrepancia entre consistencia y disponibilidad del proyecto.

No se modificó código del producto, no se hicieron commits y no se alteraron proyectos del usuario. Este informe permanece en `tmp/ape4-docs`.

## Revisión y entorno

- Revisión validada: `develop`, `d9ce553388e6bb5ccd8d219cedd8a0f64d78db59`, extraída mediante `git archive` fuera del repositorio de trabajo.
- Contenedor exclusivo: `caseflow-coherence-validation-20261025`, imagen local `pgvector/pgvector:0.8.6-pg18`, puerto enlazado a `127.0.0.1:52227`.
- Base del ensayo final: `coherence_flow3_test`, con las 65 migraciones aplicadas. Los dos intentos anteriores se conservaron en bases distintas.
- Proyecto final: `1850beed-6e14-4ee4-b339-bf5cf2662db6`.
- Ruta `FULL`; `coherenceRequired=true`, comprobados al crear el proyecto. No se desactivaron los controles de coherencia ni vigencia.
- NestJS y Prisma reales; solicitudes HTTP mediante Supertest. El soporte de pruebas sustituye autenticación, almacenamiento, renderizador externo y sandbox. La cola de mockups no utiliza Redis; se ejecutó explícitamente el trabajo interno.
- Entradas manuales sintéticas y transiciones instrumentales de revisión/aprobación. No hubo llamadas a proveedores: se comprobaron **0 registros AIRun** en el proyecto.

## Caso ficticio

Biblioteca de aula: el encargado registra libros, préstamos y devoluciones; el estudiante consulta únicamente sus propios préstamos. Un libro no puede tener dos préstamos activos y un estudiante puede tener como máximo tres. Los eventos de altas y devoluciones deben conservar actor y fecha durante 365 días. Pagos y reservas quedan fuera del alcance.

Se registraron una fuente y su informe manual, un contexto con cuatro necesidades, dos reglas de negocio y una restricción; cuatro requisitos funcionales y uno no funcional; cuatro casos de uso; diagrama de casos de uso; modelo de datos; diagrama de clases; navegación; arquitecturas de software y sistema; cuatro pantallas de interfaz; tema; boceto interno; plan de generación; modelo conceptual; línea base de diseño y plan de implementación.

El trabajo de boceto terminó `COMPLETED` y se aprobó su versión. Las exportaciones JSON y HTML devolvieron HTTP 200. La línea base devolvió HTTP 201 e incorporó nueve versiones explícitas; identificador `102fc4d7-6e36-42a4-a6f7-44ea31be85d7`. El plan de implementación aprobado tiene identificador `f657576b-27a1-4454-b540-c350f8269502`.

## Controles comprobados

| Prueba                                                              | Resultado observado                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Contexto aprobado sin requisitos                                    | `readiness.ready=false`; necesidades y reglas sin cobertura identificadas.          |
| Aprobar requisito sin origen                                        | HTTP 422; exige elementos de contexto o justificación.                              |
| Aprobar clases omitiendo una entidad del modelo                     | HTTP 422; identifica la entidad Prestamo sin clase.                                 |
| RNF sin referencia en diseño                                        | Advertencia `QUALITY_REQUIREMENT_DESIGN`; no bloquea la aprobación de arquitectura. |
| Aprobar interfaz omitiendo una pantalla/caso de uso                 | HTTP 422; identifica nodo y CU-004 sin cobertura.                                   |
| Aprobar implementación omitiendo ruta de una pantalla               | HTTP 422; identifica la pantalla sin ruta.                                          |
| Completar las omisiones mediante nuevas versiones                   | Aprobaciones HTTP 201; no se reescribieron las versiones anteriores.                |
| Congelar diseño después de aprobar cambios aguas arriba             | HTTP 422; solicita rehacer desde Diagrama de casos de uso.                          |
| Consultar arquitectura histórica después de crear la contradictoria | Conserva el contenido original de 365 días; aserción aprobada.                      |

## Huecos reales

### 1. Referencias válidas no garantizan cumplimiento semántico

Se creó una nueva arquitectura que conserva la referencia correcta a RNF-001, pero declara: «Eliminar permanentemente todos los eventos después de 24 horas». El requisito exige conservarlos 365 días. Su aprobación devolvió **HTTP 201**. El informe de consistencia no señaló esta contradicción ni mantuvo la advertencia de cobertura del RNF.

El chequeo de RNF en `apps/api/src/consistency-engine/consistency-engine.service.ts`, aproximadamente líneas 75–103, recopila `relatedSourceCodes`. Prueba que existe una referencia, pero no compara el compromiso con las responsabilidades escritas.

Impacto: puede aparentar cobertura de una garantía incumplida. El esquema válido y la trazabilidad son necesarios, pero insuficientes para afirmar coherencia. La revisión humana sigue siendo decisiva. Prioridad recomendada: alta para compromisos medibles, seguridad y permisos.

### 2. Un caso de uso puede contradecir actor y alcance del requisito

Se versionó el caso de consulta propia conservando su referencia al requisito aprobado, pero cambiando el actor a «Visitante anónimo» y la acción a consultar los préstamos de todos los estudiantes. La aprobación devolvió **HTTP 201**.

Impacto: una relación correcta puede acompañar un diseño de permisos incorrecto. Esto no demuestra que exista actualmente una filtración de datos en ejecución: no se generó ni ejecutó una aplicación. Demuestra que la aprobación de estos artefactos no bloquea esa contradicción.

### 3. Boceto interno y diagnóstico de cobertura no coinciden

Con el boceto interno aprobado, consistencia devolvió **cuatro errores `Mockup Association`**, uno por pantalla, mientras `readiness.ready` era **true**. También pudo congelarse la línea base de diseño (HTTP 201).

La regla de asociación, en `consistency-engine.service.ts`, aproximadamente líneas 136–153, cuenta las filas `screens` del boceto. El resultado `INTERNAL_WIREFRAME` se guarda como SVG, a diferencia del resultado externo con pantallas individuales (`apps/api/src/mockups/mockups.service.ts`). La cobertura de la alternativa interna no queda representada para esa regla.

Además, `apps/api/src/readiness/readiness.service.ts:173` calcula disponibilidad mediante la satisfacción de etapas. En este caso no refleja aquellos errores. Antes de endurecer una puerta de aprobación hay que corregir la representación del fallback: bloquear indiscriminadamente estos errores inutilizaría un flujo interno que hoy puede completarse.

Impacto: mensajes incompatibles para el usuario y pérdida de confianza en el diagnóstico. No se inspeccionó visualmente el SVG, por lo que este ensayo no certifica la calidad gráfica o fidelidad visual de cada pantalla.

## Evidencia reproducible

Directorio externo, conservado junto al repositorio:

`C:\Documentos\Documentos\Universidad UTA\Ingenieria De Software\Semestre 7\DAS\CASEFlow-Validacion-Flujo\20261025-11e50922b33343758da8cc0586909cda`

| Archivo                                                              | SHA-256                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `coherence-flow-1792990118786.json`                                  | `E1D77F56384829C4521315B7D849AD74332A2AD81EF015882AAE62B0780AF06A` |
| `flow-run-3.json`                                                    | `41AB081E7C5B424DC343131A4ACF8F80A881BC67E5566D9C9A5BDA266D6A3FBC` |
| `apps/api/test/integration/coherence-flow-audit.integration.spec.ts` | `C741C53CCEE73517C36B2ECB6461E91C20368FE8C469761B3D8C7B9F2DA08CDF` |

El JSON conserva solicitudes respondidas, estados, versiones, exportaciones, matriz, cobertura, trazabilidad y sondas negativas, sin guardar cabeceras de autorización. El archivo Vitest registra el éxito del ensayo. El harness y sus datos están fuera del código oficial.

La ejecución utiliza los CLI locales de Prisma y Vitest, variables de conexión exclusivas de pruebas y:

```text
node node_modules/prisma/build/index.js migrate deploy
node node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts apps/api/test/integration/coherence-flow-audit.integration.spec.ts --hookTimeout=30000 --reporter=json --outputFile=flow-run-3.json
```

Los primeros dos intentos fallaron por entradas incorrectas del propio ensayo: nombre de campo del endpoint de diagramas (`sourceVersionIds`) y ausencia de `description` en entidades conceptuales. Se corrigió únicamente el harness. No son defectos del producto. Sus evidencias y bases quedaron conservadas. Se observó una advertencia de deprecación de consultas concurrentes de PostgreSQL; no impidió finalizar el ensayo y no se investigó como incidencia funcional.

## Límites y siguiente paso

Este ensayo comprueba el flujo de planificación mediante API y controles estructurales con datos controlados. **No certifica la generación completa de un software funcional ni la calidad de respuestas de un proveedor.** No se ejecutaron generación de código, instalación/build de un proyecto generado, sandbox real, OCR/transcripción, Stitch, autenticación real, navegador ni recorridos de escritorio/móvil. No se ejecutó la suite completa o cobertura global porque no hubo cambios de implementación.

La siguiente intervención útil para el producto corresponde a `develop`: representar explícitamente cobertura del fallback de bocetos, armonizar el diagnóstico de disponibilidad con consistencia y convertir compromisos verificables/permisos en comprobaciones estructuradas con evidencia. No conviene prometer detección universal de contradicciones en lenguaje libre ni sustituir la revisión humana por un juicio opaco.

Después debe repetirse este caso con generación real por etapas y revisión semántica de cada candidato, antes de aprobarlo. Esa segunda evaluación todavía está pendiente; no se deben extrapolar estos resultados manuales a la calidad de la generación real.
