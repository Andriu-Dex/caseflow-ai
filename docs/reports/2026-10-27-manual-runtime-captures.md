# Capturas reales para el manual del software generado

Fecha: 2026-10-27. Rama: `feat/visual-user-manual`.

## Resultado

El manual puede incorporar capturas reales de la aplicación generada, ejecutada en un entorno Docker desechable. Se muestran por pantalla y rol, se incluyen en HTML y PDF y se añaden como PNG a la entrega conjunta. Una captura fallida o una pantalla que necesita datos específicos conserva el esquema del flujo y muestra su limitación.

Antes de empezar se creó el commit solicitado del trabajo anterior:

`bfb19cb feat(manuals): generate versioned visual user guides`

La implementación de capturas descrita en este reporte queda **sin commit**. No se modificaron ni fusionaron `develop` o `main` y no se creó un pull request. Tampoco se empaquetó un ejecutable.

## Flujo integrado

1. El software debe contar con un `GeneratedProjectSnapshot` validado.
2. La generación inicial del manual continúa como trabajo independiente del estado READY del software.
3. Tras crear el primer candidato, se encola la captura en la infraestructura de trabajos de construcción existente. No se necesita una inferencia adicional ni conexión con un proveedor de generación visual.
4. Se lee el ZIP del snapshot y se comprueba su SHA-256 antes de utilizarlo. Se rechazan archivos con rutas inseguras, enlaces simbólicos, exceso de entradas o expansión superior al límite establecido.
5. El capturador prepara dependencias, compila la aplicación sin red y la inicia con una base vacía y sesiones de prueba.
6. Playwright abre las rutas del manual con los roles correspondientes. Comprueba respuesta HTTP, ruta final, encabezado visible, errores del navegador, fallos de API e imágenes que no cargan.
7. Las imágenes y los resultados pendientes se incorporan a una **nueva versión candidata**. Se conserva el texto de la última versión guardada, incluso si fue editado mientras se preparaba Docker. La comprobación humana de las tareas vuelve a quedar pendiente.
8. OWNER y EDITOR pueden solicitar otra captura desde «Manual de usuario y entrega». Una tarea activa impide iniciar otra y bloquea la revisión o aprobación hasta que termina.

El backend mantiene la comprobación aunque una petición evite la interfaz. La llamada interna acusa recibo sin esperar a que termine Docker, como en la validación de construcción, para no depender de la duración de la conexión HTTP del worker; una prueba comprueba ese comportamiento con el trabajo todavía pendiente. Las descargas históricas siguen perteneciendo a su versión exacta.

## Aislamiento de ejecución

`RuntimeCaptureProvider` es la abstracción de integración. `DockerRuntimeCaptureProvider` contiene el controlador de ejecución; el servicio del manual no invoca directamente un navegador o comandos Docker.

El controlador utiliza comandos establecidos en el producto. No ejecuta el Dockerfile o Compose del ZIP y no recibe comandos o direcciones de navegación libres del usuario.

- Node 24 y pnpm 11.27.0 para el perfil actual del TargetTemplate.
- Navegador y paquete Playwright 1.55.0, con versiones coincidentes.
- Instalación con lockfile congelado, scripts de instalación deshabilitados y sin cargar el hook pnpm del proyecto.
- Durante la instalación solo hay manifiestos y lockfile; el código de la aplicación se copia después.
- Preparación explícita del motor de Prisma antes de retirar el acceso a red.
- `verifyDepsBeforeRun: false` en la configuración privada del capturador, para impedir instalaciones implícitas al ejecutar los comandos posteriores. No cambia la configuración del repositorio ni del ZIP original.
- Compilación con `--network=none`.
- Aplicación, PostgreSQL y navegador en una red Docker interna con modo de gateway `isolated`, sin puertos publicados.
- Volúmenes de trabajo exclusivos; sin directorios del usuario ni socket Docker montados en el código generado.
- Variables limitadas al entorno desechable; sin credenciales de CASEFlow ni datos de otros proyectos.
- Límites de CPU, memoria, procesos y tiempo. El navegador y los procesos de preparación y ejecución tienen además topes propios.
- Navegador con usuario `pwuser`, capacidades eliminadas, `no-new-privileges`, seccomp y sandbox de Chromium.
- Solicitudes del navegador limitadas a los orígenes internos de la web y la API.
- Limpieza de contenedores, volumen, red y archivos temporales en el bloque de cierre, incluyendo las rutas de error.

La creación del esquema con Prisma ocurre únicamente en la base nueva y desechable. No se utiliza para cambiar la base de CASEFlow ni el software oficial. Las imágenes de herramientas de Docker se conservan como caché; no contienen el código generado.

El perfil seccomp parte del publicado para Playwright v1.55.0. Se permitió `chroot` para el espacio de nombres de Chromium: la prueba real comprobó que el filtro condicionado a capacidades lo bloqueaba al eliminar todas las capacidades. La solución conserva el sandbox y no añade `SYS_ADMIN`, `SYS_CHROOT` ni modo privilegiado.

