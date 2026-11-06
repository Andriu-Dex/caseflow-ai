# Correcciones de coherencia y continuación de la evaluación

## Alcance y estado

Implementación en `develop`, sin commits, sin dependencias nuevas y sin cambios de esquema o migraciones. Se corrigieron los puntos detectados en la validación de biblioteca y se continuó la evaluación real en una base exclusiva. No se modificaron proyectos del usuario ni versiones históricas aprobadas.

## Cambios del producto

### Referencias de requisitos no funcionales en casos de uso

La pérdida de trazabilidad tenía dos causas concretas: el prompt vigente prohibía citar los requisitos compartidos y `mergeUseCaseBatch` descartaba sus referencias. Ahora el ensamblador conserva los códigos expresamente citados y rechaza los que no pertenecen a las fuentes suministradas. Se sigue exigiendo al menos un requisito objetivo del lote; un RNF no obliga a crear un caso de uso independiente.

Se registró `use-cases.generate@5`. `@4` y `@3` conservan sus instrucciones históricas. El nuevo prompt pide citar un RNF cuando se incorpora su garantía en condiciones o flujos, sin relacionarlos todos indiscriminadamente. La generación síncrona heredada no se migró a otro prompt como efecto lateral.

### Cobertura del renderizador interno y preparación

La matriz consulta bocetos de artefactos no archivados y versiones aprobadas. Descarta una versión anterior cuando el mismo artefacto ya tiene otra aprobada. El renderizador interno cubre todas las pantallas de la versión exacta del plano que produjo su SVG; un SVG vacío no cuenta. Los resultados externos siguen acreditando cobertura por pantalla.

La preparación incorpora los errores de consistencia a la etapa correspondiente y no declara el proyecto listo mientras existan errores. Un requisito sin caso de uso pendiente se señala en Casos de uso: no hace desaparecer la etapa de requisitos aprobados. Los avisos y observaciones no se convierten indiscriminadamente en bloqueos.

### Comprobaciones explícitas y sus límites

Se añadió la cadena «Compromisos del requisito → comportamiento declarado», separada de la cobertura RNF. Los hallazgos contienen `kind`, `requirementCode`, `expected` y `observed` en el contrato compartido.

- Conservación: comparación determinista de períodos en días y horas, asociados a expresiones reconocidas de conservación/eliminación.
- Máximos: comparación de una cantidad declarada contra otra del mismo término, con números o palabras de uno a diez. No se compara un máximo de personas con uno de documentos.
- Actores: aviso cuando el actor primario no coincide con los actores estructurados del requisito enlazado.
- Consulta propia: aviso ante pasos explícitos que consultan datos de otros propietarios cuando el requisito exige datos propios. Las negaciones y denegaciones reconocidas no se interpretan como permisos.

Las contradicciones numéricas explícitas del diseño bloquean aprobación y congelación en proyectos con coherencia obligatoria. En proyectos anteriores se mantienen como advertencias. Los avisos de actores/alcance requieren revisión y no afirman una vulnerabilidad ejecutable.

**No es un verificador semántico universal.** Los controles de texto son conservadores y acotados a formatos reconocidos en español; varias políticas, términos ambiguos, formulaciones diferentes o medidas no soportadas pueden necesitar revisión manual. No se inferirá cumplimiento porque una referencia exista o porque no se detecte contradicción. La matriz expresa este límite y no etiqueta esas comprobaciones como certificación. Las pruebas del software generado siguen siendo necesarias.

### Decisiones pendientes en modelos mínimos

Una revisión estructural compartida identifica entidades con únicamente claves/identificadores. Las preguntas aparecen en los candidatos antes de incorporarlos, en los modelos y en consistencia/preparación. Piden decidir datos de captura y reconocimiento o conservar deliberadamente un modelo conceptual mínimo. No inventan títulos, nombres ni otros atributos; no rechazan una entidad conceptual válida.

La especificación, §221.17, documenta el comportamiento. Se reutilizaron contratos, servicios, pantallas y mecanismos de revisión existentes.

### Descargas reales de Stitch: fallo adicional encontrado durante la evaluación

La evaluación nativa llegó a crear el proyecto externo, pero fallaron las descargas: se observaron respuestas 401 y 404 en `stitch.googleapis.com`. El código aplicaba el sufijo FIFE de tamaño a cualquier URL y descargaba recursos REST sin autenticación.

Se limita el ajuste de resolución a los hosts FIFE reconocidos `lh3`–`lh6.googleusercontent.com`. Las URLs REST y de otros orígenes se conservan. Solo el origen HTTPS exacto `stitch.googleapis.com` recibe `x-goog-api-key`. Las redirecciones se siguen manualmente con un máximo de tres saltos, validando HTTPS y recalculando cabeceras por destino: la clave nunca se reenvía a un CDN u otro dominio.

