# Manual visual del software generado

## Entrega implementada

Rama `codex/visual-user-manual`, creada desde `develop` después del commit `787287a`. Esta implementación queda sin commit. Se incorporó un manual de usuario visual al resultado de construcción, sin empaquetar un ejecutable ni desplegar una edición web.

La entrada aparece como **«Manual de usuario y entrega»** junto al ZIP de cada validación `READY`. Cuando se formaliza un snapshot, se encola una propuesta de manual en un trabajo independiente. El responsable puede editar las instrucciones, revisar tareas, consultar el historial y descargar HTML o PDF. La entrega conjunta exige una versión aprobada del manual.

## Fuente y contenido

La generación es determinista y no consume inferencias adicionales. Toma el ImplementationPlan exacto indicado por el snapshot, el plano de interfaz seleccionado en su Design Baseline y los archivos de esa generación. No consulta el último plano de otro proyecto ni reemplaza los identificadores históricos por versiones actuales.

Cada ruta con un archivo generado produce una tarea. Se incluyen el nombre de pantalla, las indicaciones de acceso, roles y restricciones de acciones declarados por el plan, pasos breves y resultados que el usuario debe comprobar. Si la ruta no tiene un archivo generado, la generación falla en vez de documentarla como disponible. El título guarda el nombre del proyecto al crear el manual y se conserva en sus versiones de edición.

Las instrucciones iniciales son deliberadamente conservadoras: no inventan datos de negocio, mensajes específicos de error, plazos o resultados no comprobados. Su elaboración final corresponde a la revisión. El manual es un candidato, no una prueba de que sus instrucciones se hayan ejecutado.

## Presentación visual

- HTML sin conexión, sin JavaScript ni recursos remotos, con índice navegable de tareas.
- Guías por pantalla y rol, pasos numerados, conectores y tarjetas de comprobación.
- PDF con portada, índice de tareas, ayuda breve, guías por tarea, tarjetas visuales y numeración de páginas.
- Indicación visible de borrador mientras el manual no esté aprobado.
- Advertencia si el software tiene un snapshot posterior al que documenta el manual.

**Los gráficos de esta entrega son esquemas de flujo, no capturas de una aplicación ejecutada.** No se presenta una imagen de Stitch como evidencia del software final. No se implementó captura automática de pantallas: esa capacidad necesita ejecución de la aplicación y recogida de evidencias dentro de una frontera aislada. Los manuales actuales ya son visuales y utilizables sin depender de esa capacidad.

## Modelo y protección del historial

Se añadió el tipo de artefacto `USER_MANUAL`, con prefijo de código `MAN` y las versiones habituales de `ArtifactVersion`. El contenido es relacional:

- `user_manual_details`: introducción y snapshot exacto.
- `user_manual_tasks`: tareas, ruta, archivo generado y comprobación humana.
- `user_manual_task_roles`: roles por tarea.
- `user_manual_steps`: instrucciones y resultados que comprobar, ordenados.
- `user_manual_jobs`: trabajo único por snapshot y estado independiente.

Las restricciones y triggers verifican pertenencia al proyecto y al snapshot, inmutabilidad del contenido, inserción de detalles únicamente durante la creación de la versión y aprobación con todas las tareas verificadas. No se utiliza JSONB para sustituir estas entidades. Los códigos no se reutilizan.

Se incorporaron dos migraciones aditivas. La segunda ajusta el control de la transacción de inserción: comparar la fecha de creación con `transaction_timestamp()` resultó demasiado estricto por la fecha que proporciona el cliente. Se usa la identidad de la transacción (`xmin` y `txid_current`) para mantener la protección sin depender del reloj. No se reescribieron migraciones históricas ni se usó `db push`.

Las versiones se editan creando otra versión completa; la anterior conserva sus instrucciones y verificaciones. Se verifica `expectedVersionId` bajo bloqueo para rechazar ediciones concurrentes obsoletas. La eliminación individual de contenido histórico está protegida. La eliminación autorizada del proyecto completo incluye las tablas nuevas en orden de dependencias, conservando la política vigente de purga.

