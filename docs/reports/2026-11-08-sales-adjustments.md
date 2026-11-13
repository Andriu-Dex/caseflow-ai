# Anulaciones y rectificaciones de ventas: implementación y evaluación real

Fecha: 2026-11-08. Rama: `feat/construction-working-copy`. Sin commit, push ni pull request durante esta implementación.

## Resultado y alcance

Se completaron las cuatro acciones de revisión y confirmación de anulaciones y rectificaciones de ventas del proyecto RestGuestMateos. Se generaron mediante el proveedor configurado, se revisaron y se integraron con las quince acciones de ventas e inventario ya evaluadas. La nueva versión de trabajo conserva **19 acciones implementadas y 12 pendientes**.

La evaluación aislada pasó instalación, lint, tipos, pruebas y compilación. Pasaron **65 comprobaciones funcionales nuevas**, **115 regresiones existentes** y los recorridos de navegador de inventario, rectificación y anulación.

Esto completa este bloque de ventas dentro de la política descrita más adelante. **No completa el proyecto entero ni publica una entrega oficial.** La versión integrada sigue siendo `WORKING_COPY`; la evaluación descrita no crea un sandbox oficial `READY` ni un nuevo snapshot.

## Registros persistidos

| Registro                           | Identificador o resultado                             |
| ---------------------------------- | ----------------------------------------------------- |
| Proyecto                           | `4584e81d-42f3-4501-b0c8-58bac5f7253c`                |
| Plan anterior conservado           | v14, `6cb0e78a-2af0-40b5-ac18-6e9aa919bc9a`, aprobado |
| Nuevo plan aprobado                | v15, `540711e7-917a-4bbc-aff8-96f7793cdfc5`           |
| Baseline conservado                | `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`                |
| Corrida de generación parcial      | `ade248b8-f7b1-467c-a8fb-f03ad2efe1f4`                |
| Versión de trabajo integrada final | `7166cb27-00c9-42fa-8a04-4ed4c5dbe251`                |
| Archivos persistidos               | 338                                                   |
| Snapshot histórico conservado      | `068daf1b-1b9b-47a9-8e54-dae7e36d59a0`                |
| Nuevos snapshots oficiales         | Ninguno                                               |

El plan se publicó mediante versionado, revisión y transición normal a aprobado. Se utilizaron las decisiones delegadas previamente por el usuario para resolver las políticas no definidas; no se sobrescribió el plan v14. Se conservaron las fuentes y los artefactos aprobados.

La corrida parcial figura como `FAILED` con un mensaje explícito de evaluación parcial: seleccionar cuatro acciones no equivale a generar una entrega completa. Las cuatro propuestas fueron aceptadas y conservadas como checkpoints. Su estado no significa que fallaran las cuatro acciones.

La versión de trabajo incluye cuerpos, procedencia, hashes, trazabilidad y manifiesto de acciones implementadas y pendientes. Las quince implementaciones anteriores se recuperaron de los archivos y referencias persistidos en CASEFlow, con verificación del origen y hash; no se volvieron a solicitar al proveedor.

## Corrección reutilizable en CASEFlow

El generador de Prisma no distinguía los nombres inversos de dos relaciones `ONE_TO_ONE` desde una entidad hacia otra. Ambas terminaban intentando crear el mismo campo inverso. Esto impedía modelar, por ejemplo, una operación con un documento original y otro de reemplazo.

Se conservó el nombre singular habitual cuando existe una sola relación y se añadió el sufijo determinista de la relación cuando hay varias. Las relaciones mantienen su nombre explícito, su FK única y su cardinalidad. Se añadió una prueba de regresión con dos vínculos hacia el mismo modelo. El esquema real ampliado también pasó la generación y validación de Prisma dentro de Docker.

Este cambio es genérico: no contiene nombres, roles, rutas ni políticas de RestGuestMateos. Las decisiones específicas de ventas permanecen en el plan del proyecto y en su código generado. No se modificó el esquema de la base principal de CASEFlow ni se creó una migración para sus datos.

## Política de ventas formalizada

Las fuentes RF-009, RF-132, RF-133, RF-134 y RF-194 exigen preservar el original, registrar los efectos y evitar duplicaciones, pero dejaban decisiones operativas pendientes. El plan v15 concreta lo siguiente:

### Anulación

