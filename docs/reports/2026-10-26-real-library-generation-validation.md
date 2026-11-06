# Evaluación por etapas de generación real: biblioteca de aula

Continuación posterior: `2026-10-26-mockup-fidelity.md` documenta el contraste del HTML original, la regeneración de cinco pantallas y tres refinamientos reales. La versión final de bocetos permanece sin aprobar; los defectos iniciales documentados aquí se conservan como evidencia histórica.

## Estado

Evaluación en curso. Contexto, cinco requisitos, cuatro casos de uso, modelo de datos conceptual, clases, navegación, arquitecturas, plano de interfaz de prueba y tema revisados y aprobados expresamente por el usuario. La aprobación de modelos y pantallas mínimos no equivale a aprobar una UX final ni un proyecto ejecutable.

La evaluación inicial no modificó código. Posteriormente el usuario autorizó las correcciones en `develop`, sin commits, documentadas en `2026-10-26-coherence-corrections.md`. La base inicial es `d9ce553388e6bb5ccd8d219cedd8a0f64d78db59`; la continuación usa una copia externa de los cambios sin confirmar, registrada en `product-fixes-files-20261026.json` y `product-fixes-20261026.patch`. Las evidencias originales se conservan.

## Entorno y evidencia

- Proyecto de prueba: `ede757d7-abbf-4a12-8cb8-4e50093e017b`, Biblioteca de aula — generación real.
- Base exclusiva: `coherence_real_test`, con 65 migraciones, en el contenedor de validación `caseflow-coherence-validation-20261025`. El puerto local cambió al reiniciarlo; para esta ejecución fue `61528`.
- Proveedor real: `chatgpt`; modelo configurado y registrado: `gpt-6.1-sol`. El usuario inició sesión en el intermediario local. No se copiaron credenciales a los informes.
- NestJS, Prisma y servicios del dominio reales; API invocada mediante Supertest. Autenticación de prueba y adaptadores de almacenamiento, renderizado externo y sandbox sustituidos por el soporte de integración. No es una prueba de navegador ni de autenticación real.
- Evidencia externa: `C:\Documentos\Documentos\Universidad UTA\Ingenieria De Software\Semestre 7\DAS\CASEFlow-Validacion-Flujo\20261025-11e50922b33343758da8cc0586909cda`.
- Archivos: `real-state.json`, `real-context-candidate.json`, `real-current-requirements-candidates.json`, informes Vitest `real-*-run.json` y harness `apps/api/test/integration/real-flow-audit.integration.spec.ts`. El estado conserva respuestas, referencias, tiempos y registros AIRun. No contiene cabeceras de autorización.

Las adaptaciones del ensayo están exclusivamente en esa copia externa. Se conservan los intentos fallidos: primero se utilizó un puerto anterior del contenedor y después el soporte de integración desactivó el proveedor. Este último intento produjo `AI_NOT_CONFIGURED`, sin inferencia externa. Se habilitó ChatGPT únicamente dentro del ensayo especializado. Durante ese reintento se registraron dos fuentes idénticas en el mismo proyecto sintético; ambas contienen exactamente el corpus indicado abajo. Esto no equivale a evaluar dos fuentes independientes ni sus contradicciones.

## Fuente

> Proyecto ficticio de biblioteca de aula. El encargado registra libros, registra préstamos y registra devoluciones. El estudiante consulta únicamente sus préstamos. No se presta un libro que ya tenga un préstamo activo. Cada estudiante puede tener como máximo tres préstamos activos. Cada alta y devolución conserva un evento de auditoría con actor y fecha durante 365 días. No incluye pagos ni reservas.

Se suministró solamente esta fuente, sin una solución esperada. No se añadieron informes manuales para guiar la generación del contexto.

## Contexto

- Prompt `project-context.generate@5`.
- AIRun `ddf7e800-7048-4080-a331-0536ceb11a0a`: `SUCCEEDED`.
- Tiempo HTTP: 19 986 ms.
- Candidato `24a00b55-1339-4a7f-a895-e693f61704f1`.
- Versión registrada tras la aprobación humana: `20d5fcac-e362-46ff-88dd-70ca7b83e933`.

