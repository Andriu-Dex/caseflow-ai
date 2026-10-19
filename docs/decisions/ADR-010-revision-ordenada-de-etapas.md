# ADR-010 — Rehacer en orden los pasos posteriores a un cambio aprobado

- Estado: Aprobado
- Fecha: 2026-10-13
- Decisión: DEC-136

## Decisión

Una aprobación posterior a la evidencia de una etapa obliga a revisar las etapas siguientes que ya tienen evidencia. Crear un borrador no inicia esta revisión. `PIPELINE_ORDER` es el orden compartido de API y web; IMPACT no participa en la propagación.

El primer pendiente es `OUTDATED`; los posteriores con evidencia son `BLOCKED`. Las etapas vacías conservan sus condiciones normales de preparación. Una nueva aprobación o una confirmación de vigencia permite avanzar. La confirmación es un registro de solo añadir, con usuario, fecha y nota opcional, acompañado de `STAGE_CONFIRMED_CURRENT`. Solo OWNER, EDITOR y REVIEWER del proyecto pueden confirmarla.

El diagrama de casos de uso usa la fecha de su generación determinista y debe representar todas las versiones aprobadas actuales. El ER comparte la versión canónica del modelo de datos: revisar el modelo también revisa su representación. Las pantallas compartidas siguen accesibles para resolver el primer subpaso pendiente.

Las confirmaciones no eliminan errores de coherencia comprobables. La construcción y la congelación de diseño comprueban vigencia en el servidor. Solo la ejecución interna ordenada de EXPRESS y BUILD_ONLY puede atravesar estados intermedios; una solicitud externa no puede activar esa excepción. EXPRESS vuelve a derivar el diagrama al aprobar los casos de uso en bloque.

## Coherencia y experiencia

Se conserva el motor de coherencia existente. La matriz también advierte cuando un requisito no funcional no está relacionado explícitamente con el diseño aprobado. Los atributos de calidad se atienden en el componente, nodo o pantalla pertinente; no se exige representar cada RNF en todos los diagramas. Una referencia es cobertura declarada, no una prueba semántica del cumplimiento.

Los avisos indican el cambio y la acción necesaria, permiten una confirmación con nota y preservan el historial aprobado. Una etapa bloqueada puede consultarse mediante una URL directa, pero sus controles quedan deshabilitados; la protección de construcción es independiente de la interfaz.

La migración agrega `stage_confirmations`, sus claves foráneas, índice y protección de solo añadir. Solo el borrado completo del proyecto (`caseflow.project_purge`, DEC-134) puede eliminar esos registros.
