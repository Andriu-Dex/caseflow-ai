# Cierre de las doce acciones pendientes de construcción

Fecha de cierre: 2026-11-09, America/Guayaquil. Rama: `feat/construction-working-copy`.

## Resultado

Las doce acciones pendientes de RestGuestMateos quedaron implementadas y evaluadas junto con las diecinueve anteriores. La versión de trabajo conserva **31 acciones implementadas, cero pendientes y 353 archivos persistidos**.

Pasaron los cinco controles del proyecto generado, **290 comprobaciones funcionales**, los recorridos de navegador existentes y los nuevos de reportes, comprobantes y catering. Se comprobó además la selección, asociación y descarga exacta de un comprobante en una ventana móvil de 390 × 844.

La corrida continúa siendo `WORKING_COPY`. No se creó un snapshot ni un ZIP oficial y no se certificó la equivalencia visual con todos los bocetos. Cero acciones personalizadas pendientes no equivale a certificar todos los requisitos, pantallas o integraciones del proyecto.

## Acciones completadas

| Acción                                        | Comportamiento comprobado                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /reports/sales`                          | Ventas confirmadas, importes históricos, exclusión de anuladas y borradores, rectificaciones sin duplicar, categorías y cantidades estructuradas de almuerzos/proteínas/extras. |
| `GET /reports/expenses`                       | Gastos confirmados USD por periodo y categoría, con referencias para conciliar sus totales.                                                                                     |
| `GET /reports/inventory`                      | Saldos y mínimos actuales, movimientos por fecha operativa, unidades y responsables; distingue mínimo ausente de cero configurado.                                              |
| `GET /reports/branch-comparison`              | Comparación autorizada de dos sucursales, sin mezclar cantidades de unidades distintas.                                                                                         |
| `GET /reports/catering/costs`                 | Costos reales por imputaciones de gastos confirmados, sin duplicar el gasto compartido ni confundir costos previstos con reales.                                                |
| `GET /reports/:reportid/export/csv`           | Descarga del CSV congelado al consultar, conservando exactamente sus bytes y verificando propietario, sucursal y permisos actuales para ese tipo de reporte.                    |
| `GET /management/indicators`                  | Ventas, gastos, promedio de venta, saldo operativo parcial y alertas actuales, con definiciones y referencias de origen.                                                        |
| `GET /management/stock-alerts`                | Alertas por saldo menor o igual al mínimo, incluida igualdad y mínimo cero.                                                                                                     |
| `GET /management/recommendations`             | Reglas orientativas de reposición, revisión del saldo parcial, configuración de mínimos y ausencia de actividad.                                                                |
| `POST /catering/records/:recordid/transition` | Matriz de estados, revisión esperada, permisos, condiciones, historial, auditoría e idempotencia.                                                                               |
| `GET /catering/history`                       | Transiciones por periodo local y registros asociados, sin multiplicar solicitudes por sus eventos.                                                                              |
| `POST /expenses/:expenseId/receipts`          | Consulta de metadatos, asociación y recuperación privada de PDF/PNG/JPEG; no confirma gastos ni simula procesamiento OCR.                                                       |

## Decisiones versionadas del proyecto

Se conservaron los planes anteriores y se publicaron nuevas versiones mediante el ciclo normal de versión, revisión y aprobación, aplicando las decisiones delegadas por el usuario. La versión final es **v19**, `e1e5eec6-c61d-44d7-9e9d-3bf6738d8028`. El baseline de diseño sigue siendo `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`.

Las versiones intermedias concretaron contratos y persistencia, añadieron cantidades estructuradas a ventas, separaron ese contrato de los demás reportes y completaron permisos de navegación y coherencia entre solicitudes y eventos. No se sobrescribieron versiones aprobadas.

### Reportes, indicadores y exportación

- Periodos operativos inclusivos de hasta 366 días. Las consultas y resultados están acotados; exceder los límites produce un error, no un total truncado.
- Moneda ratificada para este bloque: USD. Un gasto confirmado con datos incompletos o moneda incompatible se rechaza; no se convierte ni se suma silenciosamente.
- Cálculos exactos en centésimas mediante `BigInt`, con redondeo `HALF_UP` cuando corresponde.
- Las ventas anuladas quedan fuera de los totales normales. La venta rectificada confirmada contribuye una sola vez.
- Proteínas y extras utilizan las cantidades persistidas de sus selecciones, sin multiplicarlas otra vez por los almuerzos. Esas cantidades se conservan estructuradas y en los metadatos CSV.
- Un periodo sin ventas o gastos confirmados representa cero medido. Un promedio sin ventas es no aplicable. Los costos de catering sin gastos registrados se presentan como «Sin información».
- Los saldos de inventario y sus mínimos corresponden al instante actual; el periodo filtra movimientos, no reconstruye un saldo histórico inexistente.
- Los gastos compartidos necesitan imputaciones explícitas, positivas y cuya suma no supere el gasto. Un importe no distribuido se utiliza íntegro solo cuando hay un único vínculo.
- El saldo operativo parcial es ventas menos gastos operativos; no se presenta como utilidad neta ni como ingresos de catering.

El resultado exportable conserva su CSV y filtros en un evento de auditoría inmutable. Es evidencia derivada de la consulta, no un reemplazo de las entidades financieras. La descarga posterior no vuelve a calcular datos ni amplía filtros. Cambiar datos después de consultar no cambia ese archivo.

La descarga requiere el propietario original, la sucursal seleccionada y el rol actualmente autorizado para el tipo de reporte. Se probó la pérdida del permiso financiero del propietario después de consultar. Las celdas de texto no confiable se protegen contra fórmulas de hojas de cálculo, conservando los decimales controlados.

### Catering

Las solicitudes inician `RECEIVED`; los eventos, `PLANNED`, con revisión inicial del servidor. La confirmación exige condiciones versionadas; la preparación requiere un plan consistente. Las transiciones de preparación y realización requieren que la solicitud permanezca confirmada.

Se conserva cada transición con estado anterior y nuevo, actor, fecha, motivo y observaciones. La actualización del estado, el historial, la auditoría y la idempotencia forman una transacción. La reapertura requiere Administrador y observaciones. Un evento cancelado no puede pasar directamente a realizado.

Una solicitud no se puede cancelar mientras tenga eventos distintos de cerrados o cancelados. La edición CRUD no permite escribir directamente estado o revisión ni crear entradas de historial ficticias. Los roles operativos pueden acceder a sus pantallas de reportes mediante las opciones autorizadas del servidor.

### Comprobantes

Se ratificó un máximo de un MiB por archivo, con PDF, PNG y JPEG. Se comprueban nombre, tamaño decodificado, base64 canónico, MIME, extensión y firma de contenido. El nombre no admite separadores de rutas ni caracteres de control.

Los metadatos y el contenido privado se conservan por separado en el PostgreSQL del proyecto generado. `ReceiptFile` es un refinamiento físico de Comprobante, sin CRUD público; una referencia de almacenamiento no autoriza su descarga. El acceso se realiza por la acción autorizada del gasto y comprueba también la asociación exacta del comprobante.

Las subidas concurrentes con la misma clave recuperan un único resultado. Un fallo de auditoría revierte metadatos y contenido, sin registros huérfanos. Los adjuntos no modifican importes, estado ni confirmación del gasto. La respuesta informa explícitamente que OCR no está configurado.

Esta implementación valida firmas básicas, no realiza análisis antivirus ni configura un proveedor OCR. La representación está acotada para el perfil actual; no se incorporó almacenamiento externo ni una dependencia nueva.

## Correcciones reutilizables en CASEFlow

### Archivos en contratos de acciones

Se añadió `FILE`, con nombre, MIME permitido y contenido base64. La misma definición produce Zod, OpenAPI, tipos del cliente, selección de archivo y descarga mediante Blob. Su límite máximo es explícito y nunca supera un MiB decodificado.

El servidor generado permite cuerpos JSON de hasta dos MiB para transportar el contenido codificado. Se probó un PDF válido de más de 150 KB, superior al límite por defecto de Express, y el rechazo de archivos que superan el límite declarado.

Las acciones tipadas sin filtros declarados rechazan parámetros de consulta adicionales, en lugar de ignorarlos silenciosamente.

### Campos controlados por el servidor

`readOnly` conserva el campo en lecturas y lo excluye de contratos y formularios CRUD de escritura. `serverDefault` debe ser compatible con su tipo y proporciona el valor inicial desde el servidor y Prisma. La precomprobación impide generar una creación CRUD que necesite un campo obligatorio protegido sin valor inicial.

Esto evita que una edición genérica sustituya una transición auditada o falsifique una revisión. La implementación es genérica: no contiene nombres, rutas, roles ni estados del restaurante.

### Contexto e idioma de generación

`business-logic.generate@7` conserva el prompt v6 histórico y separa el idioma del usuario de los identificadores técnicos. También recibe el perfil exacto de ámbito —incluido su estado activo— y los campos controlados por el servidor.

Se detectó que las propuestas de reportes habían supuesto `ACTIVA` o `ACTIVO` cuando el perfil exige `ACTIVE`. Se corrigieron esas propuestas y se añadió el perfil explícito al contexto para evitar esa inferencia. Una generación real posterior utilizó correctamente `ACTIVE` e identificadores técnicos en inglés.

Estas extensiones están documentadas en la especificación y ADR-017. No cambiaron la pila, el catálogo de dependencias, las credenciales ni el esquema de la base principal de CASEFlow.

## Generación externa y revisión manual

Se obtuvieron propuestas reales de ventas, gastos e inventario. Después se agotó la cuota del proveedor. Se conservaron sus resultados y se completaron las otras nueve acciones mediante implementación revisada conforme al plan aprobado, sin cambiar de proveedor.

Las propuestas reales también requirieron revisión: se corrigieron los estados de sucursal, la representación estructurada de cantidades, nombres técnicos y una clasificación de error de datos persistidos. Los cambios estructurales de nombres se aplicaron mediante las herramientas de TypeScript, preservando claves de contratos.

Tras reconectar la cuenta, una solicitud real de alertas con el prompt v7 terminó correctamente. Esto confirmó que la cuota volvía a permitir solicitudes. Esa prueba de conexión no convierte las nueve implementaciones revisadas en nueve generaciones externas comprobadas.

Los cuerpos finales y sus hashes están persistidos como checkpoints y archivos del proyecto. Las diecinueve acciones anteriores se recuperaron de su versión de trabajo, con procedencia y hashes verificados; no se volvieron a generar. La entrega no depende de conservar los scripts temporales utilizados durante la evaluación.

## Verificación

### Proyecto generado

Se evaluaron los archivos recuperados de la versión de trabajo persistida, exclusivamente dentro de Docker:

1. Instalación: correcta.
2. Lint: correcto.
3. Tipos, incluida generación de Prisma: correctos.
4. Pruebas generadas: correctas.
5. Compilación: correcta.

Las 290 comprobaciones funcionales se distribuyen así:

| Grupo                                            | Correctas |
| ------------------------------------------------ | --------: |
| Entradas, alcance y unidades de inventario       |        35 |
| Ventas: borrador, revisión, confirmación y notas |        35 |
| Salidas, mermas, ajustes y mínimos               |        45 |
| Anulaciones y rectificaciones                    |        65 |
| Doce acciones nuevas                             |       110 |

El bloque nuevo comprueba conciliación de ventas rectificadas, cantidades de selecciones, exclusiones, monedas, periodos, igualdad de mínimos, cero frente a ausencia de información, exportación congelada, fórmulas CSV, pérdida de permisos, comparación entre sucursales, navegación por rol, matriz de catering, concurrencia, auditoría y retroceso completo ante fallos. También cubre contenido privado exacto, subidas duplicadas, nombres y firmas inválidas, archivos vacíos o demasiado grandes y cierre de las escrituras CRUD que eludían flujos específicos.

Los recorridos de navegador existentes pasaron junto con consulta y descarga CSV, asociación y descarga exacta de PDF, y transición autorizada de catering. Los nuevos recorridos de escritorio usaron 1440 × 900. Se repitió el flujo de archivo en 390 × 844. Estas pruebas verifican funcionamiento de controles; no certifican fidelidad visual de todas las pantallas. La captura del entorno también terminó correctamente.

Las bases, cuentas, sesiones y documentos de prueba fueron desechables. No se registraron ventas operativas ni comprobantes reales en la base principal de CASEFlow.

### CASEFlow

- `pnpm run build`: correcto para el monorepo; no empaqueta un instalable EXE.
- `pnpm run typecheck`: correcto.
- `pnpm run test:coverage`: 1048 pruebas correctas, tres omitidas. Cobertura: 77,28 % de sentencias, 74,92 % de ramas, 77,01 % de funciones y 77,89 % de líneas.
- `pnpm --filter @caseflow-ai/web run test`: 345 correctas.
- `pnpm run test:integration`: 344 correctas, dos omitidas.
- Las pruebas focalizadas de contratos, precomprobaciones y generación también pasaron.

La evidencia estructurada y los resultados de lint y formato se conservan en [2026-11-09-remaining-actions-validation.json](./2026-11-09-remaining-actions-validation.json).

### Incidencias detectadas durante la verificación

Antes de aceptar la versión final se corrigieron errores de lint de la validación de nombres de archivo y variables sin uso, un contrato de cantidades compartido indebidamente entre reportes, los estados activos de sucursal incorrectos y la aceptación de filtros no declarados en descargas.

La evaluación también permitió corregir su propio montaje: una comparación incluía un timestamp que el fixture había modificado intencionalmente al probar alertas, y una inyección del controlador de navegador situaba un `await` fuera de su función. Las aserciones finales se ejecutaron sobre los archivos de evaluación conservados en el repositorio.

Una ejecución de cobertura en paralelo con la compilación completa y la suite web excedió el tiempo de una prueba OpenAPI. La suite completa pasó al repetirse sin esa carga; no se aumentaron los tiempos ni se deshabilitaron aserciones.

## Evaluaciones reproducibles

Se conservan dos fixtures de evaluación separados de las pruebas ordinarias:

- [remaining-actions.mjs](../../tests/evaluations/rest-guest-mateos/remaining-actions.mjs): comprobaciones HTTP y de persistencia.
- [remaining-browser.mjs](../../tests/evaluations/rest-guest-mateos/remaining-browser.mjs): recorridos de navegador y descargas.

El primero se copia y ejecuta en el contenedor de la aplicación generada con `CASEFLOW_EVALUATION_DISPOSABLE=1`; el segundo se utiliza desde el controlador de navegador de `DockerRuntimeCaptureProvider`, con cuentas y datos desechables. Ambos requieren el entorno de evaluación; no ejecutan el proyecto generado dentro del proceso principal de CASEFlow ni forman parte de una CI que dependa de servicios externos.

## Commits y límites de entrega

Los commits técnicos son:

- `4a02178` — `feat(construction): add bounded files and server-owned workflow fields`.
- `eee2f74` — `fix(construction): preserve technical names and explicit scope context`.

Los fixtures y este reporte se conservan en el commit de cierre de evaluación. No se hizo push, pull request ni merge hacia `develop` o `main`.

La versión oficial anterior sigue conservada. Antes de publicar una nueva entrega falta ejecutar la generación oficial con su adaptación de diseño, revisar la fidelidad con los bocetos aprobados y completar la validación de entrega y del manual. En este bloque no se certificaron todos los CRUD, todos los requisitos no funcionales, una actualización de instalaciones externas, antivirus, OCR ni un instalable EXE.
