# Contexto de operación, aislamiento y diagnóstico de la nueva entrega

Fecha: 28 de octubre de 2026. Rama: `feat/visual-user-manual`. Implementación consolidada en `a36bbdc`.

## Resultado

Se implementó y comprobó el contexto de operación del software generado: identidad, roles, permisos por operación, asignación y selección de ámbitos, formularios administrativos y aislamiento en persistencia. El mecanismo es genérico; RestGuestMateos aporta sus sucursales y roles mediante el plan.

**La entrega completa no está terminada.** La generación real encontró acciones de negocio sin contrato suficiente y pantallas cuyos controles todavía no representan el diseño aprobado. La comprobación nueva rechaza 23 cuerpos que únicamente lanzaban excepciones. No se produjo un snapshot, ZIP ni manual nuevos, ni se declaró READY el proyecto.

La evidencia estructurada y el estado individual de las 80 rutas están en [2026-10-28-operation-scope-validation.json](2026-10-28-operation-scope-validation.json). Los resultados anteriores siguen documentados en [el reporte de fidelidad y autenticación](2026-10-28-generated-delivery-corrections.md).

## Plan e historial

- Proyecto: `4584e81d-42f3-4501-b0c8-58bac5f7253c`.
- Diseño congelado: `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`.
- Plan actual: versión 10, aprobado; versión `5d444597-efe0-4427-8b93-fae0d0b2c3bc`.
- TargetTemplate: `CASEFLOW_WEB_TS_V1`, versión 2; conserva el mismo stack.
- Las versiones anteriores se conservaron. Los intentos intermedios y sus fallos no se reescribieron.
- La autorización del usuario para reemplazar el plan y proponer la matriz se aplicó mediante los servicios normales de versionado y aprobación. El contenido no se sobrescribió directamente en una versión histórica.

La versión 9 introdujo las asignaciones y capacidades. La versión 10 añadió los campos públicos del contexto que faltaban en la pantalla canónica: identificación y zona horaria de la sucursal. El estado de la cuenta y del ámbito también se presenta.

## Implementación

### Contrato explícito del contexto

`authentication.local.scope` enlaza la cuenta, las asignaciones, la entidad de alcance, sus campos visibles, los roles globales y el catálogo de permisos. El esquema valida esos enlaces y rechaza campos internos o inexistentes para la presentación.

`operationScope` declara todas las rutas singulares de propiedad de una entidad, los registros compartidos admitidos y, cuando corresponde, el autor o propietario. El plan de prueba tiene 44 entidades, de las cuales 35 declaran alcance. Los catálogos compartidos se mantienen explícitos; no se les atribuye automáticamente una sucursal.

Las acciones personalizadas declaran `dataAccess` por entidad y operación. La consulta entre ámbitos exige `GET`, roles globales explícitos y `ASSIGNED_SET`. No concede escritura. El perfil administrativo no permite que una cuenta sin rol global modifique cuentas o autorizaciones.

### Verificación en el servidor

Cada solicitud verifica la sesión persistida, el estado y los roles actuales, sus permisos y los ámbitos activos disponibles. `x-operation-scope` selecciona un ámbito; no concede autorización. Una asignación revocada invalida inmediatamente las solicitudes siguientes del mismo token.

El contexto asíncrono de la solicitud llega a la frontera de Prisma, donde se restringen lecturas, búsquedas por identificador, agregaciones y escrituras masivas. Se comprueban los padres relacionados antes de crear o modificar hijos. La autoría se obtiene de la sesión y no se acepta desde el contrato público.

Las consultas crudas y las operaciones no admitidas se rechazan bajo un actor. Las proyecciones, conteos, filtros o escrituras anidadas cuyo alcance no puede garantizarse fallan explícitamente; deben sustituirse por consultas directas y transacciones. La lógica no obtiene acceso a delegados fuera de sus capacidades declaradas.

Los campos internos se excluyen de consultas y respuestas públicas. También se bloquean accesos a importaciones dinámicas y miembros privados que podrían intentar eludir la frontera de ejecución.

### Interfaz funcional

