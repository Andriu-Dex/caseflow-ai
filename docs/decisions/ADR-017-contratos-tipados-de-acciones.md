# ADR-017 — Contratos tipados de acciones del proyecto generado

- Estado: Aprobado para implementación.
- Fecha: 2026-10-29.
- Decisión: DEC-156.
- Complementa: ADR-015 y ADR-016.

## Problema

Una acción descrita únicamente por método, ruta y resumen no permite construir un formulario útil ni comprobar la correspondencia entre entrada, respuesta y cliente. Los controles de autorización tampoco demuestran que una operación calcule importes o cambie estados correctamente.

## Decisión

Las acciones personalizadas del ImplementationPlan admiten un `contract` estructurado con `body`, `query` y `response`. Sus valores son escalares, objetos y arreglos acotados. Los objetos rechazan propiedades desconocidas; los decimales viajan como cadenas exactas, con hasta diez posiciones enteras y dos decimales. Las escrituras POST/PUT/PATCH requieren cuerpo y las consultas no lo aceptan. El contrato no sustituye los permisos ni las capacidades de persistencia.

El generador deriva de la misma definición los esquemas compartidos Zod, OpenAPI, tipos del cliente, entradas del controlador y tipos del servicio. La frontera HTTP comprueba también la respuesta antes de entregarla. Un resultado incompatible falla con un mensaje público seguro. Los filtros booleanos admiten `true` y `false`; no se convierte cualquier cadena no vacía en verdadero.

La interfaz genera campos anidados, referencias a listas autorizadas, filtros y presentación estructurada del resultado. Los campos enlazados mediante `bindings` se obtienen de una consulta declarada en la misma pantalla o de una clave UUID creada por el cliente. El plan puede exigir un booleano de habilitación y declarar una navegación de éxito hacia una ruta existente. Estos enlaces son ayudas de interfaz: el servidor vuelve a validar versión, identidad, estado, permisos e idempotencia.

Una consulta de revisión puede usar POST cuando necesita un cuerpo estructurado. Para alimentar un enlace desde POST se exige el perfil de alcance activo y capacidades de datos explícitas, no vacías y exclusivamente READ. La frontera de persistencia impide que esa revisión escriba datos. Una fuente POST con capacidades de escritura no puede habilitar una confirmación mediante enlaces de revisión. Se conserva el requisito de declarar ambas acciones en la misma pantalla.

Las revisiones se invalidan tras modificar datos. Los cambios todavía sin guardar impiden confirmar otra acción que dependa de una revisión. La caché incorpora ruta y ámbito; las respuestas tardías de otra identidad, ruta o ámbito no se publican. Una clave de reintento se conserva ante error y se renueva tras una escritura correcta.

Una operación desactivada por una decisión explícita puede declarar `disabledReason`: la interfaz explica el motivo y el servidor devuelve 403. No se genera un cuerpo ficticio. Los esquemas de salida de planificación automática excluyen este campo para impedir que una propuesta desactive requisitos y eluda las comprobaciones de entrega. Esta representación exige una decisión revisada sobre el alcance; no convierte un requisito pendiente en implementado.

Las entidades admiten restricciones únicas compuestas, validadas contra sus columnas escalares o claves foráneas. La persistencia generada las materializa con Prisma. La corrección de sus reglas de negocio requiere pruebas adicionales.

Cuando una acción declara capacidades de datos de la misma entidad en varias entradas, el controlador conserva su unión sin duplicados. No debe sobrescribir una lectura con una escritura ni añadir operaciones ausentes del plan.

Los diagnósticos TypeScript ubicados dentro de métodos de servicios de acciones pueden utilizar `code-repair.generate@2`: se solicita exclusivamente el cuerpo del método diagnosticado y se aplica mediante sus límites AST. Se conservan firmas, importaciones y los bytes externos al cuerpo; los cambios a métodos ajenos, supresiones de tipos y código no permitido se rechazan. Los demás diagnósticos conservan la reparación de archivos de la versión 1. La granularidad nueva no amplía el máximo de tres rondas ni sustituye la repetición de controles y pruebas.

La frontera de alcance utiliza el mismo cliente transaccional para comprobar padres relacionados y efectuar escrituras. Esto permite crear un padre, sus detalles y su auditoría en una transacción sin consultar fuera de ella. Bajo un actor, las fachadas solo exponen delegados y métodos admitidos; no revelan el cliente subyacente mediante propiedades propias ni permiten SQL crudo.

## Compatibilidad y límites

- Se mantiene `CASEFLOW_WEB_TS_V1`, versión 2, y su catálogo de dependencias. No se añade otra pila ni una dependencia nueva.
- Los contratos son opcionales para preservar los planes históricos. Las acciones sin contrato conservan su comportamiento previo y sus controles de entrega.
- Las propuestas de cuerpos tipados usan `business-logic.generate@6`; el contexto y el hash de reutilización incluyen contrato y reglas. Esto no certifica su significado.
- Los cuerpos siguen sujetos a revisión estática y ejecución exclusiva en Docker. Compilar o superar una prueba genérica no acredita las operaciones de un proyecto real.
- Los planes aprobados y snapshots históricos no se sobrescriben. Cada entrega oficial conserva sus versiones y necesita todos los controles obligatorios.
- Una caída o límite de uso del proveedor conserva la revisión manual y el estado fallido de la corrida; no publica una entrega incompleta.
