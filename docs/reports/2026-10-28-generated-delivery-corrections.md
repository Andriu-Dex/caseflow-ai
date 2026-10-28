# Correcciones del generador y verificación de RestGuestMateos

Fecha: 2026-10-28. Rama: `feat/visual-user-manual`. Cambios de esta implementación sin commit.

## Estado real

La implementación incorpora una nueva versión de plantilla, autenticación local funcional y una etapa de composición basada en el diseño congelado. **Todavía no existe una nueva entrega oficial completa de RestGuestMateos.** La corrida real se detuvo al detectar enlaces funcionales ausentes en «Inicio de operación». No se creó un snapshot READY, no se reemplazó el ZIP anterior y no se presentan las capturas de prueba como evidencia de que las 80 rutas funcionan.

El plan vigente es la versión **7**, `81b8ba13-10d2-47e2-821a-c0988cf38942`. El usuario autorizó sustituir el plan vigente e inventar una matriz inicial de permisos. Se publicaron versiones nuevas mediante los servicios existentes; se conservaron las versiones históricas y sus aprobaciones.

## Causas encontradas

1. Las capturas del manual mostraban el código generado, pero el frontend se construía con plantillas genéricas. Capturar de nuevo ese mismo snapshot no podía reproducir el diseño de Stitch.
2. El plan anterior representaba el acceso mediante operaciones de sesión y permitía que `passwordHash` apareciera en los contratos y formularios genéricos.
3. La navegación anterior consultaba usuarios administrativos incluso para cuentas sin ese permiso. Esto explicaba capturas rechazadas con 403.
4. Una compilación correcta y la presencia de botones con los textos esperados no demostraban que las acciones implementaran el flujo de negocio.
5. Las acciones personalizadas no recibían explícitamente la identidad verificada del solicitante y su contexto omitía el texto completo del análisis histórico.
6. Al probar el nuevo adaptador con el proveedor real, la normalización eliminó propiedades nulas obligatorias. Se restauran mediante valores predeterminados, conservando la validación del dominio.
7. El control de estilos confundía `border-border` con una utilidad `order-*`. Ahora comprueba utilidades completas.
8. La página de acceso no tenía un aviso específico de sesión expirada. Se añadió la redirección y el estado correspondiente, con limpieza de caché al cambiar de cuenta.

## Cambios implementados

### Plantilla y autenticación

Se conserva `CASEFLOW_WEB_TS_V1@1` y se incorpora `CASEFLOW_WEB_TS_V1@2`; es el mismo stack, no otro TargetTemplate. El catálogo de la versión 2 añade `argon2@0.45.1`.

`authentication.local` identifica explícitamente cuenta, identificador de acceso único, hash interno, estados, relación de roles y campos de sesión. El esquema comprueba que las referencias existan y que no se expongan sesiones mediante CRUD público.

El código generado verifica credenciales reales con Argon2id, crea sesiones persistidas, verifica sesión y roles actuales en cada petición e invalida sesiones al cerrar, cambiar contraseña o desactivar una cuenta. Se añade una operación administrativa específica de desactivación; no se representa mediante creación de otro usuario.

Los hashes se excluyen de los DTO, OpenAPI, cliente, formularios y respuestas. El acceso de desarrollo no se genera para este perfil. El navegador recibe opciones autorizadas desde el servidor; no consulta la lista administrativa de usuarios para construir su navegación.

Los límites de intentos por cuenta y dirección son configurables y locales al proceso. No se presentan como una política deducida de los requisitos ni como una solución distribuida. El perfil requiere nueva autenticación al expirar; no incluye renovación silenciosa de tokens.

### Composición y trazabilidad

El adaptador utiliza las versiones exactas del plano y del boceto congelados en la línea base del proyecto. Lee HTML privado como datos y no ejecuta sus scripts ni copia registros, importes, estadísticas o garantías ilustrativas.

La propuesta es un árbol declarativo de contenedores y controles existentes. Se comprueban referencias únicas, cobertura, ciclos, profundidad, pertenencia a formularios y estilos. La transformación mediante AST conserva consultas, validadores, eventos y controles; preserva clases dinámicas y evita tarjetas vacías al componer mensajes condicionales.

El shell compartido adapta navegación superior, lateral o ausente por ruta. Las funciones ya implementadas en el shell y el cliente se incluyen como contexto del adaptador para evitar pedir controles duplicados.

