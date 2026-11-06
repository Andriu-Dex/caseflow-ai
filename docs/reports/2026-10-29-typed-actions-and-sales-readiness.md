# Contratos de acciones y preparación del flujo de ventas

Fecha: 29 de octubre de 2026. Rama: `feat/visual-user-manual`. Los cambios de esta implementación permanecen sin commit.

Actualización posterior: el proveedor volvió a estar disponible. El [reintento real de ventas](2026-10-29-real-sales-generation-retry.md) registra las propuestas nuevas, su reparación y las pruebas posteriores. Este reporte conserva los resultados del intento anterior.

## Resultado y alcance

Se implementó el soporte genérico de contratos tipados de acciones y se comprobó un flujo determinista completo de pedidos en Docker. Se preparó y aprobó una nueva versión del plan de RestGuestMateos con las decisiones comerciales indicadas por el usuario. **El flujo real de ventas de RestGuestMateos todavía no está implementado ni certificado:** el proveedor configurado devuelve un límite de uso y las corridas quedan fallidas, sin publicar archivos ni un nuevo snapshot.

Las pruebas del proyecto de pedidos acreditan el mecanismo de generación y sus componentes compartidos. No acreditan los cálculos, permisos ni reglas comerciales particulares de RestGuestMateos. La evaluación de alcance con el plan del restaurante utiliza cuerpos de prueba controlados; tampoco sustituye la evaluación de sus operaciones definitivas.

## Cambios del producto

### Contratos compartidos

Cada acción personalizada del ImplementationPlan puede declarar `contract.body`, `contract.query` y `contract.response`. La estructura admite texto, UUID, decimal exacto, entero, booleano, fecha, fecha/hora, enumeración, objeto y arreglo. Se limitan profundidad, cantidad de campos, elementos y longitud; se rechazan campos desconocidos, nombres duplicados y límites incompatibles.

De esa definición se derivan los esquemas Zod compartidos, OpenAPI, las firmas del cliente TypeScript, la validación del controlador y los tipos del servicio. Las escrituras requieren cuerpo; las consultas solo reciben los filtros declarados. Los booleanos de consulta se interpretan explícitamente y no mediante la veracidad de una cadena.

Las respuestas se normalizan al formato JSON y se validan antes de enviarse. Un cuerpo incompatible devuelve un error público seguro. Las acciones tipadas declaran HTTP 200 para evitar la diferencia entre el POST 201 predeterminado de NestJS y el contrato publicado. Los contratos nuevos no exponen campos marcados como internos.

Los decimales se transportan como cadenas con hasta diez dígitos enteros y dos decimales. Esta representación evita convertir el contrato monetario en números binarios, pero **no implementa por sí sola la regla comercial de cálculo o redondeo**. Esa lógica pertenece al cuerpo revisado de cada operación.

### Formularios y revisión

Los formularios generados admiten objetos y listas anidadas, referencias mediante opciones autorizadas, filtros y resultados estructurados. Los errores de validación nuevos tienen mensajes públicos en español. El usuario no debe escribir claves de idempotencia ni revisiones técnicas para una acción que las obtiene mediante enlaces explícitos.

`bindings` permite tomar un campo obligatorio de la respuesta de una consulta GET o generar un UUID de reintento. Puede exigir una condición booleana como `canConfirm`. La pantalla debe ofrecer la consulta que alimenta ese enlace; el contrato rechaza referencias incompatibles o ausentes. `successNavigation` permite abrir una ruta existente con el identificador devuelto.

La caché distingue ruta y ámbito. Una respuesta tardía no se presenta si cambiaron token, ámbito o ruta. Las escrituras invalidan revisiones previas; los cambios todavía sin guardar bloquean otra acción que depende de una revisión. La clave de reintento se conserva ante error y se renueva tras éxito. El servidor debe seguir comprobando estado, revisión e idempotencia: el bloqueo de un botón no constituye autorización.

La comprobación real en navegador encontró un problema con `crypto.randomUUID()` en el origen HTTP del contenedor. Se reemplazó por un UUID v4 construido con `crypto.getRandomValues`, manteniendo aleatoriedad criptográfica y compatibilidad con ese entorno. También se corrigió el escape de la expresión que sustituye el parámetro de navegación dentro de la plantilla.

### Persistencia y seguridad

Las entidades pueden declarar claves únicas compuestas. El plan comprueba columnas existentes, columnas repetidas y restricciones duplicadas, incluso con distinto orden. Prisma materializa esas restricciones en el proyecto generado.