La pantalla inicial muestra identidad, estado, roles y ámbito. Permite elegir únicamente un ámbito autorizado y presenta sus datos públicos. El cambio cancela consultas, elimina la caché y desmonta el estado previo de las páginas. La consulta del contexto permite recuperarse cuando se revoca la selección actual, sin obligar a cerrar una sesión válida.

La vista administrativa guarda por separado los roles de la cuenta, sus ámbitos y los permisos compartidos por rol. No implementa excepciones individuales. Las relaciones de muchos a muchos se convierten en conexiones persistentes; no son campos decorativos.

La inicialización crea los permisos derivados del plan sin sobrescribir una política ya configurada. `RESET_ROLE_PERMISSIONS=true` permite restaurarla explícitamente para recuperación administrativa.

También se añadió confirmación del cierre correcto en la página de acceso y registro del rechazo por límite de intentos. La expiración y el cierre conservan la limpieza de credenciales y caché.

### Composición visual y comprobaciones

El adaptador recibe ahora la página funcional completa, incluidos los manejadores que los controles referencian. Para autenticación recibe los servicios pertinentes y, al revisar el cierre, la página de destino. Así puede distinguir un comportamiento existente de un enlace ausente en los fragmentos de JSX.

Se conserva `frontend-design.generate` en sus versiones históricas y se añade la versión 6. La versión 5 del generador de negocio incorpora las capacidades de datos y el actor verificado. Las claves de caché incluyen los insumos relevantes; los cambios no autorizan reutilización silenciosa de una composición distinta.

`GET /auth/context` sirve a la interfaz compartida y no exige inventar una acción en el plano. La comprobación de acciones de negocio huérfanas sigue activa y tiene regresión propia.

## Pruebas reales de alcance

Se ejecutaron 21 comprobaciones HTTP dentro de Docker, con PostgreSQL desechable y datos sintéticos. Se comprobaron:

- Identidad y ámbitos obtenidos del servidor.
- Rechazo sin selección y con una selección falsificada.
- Listas restringidas al ámbito elegido y rechazo de identificadores ajenos.
- Rechazo de cambios de padre y creación de hijos en otra sucursal.
- Autoría inyectada por el servidor y rechazo de suplantación desde el contrato.
- Restricción de listas y sumas en una acción personalizada.
- Doce solicitudes concurrentes alternando ámbitos, sin mezcla de resultados.
- Rechazo de escrituras desde una vista previa con capacidad de lectura.
- Comparación entre sucursales solo para el administrador autorizado.
- Eliminación masiva que conserva los registros de la otra sucursal.
- Persistencia de asignaciones y ausencia del hash en respuestas.
- Revocación de ámbitos y permisos con un token emitido anteriormente.
- Recuperación del contexto cuando deja de ser válida la selección.
- Límite de intentos y auditoría del rechazo, con fecha y correlación, sin credenciales.

El navegador comprobó el cambio de ámbito y el guardado de roles y sucursales. Las dos capturas finales de inicio —Administrador y Encargado— terminaron CAPTURED a 1440 × 900.

Las acciones de prueba que ejercitan la frontera de persistencia utilizan cuerpos controlados. **Estas pruebas no acreditan las 26 implementaciones reales del negocio.** Las capturas corresponden a la plantilla funcional de prueba, no a un nuevo manual oficial ni a una certificación visual de MCK-005.

Se corrigieron errores del propio ejecutor de pruebas: un primer intento leyó el archivo de sesiones antes de que estuviera completo; después se ajustaron valores decimales al contrato de texto. Una comprobación adicional de cierre revocó la sesión de captura y provocó una captura fallida; se separó esa comprobación del recorrido de captura. Ninguno de esos intentos se contabiliza como captura aprobada.

## Hallazgo crítico de la generación real

La corrida `fbf1a8fe-be3b-459e-bcdb-995dc7c62a3c` obtuvo 26 propuestas reales de negocio y comenzó la composición visual. Detectó campos faltantes en Inicio; se implementaron. Los intentos siguientes aportaron el código de los manejadores y los servicios que faltaban en el contexto de revisión.

La corrida `089fbfad-ad94-496a-8ec8-36746f716419` alcanzó el panel de indicadores. Las propuestas de composición de acceso, inicio y cierre superaron la validación estructural. El panel carece de filtros de periodo, presentación específica de indicadores y sus definiciones. Esto es un hueco real de implementación, no una diferencia cosmética.