La revisión encontró los dos actores y sus responsabilidades, las cuatro funciones explícitas, auditoría, prohibición de doble préstamo activo, máximo de tres préstamos y exclusiones de pagos/reservas. No se detectaron omisiones relevantes. La auditoría de 365 días se clasificó como regla de negocio, no como restricción; se conservó literalmente su compromiso y posteriormente dio lugar a un RNF.

Se guardó mediante el formulario/API normal de contexto, que registra origen `MANUAL`; su procedencia real se conserva en el candidato y AIRun de esta evidencia. No se debe interpretar ese campo de origen como prueba de que el texto fue redactado manualmente.

## Requisitos actuales

Se ejecutaron dos recorridos, conservados por separado:

1. El endpoint síncrono heredado `requirements/generate` utiliza `requirements.generate@3`: produjo ocho requisitos derivados y tres sugerencias opcionales. No se aceptaron esos candidatos.
2. El recorrido utilizado por la interfaz, `requirements/generation-jobs`, usa generación por lotes `requirements.generate@6` y `requirements.dependencies@1`. Este es el resultado seleccionado para continuar.

Trabajo actual: `f69c8aa4-3ec2-4f88-a180-f1f0fee423af`, estado `COMPLETED`, tres lotes terminados. Generación `40d1d570-eaa3-420c-977f-163a448eaeff`. Tiempo hasta recuperar el resultado: **58 540 ms**. Los tres AIRun del recorrido actual terminaron `SUCCEEDED`.

| Candidato | Tipo         | Contenido revisado                                                                                                                | Contexto        |
| --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| B1-C1     | Funcional    | El encargado registra libros.                                                                                                     | N-1             |
| B1-C2     | Funcional    | Registra préstamos únicamente con libro disponible y menos de tres activos; el rechazo no crea préstamo ni altera los existentes. | N-2, RN-2, RN-3 |
| B1-C3     | Funcional    | Registra devolución, libera el libro y deja de contar el préstamo como activo.                                                    | N-3             |
| B1-C4     | Funcional    | El estudiante identificado consulta únicamente sus préstamos; no accede a los ajenos.                                             | N-4, RN-1       |
| B1-C5     | No funcional | Cada alta/devolución tiene evento con actor y fecha, conservado al menos 365 días desde la operación.                             | N-5, RN-4       |

Se revisaron también precondiciones, postcondiciones y dependencias. La cobertura reportada no contiene elementos sin cubrir: cinco necesidades y cuatro reglas. No aparecen pagos, reservas ni sugerencias adicionales en la generación actual. Los cinco candidatos tienen `qualityFindings=[]`; esta ausencia de hallazgos automáticos no sustituye la revisión semántica realizada.

Observaciones para etapas posteriores: «alta» conserva la ambigüedad de la fuente y debe concretarse al diseñar los eventos. La generación del evento y su conservación están agrupadas en un RNF; el caso de uso y la arquitectura deberán atender ambas partes, sin asumir que la clasificación RNF significa que no hay comportamiento que implementar. La identificación del estudiante es una necesidad derivada de la consulta propia, pero no justifica inventar un mecanismo concreto de autenticación.

El usuario aprobó expresamente los cinco candidatos para continuar. Esto autoriza su aceptación y revisión/aprobación en este proyecto ficticio; no constituye validación del software generado ni de artefactos posteriores.

## Casos de uso reales

Los cinco requisitos se aceptaron y aprobaron mediante sus transiciones normales, después de la aprobación explícita del usuario. La cobertura aprobada conserva los nueve elementos del contexto.

Se usó `use-cases/generation-jobs`, trabajo `0546c145-b5f0-4a3e-9f0d-ef6bd185d241`, generación `e0f6313a-838c-4ca2-8585-420272f30826`. Terminó `COMPLETED`, con un lote. AIRun `7035a9f7-7d81-445b-9e59-e9b0221ed03b`, prompt `use-cases.generate@4`, estado `SUCCEEDED`, latencia del proveedor 52 325 ms, 3 072 tokens registrados; tiempo del recorrido con sondeo 53 151 ms.

