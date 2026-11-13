# Revisión del candidato y evaluación de entrega oficial

Fecha: 9 de noviembre de 2026. Rama: `feat/construction-official-candidate`.

## Veredicto

**La entrega oficial todavía no puede publicarse.** Las correcciones de alcance resolvieron el caso observado y las operaciones evaluadas pasan, pero la generación oficial se detuvo al contrastar el listado de productos con su diseño aprobado. No se creó un nuevo snapshot ni se aprobó un manual.

La cuota de ChatGPT sí estuvo disponible: se realizaron llamadas reales satisfactorias. El bloqueo final corresponde a funcionalidades de interfaz pendientes, no a la cuota.

## Revisión de los cambios recibidos

- `dc42e09`: la separación de controles, mensajes y resultados conserva el contexto de cada operación y permite compartir filtros. Las pruebas comprueban que una respuesta tardía no se publica después de modificar la selección y que el cambio de sucursal no conserva resultados de otro ámbito.
- `b2ff0a1`: priorizar la relación directa de ámbito evita ocultar un gasto propio que tiene una referencia de categoría inconsistente. La operación puede detectarlo y rechazarlo. Se mantienen las consultas separadas de relaciones, las comprobaciones de escritura y los controles de ámbitos ajenos. La evaluación real incluye esos rechazos.
- `7b1397a`: permitir tiempos configurables es útil, pero faltaban límites, validación de configuración y sincronización con el temporizador interno del navegador. Se corrigieron antes de continuar.

## Correcciones realizadas durante esta revisión

### Capturas

Los tiempos de espera rechazan valores vacíos, cero, negativos, fraccionarios, no numéricos y excesivos antes de llamar a Docker. Se conservaron las unidades de la configuración recibida y se documentaron en `.env.example` y ADR-014:

| Variable                   | Unidad       | Intervalo   | Predeterminado |
| -------------------------- | ------------ | ----------- | -------------- |
| `CASEFLOW_BUILD_TIMEOUT`   | milisegundos | 1000–600000 | 600000         |
| `CASEFLOW_CAPTURE_TIMEOUT` | segundos     | 1–720       | 240            |
| `CASEFLOW_BROWSER_TIMEOUT` | milisegundos | 1000–600000 | 180000         |

El plazo global sigue siendo de doce minutos. El contenedor de aplicación dispone de terminación forzada posterior al timeout, y el navegador recibe el mismo límite validado que su controlador. Las pruebas verifican los argumentos efectivos y la ausencia de llamadas a Docker ante configuración inválida.

Commit: `f368b43` — `fix(capture): validate and synchronize runtime timeout limits`.

### Presentación genérica de resultados

La adaptación real detectó que separar los campos raíz no permitía representar adecuadamente los indicadores y sus desgloses. El contrato admite ahora `collectionLayout: CARDS | TABLE` para arreglos de objetos y `groupBy` sobre un campo visible de texto o enumeración del mismo objeto. No acepta agrupaciones inexistentes, técnicas o de tipos incompatibles.

El renderizador conserva todos los registros recibidos. Las tarjetas utilizan los datos reales; las tablas conservan columnas y filas de los grupos. No se modifican importes, cantidades, permisos ni reglas de negocio para reproducir los ejemplos del boceto.

Los resultados `DATETIME` se presentan en la zona `timeZone` explícita de la respuesta. El elemento `time` conserva el instante original en `datetime` y `title`. Las fechas operativas `DATE` no cambian de zona.

Los controles muestran la descripción aprobada de la operación antes de consultar. En recomendaciones se aclara su carácter orientativo, la ausencia de cambios automáticos y de inferencia causal, y el significado de una lista vacía bajo el catálogo ratificado.

El adaptador deja de enviar el componente de acciones a pantallas que no lo utilizan. Una prueba comprueba que modificar ese componente ajeno no invalida la presentación de una pantalla sin acciones de ese tipo.

Commit de presentación: `a8c59b2` — `feat(code-generation): add structured result views and contextual notices`.

### Datos versionados del proyecto

Se conservaron las versiones aprobadas anteriores:

- Plan v22, `343ac89c-2535-4625-b3c0-adc51c2fe9da`: indicadores en tarjetas y desgloses en tablas agrupadas.
- Plan v23, `84fe4085-557e-46db-80db-9c9baf3b5092`: aviso previo y aclaración del catálogo ratificado de recomendaciones.
- Versión de trabajo evaluada: `8567a87f-f55c-4751-bc7b-385c75872140`, con 353 archivos y 31 acciones implementadas, sin acciones personalizadas pendientes.

