# Inventario: continuación de generación y validación funcional

Fecha: 2026-11-05. Rama: `feat/visual-user-manual`. Sin commit.

## Resultado y alcance

Se retomó el plan v14 aprobado de RestGuestMateos, sin modificarlo ni sustituir su baseline. Se reutilizaron las dos propuestas de entradas existentes y se generaron las ocho operaciones pendientes. Las diez propuestas superaron la revisión estática; la evaluación ejecutable necesitó una corrección localizada de tipos y normalización de identificadores.

El proyecto de evaluación pasó instalación, lint, tipos, pruebas y compilación dentro de Docker. También pasaron 80 comprobaciones HTTP de inventario, 35 regresiones de ventas y los flujos de navegador de entradas, salidas, mermas, ajustes y mínimos.

Esto completa la evaluación de estas diez acciones; **no certifica una entrega completa de RestGuestMateos**. Las otras 16 acciones de negocio todavía deben implementarse y comprobarse. No se publicó un snapshot, ZIP ni manual nuevo. La corrida permanece `FAILED` con explicación de evaluación parcial, aunque las diez acciones seleccionadas estén disponibles.

## Registros y conservación histórica

| Registro              | Identificador                          |
| --------------------- | -------------------------------------- |
| Proyecto              | `4584e81d-42f3-4501-b0c8-58bac5f7253c` |
| Plan v14 aprobado     | `6cb0e78a-2af0-40b5-ac18-6e9aa919bc9a` |
| Baseline conservado   | `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4` |
| Nueva corrida parcial | `204ae02d-7fe5-43d1-9d26-4c57153c51db` |

Se verificó que v14 continuaba siendo la última versión aprobada antes de ejecutar. La nueva corrida conserva diez checkpoints de propuestas: dos reutilizados y ocho nuevos. Las propuestas originales y la corrida anterior no se sobrescribieron. Los archivos preparados previamente en Git conservaron su estado; no se ejecutó commit, cambio de rama ni modificación del índice.

## Operaciones generadas

- `POST /inventory/issues/preview` y `/confirm`: revisión y confirmación de salidas ordinarias.
- `POST /inventory/losses/preview` y `/confirm`: revisión y confirmación de mermas.
- `POST /inventory/adjustments/preview` y `/confirm`: revisión y confirmación de ajustes positivos o negativos autorizados.
- `POST /inventory/branches/:branchId/products/:productId/minimum`: establecimiento del mínimo.
- `PATCH` sobre la misma ruta: modificación de un mínimo existente.

Las entradas se recuperaron de sus checkpoints compatibles, sin repetir esas dos solicitudes externas. Se mantuvieron las decisiones versionadas de cantidades exactas, unidades, permisos, fecha operativa, revisión, idempotencia, auditoría y transacciones descritas en el [reporte anterior](2026-10-29-inventory-contracts-and-receipts.md).

## Fallos encontrados y correcciones

### Tipos de la sucursal dentro de una transacción

El primer control de tipos encontró dos diagnósticos TS2322 en el alta de mínimos. Aunque la entrada ya comprobaba `actor.selectedScopeId`, TypeScript no conservaba esa reducción de `string | undefined` dentro de la función transaccional. Afectaba la creación del saldo y la respuesta tipada; habría bloqueado una entrega válida.

Se reemplazaron seis referencias internas por el parámetro `branchId`, obligatorio y previamente comprobado contra la sucursal seleccionada. La corrección utilizó los límites AST del método de alta de mínimos. No se añadieron aserciones de tipo, operadores de no nulidad ni supresiones. Se repitieron los cinco controles completos y pasaron.

### Identificadores internos en español

Las propuestas de confirmación de ajuste y mínimos incluían variables internas en español. Se normalizaron mediante referencias de símbolos del servicio de lenguaje TypeScript, conservando las propiedades del contrato, los textos públicos y las reglas. No se utilizó sustitución global de palabras. La evidencia registra 435 referencias renombradas y hashes anteriores/posteriores del archivo evaluado.

Estas correcciones se aplicaron al código de evaluación; los checkpoints originales permanecen como historial. Antes de publicar una entrega oficial deberán integrarse mediante el proceso de generación y reparación y repetirse los controles de esa corrida. No se afirma que los checkpoints originales compilen sin esa corrección.