| Caso                        | Comprobación semántica                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrar libro             | Encargado; registra libro y evento con actor/fecha y conservación de 365 días.                                                                  |
| Registrar préstamo          | Encargado; comprueba disponibilidad y menos de tres activos; dos alternativas de rechazo sin alterar préstamos; registra auditoría en el éxito. |
| Registrar devolución        | Encargado; cierra préstamo, libera libro y reduce el cómputo de activos; registra auditoría y su conservación.                                  |
| Consultar préstamos propios | Estudiante identificado; filtra exclusivamente por su identidad; resultado vacío y denegación de acceso ajeno como alternativas.                |

No se detectaron contradicciones en esos comportamientos ni incorporación de pagos/reservas. La interpretación de «alta» abarca libro y préstamo: es razonable, pero la fuente no lo desambigua y no debe presentarse como una decisión explícita original.

**Hueco de trazabilidad:** los casos de alta y devolución incluyen auditoría en sus flujos/postcondiciones, pero sus `sources` enlazan únicamente el RF correspondiente. Ninguno incluye la versión RNF de auditoría `7a5a072a-9dc7-4d0b-9012-5d7d03b112d9`. El RNF sí estaba entre las cinco versiones de entrada del trabajo. Esto demuestra conservación textual del compromiso, pero no trazabilidad explícita completa de ese compromiso en los candidatos. No se corrigieron los vínculos del resultado original. Se solicitó al usuario revisar/aprobar con esta observación antes de avanzar.

El ensayo de casos de uso finalizó con 1 prueba aprobada y 0 fallidas. El resultado completo se conserva en `real-state.json`; aprobar la prueba solo confirma que se generaron y recuperaron candidatos, no que la trazabilidad sea completa.

## Aprobación de casos y renderizado real del diagrama

El usuario aprobó expresamente los cuatro casos con la observación de trazabilidad. Se aceptaron mediante la API y se realizaron las transiciones normales a revisión y aprobación. No se añadieron vínculos al RNF para disimular el hueco detectado.

Se generó la fuente canónica del diagrama de casos de uso desde sus cuatro versiones aprobadas: `DIA-001`, versión `35cc5cbd-22c0-4ffb-88d0-15334680c0b8`. La API del ensayo sigue usando un renderizador sustituido: su SVG almacenado de prueba **no** sirve como evidencia gráfica.

Para comprobar el renderizado real, se envió esa misma fuente PlantUML, sin modificaciones, al Kroki local ya existente en `127.0.0.1:8000`. Respuestas: SVG HTTP 200, 6 751 bytes, 529 ms; PNG HTTP 200, 24 504 bytes, 60 ms. Archivos externos: `real-use-case-diagram.svg`, `real-use-case-diagram.png`, `real-use-case-render.json`.

Se inspeccionó visualmente el PNG: el Encargado está asociado a registrar libro, préstamo y devolución; el Estudiante, únicamente a consultar préstamos propios. No se muestran pagos/reservas ni actores ajenos. La representación es legible. Este tipo de diagrama muestra asociaciones, no las condiciones detalladas del máximo de tres préstamos ni la retención de auditoría: esas reglas se comprobaron en los flujos y deberán comprobarse en los modelos/diseño posteriores.

## Modelo de datos real: candidato conceptual

Trabajo `39622873-206a-44e4-a539-7fdbf992d12a`, estado `COMPLETED`, dos lotes; generación `9e147e5f-4e49-40f9-9e27-2fff459161f2`, candidato `8c2ee396-bcf3-4018-a437-a65f831acd93`. El recorrido tardó **84 146 ms**. Se registraron dos inferencias satisfactorias: `data-model.generate@3` (21 539 ms) y `data-model.detail@1` (61 861 ms).

El resultado es un ER titulado «Modelo conceptual de gestión de préstamos de biblioteca». Entidades: Libro, Préstamo, Estudiante, Encargado, Devolución y Evento de auditoría. Tiene siete relaciones: libro/préstamo, estudiante/préstamo, préstamo/devolución, encargado/evento y evento con cada uno de los tres tipos de operación. Las nueve versiones aprobadas de requisitos y casos aparecen como fuentes de la generación.

Hallazgos de la revisión:

