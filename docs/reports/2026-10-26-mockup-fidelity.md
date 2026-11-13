# Fidelidad de bocetos: contexto aprobado y revisión previa a aprobación

## Resultado y alcance

Implementado en `develop`, sin commit. Se preservan los cambios anteriores y todas las evidencias originales. Se reforzó el contexto de generación y edición, se añadió revisión determinista del HTML y se repitió la evaluación externa de las cinco pantallas de biblioteca. El conjunto corregido permanece `GENERATED`, pendiente de revisión humana. No se creó una Design Baseline ni se inició construcción.

La implementación es genérica: las reglas de biblioteca existen únicamente en los datos del proyecto ficticio y en sus evidencias. No se añadieron dependencias, migraciones ni configuración de proveedores.

## Problema comprobado

El boceto externo anterior tenía cobertura de cinco pantallas y buena resolución, pero Inicio mostraba un máximo de dos préstamos frente a los tres aprobados. También añadía plazos de siete y quince días, formatos de código y funciones no solicitadas. La validación estructural de una generación y la descarga correcta no detectaban esas desviaciones.

Además, el requisito de préstamo decía «menos de tres» antes de registrar la operación. Interpretar esa precondición como si fuera un máximo final de dos habría sido incorrecto. Por eso se conserva el texto del requisito y se incorpora la regla explícita de máximo de tres desde su elemento de contexto aprobado enlazado, sin reescribir el requisito ni inferir otra política.

## Cambios técnicos

- `MockupAppContext` admite requisitos aprobados con su versión y, cuando procede, la versión de contexto enlazada. La selección toma la última versión aprobada de cada requisito del mismo proyecto, excluye artefactos archivados e incluye actores, precondiciones y postcondiciones. Un contexto enlazado solo aporta sus elementos si su versión está aprobada, pertenece al mismo proyecto y coincide con el elemento referenciado.
- Cada generación recibe esas reglas como datos de referencia y la instrucción explícita de omitir decisiones ausentes. Se prohíbe inventar límites, plazos, formatos obligatorios, campos, permisos, funciones o paneles. No se envían los UUID ni códigos de requisitos al texto visual del prompt.
- La edición individual recibe también su pantalla del plano canónico y los requisitos aprobados. Una pantalla ausente en ese plano no se edita. Las instrucciones de usuario originales siguen almacenándose como refinamiento; el contexto adicional no las reemplaza en el historial.
- `mockup-fidelity.ts` analiza texto del HTML sin ejecutarlo: descarta scripts, estilos, plantillas y comentarios, y decodifica entidades habituales. No es un sanitizador de seguridad ni un navegador.
- La revisión devuelve `scope: HTML_HEURISTIC`, versiones contrastadas y hallazgos por pantalla, con severidad, código, mensaje y evidencia esperada/observada.
- Los máximos explícitos comparables que cambian en cualquier dirección y la conservación inferior a la exigida generan errores. Un máximo o plazo sin respaldo identificable genera un aviso. No se equiparan automáticamente magnitudes de sujetos distintos.
- La vista previa muestra los hallazgos y sus límites. Si falta el resultado de revisión, no muestra un mensaje de comprobación satisfactoria.
- Antes de aprobar un boceto externo, la API repite la revisión sobre el HTML realmente almacenado. Los errores impiden la transición con HTTP 422 y `MOCKUP_FIDELITY_FAILED`. HTML no disponible, demasiado grande para el análisis o vacío también impide aprobar; un plano no legible o un conjunto sin pantallas produce bloqueo. Los avisos requieren revisión humana y no se convierten en certificación automática.
- El esquema interno conserva su flujo normal sin Stitch. Las versiones aprobadas o anteriores no se modifican. Las rutas de aprobación del flujo de construcción delegan en la misma transición del servicio.

La revisión se calcula contra los requisitos aprobados vigentes al consultar o aprobar; sus identificadores permiten saber qué se contrastó. No se presenta como una nueva instantánea histórica inmutable de los requisitos usados originalmente para generar el render.

## Pruebas reales y evidencia conservada

Entorno exclusivo: proyecto `ede757d7-abbf-4a12-8cb8-4e50093e017b`, base `coherence_real_test`, contenedor `caseflow-coherence-validation-20261025`, puerto local `61528`. Las pruebas de integración deterministas usan otra base, `coherence_fixes_test`. No se reinició ni vació la base de evaluación real.

Directorio de evidencia externo:

`C:\Documentos\Documentos\Universidad UTA\Ingenieria De Software\Semestre 7\DAS\CASEFlow-Validacion-Flujo\20261025-11e50922b33343758da8cc0586909cda`

Se reutilizó el adaptador nativo de ensayo descrito en el reporte de evaluación: ejecuta el proveedor compilado y el SDK real en Node fuera de la VM de Vitest. No simula respuestas externas. El HTML se descargó e inspeccionó como texto; no se ejecutó.

### Contraste con el resultado defectuoso

`real-old-mockup-fidelity-review.json` detecta como error el máximo de dos en Inicio, esperado tres, y como avisos los plazos de siete y quince días. La revisión referencia las cinco versiones aprobadas de requisitos y el contexto `20d5fcac-e362-46ff-88dd-70ca7b83e933`.

La primera comprobación de ensayo solo consultaba la descripción del requisito y señalaba el máximo como no respaldado. Ese intento falló su aserción de contradicción. Se conservó como `real-fidelity-review-before-context-run.json` y `real-old-mockup-fidelity-before-context.json`. Tras incorporar los elementos de contexto enlazados, `real-fidelity-review-run.json` pasó. No se alteró la evidencia ni se cambió la aserción para ocultar el hueco.

