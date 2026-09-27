# Idioma de generación con IA por proyecto

Fecha: 26 de septiembre de 2026. Rama: `feat/project-ai-generation-language` (base `develop`). Estado: implementación local sin commit, push ni PR, conforme a la instrucción explícita del usuario.

## Objetivo y alcance

Permitir que cada proyecto elija `ES` (predeterminado) o `EN` para el contenido generado por IA. El cambio aplica a la generación de contexto del proyecto, reportes de fuentes, requisitos, casos de uso, modelo de datos y análisis estructurado (navegación, arquitectura de software, arquitectura de sistema y UI Blueprint). Los textos fijos de la interfaz y los encabezados de exportación permanecen en español. No se modifica la configuración del proveedor ni se envía el idioma como parámetro específico de Groq/Gemini: la instrucción se compone en el orquestador agnóstico.

## Implementación

1. **Persistencia.** `Project.language` usa el nuevo enum Prisma `ProjectLanguage` (`ES`, `EN`) con valor por defecto `ES`. La migración `20260927020912_add_project_language` solo crea el tipo PostgreSQL `project_language` y agrega la columna `projects.language` no nula con `DEFAULT 'ES'`. Se ejecutó `prisma migrate dev` y después `db:generate`; no se usó `db push` ni se alteraron migraciones históricas. El valor por defecto cubre proyectos ya existentes y nuevos.
2. **Contrato y API.** `ProjectResponse` incluye `language`; el esquema estricto `updateProjectLanguageRequestSchema` acepta únicamente `ES` o `EN`. El mapeador lo propaga a creación, consulta y listado. `POST /projects/{projectId}/language` valida UUID y cuerpo, devuelve HTTP 200 con el proyecto actualizado o 404 si no existe. La operación OpenAPI se llama `updateProjectLanguage`.
3. **Orquestación.** `StructuredGenerationInput` acepta `language` opcional. El orquestador agrega a las instrucciones del sistema el idioma de etiquetas, nombres, descripciones y textos, manteniendo intactos esquema, mensajes y petición neutral hacia el proveedor. `language` entra también en el hash de entrada del `AIRun`, evitando que ejecuciones con distinto idioma parezcan idénticas en la auditoría. Si se omite el idioma, la instrucción preexistente no se modifica (compatibilidad).
4. **Servicios.** Los seis servicios indicados en `instruction.md` leen el idioma del proyecto y lo pasan al orquestador; un helper compartido selecciona solo la columna requerida y responde 404 si el proyecto no existe. En contexto de proyecto se reutiliza la consulta ya existente. El idioma se resuelve por `projectId`, sin dato suministrado libremente por el cliente de generación, lo cual mantiene el aislamiento del proyecto.
5. **Prompt de navegación.** La versión 2 histórica tenía la orden absoluta «Responde siempre en español», incompatible con `EN`. Se preservó intacta para auditabilidad y se creó la versión 3 sin esa orden; la generación actual de navegación usa la versión 3. Es una corrección necesaria al supuesto de `instruction.md` de que el prompt previo no crearía conflictos.
6. **Frontend.** El selector junto al proyecto activo ofrece Español/English, muestra estado de guardado, persiste mediante la API, invalida el listado de proyectos y presenta confirmación o error sin exponer detalles técnicos. No cambia el idioma de los textos fijos de la interfaz.
7. **Documentación.** README y prueba de inventario OpenAPI actualizados. Una prueba de exportación cubre contenido aprobado en inglés dentro de un HTML cuyos encabezados siguen en español; no se cambió código de exportación PDF, Word ni HTML.

## Verificación

| Comprobación             | Resultado                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`     | Correcto.                                                                                                                                                                                                                 |
| `pnpm run lint`          | Correcto.                                                                                                                                                                                                                 |
| `pnpm run format:check`  | Correcto.                                                                                                                                                                                                                 |
| `pnpm run test:coverage` | 54 archivos, 319 pruebas aprobadas. Sentencias 76,92 %, ramas 71,55 %, funciones 76,47 %, líneas 77,61 %; las cuatro métricas superan el mínimo global de 70 %.                                                           |
| `prisma migrate status`  | 18 migraciones; esquema de base de datos al día.                                                                                                                                                                          |
| API local                | Se creó un proyecto temporal: respuesta inicial `ES`; `POST /language` a `EN` devolvió `EN`; `GET /projects/{id}` confirmó persistencia `EN`. Luego se eliminó únicamente ese proyecto temporal sin artefactos aprobados. |
| OpenAPI local            | `POST /projects/{projectId}/language` expone `operationId=updateProjectLanguage` y enum de solicitud `ES`/`EN`.                                                                                                           |
| `git diff --check`       | Sin errores de espacios o marcadores de conflicto.                                                                                                                                                                        |

Las pruebas nuevas cubren contratos de idioma, validación y errores HTTP, lectura/persistencia de proyecto, propagación desde los seis servicios, composición del prompt y distinción de hashes de auditoría. La prueba de exportación poblada también cerró el déficit de cobertura de ramas observado durante esta implementación (67,78 % antes de esa prueba).

## Límites y riesgos pendientes

- **No se verificó una generación real contra Groq/Gemini ni el cambio mediante clics en el navegador.** Se verificaron API y persistencia reales, y la propagación/composición mediante pruebas deterministas. La API local inicialmente no estaba activa; se arrancó para la prueba y se detuvo al terminar. Para cerrar la aceptación funcional se recomienda seleccionar `EN` en la interfaz de un proyecto con fuentes aprobadas y generar al menos un artefacto con el proveedor configurado, inspeccionando la salida. Esta implementación no garantiza por sí sola obediencia lingüística perfecta de un LLM.
- El prompt de navegación v2 conserva su texto histórico en español; solo los nuevos runs usan v3. Esto es intencional para trazabilidad.
- `prisma format` realineó columnas en otras partes de `schema.prisma` además de insertar el campo; esos cambios son exclusivamente formato, sin modificaciones semánticas ni SQL adicional.
- Los archivos preexistentes sin seguimiento `docs/PRIMER_PARCIAL_REPORT_DATA.md`, `docs/reports/data-model-and-export-improvements-report.md` y `requirements.md` se dejaron intactos.
- No se creó commit ni PR. La instrucción del usuario de no hacer commit prevalece sobre la solicitud de PR contenida en `instruction.md`.

## Archivos principales

`prisma/schema.prisma`; `prisma/migrations/20260927020912_add_project_language/migration.sql`; `packages/contracts/src/projects/project.contract.ts`; `packages/ai/src/index.ts`; `apps/api/src/projects/*`; seis servicios de generación en `apps/api/src`; `apps/api/src/ai/ai.module.ts`; `apps/web/components/project-switcher.tsx`; `apps/web/lib/api.ts`; pruebas relacionadas.