### Fecha de las pruebas en el cambio de día UTC

La primera ejecución HTTP usaba `toISOString().slice(0, 10)` para seleccionar la fecha operativa. Al haberse cambiado el día UTC antes que en Guayaquil, la prueba envió una fecha futura para la sucursal. El servidor la rechazó correctamente.

Se corrigieron las fechas de los fixtures HTTP y navegador para obtener el día en `America/Guayaquil`, igual que las sucursales de evaluación. No se relajó la validación del producto. La ejecución completa posterior pasó.

## Validación funcional

Las 35 comprobaciones de entradas se repitieron, incluyendo conversiones exactas, ausencia de escrituras en revisión, concurrencia al crear el primer saldo, reintentos, aislamiento, cierre de CRUD de escrituras, conservación de unidad, fecha anterior y reversión integral ante fallo de auditoría.

Las 45 comprobaciones adicionales verificaron:

- Salidas, mermas y ajustes rechazan cero y saldo negativo.
- Mermas y ajustes requieren motivo.
- Las tres confirmaciones registran variaciones exactas y el tipo de movimiento correcto.
- Dos confirmaciones con la misma clave tienen un único efecto; una revisión obsoleta no sobrescribe el saldo.
- Dos claves distintas compitiendo por la última unidad producen una aceptación y un conflicto, dejando saldo cero.
- Confirmaciones directas con referencias falsificadas no crean movimientos.
- El mínimo cero queda configurado y se distingue de su ausencia.
- No se permite modificar un mínimo inexistente ni establecerlo dos veces.
- Modificar mínimos conserva saldo y unidad y no crea movimientos de inventario.
- Un mínimo puede inicializar existencias con saldo cero y unidad normalizada.
- No se acepta una sucursal de ruta distinta de la seleccionada.
- El cajero no puede revisar movimientos ni modificar mínimos.

La regresión de ventas repitió 35 comprobaciones, incluidas cantidades e importes exactos, precio por sucursal, confirmación concurrente, recuperación idempotente, auditoría, conservación histórica y ausencia de descuento automático de inventario.

En navegador, un Administrador seleccionó sucursal y producto y completó entrada, salida, merma, ajuste, establecimiento de mínimo y modificación de mínimo. Se comprobaron resultados y ausencia de errores de página. Las confirmaciones recibieron automáticamente los datos de la revisión POST; no se solicitaron referencias técnicas al usuario.

## Controles y evidencia

| Control del proyecto generado | Resultado                              |
| ----------------------------- | -------------------------------------- |
| Instalación                   | Correcto                               |
| Lint                          | Correcto                               |
| Typecheck                     | Correcto tras la corrección localizada |
| Pruebas generadas             | Correcto                               |
| Build                         | Correcto                               |
| HTTP inventario               | 80/80                                  |
| Regresión HTTP ventas         | 35/35                                  |
| Navegador                     | Correcto en los flujos descritos       |

La [evidencia estructurada](2026-11-05-inventory-resumed-validation.json) conserva etapas, duración, hashes, registros y nombres de las comprobaciones. El código generado se ejecutó únicamente en contenedores desechables, con base y cuentas de prueba. Los recursos de evaluación se eliminaron al finalizar y no se detuvieron contenedores ajenos.

No se cambió código del núcleo en esta continuación ni se repitieron sus suites como si fueran evidencia nueva. Las validaciones anteriores del repositorio están documentadas en el reporte del 29 de octubre. Esta sesión verificó el proyecto generado y la documentación nueva.

## Pendientes y siguiente bloque

- Implementar las otras 16 acciones: cancelaciones/correcciones de ventas, gastos/catering y reportes, conservando sus dependencias.
- Completar filtros y paginación del historial, alertas y la experiencia general de mínimos; comprobar estas diez acciones no certifica esas pantallas completas.
- Evaluar todos los roles, dispositivos, navegación y fidelidad respecto de los bocetos. La sesión de navegador descrita es de escritorio y Administrador.
- Integrar las correcciones evaluadas y los cuerpos de ventas ya reparados en una corrida completa, manteniendo el historial.
- Solo después de todos los controles obligatorios corresponde crear snapshot, ZIP y manual de una nueva entrega oficial.