## Datos, versiones y autorización

Se añadió la tabla relacional `user_manual_captures`. Cada fila identifica tarea, conjunto de captura, rol, perfil, resultado, motivo, ubicación privada, hash y dimensiones. Las filas históricas son inmutables y solo se insertan en la transacción que crea la versión del manual.

Los controles de base de datos comprueban:

- pertenencia del archivo a proyecto, snapshot y conjunto;
- correspondencia del rol con la tarea;
- estados admitidos;
- presencia de hash y dimensiones cuando existe una captura;
- ausencia de metadatos de imagen cuando el resultado es fallido o pendiente;
- prohibición de modificar el historial o insertar evidencia después de crear la versión.

El trabajo existente conserva una marca `capture_requested` para distinguir la preparación del texto de la captura. No se crea una segunda arquitectura de colas. Los inicios y resultados se registran con proyecto, snapshot, conjunto, perfil y cantidades, sin tokens ni contenidos sensibles.

La lectura de PNG exige autenticación y pertenencia al proyecto. La consulta también filtra por snapshot y versión; conocer el UUID de otra imagen no permite descargarla. Al recuperar el objeto se verifica su hash. El endpoint responde como PNG y evita almacenamiento en caché compartida.

Editar el texto crea una versión nueva que conserva las referencias gráficas. Repetir la captura crea otro conjunto y otra versión; no altera las capturas aprobadas anteriores. La eliminación autorizada de un proyecto elimina sus filas y objetos privados asociados.

## Interfaz y exportación

La página ofrece «Capturar o reintentar pantallas», informa que Docker puede tardar varios minutos y presenta las imágenes por tarea y rol. Distingue imágenes reales, pendientes y esquemas. Mientras el trabajo está activo bloquea nuevas capturas, edición y revisión en la interfaz. El servicio también bloquea las transiciones de revisión.

HTML incorpora PNG como datos embebidos, con una política de contenido que permite esas imágenes y mantiene el documento utilizable sin conexión. Se comprobó que las tres imágenes cargan tanto a 1280 como a 390 píxeles de ancho, sin desbordamiento horizontal.

PDF incorpora las imágenes, identifica su rol y estado inicial y pagina las capturas de varios roles antes de los pasos numerados. Los fallos se etiquetan «Sin captura». Se renderizó un ejemplo con las capturas reales y se revisó su distribución.

La entrega conjunta mantiene `software.zip` intacto y añade:

- `manual/index.html`;
- `manual/manual.pdf`;
- `manual/capturas/{captureId}.png`;
- `entrega.json`, con versión, hashes, ruta, rol, perfil, resultado y archivo de cada evidencia.

El paquete completo sigue requiriendo un manual aprobado. Obtener una imagen no aprueba las instrucciones ni sustituye la comprobación humana.

## Prueba real realizada

Se generó una aplicación sintética con el motor del TargetTemplate, una entidad de catálogo, listado, formulario y dos roles: EDITOR y READER. Su lockfile se obtuvo dentro del sandbox. Después se ejecutó el capturador Docker real y se inspeccionaron las imágenes resultantes.

| Ruta          | Rol    | Resultado | Dimensiones | Tamaño                         |
| ------------- | ------ | --------- | ----------- | ------------------------------ |
| `/items`      | EDITOR | CAPTURED  | 1440 × 900  | 18 321 bytes                   |
| `/items`      | READER | CAPTURED  | 1440 × 900  | 18 321 bytes                   |
| `/items/new`  | EDITOR | CAPTURED  | 1440 × 900  | 19 293 bytes                   |
| `/items/[id]` | EDITOR | SKIPPED   | Sin imagen  | Requiere un registro de prueba |

Hashes SHA-256 de las tres imágenes:

```text
0.png  83e27f400f0b3cd95b098f21ff4347c81dbd5eb3dd92b0bf0c2f0c5ce4a48936
1.png  83e27f400f0b3cd95b098f21ff4347c81dbd5eb3dd92b0bf0c2f0c5ce4a48936
2.png  87fe65081b7fc35442469291dd6c165eb35aa6df52dd29d9864b44f455ef4d3d
```

El listado vacío fue visible y legible y el formulario se capturó como pantalla real. La coincidencia de los dos PNG de listado corresponde al mismo estado vacío; **no acredita permisos de escritura**. No se intentó completar una operación de negocio con READER.

La prueba real detectó y permitió corregir tres problemas antes de dar por terminada la capacidad:

1. pnpm intentaba verificar o instalar dependencias al entrar en comandos de compilación sin red.
2. Prisma intentaba descargar su motor durante la compilación aislada.
3. Chromium no podía completar el `chroot` de su sandbox con el filtro seccomp inicial y todas las capacidades eliminadas.