Los cuerpos de negocio se reutilizaron para estos cambios de presentación y aclaración; no se solicitaron nuevas implementaciones de sus cálculos. Los planes y archivos de trabajo permanecen en la base del proyecto, no se transfieren como una entrega mediante Git.

## Resultado de la generación oficial

Última corrida: `e615b304-d3bc-4188-bdd5-9e31bf46e02e`, estado `FAILED`.

Conservó las 31 acciones de negocio y seis composiciones de pantalla validadas antes de detenerse en `/products`. Esas composiciones son checkpoints de adaptación, no aprobaciones visuales humanas ni un snapshot oficial.

Durante un intento anterior, el watcher de desarrollo reinició la API al compilar dependencias. Se utilizó después una API estable para las corridas, preservando los checkpoints. No se modificaron configuraciones ni credenciales de conexión para solventarlo.

## Bloqueo pendiente: generador de listados

La revisión del código confirma los hallazgos de la adaptación:

1. **Paginación sin efecto.** Los enlaces anterior y siguiente apuntan a la misma ruta; `api.listProducts()` no recibe página y no define un orden de consulta estable.
2. **Reintento sin consulta nueva.** Consultar y reintentar pueden convertirse en enlaces al listado, en lugar de invocar `refetch` o invalidar la consulta correspondiente.
3. **Identificador ausente.** La tabla usa `row.id` como clave, pero sus columnas se obtienen de los primeros campos de la entidad y no incluyen el identificador exigido por esta pantalla.
4. **Encabezados sin etiquetas de presentación.** `labelOf(field.name)` humaniza identificadores técnicos ingleses, lo que no garantiza etiquetas en español.
5. **Acción implícita ajena a la pantalla.** El generador inserta un acceso «Nuevo» cuando existe un formulario, aunque las acciones explícitas de esta pantalla definan una consulta de solo lectura.

La implementación compartida está en `apps/api/src/code-generation/engine/frontend.templates.ts`, especialmente `actionControl` y `listPage`. El plan contiene quince rutas `LIST` que utilizan este generador: deben revisarse por sus requisitos particulares; no se afirma que todas tengan exactamente el mismo fallo.

La corrección siguiente debe ser una sección completa de contrato, API, cliente y UI: paginación explícita con orden estable y alcance preservado, controles de consulta/reintento con efectos verificables, identificadores y etiquetas de presentación, y respeto a las acciones aprobadas de cada pantalla. No basta con cambiar las etiquetas o reconocer palabras españolas en el generador.

## Verificación ejecutada

- Compilación completa del monorepo: correcta.
- Lint, formato y typecheck: correctos.
- Suite raíz con cobertura: **1053 correctas y 3 omitidas**. Cobertura: 77,33 % de sentencias, 75,05 % de ramas, 77,05 % de funciones y 77,93 % de líneas.
- Integración focalizada de generación de construcción: **6 correctas**.
- Candidato generado en Docker: instalación, lint, tipos, pruebas y compilación correctos.
- Evaluación HTTP/persistencia: **295 comprobaciones correctas**: inventario 35, ventas 35, movimientos/mínimos 45, anulaciones/correcciones 65 y reportes/indicadores/catering/adjuntos 115.
- Navegador: **16 comprobaciones correctas**, incluidas tarjetas y tablas sin pérdida de filas, hora local con UTC conservado, aviso previo, filtros compartidos, descarte de respuestas tardías, aislamiento entre sucursales, CSV, PDF privado y recorrido móvil.

Se corrigió un filtro de ruta del comando de integración que inicialmente no encontraba archivos. La ejecución contabilizada utiliza `apps/api/test/integration/construction-generation-runs.integration.spec.ts`.

La evidencia estructurada está en [2026-11-09-official-candidate-review.json](./2026-11-09-official-candidate-review.json).

## Límites y siguiente paso

Las pruebas funcionales ejecutadas no acreditan paginación, recuperación de errores ni fidelidad visual completa de los listados. Las 75 pantallas restantes incluyen la bloqueada y no están certificadas por esta corrida. No se repitió la suite completa de integración ni una evaluación completa de todos los CRUD o requisitos no funcionales.

El snapshot anterior `068daf1b-1b9b-47a9-8e54-dae7e36d59a0` permanece conservado. No existe una nueva entrega oficial, ZIP final, manual aprobado ni una revisión visual integral. Tampoco se generó un instalable.

Primero debe completarse el generador de listados y repetirse la generación desde el plan revisado. Después corresponden los controles Docker oficiales, la comparación visual de la aplicación ejecutada con los bocetos, la generación de capturas y la revisión humana del manual del nuevo snapshot. No se debe aprobar un manual utilizando las capturas de la entrega anterior.