- Solo se compensa una venta confirmada y todavía no compensada.
- Se conserva su detalle, importes, autor, canal y fechas. El estado pasa a `ANULADA` y aumenta la revisión.
- Se crea una operación `REVERSA` vinculada al original, con motivo, actor, instante y efecto financiero estructurado.
- El total resultante de la reversa es cero y la variación es el negativo del total anterior.
- No se borran ventas ni líneas y no se modifican existencias automáticamente.

### Rectificación

- Se rectifican cantidades de líneas simples existentes, usando exclusivamente sus precios y clasificación históricos.
- Una cantidad cero elimina la línea de la venta rectificada, sin borrar la original. Debe quedar alguna línea positiva y existir un cambio real.
- Se conserva la venta original, se marca anulada y se crea otra venta confirmada con sus nuevas líneas.
- Una operación `CORRECCION` enlaza ambas ventas y conserva los totales anterior, resultante y su diferencia.
- La venta rectificada conserva la sucursal, canal y fecha operativa originales. El instante de creación y responsable son los de la nueva operación.
- La venta resultante admite posteriormente otra compensación, formando una cadena explícita.
- No se admiten nuevos productos, cambios de precios, cambios de fecha/canal ni descuentos mediante esta acción.

Se rechazan ventas con clasificación compleja, proteínas/extras o descuentos distintos de cero. Es una limitación explícita de la política aprobada, no una implementación completa de esos casos. La generación existente de ventas simples tampoco los ofrece como un flujo soportado.

### Permisos y fecha

Administrador, Encargado de sucursal y Cajero pueden revisar dentro de una sucursal autorizada. Solo Administrador y Encargado pueden confirmar. El Encargado confirma exclusivamente operaciones de la fecha operativa actual según la zona IANA de la sucursal. El Administrador puede compensar fechas anteriores con motivo. Se rechazan fechas futuras y zonas horarias inválidas.

No existe un cierre de caja modelado. Esta política temporal no pretende demostrar controles de cierre contable que el proyecto todavía no define.

## Integridad, concurrencia y auditoría

Los importes y cantidades utilizan centésimas exactas con `BigInt`, rango compatible con `NUMERIC(12,2)` y redondeo `HALF_UP` por línea. Se verifican los subtotales y totales originales antes de compensar. No se recalcula una venta histórica con precios actuales del catálogo.

La revisión no escribe datos. Su referencia se vuelve a calcular en el servidor al confirmar e incluye revisión, motivo, alcance y valores históricos/resultantes. Cambiar datos después de revisar obliga a revisar nuevamente. El nombre actual del producto es de presentación y no altera esa referencia financiera.

La confirmación utiliza una transacción, comprobación de estado y revisión esperados, y una relación única por venta original. Esto impide que una anulación y una corrección concurrentes compensen dos veces la misma venta.

La idempotencia se identifica por actor, sucursal, operación y clave. Un reintento idéntico recupera la respuesta guardada; una clave reutilizada con otro cuerpo se rechaza. Se relajó a `MANY_TO_ONE` la relación del registro idempotente hacia la venta en el modelo generado: la confirmación inicial y una compensación posterior necesitan registros distintos para una misma venta. La clave compuesta continúa siendo única.

Cada compensación conserva un evento de auditoría y cambios de valores anteriores/resultantes. Los detalles tienen un solo propietario: el evento de auditoría. La operación compensatoria permanece identificada en los campos afectados y en su vínculo con la venta. Se comprobó el retroceso completo de las escrituras al provocar un fallo obligatorio de auditoría, tanto en reversas como en rectificaciones.

## Generación real

Se ejecutó `business-logic.generate` v6 mediante el orquestador y el registrador existentes, con el plan y contexto congelado correspondientes. Las cuatro llamadas finalizaron correctamente:

| Acción                  | Latencia registrada | Tokens totales registrados |
| ----------------------- | ------------------: | -------------------------: |
| Revisar anulación       |            45,842 s |                     26 117 |
| Confirmar anulación     |            61,821 s |                     27 426 |
| Revisar rectificación   |            51,373 s |                     26 667 |
| Confirmar rectificación |            76,019 s |                     28 454 |

Estos valores son la telemetría registrada de las solicitudes; no expresan un coste monetario ni garantizan una cuota disponible posterior. Las pruebas deterministas y de navegador no solicitaron nuevas inferencias.

## Validación aislada

