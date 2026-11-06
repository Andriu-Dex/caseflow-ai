# Inventario: contratos, decisiones y evaluación de entradas

Fecha: 29 de octubre de 2026. Rama: `feat/visual-user-manual`. Sin commit. Se conservaron los cambios que ya estaban preparados en el índice.

## Estado

Se formalizaron las ocho operaciones de revisión y confirmación de inventario y dos operaciones de mínimos. El plan v14 quedó aprobado mediante el flujo normal de versiones y comprobaciones de coherencia. La versión aprobada v11 permanece intacta.

ChatGPT generó la revisión y confirmación de entradas, pero volvió a alcanzar su límite al comenzar salidas. El usuario decidió esperar, sin cambiar de proveedor. **Las otras ocho operaciones de este bloque no se han generado ni certificado**: seis de salidas, mermas y ajustes, y dos de mínimos.

Las dos operaciones disponibles pasaron los cinco controles de Docker, 35 comprobaciones HTTP y una interacción real de navegador. También se repitieron satisfactoriamente las 35 comprobaciones de ventas sobre el nuevo modelo. No se produjo una nueva entrega oficial, snapshot, ZIP ni manual.

## Fuentes y decisiones

Se revisó SRC-001, versión `c33a04be-c58e-48a3-8f3e-3be3cd892ae6`, y el contexto histórico de requisitos y casos de uso del baseline aprobado. Destacan RF-135–RF-143, RNF-060, RNF-061 y RNF-064: entradas, salidas, mermas, ajustes autorizados, saldos, historial, mínimos, alertas, auditoría, atomicidad y concurrencia.

Las reglas siguientes concretan las decisiones que el usuario delegó expresamente. No se presentan como citas literales de la fuente:

| Tema                    | Decisión adoptada                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Permisos                | Administrador, Encargado de sucursal y Responsable de inventario operan en sus sucursales autorizadas. Cajero y Catering no reciben estas facultades.                                                                                            |
| Ajustes                 | Variación con signo, distinta de cero, motivo obligatorio y permiso efectivo. No hay excepción administrativa para saldo negativo.                                                                                                               |
| Precisión               | Cantidades y saldos exactos con dos decimales, dentro de NUMERIC(12,2). Aritmética de centésimas con BigInt; sin redondear pérdidas de precisión.                                                                                                |
| Unidad de existencias   | Procede de Product.salesUnit al inicializar el registro y queda congelada para ese saldo. Cambiar después el catálogo no reinterpreta existencias ni movimientos anteriores.                                                                     |
| Unidades y conversiones | Alias explícitos para unidad, g, kg, ml y l. Conversiones exactas kg/g y l/ml por factor 1000; otras unidades solo admiten coincidencia normalizada. No se convierte masa en volumen ni conteos en masa.                                         |
| Conversión inexacta     | Se rechaza si el resultado no cabe exactamente en dos decimales. Por ejemplo, 500 g se convierten en 0.50 kg, pero 0.01 g no se redondean a cero kg.                                                                                             |
| Origen y motivo         | Origen no vacío en entradas; motivo no vacío en mermas y ajustes. Ambos se recortan y se conservan cuando corresponde.                                                                                                                           |
| Producto inactivo       | No recibe nuevas entradas. Puede retirarse o conciliarse en las otras operaciones según el contrato, sin inventar ventas automáticas. Esta última parte aún debe probarse al generar esas operaciones.                                           |
| Fecha                   | Fecha operativa explícita, no futura respecto a la zona IANA de la sucursal. Se admite fecha anterior, pero el movimiento modifica el saldo actual al confirmarse y no recalcula historia. El instante de ocurrencia lo fija el servidor en UTC. |
| Concurrencia            | Revisión del saldo, comparación exacta de la vista previa y actualización CAS. Los cambios obligan a revisar de nuevo.                                                                                                                           |
| Reintentos              | Clave UUID vinculada a usuario, sucursal y operación; misma solicitud recupera el resultado original y una diferente produce conflicto.                                                                                                          |
| Mínimos                 | Cero es configuración existente; null significa ausencia. Establecer y modificar son operaciones distintas, sin cambiar saldo ni crear movimientos.                                                                                              |

La política no presupone recetas, salidas por venta, conversiones arbitrarias, autorizaciones sin rol ni excepciones de saldo negativo.

## Cambios del plan generado

- `BranchProductStock` incorpora revisión de concurrencia y unicidad producto/sucursal.
- `InventoryMovement` incorpora fecha operativa y exige saldos anterior y resultante.
- `IdempotentOperation` puede enlazarse al movimiento de inventario y hereda su alcance de sucursal. Se conserva la relación y el alcance de ventas.
- Saldos y movimientos quedan con operaciones CRUD exclusivamente de lectura. Se cierran la modificación libre del saldo y la creación genérica de movimientos, que el plan anterior permitía pese a describir un flujo transaccional.
- Las ocho acciones existentes obtienen cuerpos y respuestas tipados, reglas, capacidades de datos y enlaces entre revisión y confirmación.
- Los formularios de movimientos utilizan controles de sus acciones específicas, sin ofrecer además un guardado CRUD genérico.
- Los mínimos se establecen mediante POST y se modifican mediante PATCH en la ruta de producto y sucursal, con el servidor controlando la revisión y el saldo. Ambos cuerpos están pendientes de generación.

Estos cambios pertenecen a los datos versionados de RestGuestMateos. No se introdujeron nombres de ese negocio ni reglas particulares de inventario en el núcleo genérico de CASEFlow. Tampoco se añadieron dependencias o migraciones a la base principal de CASEFlow; los cambios de entidades corresponden al proyecto generado.