El manifiesto `docs/design-fidelity.json` registra fuentes, rutas, hashes de páginas y componentes compartidos. Se comprueba su cobertura y que una reparación no haya descartado la composición. **Es evidencia estructural y de procedencia; no es una certificación de fidelidad visual.**

Se conservan checkpoints validados de presentaciones y acciones de negocio, identificados por sus insumos y limitados al proyecto y línea base. No son snapshots oficiales. Su finalidad es evitar repetir trabajo válido después de un fallo posterior.

### Contexto de negocio y comprobaciones de entrega

Las acciones personalizadas reciben la identidad de sesión verificada. Su contexto recupera versiones históricas a través del plan de generación congelado: descripciones de requisitos, condiciones, flujo principal, alternativas y restricciones no funcionales. No utiliza automáticamente el análisis más reciente.

La versión 2 rechaza autenticación sin enlaces suficientes, campos públicos de credenciales y determinadas asignaciones incompatibles de acciones. Detiene la generación ante acciones de negocio no implementadas y no permite formalizar como READY un backend que conserve excepciones explícitas de operación no implementada.

Las limitaciones de una pantalla se comunican con su nombre, ruta y enlace faltante. No se sustituyen por una página genérica presentada como diseño completado.

### Capturas

El entorno Docker prepara cuentas y sesiones temporales para aplicaciones con autenticación persistida. El controlador verifica firma, expiración, identidad de sesión y rol de los tokens. No utiliza cuentas ni secretos del producto. Las entregas históricas conservan la ruta de captura compatible.

Se reutilizan las imágenes versionadas del controlador ya preparadas, siguiendo el patrón del sandbox. Esto evitó reconstruirlas innecesariamente cuando Docker Hub presentó un fallo de resolución DNS. No se modificó la configuración de red del equipo.

## Plan y matriz inicial

La [matriz estructurada](2026-10-28-restguestmateos-authorization-matrix.json) es una decisión nueva autorizada por el usuario, no información atribuida a las fuentes anteriores.

| Rol                       | Operaciones asignadas                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrador             | Administración de cuentas, roles, sucursales y configuración; operación de módulos; auditoría y comparación entre sucursales.                                                             |
| Encargado de sucursal     | Catálogo, menús, ventas, inventario, gastos, revisión de comprobantes, reportes e indicadores de su sucursal; operación de catering. Sin administración de cuentas ni comparación global. |
| Cajero                    | Consulta de catálogo y menús; operación de ventas y caja.                                                                                                                                 |
| Responsable de inventario | Consulta de catálogo y menús; operación de inventario.                                                                                                                                    |
| Responsable de catering   | Consulta de catálogo y menús; operación de catering.                                                                                                                                      |

Los roles de lectura y escritura de 44 entidades, los roles de 30 endpoints y las restricciones de navegación de 80 rutas están vinculados en el plan. La comparación entre sucursales queda restringida a Administrador. La auditoría conserva operaciones de lectura; no se habilita modificación arbitraria de su historial.

La política de alcance elegida es: Administrador puede seleccionar cualquier sucursal activa; los demás roles solo sucursales activas asignadas a su cuenta. Se opera en una sucursal a la vez y el cambio debe limpiar los datos visibles de la anterior. No se admiten excepciones individuales a los roles.

**La selección y el filtrado efectivo por sucursal todavía requieren implementación y pruebas.** Las listas de roles del plan no demuestran aislamiento de filas. La matriz JSON distingue expresamente estos estados.

## Prueba real de generación

- Proyecto: `4584e81d-42f3-4501-b0c8-58bac5f7253c`.
- Diseño congelado: `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`.
- Boceto congelado: MCK-005 v1, `2fda49d9-baa6-4da8-9299-49ebec2215d2`.
- Corrida: `5427453c-7739-48a0-9825-d515dc2365c2`.
- Plan utilizado en esa corrida: v5, `5b7bdc5e-8cba-41e1-99af-c9c1a2a5d972`; es anterior a la decisión posterior de matriz.
- Estado final: FAILED; conserva un checkpoint de presentación. Sin snapshot nuevo.
- Duración total registrada: aproximadamente 264 segundos.
- El registro de ejecución muestra 26 invocaciones de negocio y dos de composición mediante el proveedor real configurado. Esto no equivale a 26 reglas de negocio validadas en ejecución.

La pantalla de acceso produjo una composición estructural válida. La siguiente pantalla detectó falta de datos de identidad/contexto y selección de sucursal. Una prueba focalizada confirmó que `GET /auth/options` no implementa la selección ni la conservación de alcance por sucursal.

