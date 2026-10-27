# ADR-014 — Capturas reales del manual de usuario

- Estado: Aprobado.
- Fecha: 2026-10-27.
- Decisión: DEC-153.
- Amplía: ADR-013, DEC-152.

## Decisión

El manual puede incorporar capturas de la aplicación generada en ejecución. `RuntimeCaptureProvider` separa esta capacidad del servicio de documentación. La implementación inicial utiliza Docker y Playwright; no ejecuta código generado en el proceso de CASEFlow ni utiliza imágenes de Stitch como evidencia de ejecución.

Se verifica el hash del ZIP del snapshot y se reconstruye ese código con su lockfile. Las dependencias se instalan sin scripts del proyecto antes de copiar el código. La preparación explícita del motor de Prisma pertenece a esa fase. La compilación posterior no tiene red. No se ejecutan el Dockerfile ni el Compose de la aplicación generada: el controlador establece los comandos, contenedores, límites, variables y volúmenes.

La aplicación, PostgreSQL desechable y el navegador se conectan a una red interna aislada sin publicar puertos. No se suministran secretos, cuentas ni datos de CASEFlow. El navegador tiene usuario independiente, perfil seccomp y sandbox de Chromium; solo permite solicitudes a los dos orígenes de la aplicación. Cada sesión utiliza un rol de prueba documentado en el manual y un JWT HS256 emitido con una clave exclusiva del entorno desechable. No depende del endpoint de acceso de desarrollo de la aplicación ni lo habilita. Esto permite capturar entregas anteriores que no incluían ese endpoint sin modificar sus archivos ni su autenticación de producción.

El perfil inicial es `EMPTY_DATABASE_DESKTOP_V1`: vista de 1440 × 900, base vacía y estados iniciales. Las rutas con parámetros necesitan datos de prueba específicos y quedan pendientes. Las capturas no equivalen a una prueba completa de los pasos, de permisos o de las reglas de negocio.

Las capturas se guardan en almacenamiento privado, con hash, dimensiones, rol y conjunto de captura. Pertenecen a tareas de una nueva versión del manual del mismo snapshot. Las versiones anteriores y el archivo del software no cambian. Al incorporar imágenes se conserva el texto más reciente y se reinicia la comprobación humana de las tareas. Las ediciones posteriores conservan la evidencia gráfica sin modificarla.

La generación inicial del manual encola la captura automáticamente. OWNER y EDITOR pueden reintentar desde la interfaz. Una tarea activa impide iniciar otra y bloquea las transiciones de revisión del manual. La generación del software no pierde su estado READY si la captura falla. Los fallos se muestran expresamente y el esquema del flujo continúa disponible.

HTML y PDF incorporan las imágenes disponibles. La entrega conjunta añade los PNG y sus hashes al paquete del manual; conserva intacto `software.zip`. Toda lectura de una captura requiere pertenencia al proyecto y coincidencia del snapshot y de la versión del manual.

OWNER y EDITOR pueden cancelar con `POST …/user-manual/capture/cancel`. En cola pasa a `CANCELLED`; en ejecución pasa a `CANCELLING`, interrumpe el comando de Docker mediante una señal de aborto y limpia los recursos propios antes de finalizar como `CANCELLED`. No se publica una versión parcial y se eliminan las imágenes nuevas aún no incorporadas. La publicación y la cancelación se serializan sobre el trabajo: si la publicación ya terminó, se conserva esa versión completada. Mientras se cancela no se permite reintentar ni revisar el manual. La solicitud queda auditada.

## Límites

- Hasta 40 combinaciones de ruta y rol por ejecución; las entradas que superan el límite no se ejecutan.
- Sin relleno autónomo de formularios, creación genérica de registros ni ejecución de transacciones de negocio.
- Sin capturas de producción, conexiones a bases existentes o navegación a direcciones aportadas libremente por el usuario.
- Sin captura móvil en este perfil inicial.
- Sin aprobación automática del manual por haber obtenido una imagen.
- El cierre normal y los errores limpian los recursos temporales. Una interrupción abrupta del proceso puede dejar volúmenes o contenedores pendientes de limpieza; los procesos de ejecución tienen límites de tiempo propios.

## Referencias técnicas

- [Playwright en Docker](https://playwright.dev/docs/docker).
- [Modos de red de Docker](https://docs.docker.com/engine/network/port-publishing/#gateway-modes).
- [Comprobación de dependencias antes de ejecutar scripts en pnpm](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/settings/build.md#verifydepsbeforerun).

El perfil seccomp parte de `utils/docker/seccomp_profile.json` de Playwright v1.55.0, la misma versión que utiliza el navegador de captura. Añade permiso para la llamada `chroot` que Chromium utiliza dentro de su espacio de nombres; se mantienen `cap-drop=ALL`, el usuario sin privilegios y `no-new-privileges`, sin conceder `SYS_ADMIN` ni `SYS_CHROOT` al contenedor.
