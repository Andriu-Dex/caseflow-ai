# Consolidación de correcciones y versión de trabajo integrada

Fecha: 2026-11-08. Rama: `feat/construction-working-copy`, creada desde `develop`. Sin commit, push o merge.

## Resultado

Las correcciones evaluadas de ventas e inventario quedaron integradas en una nueva versión de trabajo de RestGuestMateos, persistida en CASEFlow. Ya no dependen únicamente de archivos temporales para recuperarlas. La base conserva quince acciones implementadas y dieciséis acciones pendientes; no se presenta como software terminado.

| Registro                   | Identificador o resultado                   |
| -------------------------- | ------------------------------------------- |
| Proyecto                   | `4584e81d-42f3-4501-b0c8-58bac5f7253c`      |
| Plan aprobado conservado   | v14, `6cb0e78a-2af0-40b5-ac18-6e9aa919bc9a` |
| Baseline conservado        | `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`      |
| Nueva corrida              | `a118b9a7-ae5a-4bb2-b903-389496c34413`      |
| Estado                     | `WORKING_COPY`                              |
| Archivos persistidos       | 334                                         |
| Acciones integradas        | 15                                          |
| Acciones pendientes        | 16                                          |
| Nuevos snapshots oficiales | Ninguno                                     |

Se comprobó que la lista de snapshots históricos del proyecto permaneció intacta. No se modificaron el plan aprobado, sus fuentes ni las versiones de los artefactos. Los contenedores de evaluación utilizaron cuentas y bases desechables; la persistencia de la versión de trabajo se realizó en el proyecto autorizado de CASEFlow.

## Implementación reutilizable en CASEFlow

Se añadió el estado terminal `WORKING_COPY` y el contrato `createWorkingCopyRequestSchema`. La ruta `POST /projects/{projectId}/generation-runs/working-copies` permite consolidar checkpoints y revisiones explícitas de cuerpos de acciones sin solicitar nuevas inferencias.

Cada revisión identifica la acción del plan, el checkpoint original, su hash esperado y el cuerpo corregido. Se verifica permiso de generación, pertenencia al workspace/proyecto, plan y baseline aprobados, plantilla, procedencia y hash del archivo. Se rechazan acciones ajenas, desactivadas o repetidas y cuerpos que incumplen la revisión estática existente. La comprobación del origen no sustituye la validación funcional del nuevo código.

Las revisiones se guardan como nuevos checkpoints, conservando los originales. La nueva corrida conserva archivos generados, trazabilidad al plan y un manifiesto `docs/working-copy.json` con motivo, procedencia, hashes y listas de acciones implementadas y pendientes. La auditoría registra inicio y finalización. Los fallos de integración mantienen un estado fallido y no publican una entrega.

La recuperación de checkpoints compatibles ahora tiene orden explícito: primero la corrida más reciente y después un desempate estable por identificador. Esto evita recuperar de forma indeterminada una propuesta anterior a una corrección consolidada. Se mantienen las claves de compatibilidad basadas en contexto, plantilla y versión del prompt; un cambio material del contexto no recibe automáticamente una implementación antigua.

La modalidad de consolidación utiliza exclusivamente caché y revisiones suministradas. Las acciones ausentes conservan 501 y aparecen en el manifiesto y advertencias. No se ejecuta código generado en el proceso principal.

## Interfaz y publicación

Inicio y Preparación muestran «Análisis y diseño completos» cuando se satisfacen sus etapas. Una explicación y un enlace separan ese avance del estado de construcción y validación. No se cambió el significado del contrato de preparación ni se alteraron los datos aprobados para cambiar la etiqueta.

La vista Generación de código añade «Preparar versión de trabajo», identifica las copias como incompletas y permite consultar sus archivos. Su estado no habilita el control de validación oficial ni la descarga de un ZIP oficial.

Se comprobó contra la corrida persistida que `SandboxRunsService.start` rechaza esta copia con 422. La regla existente sigue exigiendo `GENERATED` para iniciar ese flujo. Tampoco se creó un manual o snapshot nuevo. La generación oficial futura deberá completar las acciones restantes, aplicar la adaptación de diseño y superar todos los controles; no existe una promoción directa de `WORKING_COPY` a `READY`.

La copia utiliza el renderizador interno con el tema congelado. Es una base reproducible para implementar y evaluar; no constituye una certificación de fidelidad visual respecto de los bocetos.

## Integración del proyecto real

Se recuperaron los cuerpos de las copias evaluadas mediante AST y se vincularon las quince revisiones a checkpoints originales del mismo proyecto y baseline. Los hashes de esos originales se verificaron antes de persistir la nueva corrida. Se consolidaron tanto los cuerpos de ventas reparados como los de inventario, incluida la corrección del alcance de sucursal dentro de la transacción de mínimos y la normalización de identificadores.