El código posterior mejora el diagnóstico e incluye capacidades compartidas —cierre de sesión y redirección ante expiración— para distinguirlas de los enlaces que realmente faltan. La corrida histórica no se reescribió con un resultado distinto.

Esta prueba invocó los servicios reales desde un ejecutor local y utilizó el proveedor conectado, con persistencia y auditoría. No comprobó en esa corrida el recorrido completo interfaz → API → cola → worker. El callback y la integración de generación se comprobaron por separado con pruebas automatizadas.

## Verificación realizada

- Build completo del monorepo, build posterior de la API, lint, formato y typecheck ejecutados satisfactoriamente durante esta implementación.
- Suite web separada: 64 archivos, 325 pruebas aprobadas.
- Integración de catálogo, generación y sandbox con PostgreSQL aislado: 19 pruebas aprobadas, una omitida por su condición de ejecución real. No se utilizó ni se truncó la base del proyecto.
- Suite principal con cobertura: 1009 pruebas aprobadas y tres omitidas. Líneas 77.00 %, ramas 73.21 %, funciones 75.86 %, sentencias 76.38 %. Supera el mínimo de 70 %. Un primer intento concurrente agotó el tiempo de una prueba existente de ZIP de 60 MB; al ejecutar la cobertura separadamente pasó, sin aumentar límites ni debilitar la prueba.
- Plantilla generada en Docker: INSTALL, LINT, TYPECHECK, TEST y BUILD con salida 0. Estos resultados no incluyen una validación completa de las 26 acciones reales ni convierten el proyecto en una entrega READY.
- Prueba HTTP real en Docker: credenciales incorrectas rechazadas, acceso correcto, cierre con revocación, cambio de contraseña con revocación, cuenta inactiva rechazada, acceso administrativo denegado a Cajero, desactivación administrativa protegida, ausencia de hash en respuestas y ausencia de CRUD público de sesiones.
- Capturas Docker: acceso anónimo, inicio de Administrador e inicio de Cajero; las tres CAPTURED a 1440 × 900. El acceso utiliza una composición derivada del boceto; las dos capturas de inicio siguen siendo pruebas de la plantilla funcional. No se publicaron como capturas de un nuevo manual oficial.

La última validación de plantilla registró INSTALL 52.995 s, LINT 7.800 s, TYPECHECK 15.885 s, TEST 29.763 s y BUILD 40.362 s. Incluye pruebas del cliente que reproducen una respuesta 401 tardía de una sesión anterior y credenciales incorrectas en un nuevo intento: ninguna debe invalidar una sesión actual distinta. También se corrigió el caso de una ruta canónica `/access`, que debe conservar su formulario y no redirigirse a sí misma.

Las pruebas de integración verifican además que un checkpoint válido se reutiliza sin llamar al proveedor, y que cambiar una regla del plan impide reutilizar ese cuerpo: si el proveedor no está disponible, la corrida nueva falla explícitamente. No se deshabilitó la caché para simular artificialmente un fallo.

## Pendientes que impiden declarar terminada la entrega

1. Implementar contexto de identidad, asignación/selección de sucursal y filtrado de datos en backend conforme a la matriz nueva, incluidas consultas, modificaciones, reportes y acciones personalizadas.
2. Comprobar que los formularios de roles y sucursales guardan realmente sus relaciones; las acciones con distintos textos no deben quedar reducidas a una misma actualización genérica incompleta.
3. Evaluar las 80 rutas frente a sus pantallas canónicas y completar enlaces de datos, formularios y acciones que el adaptador identifique. No se certificaron las 77 pantallas de MCK-005.
4. Ejecutar las reglas de negocio del proyecto real, no solo compilar sus cuerpos o validar su sintaxis.
5. Completar sandbox, revisión visual, snapshot, ZIP y nuevo manual con capturas de esa entrega. No reutilizar imágenes de un snapshot anterior para acreditar el nuevo código.

El siguiente incremento funcional es contexto de operación y aislamiento por sucursal. El generador conserva una comprobación explícita que impide presentar ese trabajo pendiente como una entrega finalizada.

## Continuación del 28 de octubre de 2026

El contexto de operación y sus pruebas se desarrollan en [el reporte de alcance y entrega](2026-10-28-operation-scope-and-delivery.md). Ese reporte actualiza los pendientes de contexto y documenta un bloqueo adicional en los contratos de negocio. Los resultados históricos de este documento se conservan como tales.
