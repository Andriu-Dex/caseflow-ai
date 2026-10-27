# Revisión del manual y compatibilidad de capturas

Fecha: 2026-10-27. Rama: `feat/visual-user-manual`.

## Trabajo guardado

Se creó el commit `b0674f0` (`feat(manuals): capture generated application screens in Docker`) con la implementación de capturas existente. Los cambios visuales de la página del manual y del enlace desde construcción se separaron de ese commit para revisarlos antes de integrarlos.

## Causa de las capturas fallidas

Se revisó la entrega de RestGuestMateos con snapshot `068daf1b-1b9b-47a9-8e54-dae7e36d59a0`. La versión de manual examinada, `b220c515-8a5a-4af4-b3ea-0741f32b8172`, contenía 284 combinaciones de pantalla y rol: 40 fallidas y 244 omitidas por el límite de ejecución.

El capturador intentaba obtener una sesión mediante `POST /auth/dev-login`. Ese endpoint existe en versiones recientes del TargetTemplate, pero no forma parte del código de esta entrega antigua. La operación fallaba antes de visitar la pantalla solicitada; no era un problema causado por el rediseño visual del manual.

Se corrigió la compatibilidad mediante sesiones JWT HS256 de prueba, con un identificador de sujeto válido, un rol documentado y una clave aleatoria exclusiva del entorno desechable. El navegador recibe esa sesión antes de abrir cada ruta. No se necesitan endpoints de acceso de desarrollo y `DEV_LOGIN` queda deshabilitado. No se utilizan claves de CASEFlow o de producción y los tokens no se incluyen en los resultados públicos ni en las imágenes.

La preparación de sesiones se hace después de iniciar la aplicación y de construir las imágenes de herramientas, para evitar incluir tokens en su contexto de construcción. También se distinguen errores de sesión, permisos, ruta, navegador e imágenes mediante mensajes controlados, sin publicar respuestas privadas o trazas internas.

## Prueba real sobre la entrega existente

Se recuperó el ZIP original, se comprobó su integridad y se ejecutaron sus 305 archivos dentro del capturador Docker. No se modificó el ZIP, el snapshot ni la versión del manual del proyecto.

SHA-256 original, conservado después de las pruebas:

```text
f0fa7c4152036be58549471b8ac5d64c67ada3279ca1bf191daa1fd75481fbcc
```

Una primera comprobación obtuvo tres capturas: `/login` con Administrador y `/home` con Administrador y Cajero. Después se ejecutó el lote completo de 40 combinaciones que procesaría el manual: **36 capturas correctas y 4 fallidas**.

Las cuatro pendientes corresponden a `/login` con Cajero, Encargado de sucursal, Responsable de catering y Responsable de inventario. El código de esa página carga `api.listUsers()` para obtener opciones del formulario; el controlador de `GET /users` exige el rol Administrador. Este es un problema del flujo de acceso de la entrega generada, distinto de la incompatibilidad del capturador.

Una comprobación adicional confirmó el rechazo HTTP 403 al capturar `/login` con Cajero, mientras `/home` se capturó correctamente con Administrador y Cajero. El aviso ya distingue este rechazo de permisos de una sesión inválida o de otros errores de API.

Se mantiene el rechazo de esas capturas. No se ampliaron permisos para ocultarlo ni se aceptaron pantallas con peticiones fallidas como evidencia válida. Corregir ese flujo requiere revisar su implementación y producir una nueva entrega; no corresponde alterar silenciosamente un snapshot histórico.

Las pruebas se ejecutaron directamente contra el capturador y no guardaron nuevas versiones del manual ni aprobaron tareas del proyecto. Las imágenes y resultados de diagnóstico se conservaron fuera del repositorio.

## Revisión de las vistas

Se conservaron el diseño de tarjetas, la barra de acciones, las búsquedas, los filtros, la paginación, el plegado de tareas y la consulta histórica. Se corrigieron estos detalles:

- Se eliminaron dos importaciones sin uso y se aplicó el formato del proyecto.
- El indicador de ejecución ya no asigna un porcentaje ni marca fases completadas solo por el tiempo transcurrido. Muestra el estado confirmado —en cola o procesando— y una barra indeterminada. El porcentaje de tareas verificadas se conserva porque procede de datos reales.
- El contador de capturas identifica vistas por rol, evitando confundir varias capturas de una pantalla con pantallas diferentes.
- Las capturas fallidas se distinguen de las pendientes.
- Guardar valida también las tareas ocultas por búsqueda, plegado o paginación. Si hay un campo inválido en otra página, se muestra la tarea correspondiente antes de enviar la petición.
- Las pruebas comprueban que editar una tarea filtrada conserva su identidad y no elimina las demás tareas al guardar.
- Los controles de plegado exponen su estado mediante `aria-expanded`.
- El editor queda deshabilitado mientras una petición está en curso para evitar cambios locales durante el guardado.
- Las notificaciones de generación indican que se envió una solicitud, sin anunciar que un trabajo en cola ya terminó.
- La consulta de estado lee primero el trabajo y después el manual: evita que el último sondeo observe un trabajo completado junto con la versión anterior y deje de actualizarse.

## Nombre y alcance del botón

El botón se denomina **«Generar capturas»** antes de disponer de resultados y **«Volver a generar capturas»** cuando ya existe un intento. Este segundo nombre describe mejor su funcionamiento que «reintentar», porque repite el lote inicial y no procesa exclusivamente los elementos fallidos.

La acción prepara el entorno aislado, captura las rutas y crea otra versión candidata del manual con sus tareas pendientes de verificación. No regenera el programa ni sobrescribe el manual aprobado anterior.

Se mantiene el límite de las primeras **40 combinaciones de pantalla y rol** por ejecución. Pulsar el botón repetidamente no avanza automáticamente sobre las 244 adicionales. La interfaz informa expresamente de este límite y de la creación de una nueva versión.

## Comprobaciones

- Pruebas generales y cobertura: **964 correctas y 3 omitidas**, con un worker.
- Cobertura: líneas 76,40 %, ramas 71,92 %, funciones 75,00 % y sentencias 75,80 %.
- Suite web completa: **324 pruebas correctas**.
- Pruebas específicas de la página del manual: **7 correctas**, repetidas tras los últimos ajustes de mensajes y bloqueo del editor.
- Pruebas del capturador: **4 correctas**, incluyendo firma y aislamiento de sesiones, ausencia de tokens en resultados y mensajes seguros para errores de permisos y autenticación.
- Compilación del monorepo y comprobación de tipos: correctas.
- Lint y formato: correctos.

La primera ejecución de cobertura bajo carga tuvo tiempos de espera en pruebas de Prisma, OpenAPI, salud y PDF. La repetición con un worker pasó sin aumentar tiempos máximos, reducir cobertura ni modificar esas pruebas para forzar su aceptación.

No se cambiaron conexiones, credenciales, migraciones, datos del proyecto o ramas oficiales. La revisión del flujo de acceso de la entrega generada y la ampliación de la cobertura a las combinaciones adicionales siguen pendientes.