Se corrigió un defecto de la frontera de alcance: al crear padre, detalles y auditoría en una transacción, la comprobación de relaciones consultaba el cliente exterior y no veía los registros todavía sin confirmar. Ahora verifica y escribe con el mismo cliente transaccional. Se conserva el rollback conjunto.

Bajo un actor, las fachadas exponen únicamente delegados declarados y métodos permitidos. No exponen el cliente subyacente mediante propiedades propias, bloquean SQL crudo y rechazan transacciones por lotes que eludan el contexto. Se mantienen permisos por operación, restricciones de lectura y escritura y alcance seleccionado.

Se registran los controladores de acciones antes de los controladores CRUD, y las rutas estáticas antes de las parametrizadas. Esto evita que una acción como `/orders/invalid-response` sea interpretada como el identificador de un recurso. OpenAPI rechaza colisiones equivalentes por método y forma de ruta.

### Desactivación y generación

Una decisión manual explícita puede declarar `disabledReason`. El control explica el motivo, permanece desactivado y su endpoint devuelve 403, sin solicitar un cuerpo al proveedor. Los contratos de salida de planificación automática excluyen ese campo para impedir que una propuesta lo use para ocultar requisitos pendientes.

La lógica tipada utiliza `business-logic.generate@6`, con entrada, salida y reglas del plan en su contexto y hash de reutilización. Las acciones históricas conservan sus versiones de prompt anteriores. El componente de formularios se incorpora al contexto de composición del diseño. Se mantiene la revisión estática y el bloqueo de entrega cuando faltan implementaciones.

No se añadieron dependencias, variables de entorno ni migraciones a la base principal de CASEFlow. Se conserva `CASEFLOW_WEB_TS_V1`, versión 2. Los datos comerciales del restaurante permanecen en su plan, no en reglas del núcleo.

## Decisiones aprobadas para RestGuestMateos

El usuario aprobó expresamente:

1. Precio vigente por sucursal, con respaldo del catálogo cuando corresponde.
2. Cálculo exacto y redondeo HALF_UP a dos decimales.
3. Descuentos desactivados inicialmente.
4. Inventario mediante movimientos manuales, sin descuento automático por recetas.

Se registró el plan de implementación v11, conservando v10 y las versiones anteriores. Se retiraron las escrituras CRUD directas de las entidades del flujo de venta y se prepararon contratos para:

| Método | Ruta                     | Propósito                                                        |
| ------ | ------------------------ | ---------------------------------------------------------------- |
| POST   | `/sales/drafts`          | Crear un borrador con productos simples e importes del servidor. |
| POST   | `/sales/:saleId/draft`   | Guardar cambios con revisión esperada.                           |
| GET    | `/sales/:saleId/review`  | Revisar precios e importes sin modificar registros.              |
| POST   | `/sales/:saleId/confirm` | Confirmar la revisión con atomicidad e idempotencia.             |
| POST   | `/sales/:saleId/notes`   | Añadir observaciones sin cambiar importes históricos.            |

El plan añade revisión de venta, vigencia de precios y restricciones únicas para precios e idempotencia. Las reglas exigen detectar precios vigentes ambiguos, conservar importes históricos y no aceptar importes calculados por el cliente. Se enlazaron las acciones con las pantallas correspondientes y una ruta de creación.

Esto cubre la preparación de ventas simples del catálogo. No resuelve automáticamente menús, proteínas, extras, reparto, cierres, anulaciones ni las demás políticas pendientes. No se afirma cobertura completa del requisito comercial de ventas.

### Identificadores conservados

| Registro                                       | Identificador                          |
| ---------------------------------------------- | -------------------------------------- |
| Proyecto                                       | `4584e81d-42f3-4501-b0c8-58bac5f7253c` |
| Baseline de diseño                             | `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4` |
| Plan v10 anterior                              | `5d444597-efe0-4427-8b93-fae0d0b2c3bc` |
| Plan v11 aprobado                              | `d5c1f96d-ebd4-407e-bc4c-738f63d43235` |
| Primera corrida v11 fallida por disponibilidad | `41035b7f-ef06-4851-9a7d-4ca68fdd1342` |
| Reintento durante esta continuación            | `b218a3b9-573f-4d91-ac2b-31250a54f11c` |
| Snapshot anterior, conservado                  | `068daf1b-1b9b-47a9-8e54-dae7e36d59a0` |

El reintento terminó `FAILED`, con 29 acciones sin implementar y cero archivos publicados. El mensaje del proveedor fue límite de uso de ChatGPT; no se cambió de proveedor ni se habilitó un fallback de pago. No hay un nuevo ZIP, snapshot o manual que certifique este flujo.

## Verificaciones

### Pruebas del generador y del proyecto de pedidos

