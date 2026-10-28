# ADR-016 — Contexto de operación y permisos del proyecto generado

- Estado: Aprobado.
- Fecha: 2026-10-28.
- Decisión: DEC-155.
- Complementa: ADR-015 / DEC-154.

## Decisión

El perfil local de la versión 2 de `CASEFLOW_WEB_TS_V1` admite contexto de operación explícito mediante `authentication.local.scope`. Los nombres de entidades, campos, relaciones, roles y etiquetas proceden del plan versionado. Las sucursales de un restaurante son un caso de uso de este mecanismo; no constituyen reglas del núcleo.

El perfil enlaza cuenta, catálogo de permisos por operación, roles, asignaciones y entidad de alcance. Cada entidad dependiente declara todas sus rutas singulares de propiedad mediante `operationScope`. El plan distingue registros compartidos opcionales, autoría y propiedad individual. Una ruta ausente o inconsistente impide validar el plan.

La sesión se comprueba contra persistencia en cada solicitud. La identidad, los roles, los permisos y los ámbitos disponibles se calculan en el servidor; una cabecera selecciona un ámbito permitido, sin conceder permisos. El contexto obsoleto se puede consultar para recuperar la interfaz tras una revocación. Los cambios de ámbito cancelan consultas y eliminan la caché y el estado de las páginas anteriores.

El servidor propaga el actor mediante contexto asíncrono por solicitud. La frontera de persistencia aplica el alcance a lecturas, agregaciones, modificaciones y eliminaciones, comprueba los padres relacionados e inyecta la autoría. El perfil impide SQL crudo bajo un actor y rechaza operaciones o proyecciones anidadas cuyo alcance no pueda garantizar. Las operaciones complejas usan consultas separadas y transacciones, conservando la frontera de persistencia.

Cada acción personalizada declara capacidades de datos (`dataAccess`) por entidad y operación. Una vista previa no obtiene capacidad de escritura por compartir módulo con una confirmación. La comparación de ámbitos requiere `GET`, roles globales explícitos y `ASSIGNED_SET`; sigue siendo de solo lectura. La administración de cuentas y autorizaciones requiere un rol global.

Los formularios administran relaciones persistentes de roles, permisos compartidos por rol y ámbitos. No se añaden excepciones individuales. Los permisos iniciales se derivan del plan; la inicialización no sobrescribe una configuración existente. La restauración explícita mediante `RESET_ROLE_PERMISSIONS=true` se reserva para recuperación administrativa.

`GET /auth/context` es una consulta de infraestructura de la interfaz compartida; no requiere inventar una acción en el plano. Las operaciones de negocio conservan la comprobación de cobertura de acciones.

## Límites

- Las rutas de propiedad son singulares, con profundidad y cantidad acotadas por el contrato. Un modelo que requiera otras formas debe ampliar el perfil y sus verificaciones explícitamente.
- Las proyecciones, conteos y escrituras anidadas de entidades con alcance se rechazan cuando no pueden ejecutarse con la misma garantía. La lógica debe consultar directamente las entidades necesarias.
- Los catálogos compartidos se declaran como tales en el plan; no se convierten implícitamente en datos por ámbito.
- La frontera de persistencia no demuestra corrección de importes, transiciones o reglas de negocio. Estas requieren pruebas de sus operaciones reales.
- Una captura acredita una pantalla del código ejecutado; no acredita equivalencia visual con el boceto ni finalización de un flujo.
- Las versiones y snapshots previos se conservan. Una nueva entrega debe superar todos los controles de validación.
