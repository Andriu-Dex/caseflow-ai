# Correcciones de ciclo de vida y generación controlada

Fecha: 10 de noviembre de 2026.  
Rama: `feat/construction-official-candidate`.  
Estado: correcciones del generador; no constituye una nueva entrega oficial de RestGuestMateos.

## 1. Problemas corregidos

La revisión anterior encontró publicación evadible por creación, protección incompleta de versiones y componentes, modificaciones independientes presentadas como transaccionales, reglas del restaurante incorporadas al generador, aprobación deducida de texto y carreras entre comprobación y escritura.

Se eliminaron las implementaciones que deducían esos flujos de nombres de entidades, rutas o etiquetas. Los formularios normales conservan CRUD; la publicación y otras transiciones de dominio deben estar declaradas mediante endpoints explícitos. El generador deja de inventar componentes, políticas, dictámenes y resultados comerciales para satisfacer una evaluación visual.

| Hallazgo                                                             | Corrección                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Crear directamente una versión finalizada                            | El ciclo de vida explícito admite creación únicamente en su estado inicial.                                              |
| Modificar o eliminar una versión finalizada                          | Se comprueba el estado dentro de la misma transacción que realiza la mutación.                                           |
| Modificar componentes o trasladarlos fuera de una versión finalizada | Una relación de composición explícita protege tanto al propietario anterior como al nuevo.                               |
| Publicar mediante actualización genérica                             | El CRUD rechaza cambios de estado. La operación de dominio debe implementar sus validaciones específicas.                |
| Guardar componentes uno por uno y luego la versión                   | Se retiró esa edición sintetizada. No se presenta una secuencia de peticiones independientes como una operación atómica. |
| Aprobación por existencia de parámetros o por palabras de un texto   | Se retiraron las reglas y banners que afirmaban aprobación sin evidencia estructurada.                                   |
| Evaluaciones históricas demasiado permisivas                         | Nuevo prompt v36 y nuevo espacio de caché; no se reutilizan resultados de versiones anteriores.                          |
| Conflictos de escritura mostrados como error interno                 | El filtro generado transforma `P2034` en un conflicto HTTP 409 con un mensaje de recuperación.                           |

## 2. Contrato estructurado de protección

Las entidades del ImplementationPlan admiten estos metadatos opcionales:

```json
{
  "lifecycle": {
    "stateField": "state",
    "initialState": "DRAFT",
    "immutableStates": ["FINAL"],
    "managedFields": ["finalizedAt"]
  }
}
```

El campo de estado debe ser un ENUM existente y público. El estado inicial debe existir y ser editable; los estados inmutables deben existir y no repetirse. Los campos gestionados deben existir, ser de solo lectura y permitir la creación inicial mediante nulabilidad o un valor predeterminado admitido.

La propiedad `compositionOwnerRelation` identifica una relación MANY_TO_ONE obligatoria hacia el propietario del ciclo de vida. No se deduce composición de cualquier clave foránea: una referencia ordinaria a un registro finalizado no implica que ambos formen un agregado inmutable.

Esta primera protección admite composición directa. Las configuraciones ambiguas, autorreferencias y composiciones anidadas no admitidas se rechazan al validar el contrato; no se aceptan aparentando una protección transitiva inexistente.

No se modificó el esquema de la base de datos de CASEFlow ni se reescribieron versiones aprobadas. Los metadatos pertenecen al contenido estructurado y versionado del plan.

## 3. Transacciones, concurrencia y alcance

Los servicios generados que requieren protección ejecutan CREATE, UPDATE y DELETE dentro de transacciones PostgreSQL `Serializable`.

Antes de modificar un propietario existente o su composición, bloquean sus filas mediante `SELECT ... FOR UPDATE`, ordenan los bloqueos y vuelven a comprobar el estado. Una modificación concurrente no puede aprovechar una lectura anterior para escribir después de una finalización.

En proyectos con alcance operativo, el bloqueo pasa por una función específica que comprueba autorización y pertenencia al ámbito. El proxy de transacciones continúa prohibiendo SQL directo: no se abrió un permiso general de `$queryRaw` a las operaciones de dominio.

La protección del CRUD no implementa por sí sola una publicación de negocio. Un endpoint de finalización debe declarar y comprobar su contrato, autorización, requisitos de aprobación, composición válida y transacción. La existencia de un endpoint tampoco acredita su implementación: siguen aplicándose las comprobaciones de código, pruebas y sandbox.

## 4. Frontend y evaluación de presentación

- Los formularios de ciclo de vida omiten campos gestionados y no permiten seleccionar estados finales.
- Al editar, conservan el estado actual y bloquean el envío de registros finalizados. El servidor mantiene la protección incluso si se evita el frontend.
- Las pantallas que declaran únicamente una operación de dominio no reciben además un formulario CRUD ajeno a esa operación.
- Se corrigió la resolución de enlaces con identificadores de contexto y del registro. Un identificador de fila no sustituye al identificador del ámbito padre.
- Se retiró la navegación denominada «Descartar borrador» que únicamente abandonaba la pantalla. No se inventó un borrado ni una cancelación sin contrato.
- Se retiraron afirmaciones generales como «Alcance verificado» que no constituían una comprobación del registro mostrado.
- El prompt v36 exige comprobar fuentes funcionales y contradicciones con el plano. No permite considerar un banner como aprobación, una navegación como cancelación ni peticiones independientes como una transacción.
- Las presentaciones antiguas permanecen en el historial; el evaluador actual no las acepta mediante búsqueda en versiones de caché anteriores.