- Representa un préstamo de un libro a un estudiante; devolución opcional y única por préstamo. Conserva el estado activo y la identidad del estudiante para la consulta propia.
- Conserva explícitamente en descripciones el bloqueo de doble préstamo activo y el máximo de tres por estudiante. No confunde la cardinalidad histórica de varios préstamos con el límite de activos.
- Auditoría contiene tipo de operación y fecha/hora, y se vincula al encargado. Describe conservar el evento y su asociación al menos 365 días.
- La exclusión entre los destinos del evento y la coherencia entre `activo` y devolución están escritas en descripciones. El contrato no las representa como restricciones ejecutables. Por tanto, no están garantizadas por el ER ni por aprobarlo.
- Libro, Estudiante, Encargado y Devolución tienen únicamente identificador; Préstamo añade `activo`. No se inventaron títulos, nombres ni fechas de préstamo que la fuente no especifica. Esta prudencia limita el valor práctico: el modelo es conceptual y muy mínimo, no una especificación suficiente de una aplicación útil. Antes de construcción habrá que decidir datos de captura e identificación visibles para el usuario.
- Los nombres de dominio son españoles y algunos atributos contienen espacios. El renderizador los normaliza al representar Mermaid; eso no demuestra que ya exista un mapeo correcto a identificadores técnicos ingleses del proyecto generado.

Se generó una vista previa sin aceptar ni aprobar el candidato. `DiagramEngine` produjo Mermaid del candidato sin alterarlo y Kroki local devolvió SVG/PNG mediante el proveedor `kroki@0.32.1`. Renderizado conjunto: 2 090 ms; SVG 68 988 bytes; PNG 72 585 bytes. Se inspeccionó el PNG: contiene las seis entidades, los atributos y las asociaciones esperadas. Los compromisos que solo están en descripciones no aparecen como restricciones ejecutables en la imagen.

Evidencias externas: `real-data-model-candidates.json`, `real-data-model-diagram.mmd`, `real-data-model-diagram.svg`, `real-data-model-diagram.png`, `real-data-model-render.json`, `real-data-model-run.json`, `real-data-model-render-run.json`. Ambas pruebas terminaron con 1 aprobada y 0 fallidas. Se solicitó aprobación humana del modelo **como conceptual**, exponiendo las limitaciones anteriores. No se debe registrar como aprobado hasta recibirla.

## Continuación tras las correcciones

El usuario aprobó expresamente el modelo como conceptual y se incorporó como MD-001, versión `c5845c80-7611-4d2e-be50-de081ab3c7d2`. Las preguntas sobre datos mínimos siguen siendo relevantes; no se añadieron campos silenciosamente.

### Clases y navegación

El trabajo de clases `e95619f8-ff8b-49a7-9337-4159fdfb9f92` terminó `COMPLETED` en 66 784 ms. Generación `82a2a14b-5cc5-4377-8fcb-f41e8f8b77f8`: seis clases correspondientes a las entidades y una enumeración de tipos de operación. Conserva las relaciones históricas y descripciones de máximo de tres activos, disponibilidad, consulta propia y retención. Las clases pertinentes citan RNF-001. Métodos y tipos españoles son conceptuales: no constituyen TypeScript ejecutable ni certifican su posterior traducción al TargetTemplate.

La generación de navegación `3f434cb9-4331-4a16-828a-dfa95d95edec` tiene seis nodos: Inicio, sección del Encargado, tres formularios de registro y listado de préstamos propios. Conserva las condiciones y el RNF de las operaciones auditadas. El usuario aprobó clases y navegación mediante revisiones separadas.

Se renderizaron e inspeccionaron sus imágenes reales con Kroki. Archivos `real-class-diagram.*`, `real-class-render.json`, `real-navigation-diagram.*`. La navegación representa estructura; no garantiza por sí sola autorización de rutas o controles.

### Arquitecturas

| Generación                                      | Resultado                                                       | Tiempo del proveedor |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| Software `80975f69-0d97-4436-8a72-3f509b1db0bb` | Ocho componentes en Presentación, Aplicación e Infraestructura. | 61 444 ms            |
| Sistema `30af403f-0c1b-486c-b4aa-a2c0f2c12ad7`  | Cliente, aplicación y persistencia de biblioteca/auditoría.     | 32 695 ms            |

Ambas usan prompts `@3`, modelo `gpt-6.1-sol` y AIRun satisfactorios. El diseño mantiene la restricción de acceso por identidad, el límite de activos, el bloqueo por disponibilidad y la retención de 365 días con referencias RNF. Software distingue hechos de propuestas, incluyendo operaciones transaccionales y control de concurrencia. Sistema declara que tecnologías y protocolos no estaban especificados: sigue siendo arquitectura conceptual, no un despliegue final.