## Revisión y permisos

Todos los pasos deben comprobarse en la aplicación correspondiente antes de aprobar el manual. Modificar instrucciones o introducción en el editor desmarca las comprobaciones afectadas. Guardar crea una nueva versión; posteriormente se envía a revisión y se aprueba o solicita cambios.

Si hay cambios sin guardar se bloquean revisión, aprobación, descarga y cambio de versión. Se puede guardar o descartar explícitamente el borrador local. Esto evita aprobar el texto persistido anterior mientras el editor muestra otras instrucciones todavía sin guardar.

- OWNER y EDITOR: generar/reintentar, editar y revisar.
- REVIEWER: editar y revisar.
- VIEWER: consultar y descargar; no modificar ni aprobar.
- Personas sin pertenencia al espacio y proyecto: acceso rechazado.

La API y la base aplican las restricciones; no dependen solo del botón de la interfaz. La aprobación del manual registra origen `HUMAN`, también cuando el proyecto utiliza la ruta BUILD_ONLY. Es una revisión documental posterior e independiente de la automatización del diseño.

## Trabajo independiente y recuperación

Se reutiliza la cola de construcción con el tipo `user-manual`, compatible con BullMQ y con la cola en proceso del escritorio. El trabajo usa `QUEUED`, `RUNNING`, `COMPLETED` o `FAILED`, con captura atómica para no ejecutar dos veces la misma entrega.

Una propuesta se crea como máximo una vez por snapshot. Si el envío a la cola falla, el manual conserva un error seguro y puede reintentarse. Al reiniciar se recuperan trabajos en cola y se marcan los interrumpidos. Fallar el manual no revierte `READY`, no elimina el snapshot y no ejecuta de nuevo la construcción.

Se auditan generación, nuevas versiones, revisión y descarga. El registro no contiene claves, credenciales ni contenido completo del manual.

## Exportación y entrega

HTML y PDF pueden descargarse como borradores para revisar. Para la entrega conjunta se exige un manual aprobado de ese snapshot. El ZIP exterior contiene:

```text
software.zip
manual/index.html
manual/manual.pdf
entrega.json
```

`software.zip` es el archivo original; se verifica su SHA-256 antes de empaquetarlo. El manifiesto identifica snapshot, versión de manual y hashes del software y documentos. No se modifica `archiveStorageKey`, `archiveSha256` ni el contenido del snapshot oficial. El paquete exterior y los documentos son derivados; el PDF puede incluir metadatos de exportación distintos entre descargas, por lo que no se promete identidad binaria del paquete exterior.

Hay un límite para el empaquetado conjunto; las entregas grandes pueden descargar software y manual por separado.

## API y componentes

Ruta base: `/projects/{projectId}/generated-project-snapshots/{snapshotId}/user-manual`.

- `GET /`: estado del trabajo y última versión del manual.
- `POST /generate`: generar o reintentar sin reconstrucción.
- `GET /versions/{versionId}`: consultar historial exacto.
- `POST /versions`: guardar una nueva versión con control de concurrencia.
- `POST /versions/{versionId}/transition`: revisión/aprobación.
- `GET /versions/{versionId}/download?format=html|pdf|zip`: descargar documento o entrega.

Los contratos compartidos validan límites de texto, pasos, tareas y UUID. Los endpoints se documentan mediante OpenAPI. La interfaz reutiliza consultas, componentes y descargas autorizadas existentes. Se añadió `/construction/user-manual` con estados de carga, fallo, generación, historial y revisión.

## Comprobaciones realizadas