La integración utilizó el nuevo servicio con un proveedor que rechaza cualquier llamada externa y una cola que rechaza cualquier encolado. Terminó sin recurrir a ninguno. No se gastó cuota para volver a generar estas acciones.

Después se leyeron los archivos de la corrida desde la base y se ejecutaron en Docker. Las pruebas no utilizaron como entrada únicamente la copia temporal anterior. El resultado pasó los cinco controles técnicos y repitió:

- 35 comprobaciones HTTP de entradas de inventario.
- 45 comprobaciones HTTP de salidas, mermas, ajustes y mínimos.
- 35 regresiones HTTP de ventas.
- Flujos de navegador de entradas, salidas, mermas, ajustes y establecimiento/modificación de mínimos, sin errores de página.

Las comprobaciones incluyen cantidades exactas, conversiones, saldo no negativo, revisión obsoleta, competencia por la última unidad, reintentos idempotentes, permisos, aislamiento de sucursales, auditoría y conservación de ventas históricas. El fallo de auditoría inducido en la base desechable sigue siendo una prueba de reversión esperada, no un fallo ordinario ocultado.

## Migración y validación

La migración `20261108000000_construction_working_copy` agrega un valor al enum de corridas. La migración posterior `20261108010000_working_copy_lifecycle` incluye ese estado en la protección de inmutabilidad de corridas terminadas; únicamente permite cambiar su visibilidad de archivo. Ambas se aplicaron con `prisma migrate deploy`, sin reset, `db push`, reescritura de migraciones anteriores o eliminación de información. No se añadieron dependencias ni se modificaron variables de entorno.

Verificaciones realizadas:

- Pruebas nuevas de consolidación: permisos, proyecto/baseline, hashes, acciones desconocidas y duplicadas, revisión estática, fallos, manifiesto, ausencia de inferencias y conservación de checkpoints.
- Integración HTTP de construcción: creación de copia, inmutabilidad de corrida y archivos, rechazo de publicación y reutilización de la corrección en una generación posterior sin inferencias.
- Suite web completa: 327 pruebas correctas.
- Suite completa de integración, tras actualizar los fixtures: 344 pruebas correctas y 2 omisiones existentes.
- Cobertura: 1043 pruebas correctas y 3 omisiones existentes; líneas 77.85%, ramas 74.74%, por encima de los mínimos del repositorio.
- Lint, typecheck y build del repositorio.
- Instalación, lint, tipos, pruebas y build del proyecto integrado dentro de Docker.
- Generación OpenAPI sin iniciar servicios externos.
- Validación Prisma y comprobaciones de formato/diff.

La primera ejecución de cobertura tuvo un timeout en la prueba de OCR de PDF escaneado mientras se ejecutaban otras validaciones. Se repitió con `--maxWorkers=2`, conservando las pruebas, sus límites y los umbrales de cobertura; la suite completa pasó. No se cambió producción ni se amplió el timeout para ocultar esa ejecución.

La primera suite amplia de integración encontró dos fixtures desactualizados. La de casos de uso esperaba descartar el RNF compartido expresamente citado; ahora exige exactamente el vínculo al RF correspondiente y al RNF, coherente con la implementación y las pruebas unitarias vigentes. La del manual intentaba generar código con el proveedor deshabilitado; ahora declara el proveedor falso determinista utilizado por las demás pruebas de construcción y comprueba el estado generado antes de solicitar validación. Estos ajustes pertenecen a las pruebas; no se retiraron controles de publicación o trazabilidad del producto. Ambas suites dirigidas pasaron sus diez pruebas, y construcción pasó sus seis pruebas, incluida la nueva integración HTTP.

La [evidencia estructurada](2026-11-08-integrated-working-copy-validation.json) registra la corrida, procedencia, hashes, manifiesto, etapas y comprobaciones funcionales. La decisión y sus límites quedan documentados en [ADR-018](../decisions/ADR-018-versiones-de-trabajo-de-construccion.md) y en la especificación §221.33.

## Pendientes y límites

Siguen pendientes las dieciséis acciones de cancelaciones/correcciones de ventas, gastos, catering y reportes. También deben completarse filtros y paginación del historial, alertas y la experiencia general de mínimos, además de revisar todos los roles, dispositivos y fidelidad de la entrega.

Las pruebas descritas no acreditan esos pendientes. La revisión visual del escritorio principal de CASEFlow se cubrió mediante pruebas de componentes; no se realizó una nueva inspección manual de todas sus pantallas. El navegador de Docker sí recorrió los flujos descritos del proyecto integrado.

El siguiente bloque debe partir de esta base persistida y completar cancelaciones/correcciones de ventas, manteniendo las regresiones. La entrega histórica continúa disponible sin sobrescribirse. No se requiere una acción manual del usuario para conservar esta base.