La repetición autenticada obtuvo HTTP 200, pero mostró un tercer problema: el servicio devuelve un contenedor JSON con `dataString` e `imageMetadata`, no siempre los bytes directos. Se agregó validación de ese formato con Zod exclusivamente para el origen oficial, decodificación de imagen base64 con comprobación de firma PNG/JPEG/WebP y de HTML textual o base64. Se mantienen límites de tamaño y el rechazo de JSON de otros orígenes, tipos desconocidos o imágenes con contenido incompatible.

Las 15 pruebas del proveedor pasan, incluidas regresiones de URLs REST, clave limitada al origen oficial, redirección a otro dominio, destino inseguro, bucle y contenedores de imagen/HTML. La API compiló con esta corrección. La repetición real posterior se conserva aparte: pasar las pruebas de descarga simulada no demuestra por sí solo que el servicio externo entregue correctamente los cinco bocetos.

## Verificación

| Comprobación ejecutada                                | Resultado                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                           | Aprobada.                                                                                                                                  |
| `pnpm typecheck`                                      | Aprobada en el workspace.                                                                                                                  |
| `pnpm build`                                          | Aprobada, API/worker/desktop y web; 32 páginas estáticas.                                                                                  |
| `pnpm format:check`                                   | Aprobada.                                                                                                                                  |
| `pnpm test -- --reporter=dot`                         | 931 aprobadas, 3 omitidas por la configuración existente.                                                                                  |
| `pnpm test:coverage -- --reporter=dot --maxWorkers=1` | Ejecución posterior al ajuste de Stitch: 934 aprobadas y 3 omitidas; líneas 75,54 %, ramas 71,03 %, funciones 74,42 %, sentencias 75,03 %. |
| Suite web con `--maxWorkers=2`                        | 316 aprobadas. Tras añadir la cadena de compromisos se volvieron a ejecutar sus pruebas y las del aviso de modelo: 6 aprobadas.            |
| Integración de coherencia y preparación               | 15 pruebas aprobadas, incluido el caso nuevo de aprobación/archivo del boceto interno.                                                     |
| Integración de casos de uso, repetida separadamente   | 7 pruebas aprobadas.                                                                                                                       |
| `git diff --check`                                    | Aprobada durante la revisión.                                                                                                              |

Las integraciones usan `coherence_fixes_test` en el contenedor exclusivo de validación; sus reinicios de datos no afectan `coherence_real_test` ni las bases del usuario. Se verificó por HTTP el rechazo de reducir conservación de 365 días a un día, la conservación de la aprobación anterior y la separación de requisitos entre proyectos. También se comprobó que un boceto interno en borrador no cuenta, el aprobado sí cuenta y el archivado deja de contar.

Hubo ejecuciones intermedias con timeouts de las suites web, cobertura y casos de uso mientras coexistían tareas pesadas. Se repitieron sin aumentar los timeouts ni debilitar aserciones; los resultados finales indicados arriba son los observados en las repeticiones. No se cambiaron las pruebas de formulario, ZIP u OpenAPI que habían expirado. Se conservan los avisos preexistentes de deprecación de consultas de PostgreSQL, claves de React y mocks de configuración de IA; no se resolvieron como parte de esta tarea.

## Evaluación real posterior

Se conserva en `2026-10-26-real-library-generation-validation.md` y en el directorio externo indicado allí. El usuario aprobó expresamente el modelo como conceptual, las clases, navegación, arquitecturas y plano como diseño de prueba. Los candidatos se incorporaron mediante las APIs normales con las transiciones de revisión/aprobación.

La prueba real de `use-cases.generate@5` produjo cuatro candidatos: los tres casos auditados enlazan la versión RNF, y el de consulta propia no recibe ese enlace injustificadamente. La nueva generación se conserva como evidencia sin incorporarla encima de los casos originales: no se crean duplicados ni se reescribe la historia.

Las arquitecturas mantienen las garantías; el plano conserva los actores y sus flujos, pero sigue siendo mínimo por la falta de datos descriptivos del modelo y presenta avisos de referencias locales no citadas. Aprobarlo para evaluar bocetos no significa que la UX esté finalizada ni que el proyecto pueda construirse todavía.

## No verificado

La repetición real de Stitch finalizó con cinco pantallas externas de cinco en 172 692 ms y permitió descargar los cinco PNG y HTML. La revisión visual encontró una contradicción de máximo de préstamos (dos en Inicio frente a tres aprobados), plazos inventados y ampliaciones no aprobadas del modelo. Se documentan en el reporte de evaluación real. Los bocetos no se aprobaron: estas correcciones no incorporan un validador semántico del texto rasterizado ni garantizan fidelidad del render externo.

No se ejecutó construcción de código, sandbox real, E2E de navegador, seguridad de una aplicación generada ni la variante móvil. El resultado del proveedor de bocetos y su revisión se registran por separado al finalizar esa etapa. No se ha certificado que cualquier fuente y cualquier formulación de requisito sean coherentes automáticamente.
