# Manual de usuario de CASEFlow AI

Esta guía explica el uso de CASEFlow AI desde las fuentes hasta la entrega de
software. Está dirigida a quienes analizan, diseñan y revisan proyectos. Describe
el código del repositorio; un instalador anterior puede no incluir todas estas
funciones. Consulta la versión que estás utilizando antes de preparar una entrega.

## Índice

- [Instalar y acceder](#instalar-y-acceder)
- [Crear y seleccionar un proyecto](#crear-y-seleccionar-un-proyecto)
- [Registrar fuentes y aprobar el contexto](#registrar-fuentes-y-aprobar-el-contexto)
- [Requisitos y casos de uso](#requisitos-y-casos-de-uso)
- [Modelos, arquitectura y diseño](#modelos-arquitectura-y-diseño)
- [Revisar coherencia y exportar](#revisar-coherencia-y-exportar)
- [Construir software](#construir-software)
- [Revisar el manual de la aplicación generada](#revisar-el-manual-de-la-aplicación-generada)
- [Resolver problemas](#resolver-problemas)

## Instalar y acceder

1. Elige la [edición Windows](install-desktop.md) o la
   [instalación con Docker](install-docker.md). Para desarrollar usa el
   [README](../README.md#local-setup).
2. Abre CASEFlow AI. En la edición Docker, abre la dirección configurada de la web.
3. Crea una cuenta con el formulario de registro e inicia sesión. Una cuenta de
   escritorio pertenece a esa instalación y no equivale a una cuenta de otra instancia.
4. Trabaja únicamente en los espacios y proyectos a los que tengas acceso.

La IA es opcional. Puedes registrar y editar artefactos manualmente. La generación
asistida requiere configurar un proveedor; la edición de escritorio incluye
**Ajustes de IA**. No escribas claves en fuentes, requisitos ni capturas de pantalla.
Los diagramas renderizados, capturas y validación de código tienen requisitos
adicionales que se explican en las guías de instalación.

## Crear y seleccionar un proyecto

1. Abre **Proyectos** o pulsa **Nuevo proyecto**.
2. Completa los datos solicitados y elige la ruta de trabajo disponible que
   corresponda a tu objetivo.
3. Comprueba el proyecto activo en el selector superior antes de registrar datos,
   generar o descargar información. El selector de idioma determina el idioma de
   las propuestas; la interfaz permanece en español.

La **Ruta Completa** permite revisar las etapas del análisis y diseño. Las rutas
abreviadas pueden automatizar o reducir pasos: no deben confundirse con una
revisión humana de cada artefacto. En `BUILD_ONLY` determinadas aprobaciones se
registran como automáticas; la revisión del manual final sigue siendo humana.

## Registrar fuentes y aprobar el contexto

1. En **Fuentes**, elige el tipo de fuente, título y descripción de lo que representa.
2. Escribe el contenido o selecciona el archivo compatible que ofrezca el formulario.
   Explica su procedencia y alcance; evita información privada innecesaria.
3. Espera el procesamiento cuando corresponda. Abre el detalle y compara el texto
   extraído con el original. Corrige errores de PDF, OCR o transcripción antes de
   usarlo como conocimiento. Guardar correcciones conserva el historial.
4. Si un procesador externo falla, conserva el registro y completa o corrige el texto
   manualmente. Subir un archivo no demuestra que su contenido haya sido entendido.
5. En **Contexto del proyecto**, genera una propuesta o crea el contexto manualmente.
   Revisa problema, objetivo, alcance, actores, restricciones y decisiones pendientes.
6. Aprueba solo cuando coincida con las fuentes. Deja las dudas expresadas como
   pendientes; no conviertas una sugerencia en una obligación sin validarla.

## Requisitos y casos de uso

1. Abre **Requisitos**. Usa **Generar con IA** o **Crear manualmente**.
2. Revisa cada candidato: debe ser comprensible, verificable, atómico y coherente
   con el contexto. Comprueba las referencias a fuentes y separa funciones,
   restricciones de calidad y sugerencias.
3. Corrige valores, actores o reglas inventadas. No apruebes un requisito solo
   porque la respuesta pasó la validación automática.
4. Envía a revisión y aprueba según los permisos de tu rol y las acciones disponibles.
5. En **Casos de uso**, parte de los requisitos aprobados. Comprueba actor, objetivo,
   precondiciones, flujo principal, alternativas y resultado.
6. Revisa el diagrama junto con los casos estructurados: los nombres y relaciones
   deben representar lo documentado, sin añadir funciones ajenas al alcance.

Las propuestas no sustituyen a los artefactos aprobados. Una aprobación fija una
versión; las correcciones posteriores deben conservar el historial.

## Modelos, arquitectura y diseño

Sigue el orden habilitado por la barra lateral. Si un paso está bloqueado, completa
las condiciones anteriores que indique la aplicación.

| Etapa                    | Qué debes comprobar antes de aprobar                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Modelo de datos          | Entidades, atributos y cardinalidades acordes a los casos de uso.                      |
| Diagrama de clases       | Clases y relaciones compatibles con el modelo y las responsabilidades.                 |
| Navegación               | Acceso a las funciones necesarias para cada actor.                                     |
| Arquitectura de software | Componentes y responsabilidades que permiten las funciones y requisitos de calidad.    |
| Arquitectura de sistema  | Despliegue previsto, conexiones y restricciones técnicas justificadas.                 |
| Plano de interfaz        | Pantallas, campos, acciones y vínculos a las funciones aprobadas.                      |
| Tema y colores           | Presentación legible y consistente.                                                    |
| Bocetos                  | Correspondencia visual con el plano, incluyendo escritorio o móvil según la selección. |

El contenido estructurado y el código del diagrama son la referencia editable.
Una imagen es una representación derivada. Un boceto atractivo no demuestra que
la función esté implementada. En la galería de bocetos puedes abrir una pantalla
en el visor, recorrer las siguientes y usar las opciones de ampliación y descarga
disponibles. La generación externa puede tardar y consumir créditos: revisa el
aviso antes de iniciarla. Si falla, revisa el estado y las posibilidades de reintento
o continuación antes de comenzar otra generación.

## Revisar coherencia y exportar

1. Revisa **Trazabilidad**, los avisos de impacto y la evaluación de preparación.
2. Ante un aviso **Por rehacer**, compara las versiones de entrada y actualiza los
   elementos afectados. Cambiar el contexto no actualiza automáticamente todo el diseño.
3. Comprueba que los requisitos no funcionales aplicables tienen una solución
   explícita en diseño y, posteriormente, implementación y validación.
4. Resuelve hallazgos o documenta las limitaciones antes de continuar.
5. En la evaluación/exportación descarga los formatos ofrecidos. El JSON o HTML
   del análisis es una instantánea documental; no es el ZIP de código ni el manual
   de la aplicación construida.

## Construir software

La construcción utiliza el TargetTemplate soportado: TypeScript, Next.js, NestJS,
Prisma y PostgreSQL, con arquitectura de monolito modular.

1. Revisa y aprueba el **Plan de generación**: módulos, actores, pantallas y alcance.
2. Revisa el **Modelo conceptual** y el diseño correspondiente.
3. En **Aprobación de diseño**, congela la línea base que realmente deseas construir.
4. Revisa y aprueba el **Plan de implementación**, incluidas entidades, contratos,
   permisos y acciones. Un requisito sin implementación no queda resuelto por
   aparecer en una pantalla.
5. En **Generación de código**, inicia la ejecución y consulta sus etapas y errores.
6. Valida en el sandbox Docker. Solo considera entregable un snapshot con los
   controles obligatorios aprobados; crear archivos o compilar no basta.
7. Descarga el ZIP correspondiente y sigue su README en un entorno separado.

Una ejecución fallida debe investigarse a partir de sus resultados. No suprimas
pruebas para obtener READY. Las reparaciones automáticas están limitadas y no
reemplazan la revisión. Exportar no despliega el sistema; el CI de CASEFlow tampoco
publica automáticamente las aplicaciones generadas.

## Revisar el manual de la aplicación generada

1. Desde el resultado de construcción abre **Manual de usuario** del snapshot deseado.
2. Espera la propuesta determinista. Usa el plan, diseño y archivos exactos de esa
   versión, sin una inferencia adicional. Su estado es independiente del software.
3. Revisa las tareas por pantalla y rol. Completa las instrucciones genéricas con
   los pasos reales de negocio y comprueba los resultados en la aplicación.
4. Consulta las capturas disponibles. El perfil inicial captura vistas de escritorio
   con una base vacía: no completa formularios ni demuestra transacciones de negocio.
   Un esquema numerado no es una captura real. Las rutas que no se pudieron capturar
   deben conservar su limitación explícita.
5. Guarda tus cambios y marca cada tarea como comprobada solo después de verificarla.
   Durante una captura activa no se puede revisar ni aprobar. Cancelar espera la
   limpieza; no implica que puedas iniciar otra inmediatamente.
6. Pulsa **Enviar a revisión**. El responsable con permisos puede **Solicitar cambios**
   o **Aprobar manual** cuando todas las tareas estén verificadas.
7. Descarga HTML o PDF. Sin aprobación llevan indicación de borrador.
8. Con el manual aprobado, usa **Descargar software y manual**: el paquete incluye
   `software.zip`, `manual/index.html`, `manual/manual.pdf`, capturas cuando existan
   y `entrega.json`. No modifica el ZIP original del snapshot.

Una versión nueva de software necesita su propio manual. Los manuales históricos
siguen vinculados a su snapshot; no supongas que describen la última versión.
No se ofrece exportación del manual a Markdown ni generación autónoma de videos.

## Resolver problemas

| Síntoma                                        | Qué hacer                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| No puedo iniciar sesión                        | Verifica la instancia y credenciales; si hay un error del servidor, consulta al administrador. No compartas tu contraseña ni cookies. |
| La IA no está disponible o responde incompleta | Conserva el trabajo; consulta el error, reintenta cuando proceda o usa creación manual. No apruebes una respuesta parcial.            |
| Un archivo no produce texto útil               | Compara con el original y corrige el contenido manualmente; revisa el estado del procesamiento.                                       |
| No se muestra un diagrama                      | Comprueba el renderizador configurado. Conserva la fuente editable; una exportación ausente no elimina el modelo.                     |
| Un paso está bloqueado                         | Consulta los requisitos previos, versiones aprobadas y avisos de impacto.                                                             |
| Generación o capturas sin Docker               | Inicia Docker y consulta el diagnóstico de disponibilidad. El análisis manual puede continuar.                                        |
| Software READY pero manual pendiente           | Reintenta o corrige la documentación de ese snapshot; no hace falta reconstruir por ese único motivo.                                 |
| No puedo editar, aprobar o descargar           | Revisa proyecto activo, pertenencia, rol y estado del artefacto. Solicita acceso al responsable.                                      |

Para solicitar soporte, comunica edición, versión/commit cuando esté disponible,
pantalla, fecha, pasos y mensaje mostrado. Depura las capturas y registros. Para
respaldos y recuperación consulta la guía de instalación de tu edición; no borres
volúmenes ni la carpeta de datos para resolver un error sin una copia verificada.