La fixture `apps/api/src/code-generation/testing/action-contract-plan.ts` contiene operaciones deterministas conocidas. El evaluador `scripts/evaluate-action-contracts.mjs` genera ese proyecto, ejecuta sus cinco controles en Docker y después inicia un runtime desechable para HTTP y Playwright. No necesita credenciales del proyecto ni llama a proveedores de generación.

Reproducción desde la raíz, con Docker disponible:

```powershell
pnpm --filter @caseflow-ai/api run build
node scripts/evaluate-action-contracts.mjs
```

La evidencia local se escribe en `%TEMP%/caseflow-action-contract-evaluation/`. Los contenedores y archivos de ejecución temporales no se incorporan a la entrega del producto.

Se comprobaron 20 condiciones HTTP: rechazo de importes ajenos al contrato, UUID inválido y cantidad no positiva; rollback de creación y modificación; cálculo exacto; revisión obsoleta; filtros booleanos y límites; propiedades desconocidas; confirmación concurrente con un solo efecto; reintento que recupera el resultado original; conflicto por clave con datos diferentes; segunda confirmación distinta; inmutabilidad tras confirmar; conservación de precios históricos y rechazo seguro de respuestas incompatibles.

Playwright comprobó creación con selección de producto, navegación al detalle, campos técnicos ocultos, revisión previa obligatoria, bloqueo por cambios sin guardar, guardado con revisión enlazada, invalidación de revisión, confirmación y bloqueo del estado final. También comprobó ausencia de errores de página durante ese flujo. Esto es una prueba de interacción; no se deduce de una captura.

### Alcance y permisos

La evaluación controlada con el plan v10 comprobó 24 condiciones HTTP y la interfaz de cambio de ámbito y asignación de acceso. Incluye acceso por ID ajeno, reasignación de padre, falsificación del responsable, concurrencia entre ámbitos, agregaciones, capacidades de solo lectura, comparación administrativa, revocación en sesiones existentes, auditoría de limitación de acceso y protección de hijos de otra sucursal.

Las tres comprobaciones transaccionales nuevas verificaron que el cliente ve padres y auditoría recién creados, que un fallo intermedio revierte todas las escrituras y que el acceso SQL crudo sigue denegado. La prueba se repitió con las fachadas que no exponen propiedades propias.

### Controles del repositorio

Los resultados consolidados y los controles de Docker se registran en [la evidencia estructurada](2026-10-29-typed-actions-validation.json). Se ejecutaron lint, tipos, cobertura, compilación y la suite separada del frontend. Las seis suites seleccionadas de integración pasaron 34 pruebas contra `coherence_fixes_test`; el contenedor de pruebas se devolvió a su estado detenido. No se truncó la base principal ni la base usada para la evaluación real.

La cobertura global medida fue 77.47 % de líneas y 74.35 % de ramas: 1023 pruebas correctas y tres omitidas por la configuración existente. El frontend pasó 325 pruebas. Las omisiones no se cambiaron para este trabajo.

Durante la verificación se corrigieron fallos encontrados en las pruebas de navegador y formato. Un intento simultáneo de validación con el plan de alcance terminó con salida 137 durante instalación; no se consideró correcto. El reintento detectó una infracción `no-this-alias` en la plantilla de PrismaService; se sustituyó el alias por una función de fachada, sin desactivar la regla de lint. La ejecución final secuencial pasó los cinco controles y, después, las 24 comprobaciones HTTP y la prueba de navegador. Los intentos fallidos y su resolución se distinguen en la evidencia.

## Pendiente y siguiente paso

1. Recuperar disponibilidad del proveedor configurado, o seleccionar explícitamente otro proveedor autorizado.
2. Generar y revisar los cinco cuerpos de ventas contra el plan aprobado. La revisión estática no basta.
3. Ejecutar el flujo real con precios por sucursal, HALF_UP, auditoría, concurrencia, rollback, idempotencia y referencias ajenas.
4. Completar los contratos y políticas de las demás familias de acciones sin ocultar sus carencias mediante desactivaciones automáticas.
5. Producir una nueva entrega únicamente cuando todas las acciones requeridas y todos los controles obligatorios pasen. Después revisar fidelidad visual y generar el manual desde ese snapshot.

La especificación y [ADR-017](../decisions/ADR-017-contratos-tipados-de-acciones.md) documentan los mecanismos nuevos. El [reporte de contratos pendientes](2026-10-28-business-contracts-next-delivery.md) conserva el diagnóstico anterior; las decisiones aprobadas y verificaciones de esta continuación se registran aquí sin reescribir aquella evidencia.