## Control de coherencia y versiones

Los intentos v12 y v13 fueron bloqueados por el control de coherencia: primero por un control de pantalla no presente en el plano y después por un endpoint auxiliar sin acción correspondiente. Se ajustó el plan para conservar las acciones respaldadas por el diseño. No se desactivó el control ni se aprobaron esos intentos.

Los dos intentos quedaron `CHANGES_REQUESTED`, con motivo registrado en auditoría, conservando sus datos. La versión v14 pasó el control y se aprobó con las decisiones delegadas.

| Registro                      | Identificador                          |
| ----------------------------- | -------------------------------------- |
| Proyecto                      | `4584e81d-42f3-4501-b0c8-58bac5f7253c` |
| Baseline conservado           | `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4` |
| Plan v11 anterior, aprobado   | `d5c1f96d-ebd4-407e-bc4c-738f63d43235` |
| Plan v14 aprobado             | `6cb0e78a-2af0-40b5-ac18-6e9aa919bc9a` |
| Corrida de evaluación parcial | `ab3816fb-a6a5-411d-a943-cea0e313e261` |

La corrida parcial permanece `FAILED` con una explicación explícita de su alcance. Sus dos checkpoints son propuestas conservadas, no archivos de una entrega completa. No se usó un estado de éxito oficial para representar una evaluación incompleta.

## Cambio reutilizable en CASEFlow

Los enlaces de revisión admitían únicamente consultas GET. Las revisiones de inventario son POST de solo lectura porque necesitan un cuerpo estructurado.

Ahora se permite enlazar desde un POST solamente si existe el perfil de alcance y la fuente declara capacidades explícitas exclusivamente READ. La persistencia aplica esa restricción también dentro de transacciones. Una fuente con UPDATE u otra escritura no puede habilitar una confirmación mediante este mecanismo. Se mantiene la declaración de ambas acciones en la misma pantalla.

La prueba de regresión comprueba una fuente válida y rechaza capacidades de escritura o vacías. La prueba real de navegador comprobó la revisión POST y el suministro de sus valores a la confirmación sin pedir al usuario que los copie ni escriba una revisión técnica.

## Evaluación de las dos operaciones disponibles

Se utilizaron las propuestas reales recibidas y el plan v14 en un proyecto desechable. No fue necesario reparar sus cuerpos para superar instalación, lint, tipos, pruebas y compilación. Las acciones todavía no generadas conservaron sus stubs; los cinco controles no las convierten en funcionales.

Las 35 comprobaciones HTTP verificaron, entre otros casos:

- Rol de inventario, selección de sucursal y rechazo de ámbito e identidad falsificados.
- Cantidades positivas, origen obligatorio, fecha no futura y unidades compatibles.
- Conversión exacta de 500 g a 0.50 kg y rechazo de una conversión inexacta.
- Vista previa sin crear saldos, movimientos, auditoría o registros de idempotencia.
- Inicialización de existencias y registro de unidad original, variación exacta y responsable.
- Reintentos sin duplicación, solicitudes distintas con la misma clave y revisiones obsoletas.
- Confirmación concurrente sobre saldo existente y creación concurrente del primer saldo con recuperación del resultado.
- Cierre de escrituras CRUD directas y protección del detalle de movimientos de otra sucursal.
- Conservación de la unidad del saldo tras modificar la unidad del catálogo.
- Fallo de auditoría provocado mediante un trigger exclusivamente en la base desechable: saldo, movimiento e idempotencia se revirtieron y el error público no reveló el fallo interno.
- Fecha operativa anterior con ocurrencia UTC actual, saldo igual a la suma de movimientos aceptados y auditoría de saldo y revisión.

El error 500 provocado en esa prueba es un resultado esperado de la inyección de fallo; no fue una operación ordinaria fallida que se ocultara.

En navegador, una sesión de Administrador seleccionó sucursal y producto, revisó una entrada y la confirmó mediante los enlaces POST. Se comprobó el resultado esperado y la ausencia de errores de página. La matriz HTTP usó el rol Responsable de inventario. Esto no acredita todos los roles, todos los dispositivos ni fidelidad visual con los bocetos.

La regresión de ventas repitió sus 35 comprobaciones sobre el modelo ampliado y pasó. Incluye aislamiento, importes, confirmación concurrente, recuperación idempotente, conservación histórica y ausencia de cambios automáticos de inventario.

## Evidencia y límites

La [evidencia estructurada](2026-10-29-inventory-validation.json) registra versiones, hashes, etapas, comprobaciones y metadatos de AIRun. Los archivos de trabajo y las propuestas permanecen en `%TEMP%`, fuera del repositorio. El código generado se ejecutó únicamente dentro de Docker, sin utilizar la base comercial principal.

Quedan pendientes de generación y prueba:

1. Revisión y confirmación de salidas ordinarias.
2. Revisión y confirmación de mermas.
3. Revisión y confirmación de ajustes.
4. Establecimiento y modificación de mínimos.

También siguen pendientes la experiencia completa de mínimos, los filtros y paginación del historial, las alertas, el resto de familias de acciones y la validación de la entrega completa. El trabajo de entradas no certifica esos flujos.

Al restablecerse la cuota se debe retomar esta misma versión del plan, reutilizando los checkpoints disponibles cuando su contexto coincida. Después de completar y verificar este bloque corresponde integrar sus resultados en una corrida oficial completa; todavía no debe generarse un manual o ZIP que anuncie todas estas funciones como terminadas.