Se evaluaron los archivos recuperados de la nueva versión de trabajo persistida. El código generado se ejecutó exclusivamente en contenedores mediante los proveedores de sandbox y captura existentes. La base y cuentas de prueba fueron desechables; no se realizaron ventas operativas en la base principal del proyecto.

| Etapa             | Resultado | Duración |
| ----------------- | --------- | -------: |
| Instalación       | Correcto  | 17,439 s |
| Lint              | Correcto  |  6,108 s |
| Tipos             | Correcto  | 10,477 s |
| Pruebas generadas | Correcto  | 15,648 s |
| Compilación       | Correcto  | 26,853 s |

Una primera evaluación se detuvo en lint porque la revisión de pertenencia de auditoría había dejado dos variables sin uso. Se corrigió el vínculo para conservar un único propietario y utilizar el evento creado. Se creó otra versión de trabajo y se repitieron todas las etapas. La versión inicial y las propuestas permanecieron históricas; no se sobrescribieron.

### Pruebas funcionales

Pasaron 180 comprobaciones HTTP y de persistencia:

| Grupo                                            | Comprobaciones |
| ------------------------------------------------ | -------------: |
| Entradas, alcance y unidades de inventario       |             35 |
| Ventas: borrador, revisión, confirmación y notas |             35 |
| Salidas, mermas, ajustes y mínimos               |             45 |
| Anulaciones y rectificaciones                    |             65 |

El grupo nuevo incluye permisos del Cajero, alcance de sucursal, motivo obligatorio, revisión sin escrituras, referencias falsas y revisiones obsoletas, reintentos, concurrencia con la misma clave, concurrencia entre anulación y rectificación, preservación de líneas/importes originales, coexistencia de idempotencia de confirmación y compensación, cantidades inválidas, eliminación parcial de líneas, redondeo exacto, independencia de precios actuales, fechas anteriores/futuras, cadena de compensaciones, fallos de auditoría, exclusión de casos no soportados, cierre de escrituras CRUD genéricas e inventario sin alteraciones.

En Chromium aislado a 1440 × 900 se probaron los flujos existentes de inventario y las nuevas pantallas. Se comprobó la consulta inicial de líneas, edición de cantidades, invalidación de una revisión al cambiar el motivo, habilitación de confirmación y navegación al detalle de la nueva venta rectificada. Después se anuló esa venta y se comprobó la navegación a su detalle con estado `ANULADA`. El recorrido terminó sin errores de página y la captura del entorno se completó.

### Comprobaciones de CASEFlow

- Pruebas focalizadas de generadores, contratos de acciones y versiones de trabajo: 25 correctas.
- Compilación de API y sus paquetes dependientes: correcta.
- `pnpm run lint` y `pnpm run format:check` del repositorio: correctos.
- `pnpm run test:coverage`: 141 archivos correctos y uno omitido; 1044 pruebas correctas y tres omitidas. Ningún fallo.
- Cobertura: 77,23 % de sentencias, 74,76 % de ramas, 76,94 % de funciones y 77,85 % de líneas.

La evidencia estructurada, identificadores de solicitudes, hashes de archivos y nombres de las comprobaciones están en [2026-11-08-sales-adjustments-validation.json](./2026-11-08-sales-adjustments-validation.json).

## Pendientes y límites de esta evaluación

Las doce acciones restantes corresponden a indicadores, alertas y recomendaciones; transición e historial de catering; reportes y exportación CSV; y adjuntos de comprobantes de gastos. Permanecen identificadas como pendientes y responden 501 en la versión de trabajo.

No se validaron en este bloque los informes corregidos después de compensar ventas, porque sus acciones todavía están pendientes. El plan establece que deben excluir originales anulados y contabilizar las ventas rectificadas sin duplicaciones; esa regla requiere pruebas al implementar los reportes.

No se certificó fidelidad visual con todos los bocetos aprobados, funcionamiento móvil, instalación de escritorio, carga sostenida ni un cierre contable inexistente. No se repitió toda la suite de integración de la aplicación principal; sí la suite raíz con cobertura, las pruebas focalizadas y la evaluación real descrita.

El siguiente bloque recomendado es implementar los reportes de ventas y gastos y verificar su conciliación con confirmaciones, reversas y rectificaciones. Una entrega oficial requiere resolver las acciones pendientes y superar nuevamente los gates completos del producto.