El usuario aprobó ambas con esa limitación. Se incorporaron y aprobaron sin editar su contenido. Las vistas previas reales se renderizaron con Kroki e inspeccionaron: `real-software-architecture-diagram.*`, `real-system-architecture-diagram.*`, `real-design-render.json`. Se comprueba renderizado y correspondencia con el contenido; las notas y flechas no demuestran que el código aplique las reglas.

### Regresión real de trazabilidad RNF

La nueva generación `6243e97a-cabd-4fdb-a345-0cd4a5ad53df` usa `use-cases.generate@5`, AIRun satisfactorio, 58 697 ms de proveedor y 59 812 ms con sondeo. Los candidatos Registrar libro, Registrar préstamo y Registrar devolución citan la versión RNF `7a5a072a-9dc7-4d0b-9012-5d7d03b112d9`, además de su RF. Consultar préstamos propios cita únicamente su RF. Los flujos mantienen las condiciones.

Esto confirma el comportamiento nuevo con el proveedor real, además de las pruebas deterministas del ensamblador. Se conservan estos candidatos sin incorporarlos para no duplicar los cuatro casos originales ni alterar aprobaciones previas. El proyecto evaluado conserva sus casos originales aprobados con observación.

### Plano de interfaz y tema

Trabajo `4e481308-3b9f-4abe-a577-aec31db16ab2`, generación `aafbffbc-acc2-4e4c-98e8-7232decbf366`, estado `COMPLETED`, 58 795 ms con sondeo. Cinco pantallas cubren los cinco nodos navegables y los cuatro casos de uso:

- Inicio de biblioteca distingue acciones por actor.
- Registro de libro conserva auditoría automática.
- Registro de préstamo muestra las dos condiciones y los dos rechazos sin alterar préstamos.
- Devolución localiza el préstamo activo, pide confirmación, libera el libro y excluye el préstamo del cómputo.
- Consulta propia obtiene identidad no editable del estudiante, contempla resultado vacío y denegación sin exponer datos ajenos.

El modelo mínimo condiciona la UX: se introducen identificadores y no hay títulos o nombres descriptivos. La generación reporta `UNCOVERED_SOURCE` para referencias locales no citadas de NAV-001, ARQ-001 y SARQ-001; esas versiones están conservadas entre las ocho fuentes de generación, y los nodos se enlazan mediante `navigationNodeLocalId`. El aviso se comunicó y no se ocultó.

El usuario aprobó el plano **para evaluar bocetos**, sin considerarlo UX final. Posteriormente eligió y aprobó «Azul académico», de tres temas reales generados, con modo claro y oscuro. La API aplicó su validación de contraste al aprobarlo. No se modificaron los colores para forzar aceptación.

### Primer intento de bocetos: límite del entorno de ensayo

El trabajo `9ee984db-c805-4c21-b924-1e5d2862e579` terminó `COMPLETED` usando `INTERNAL_WIREFRAME`, cero pantallas externas y cinco previstas. Su aviso registró que Stitch no había generado ninguna pantalla y se creó el esquema interno. No se aprobó ese boceto.

Se investigó el fallo antes de atribuirlo al proveedor: una prueba de carga del SDK dentro de Vitest produjo `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`; la importación del SDK en Node normal funcionó. Por tanto, **ese intento no demuestra indisponibilidad del servicio de Stitch**. Se conservan `stitch-loader-probe.json`, `real-state-before-native-mockups.json`, `real-mockups-run.json` y `real-mockup-internal.svg`.

Se preparó una repetición que ejecuta el proveedor compilado de producción en un proceso Node normal, con operaciones acotadas de creación de proyecto/generación de pantalla. El ensayo transmite resultados al servicio de bocetos mediante su interfaz de proveedor, sin sustituir el SDK ni simular sus respuestas. Credenciales solo en el entorno del proceso. Los objetos se guardan mediante `FilesystemStorageProvider` en `real-assets`, fuera del almacenamiento del usuario. Esta adaptación afecta exclusivamente al ensayo externo.

## Límites