La revisión de los cuerpos de negocio reveló otro problema: 23 propuestas terminan rechazando todos los casos mediante excepciones ordinarias porque no disponen de contratos o reglas verificables. Podían superar sintaxis y tipos sin proporcionar ningún caso correcto.

Se incorporó un análisis conservador de flujo mediante AST. Rechaza cuerpos cuyos caminos alcanzables se pueden demostrar como rechazos permanentes, sin confundirlos con validaciones que conservan un camino correcto. La misma comprobación se aplica a los servicios de acciones durante la validación estructural, también después de reparaciones. No es una demostración semántica general: las operaciones complejas y los retornos vacíos siguen necesitando pruebas de ejecución.

La comprobación final reutilizó los checkpoints existentes y no realizó nuevas inferencias. Corrida: `1fdfc910-b929-42df-8048-8821a932b2d1`. Resultado: FAILED, 23 advertencias persistidas y mensaje resumido. Las otras tres propuestas solo pasaron revisión estática; no se declaran funcionalmente correctas.

Se comprobó en la base que esta corrida produjo **cero snapshots**. El snapshot anterior `068daf1b-1b9b-47a9-8e54-dae7e36d59a0` permanece conservado.

## Comprobaciones del repositorio

- Suite principal con cobertura: 1017 pruebas aprobadas, tres omitidas; líneas 77.18 %, ramas 73.60 %, funciones 76.17 %, sentencias 76.56 %.
- Suite web separada: 325 pruebas aprobadas.
- Integración de construcción, generación y sandbox: 19 pruebas aprobadas, una omitida. Tras ajustar el resumen de errores y la persistencia de advertencias se repitieron las cinco pruebas de generación: todas aprobadas.
- Typecheck y lint finales aprobados. Build completo aprobado; los cambios posteriores del backend también pasaron su build.
- La plantilla se validó en Docker con instalación, lint, tipos, pruebas y build. El resultado y los tiempos de la última repetición se incluyen al final de este reporte.
- La comprobación estructural de cobertura encuentra las entidades y acciones de las 80 rutas. No equivale a evaluación semántica ni visual de esas rutas.

Las integraciones se ejecutaron únicamente contra `coherence_fixes_test` del contenedor aislado. No se truncó la base del proyecto ni `coherence_real_test`. El contenedor de integración se devolvió al estado detenido. No se cambiaron variables de entorno, identidad Git ni configuraciones del usuario. No se ejecutó código generado dentro del proceso principal.

## Trabajo que queda para una entrega completa

1. Completar contratos tipados de entrada, consulta y respuesta de las acciones. Hoy los GET personalizados no reciben los filtros de periodo necesarios y las escrituras dependen de cuerpos genéricos sin un contrato de negocio suficiente.
2. Vincular políticas aprobadas de anulaciones, unidades/conversiones, fechas operativas, redondeo, recomendaciones y transiciones de catering. No resolver su ausencia inventando valores en el generador genérico.
3. Implementar y probar un caso correcto y los rechazos de cada acción, incluyendo atomicidad, idempotencia y conservación histórica.
4. Completar los controles del panel y revisar las 76 rutas restantes. Las tres propuestas iniciales válidas tampoco tienen certificación visual final.
5. Ejecutar el sandbox de la entrega real, producir un snapshot y ZIP nuevos y generar su manual con capturas del código de ese snapshot.

Una propuesta de contratos para revisar se incluye en [2026-10-28-business-contracts-next-delivery.md](2026-10-28-business-contracts-next-delivery.md). No modifica decisiones comerciales pendientes ni presenta propuestas como aprobaciones.

## Última validación de la plantilla en Docker

| Etapa     | Salida | Duración |
| --------- | ------ | -------- |
| INSTALL   | 0      | 30.254 s |
| LINT      | 0      | 7.844 s  |
| TYPECHECK | 0      | 11.635 s |
| TEST      | 0      | 16.524 s |
| BUILD     | 0      | 23.141 s |

Estos resultados corresponden a la plantilla y sus pruebas. La entrega real permanece bloqueada antes del sandbox por las 23 acciones sin implementar.