Se mantuvo el aislamiento y se solucionaron las tres causas. Al terminar no quedaron contenedores de captura de estas pruebas.

Las evidencias de revisión se conservaron fuera del repositorio, en el directorio local de visualizaciones `runtime-capture-qa`: PNG, resultado JSON, HTML, PDF, páginas renderizadas, comprobación de ancho y registro Docker. Los scripts y archivos temporales de diagnóstico no se incorporan al proyecto.

## Verificación

| Comprobación                                          | Resultado                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm run lint`                                       | Correcto                                                           |
| `pnpm run format:check`                               | Correcto                                                           |
| `pnpm run typecheck`                                  | Correcto en todo el monorepo                                       |
| `pnpm run build`                                      | Correcto; 33 páginas web compiladas                                |
| `pnpm run test:coverage -- --maxWorkers=4`            | 962 pruebas correctas, 3 omitidas                                  |
| Cobertura de líneas                                   | 76,38 %                                                            |
| Cobertura de ramas                                    | 71,91 %                                                            |
| Cobertura de funciones                                | 74,97 %                                                            |
| Cobertura de sentencias                               | 75,78 %                                                            |
| Suite web completa con cuatro workers                 | 322 pruebas correctas                                              |
| Suite específica de la página del manual, actualizada | 5 pruebas correctas                                                |
| Manuales y capturador: pruebas unitarias específicas  | 19 pruebas correctas                                               |
| Integración del manual, PostgreSQL real               | 6 pruebas correctas                                                |
| Integración de construcción y proyectos               | 22 pruebas correctas, 1 omitida                                    |
| Comprobaciones de migraciones                         | 5 pruebas correctas                                                |
| Capturador Docker real                                | 3 imágenes obtenidas y 1 ruta pendiente correctamente identificada |
| HTML con imágenes, anchos 1280 y 390                  | Tres PNG cargados y sin desbordamiento                             |

La integración del manual utiliza PostgreSQL real, almacenamiento y cola de pruebas y un capturador simulado. Comprueba cambios de versión, conservación de ediciones concurrentes, retorno al esquema ante fallos, descarga privada, rechazo entre proyectos y versiones, inmutabilidad, restricciones SQL, aprobación y entrega con imágenes. Se prueba además que una evidencia con ubicación de otro proyecto o sin hash se rechaza y revierte su versión completa.

La prueba Docker verifica separadamente el arranque y la captura reales de una aplicación generada. No se presenta la combinación de estas pruebas como una ejecución completa de la interfaz, BullMQ, almacenamiento remoto y aplicación de negocio en producción.

Durante comprobaciones simultáneas con Docker y compilación se observaron tiempos de espera en pruebas pesadas existentes. Las repeticiones con cuatro workers pasaron sin alterar esas pruebas, sus tiempos máximos ni las puertas de cobertura. El renderizador local de PDF emitió avisos de sustitución de fuentes; se revisaron las páginas renderizadas.

## Migraciones

Se añadieron, sin reescribir migraciones históricas:

1. `20261027030000_manual_runtime_captures`: marca del trabajo y tabla de capturas.
2. `20261027040000_manual_capture_scope`: aislamiento de almacenamiento y rol.
3. `20261027050000_manual_capture_image_integrity`: comprobación explícita de valores nulos en imágenes existentes.

Las 70 migraciones quedaron aplicadas mediante `prisma migrate deploy` a la base de desarrollo `caseflow`, conservando Docker en el puerto **5433**, y a las bases aisladas `coherence_fixes_test` y `caseflow_test`. No se cambiaron credenciales ni configuración de conexión. No se borraron datos de proyectos reales.

La especificación y las ADR-013/014 documentan la ampliación como DEC-153.

## Alcance pendiente y límites explícitos

- El perfil inicial utiliza **base vacía y escritorio**. El HTML responsive comprobado no equivale a una captura móvil de la aplicación generada.
- No se crean registros genéricos, no se rellenan formularios autónomamente ni se comprueban todas las transacciones o reglas de negocio.
- Las rutas con parámetros quedan pendientes de datos de prueba adecuados.
- Se ejecutan hasta 40 combinaciones de pantalla y rol; las adicionales quedan señaladas para revisión manual.
- No se certifican permisos solo por obtener la pantalla.
- No se ejecutó ni aprobó nuevamente el proyecto real del usuario para esta comprobación.
- No se hizo una nueva entrega `.exe` ni una prueba del instalador.
- Una terminación abrupta del proceso puede dejar recursos Docker pendientes de limpieza. Los procesos tienen topes propios, pero la limpieza inmediata se garantiza en el cierre normal y en los errores controlados.
- Un futuro cambio de TargetTemplate o toolchain requiere revisar el perfil de ejecución; no se instalan versiones arbitrarias indicadas por una respuesta de generación.

Estos límites se comunican en el producto y no bloquean la revisión manual, el esquema del flujo ni el estado READY del software.