Esta evaluación incluye inferencias reales por etapas, renderizado de diagramas y cinco bocetos externos inspeccionados. No certifica frontend funcional, generación de código ni ejecución del proyecto resultante. No se modifican candidatos silenciosamente para mejorar una puntuación. Las nuevas etapas deben conservar su evidencia y pasar revisión antes de la aprobación correspondiente. No se ejecutó la variante móvil.

## Resultado final de Stitch e inspección visual

Las repeticiones nativas revelaron defectos reales de descarga: añadir `=w1600` a rutas REST provocaba 404 y descargar recursos oficiales sin autenticación provocaba 401. Tras corregirlos, el HTTP 200 contenía un sobre JSON con `dataString` e `imageMetadata`, en lugar de bytes de imagen directos. El proveedor ahora limita el redimensionado a los hosts de imágenes compatibles, autentica exclusivamente el origen HTTPS oficial y valida/decodifica ese sobre con límites de tamaño y comprobación de firma. Recalcula la autenticación en cada redirección para no transmitir la clave a otros orígenes. Las ejecuciones fallidas y sus resultados internos se conservan por separado.

Con esas correcciones, el trabajo `f589f12b-f727-4310-9c35-317d0c033cb2` terminó `COMPLETED`, generador `STITCH`, cinco pantallas de cinco, sin mensaje de error. Inicio: `2026-10-26T23:41:24.476Z`; final: `2026-10-26T23:44:16.609Z`; tiempo observado con sondeo: **172 692 ms**. Se descargaron cinco PNG y cinco HTML mediante el almacenamiento aislado, sin ejecutar el HTML.

| Pantalla                      | PNG (bytes) | HTML (bytes) |
| ----------------------------- | ----------: | -----------: |
| Inicio de biblioteca          |     464 556 |       31 190 |
| Consulta de préstamos propios |     569 654 |       18 665 |
| Registro de devolución        |     424 883 |       19 270 |
| Registro de libro             |     383 536 |       20 540 |
| Registro de préstamo          |     568 861 |       26 146 |

Las cinco imágenes tienen 2 560 píxeles de ancho y texto legible. Se inspeccionaron individualmente. **El éxito de descarga y la cobertura de pantallas no implican coherencia semántica del boceto:**

- Inicio introduce una contradicción explícita: «Préstamo máximo: 2 ejemplares por estudiante», cuando el requisito aprobado establece tres. Las pantallas de préstamo y consulta sí representan tres.
- Se inventan condiciones de circulación: siete días lectivos en Inicio, quince días naturales en Devolución y quince días lectivos en Préstamo. La fuente no establece un plazo. Inicio añade renovación, sanciones y normas de marcapáginas que tampoco fueron aprobadas.
- Registro de libro añade un formato obligatorio `LIB-` seguido de cuatro dígitos, ubicación y categoría. Préstamo añade ISBN, curso y expediente. Son ampliaciones del modelo mínimo aprobado, no decisiones justificadas por las fuentes. Los nombres, títulos, fechas y cifras visibles son datos ilustrativos del render, no registros del proyecto.
- La consulta representa identidad no editable y acceso propio. Devolución y las altas muestran auditoría de 365 días, actor y fecha. Préstamo representa disponibilidad y máximo de tres. Son correspondencias visuales; no prueban controles de autorización ni reglas ejecutables.
- Algunos resultados de éxito, carga y error aparecen simultáneamente como ejemplos de estados. Esto requiere revisión de UX antes de tratar el HTML como una interfaz final.

**Dictamen:** generación externa y descarga verificadas; fidelidad semántica insuficiente para aprobar el conjunto. Los cinco bocetos permanecen sin aprobar. No se congeló una Design Baseline ni se inició construcción. La corrección futura debe impedir reglas inventadas y contrastar el resultado visual con el plano y los compromisos aprobados; las comprobaciones estructuradas actuales no inspeccionan automáticamente el texto rasterizado. No se sustituyó el boceto defectuoso por uno editado para ocultar el hallazgo.

Evidencia externa: `real-mockups-native-run.json`, `real-state.json`, `native-stitch-results.jsonl`, `native-stitch-downloads.jsonl`, `real-mockup-screen-1.png` a `real-mockup-screen-5.png` y sus HTML. Se conservan las capturas de estado anteriores a cada corrección. Las credenciales no se incluyen en el reporte.
