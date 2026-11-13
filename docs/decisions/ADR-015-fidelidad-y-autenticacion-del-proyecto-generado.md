# ADR-015 — Fidelidad y autenticación del proyecto generado

- Estado: Aprobado.
- Fecha: 2026-10-28.
- Decisión: DEC-154.
- Amplía: DEC-094, DEC-100, DEC-111, DEC-118 y DEC-153.

## Problema

Las capturas del manual reproducían el código del snapshot correctamente, pero ese código utilizaba pantallas genéricas que no aprovechaban la composición de los bocetos aprobados. Además, un plan podía representar el inicio de sesión mediante CRUD de sesiones y publicar campos internos de credenciales. Una compilación satisfactoria no detectaba esas diferencias funcionales.

## Decisión

Se incorpora la versión 2 del mismo TargetTemplate `CASEFLOW_WEB_TS_V1`. No se añade otra plataforma ni se reescriben snapshots históricos. Conserva el catálogo y la arquitectura anteriores; incorpora `argon2@0.45.1` al catálogo del backend para las credenciales locales.

### Plan explícito de autenticación

El plan puede declarar `authentication.local`, con referencias verificadas a las entidades y campos de cuenta, roles y sesión. Los campos `internal` permanecen en persistencia, pero se excluyen de contratos públicos, formularios y respuestas. Las contraseñas presentadas son transitorias; se derivan con Argon2id. La administración de cuentas requiere roles explícitos.

Las operaciones integradas son acceso, cierre, opciones autorizadas y, cuando el plan lo declara, desactivación. El acceso comprueba credenciales y estado; cada petición verifica la sesión persistida y los roles actuales. El cierre, el cambio de contraseña y la desactivación revocan sesiones. No se genera el acceso de desarrollo para este perfil. La expiración conduce de nuevo al acceso y el cambio de cuenta limpia la caché de consultas del navegador.

Los valores técnicos iniciales de expiración y límites de intentos son configurables y se documentan como política de plantilla, sin atribuirlos al negocio. El limitador por cuenta y dirección es local al proceso: un despliegue con varias instancias debe sustituirlo por un almacén compartido. Este perfil no incorpora renovación silenciosa de credenciales.

### Composición derivada del diseño congelado

El adaptador carga el HTML del boceto y el plano de interfaz de las versiones exactas de la línea base del mismo proyecto. El HTML se trata como datos: no se ejecutan sus scripts ni se copian llamadas, dependencias, registros de ejemplo o importes.

La propuesta contiene únicamente un árbol de contenedores y referencias a controles existentes. Se validan identidad única, cobertura de todos los controles, ausencia de ciclos, profundidad, estilos y pertenencia a formularios. Una transformación mediante AST conserva consultas, validaciones, eventos y controles funcionales. La navegación compartida se compone aparte para evitar duplicarla.

Las operaciones con contrato exponen controles, mensajes y resultados por campo como componentes de un mismo contexto `ActionForm`. El adaptador puede distribuir esos bloques dentro de su contexto original, pero no trasladarlos a otra operación, eliminarlos o cambiar sus enlaces. Los resultados y mensajes ausentes no generan tarjetas vacías al aplicar estilos. `frontend-design.generate@7` y la revisión 7 de la clave de presentación distinguen esta composición de los checkpoints anteriores.

Los datos, formularios o acciones que faltan producen una limitación explícita. No se sustituyen por tarjetas decorativas o valores inventados. El renderizador interno sigue disponible sin proveedor externo; su composición determinista no se presenta como reproducción de un boceto externo.

Cada presentación validada se conserva como checkpoint del trabajo. Su clave incluye versiones de diseño, pantalla, enlaces funcionales, código de partida, HTML y versión del adaptador. Los checkpoints están sujetos a las reglas existentes de proyecto e historial; no constituyen una entrega completada.

### Contexto y entrega verificable

Las acciones de negocio reciben la identidad verificada de la sesión. Su contexto incluye las pantallas y el análisis histórico seleccionado a través del plan de generación congelado, con descripciones completas, condiciones, flujos alternativos y requisitos no funcionales. No se sustituye ese análisis por versiones más recientes.

La versión 2 rechaza planes sin enlaces de autenticación necesarios y detiene la generación si alguna acción de negocio queda sin implementar. La validación estructural impide formalizar como READY un backend con excepciones explícitas de operación no implementada. El manifiesto `docs/design-fidelity.json` identifica el diseño, las rutas y los hashes de páginas y componentes compartidos. Una reparación que los altere requiere nueva revisión de la composición.

El manifiesto acredita procedencia y conservación estructural, no equivalencia visual ni corrección semántica completa. Las pruebas funcionales y la revisión de pantallas siguen siendo necesarias. Las capturas del manual siempre corresponden al código ejecutado del snapshot: los bocetos no sustituyen evidencia de ejecución.

### Captura de sesiones locales

El entorno desechable prepara cuentas y sesiones mediante un comando fijo de la plantilla. Las credenciales son aleatorias y pertenecen exclusivamente a la base temporal. El controlador verifica firma, expiración, identidad de sesión y rol de cada token antes de entregarlo al navegador. Las entregas históricas mantienen su mecanismo de captura compatible sin modificar sus archivos.

## Consecuencias

- Los planes históricos siguen siendo consultables; una entrega nueva puede exigir una versión del plan con enlaces que antes no existían.
- No se promete fidelidad visual por tener HTML válido o una compilación satisfactoria.
- La adaptación externa añade una etapa por pantalla; los checkpoints evitan repetir presentaciones ya validadas con los mismos insumos.
- Las pantallas que necesiten datos o interacciones no representados por la plantilla requieren completar su plan y generador. La limitación debe permanecer visible.
- Permisos por operación, alcance por sucursal u otras reglas de negocio requieren enlaces y verificaciones propios; la autenticación local no demuestra por sí sola su implementación.