Durante el sandbox se corrigieron también imports duplicados, omisiones de campos inexistentes en los esquemas de formulario, variantes de botones no implementadas y pruebas de cliente incompatibles con parámetros de consulta opcionales.

Los filtros temporales rechazan fechas de calendario inexistentes y timestamps ambiguos sin zona horaria, además de comprobar el orden del rango. Los límites sin hora conservan su interpretación UTC; esto no acredita una regla comercial de zona horaria de sucursal.

## 5. Pruebas reproducibles

El proyecto de evaluación es un registro ficticio de revisiones y componentes, independiente del restaurante:

```text
tests/fixtures/construction/lifecycle-plan.json
tests/evaluations/lifecycle/run.mjs
tests/evaluations/lifecycle/runtime.mjs
```

Ejecución desde la raíz, con Docker operativo y dependencias instaladas:

```powershell
pnpm --filter @caseflow-ai/api run build
node tests/evaluations/lifecycle/run.mjs
```

El evaluador construye el proyecto con CASEFLOW_WEB_TS_V1 versión 2, ejecuta las cinco etapas del sandbox y utiliza después una aplicación y PostgreSQL desechables. No ejecuta el proyecto generado dentro de CASEFlow ni contra la base de datos del proyecto real.

La carrera de concurrencia se sincroniza comprobando que la petición llegó al bloqueo PostgreSQL. No depende de que una espera fija coincida por casualidad con la ejecución de otra petición.

El resultado incluye un hash SHA-256 de las fuentes generadas, etapas, tiempos, resultado de las comprobaciones y metadatos de capturas. Se escribe primero en el directorio temporal como `caseflow-lifecycle-evaluation.json`.

## 6. Verificación

| Comprobación                                                     | Resultado                                         |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| Suite con cobertura (`pnpm run test:coverage -- --maxWorkers=2`) | 1069 pruebas aprobadas; 3 omitidas.               |
| Cobertura de ramas                                               | 75,25 %, superior al mínimo del 70 %.             |
| Suite web separada (`pnpm --filter @caseflow-ai/web run test`)   | 345 pruebas aprobadas.                            |
| Suite dirigida de generación, construcción y contratos           | 204 pruebas aprobadas.                            |
| `pnpm run typecheck`                                             | Aprobado.                                         |
| `pnpm run lint`                                                  | Aprobado.                                         |
| `pnpm run format:check`                                          | Aprobado.                                         |
| `pnpm run build`                                                 | Aprobado.                                         |
| Proyecto ficticio, sandbox Docker                                | INSTALL, LINT, TYPECHECK, TEST y BUILD aprobados. |
| PostgreSQL desechable                                            | 22 comprobaciones aprobadas.                      |
| Capturador de ejecución                                          | Listado y formulario capturados; 1440 × 900.      |

Las 22 comprobaciones incluyen fechas imposibles, timestamp ambiguo, fecha bisiesta válida, creación finalizada, transición y campos gestionados mediante CRUD, edición y eliminación de finalizados, composición y traslado de componentes, persistencia tras rechazos, una carrera real de bloqueo y restricciones de ámbito/SQL directo.

La evidencia resumida se conserva en [2026-11-10-lifecycle-evaluation.json](2026-11-10-lifecycle-evaluation.json). El hash permite identificar exactamente las fuentes del proyecto ficticio evaluado; no corresponde a un snapshot oficial del restaurante.

Se observaron timeouts al ejecutar suites intensivas simultáneamente. Las pruebas afectadas se repitieron sin modificar assertions, tiempos de prueba ni umbrales de cobertura. El fallo de lint de `scripts/check-status.mjs` se corrigió retirando una consulta cuyo resultado no se utilizaba. Cuatro reportes anteriores recibieron únicamente formato para cumplir Prettier.

## 7. Qué falta para RestGuestMateos

No se consumió cuota de proveedores externos, no se inició una generación oficial y no se crearon snapshots ni aprobaciones del proyecto real.

El plan aprobado anterior necesita una nueva revisión antes de generar:

1. Declarar el ciclo de vida de sus entidades versionadas y la pertenencia de los componentes.
2. Declarar las operaciones de dominio de preparación, edición conjunta y publicación, con sus contratos y reglas de autorización/aprobación.
3. Incorporar pruebas positivas y negativas de esas operaciones, incluyendo composición, integridad monetaria, vigencia y concurrencia.
4. Revisar las pantallas afectadas con el evaluador estricto, corregir las limitaciones reales y completar la adaptación pendiente.
5. Ejecutar las validaciones de la entrega real, comprobar fidelidad visual y revisar el manual antes de aprobar un snapshot oficial.

El generador rechaza ahora los planes versionados que todavía pretenden resolver esas transiciones mediante reglas implícitas o CRUD. Es un bloqueo explícito de seguridad, no una certificación de que el flujo comercial ya esté implementado.

## 8. Límites de la evidencia

La evaluación prueba servicios generados contra PostgreSQL real y el bloqueo de alcance operativo. Las capturas certifican que las dos rutas del proyecto ficticio pudieron abrirse sin los errores detectados por el capturador; no prueban fidelidad con los bocetos de RestGuestMateos ni operaciones comerciales completas.

No se verificaron en esta sesión una publicación comercial real, el conjunto de las 81 pantallas, el manual definitivo ni el proyecto completo generado del restaurante. No deben presentarse como terminados a partir de estas pruebas.

Los cambios quedan en la rama actual, sin commit ni pull request nuevos.