- Suite de cobertura final: 954 pruebas aprobadas y 3 omitidas; líneas 76,14 %, ramas 71,64 %, funciones 74,98 % y sentencias 75,61 %.
- Suite web completa: 319 pruebas aprobadas en 64 archivos. Tras incorporar la protección de cambios sin guardar se repitió la suite específica del manual: tres pruebas aprobadas, incluida la regresión de bloqueo de aprobación, descarga e historial.
- Integraciones de manuales, sandbox y proyectos: 26 aprobadas y una omitida por la configuración existente. Incluyen trabajo automático, idempotencia, revisión, versiones, rechazo a lectores y personas ajenas, hashes del ZIP y purga completa del proyecto.
- Cierre de la continuación: cinco pruebas específicas de integración del manual aprobadas. La nueva regresión provoca una caída de la cola tras validar un segundo snapshot: el software permanece `READY`, el manual queda `FAILED`, el reintento lo completa sin crear otra generación y el manual anterior se identifica como histórico. El hash del software anterior se conserva.
- Migraciones: cinco pruebas aprobadas en una base `caseflow_test` exclusiva del contenedor de validación.
- Las 67 migraciones se aplicaron a una instancia PGlite nueva en memoria; se comprobó disponibilidad de `USER_MANUAL` y `txid_current`.
- Compilación completa del monorepo aprobada, incluida la web con 33 páginas estáticas. Se repitió compilación de API después del ajuste visual del PDF.
- Typecheck del workspace y lint aprobados durante la implementación.
- Las dos migraciones se aplicaron a la base local configurada, `caseflow` en Docker por el puerto `5433`. No se cambió la configuración ni se reinició o vació esa base.

Las integraciones usan adaptadores falsos para proveedor de generación, almacenamiento y ejecución del sandbox. Verifican el flujo de CASEFlow y la persistencia real en PostgreSQL; no demuestran ejecución real de la aplicación generada ni de sus tareas. Las pruebas de migración se repitieron en una base con el nombre exigido por su suite; el primer intento en `coherence_fixes_test` rechazó únicamente ese nombre.

## Revisión visual

Se creó una muestra sintética con dos tareas y tres páginas PDF. Se extrajo su texto para comprobar legibilidad y paginación y se renderizaron las tres páginas para inspección. Se revisó nuevamente el PDF después de incorporar tarjetas y conectores.

El HTML de esa misma muestra se abrió con Chromium en modo sin interfaz a 1 280 y 390 píxeles de ancho. En ambos casos el documento conservó las dos tareas y cinco pasos y no presentó desbordamiento horizontal. Se inspeccionó su captura móvil. Esta es una comprobación del manual exportado, no de una aplicación generada.

Evidencia local:

`C:\Users\andri\.codex\visualizations\2026\10\26\01a17585-b8d3-7d60-aed7-2f944cf39748\user-manual-qa`

Incluye PDF, HTML, JSON de la muestra, páginas PNG, capturas HTML y `html-layout-check.json`. Los avisos de Poppler sobre fuentes de sustitución no impidieron el renderizado; las páginas inspeccionadas muestran el texto español completo.

[Muestra sintética de formato PDF](/C:/Users/andri/.codex/visualizations/2026/10/26/01a17585-b8d3-7d60-aed7-2f944cf39748/user-manual-qa/manual-visual-sample.pdf).

## Límites explícitos

No se añadieron capturas automáticas de aplicaciones, generación narrativa con proveedores externos, vídeos ni animaciones. No se ejecutó el proyecto de biblioteca real ni se aprobaron sus bocetos o su manual. Tampoco se certificó que cualquier aplicación pueda documentarse correctamente sin revisión: los flujos de negocio complejos requieren completar y verificar el candidato. No se compiló ni empaquetó un `.exe`, no se hizo despliegue y no se creó commit o pull request de esta rama.

La siguiente evaluación del proyecto real debe completar sus datos y diseño, ejecutar la construcción y verificar las instrucciones del manual sobre esa aplicación. El nuevo flujo ya conserva la versión de software exacta y exige revisión antes de entregar el manual como aprobado.