### Regeneración completa

Trabajo `0336e05a-1fac-47b4-be26-afbbd4b581bd`, generador `STITCH`, cinco pantallas de cinco, `COMPLETED`. Tiempo observado: **93 668 ms**. Inicio UTC `2026-10-27T00:20:07.517Z`; final UTC `2026-10-27T00:21:40.027Z` (26 de octubre en Ecuador).

La nueva salida eliminó el máximo incorrecto y redujo los datos inventados, pero aún introdujo catorce días lectivos en préstamo, un formato sugerido de identificador y un menú lateral adicional en devolución. La revisión HTML señaló el plazo. Estos resultados se preservaron en `after-fidelity-first-pass-20261026`, sin presentarlos como correctos.

### Correcciones dirigidas, sin bucle automático

Se realizaron tres ediciones explícitas mediante el flujo normal de refinamiento individual. Cada una produjo una nueva versión del mismo artefacto, conservando las demás pantallas y los archivos anteriores.

| Pantalla   | Trabajo                                | Tiempo observado | Resultado   |
| ---------- | -------------------------------------- | ---------------: | ----------- |
| Devolución | `2cfec4ce-0a1b-4a41-90f2-f552f58cdb0d` |        37 884 ms | `COMPLETED` |
| Libro      | `e61bc4dc-2504-467c-b537-128649221d06` |        28 805 ms | `COMPLETED` |
| Préstamo   | `e5b3d7aa-d744-42dd-9dcb-1b520eb7882d` |        27 431 ms | `COMPLETED` |

Artefacto final: `1835c2f6-d7a6-4d9f-8d9f-ebe60c4982c6`, versión 4, identificador `566da262-8716-4412-8c4d-62a5a8250862`, estado `GENERATED`. `real-repaired-mockup-fidelity-review.json` registra cero hallazgos en estas comprobaciones.

Se inspeccionaron las cinco imágenes regeneradas y las tres imágenes editadas. El préstamo conserva el máximo de tres, disponibilidad, ambos rechazos y auditoría de 365 días; ya no incluye el plazo inventado. Libro elimina el formato de código sugerido. Devolución elimina el menú lateral y las referencias criptográficas añadidas. Consulta mantiene identidad no editable y datos propios. Las imágenes tienen 1 920 píxeles de ancho y texto legible.

| Pantalla final  | PNG, bytes | HTML, bytes |
| --------------- | ---------: | ----------: |
| Inicio          |    233 620 |      17 707 |
| Consulta propia |    289 084 |      18 635 |
| Devolución      |    381 683 |      18 498 |
| Libro           |    291 960 |      16 928 |
| Préstamo        |    384 823 |      22 188 |

Archivos finales: `real-mockup-screen-1.png` a `real-mockup-screen-5.png`, sus HTML, `real-state.json`, `real-mockups-repair-run.json` y registros nativos sin credenciales. Los archivos previos al cambio están en `before-fidelity-20261026`; el almacenamiento conserva las claves originales sin sobrescribirlas.

## Verificación

| Comprobación                    | Resultado                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cobertura completa, un worker   | 942 pruebas aprobadas, 3 omitidas. Líneas 75,71 %, ramas 71,35 %, funciones 74,57 %, sentencias 75,20 %. |
| Suite web completa, dos workers | 317 pruebas aprobadas en 63 archivos.                                                                    |
| Integración de bocetos          | 7 pruebas aprobadas, incluyendo rechazo HTTP 422 con conservación del candidato y HTML.                  |
| Compilación API y web           | Aprobadas; web genera 32 páginas estáticas.                                                              |
| Typecheck del workspace         | Aprobado.                                                                                                |
| Lint                            | Aprobado.                                                                                                |

Las regresiones cubren cambios de máximo en ambos sentidos, plazo no respaldado, conservación reducida, texto codificado, exclusión de scripts/comentarios/estilos, falta de HTML/requisitos, selección de contexto del mismo proyecto, presentación de evidencia en la interfaz y contexto de edición individual. Se corrigió el soporte de cuatro pruebas de menú que aún no proporcionaban el nuevo acceso a requisitos; se mantuvieron sus aserciones de navegación. Un ensayo inicial de prompt también esperaba que la instrucción visual fuera la última frase: se actualizó para comprobar que el cierre protege las reglas aprobadas.

Persisten avisos de prueba ya existentes sobre claves de React, mocks de configuración y deprecación de consultas PostgreSQL; no se debilitaron aserciones ni se aumentaron timeouts para obtener los resultados anteriores.

## Límites y siguiente revisión

Cero hallazgos no certifica coherencia universal. El comprobador reconoce formulaciones numéricas concretas en español; no comprende cualquier paráfrasis, no hace OCR, no compara la imagen píxel a píxel y no verifica campos, menús o permisos funcionales. Los plazos detectados son avisos precisamente porque pueden requerir interpretación. No se implementó un ciclo autónomo de reparaciones ni una edición silenciosa del HTML.

Los modelos aprobados para la prueba siguen siendo mínimos, con identificadores como datos de captura. Inicio muestra secciones para ambos actores y algunas pantallas muestran simultáneamente confirmación y resultado ilustrativo; requiere revisión de UX y permisos por rol antes de considerar el diseño final. La redacción de devolución también debe distinguir con claridad el préstamo que deja de computar del libro liberado. Las fechas e identificadores dibujados son ilustraciones, no registros reales ni evidencia de ejecución.

No se aprobaron los bocetos. No se verificaron móvil, autenticación real de navegador, interacción E2E, código generado ni sandbox de construcción. El siguiente paso es revisar el conjunto con el usuario y resolver los datos mínimos del diseño antes del Design Gate.
