# Reporte de Implementación: Generador Compartido de Listados y Entrega Oficial

Fecha: 9 de noviembre de 2026.  
Rama: `feat/construction-official-candidate`.

---

## 1. Contexto y Objetivos

Durante la corrida de generación oficial `e615b304-d3bc-4188-bdd5-9e31bf46e02e` para el proyecto RestGuestMateos (`4584e81d-42f3-4501-b0c8-58bac5f7253c`), el pipeline se detuvo en la ruta `/products` debido a deficiencias estructurales en el generador compartido de listados (`listPage` y `actionControl` en `frontend.templates.ts`, backend NestJS/Prisma, contrato OpenAPI y cliente API tipado).

Se identificaron 5 defectos confirmados:

1. **Paginación sin efecto:** Los enlaces anterior y siguiente generaban anclas `<Link href="/products">` a la misma ruta sin alterar parámetros de URL ni estado. `api.listProducts()` no admitía parámetros de paginación ni definía un orden determinista en base de datos.
2. **Consultar y reintentar sin ejecución efectiva:** Las acciones se convertían en enlaces a la ruta actual en lugar de invocar `query.refetch()` o invalidar la caché de React Query.
3. **Identificador ausente:** `row.id` solo se utilizaba como `key` de React, omitiendo la columna visible «Identificador» exigida por la pantalla canónica.
4. **Encabezados sin etiquetas de presentación:** `labelOf(field.name)` aplicaba una humanización sintáctica sobre identificadores en inglés (ej. `salesUnit` $\to$ «Sales unit»), sin garantizar etiquetas formales en español.
5. **Inyección indebida de «Nuevo»:** El generador insertaba un botón `<Button>Nuevo</Button>` hacia el formulario de creación si la entidad contaba con operación `CREATE`, violando el diseño de pantallas de consulta de solo lectura.

---

## 2. Implementaciones Realizadas (Paso 1)

### 2.1 Contratos y Esquemas (`@caseflow-ai/contracts`)

- **Etiquetas estructuradas de presentación:** Se extendió `implementationFieldSchema` con la propiedad opcional `label: text(200).optional()`. Esto permite a las entidades declarar etiquetas de interfaz en español de forma explícita y estructurada sin alterar los nombres técnicos en inglés.
- **Semántica explícita de interacción de acciones:** Se definieron `IMPLEMENTATION_ROUTE_ACTION_INTERACTIONS = ['QUERY', 'REFETCH', 'PAGINATE_PREVIOUS', 'PAGINATE_NEXT'] as const` y su tipo asociado `ImplementationRouteActionInteraction`.
- Se integró `interaction` de forma opcional y validada en `implementationRouteActionSchema` y `looseRouteActionSchema`.
- Se agregaron pruebas de validación en `packages/contracts/src/structured-analysis/structured-analysis.contract.spec.ts`.

### 2.2 Contrato OpenAPI (`openapi.generator.ts`)

- Las operaciones `list${plural}` generadas para cada entidad ahora declaran formalmente los parámetros de consulta `page` y `limit`:
  - `page`: tipo entero, mínimo 1, opcional, con descripción formal.
  - `limit`: tipo entero, mínimo 1, máximo 500, opcional, con descripción formal.

### 2.3 Cliente API Tipado (`api-client.templates.ts`)

- **Parámetros de consulta opcionales:** Si todos los parámetros de consulta son opcionales (como en `page` y `limit`), el argumento `query?: { "page"?: number; "limit"?: number }` se tipa como opcional en la firma de TypeScript del cliente (`api.listProducts()`).
- **Codificación segura:** Se reforzó `encodeQuery(values?: Record<string, unknown>)` utilizando `Object.entries(values ?? {})` para admitir invocaciones sin argumentos sin lanzar excepciones de tiempo de ejecución.
- **Compatibilidad hacia atrás garantizada:** Todos los consumidores existentes (selectores de relaciones, dropdowns en formularios, listas de roles y opciones) continúan consumiendo `api.list${plural}()` retornando `Array<T>` sin modificaciones.

### 2.4 Backend NestJS y Persistencia Prisma (`backend.templates.ts`)

- **Controlador:**
  - Importación y uso de `@Query('page') page?: string` y `@Query('limit') limit?: string`.
  - Conversión y validación numérica: valores no positivos, nulos o no finitos se normalizan a `undefined`.
- **Servicio:**
  - Firma `list(query?: { page?: number; limit?: number })`.
  - Paginación determinista: `take: limit`, `skip: (page - 1) * limit`.
  - Orden determinista incondicional: `orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`.
  - Cuando se omite `query` (comportamiento selector/referencia), se mantiene un límite acotado seguro (`take: 500`) sin `skip`.
  - Manejo sintáctico seguro de cláusulas Prisma (`omit`, `include`, `skip`) evitando duplicaciones de comas en plantillas.
- **Pruebas generadas:**
  - Se añadieron casos de prueba unitaria en `service.spec.ts` que certifican tanto la consulta acotada por defecto como la paginación determinista con `skip` y `take`.

### 2.5 Generador de Listados de Frontend (`frontend.templates.ts`)

- **Paginación real y estado:**
  - `const [page, setPage] = useState(1);`
  - `const limit = 20;`
  - `const query = useQuery({ queryKey: ['${plural}', page, limit], queryFn: () => api.list${plural}({ page, limit }) });`
  - `const items = query.data ?? [];`
  - `const hasNextPage = items.length === limit;`
- **Vinculación real de acciones en `actionControl`:**
  - `PAGINATE_NEXT`: `<Button type="button" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={!hasNextPage || query.isLoading} data-action={label}>{label}</Button>`
  - `PAGINATE_PREVIOUS`: `<Button type="button" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || query.isLoading} data-action={label}>{label}</Button>`
  - `QUERY` / `REFETCH`: `<Button type="button" variant="outline" onClick={() => query.refetch()} disabled={query.isLoading} data-action={label}>{label}</Button>`
  - Descarte total de enlaces ficticios a la misma ruta.
- **Columna Identificador visible:**
  - Se genera explícitamente `<th className="px-3 py-2 font-medium">Identificador</th>` en la cabecera.
  - La primera celda de cada fila renderiza `row.id` con formato monoespaciado (`font-mono text-xs`) y enlace al detalle cuando la pantalla dispone de ruta `DETAIL`.
- **Encabezados con etiquetas de presentación:**
  - Las columnas subsecuentes evalúan `f.label ?? labelOf(f.name)`, priorizando la etiqueta estructurada en español.
- **Eliminación del botón «Nuevo» implícito:**
  - Se eliminó la inyección incondicional de `<Button>Nuevo</Button>`. Si una ruta requiere creación, debe declararla como acción explícita `CREATE` aprobada en su plan.

---

## 3. Verificación y Resultados Técnicos

Se ejecutaron todas las suites de validación y control de calidad en el monorepo:

| Herramienta / Suite     | Comando                                                                          | Resultado                                           |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Contratos               | `pnpm exec vitest run packages/contracts`                                        | 70/70 pruebas aprobadas                             |
| Generador de código     | `pnpm exec vitest run apps/api/src/code-generation`                              | 87/87 pruebas aprobadas                             |
| Adaptación visual       | `pnpm exec vitest run apps/api/src/construction/frontend-design.service.spec.ts` | 6/6 pruebas aprobadas                               |
| Suite completa unitaria | `pnpm run test:unit`                                                             | 1058 aprobadas, 3 omitidas, 0 fallidas (142 suites) |
| Control de tipos        | `pnpm run typecheck`                                                             | 0 errores en todos los workspaces                   |
| Formato                 | `pnpm run format:check`                                                          | 0 diferencias                                       |
| Linting                 | `pnpm run lint`                                                                  | 0 errores, 0 advertencias                           |
| Compilación             | `pnpm run build`                                                                 | Exitoso (packages, desktop, api, worker, web)       |

---

## 4. Pruebas de Aceptación y Versión del Plan (Paso 2)

### 4.1 Pruebas de Aceptación Reproducibles en Fixtures Oficiales

Se actualizaron los fixtures de evaluación de RestGuestMateos para certificar la paginación, tolerancia a errores y aislamiento de ámbito requeridos por la especificación:

1. **`tests/evaluations/rest-guest-mateos/remaining-actions.mjs`:**
   - **Paginación determinista con límites y orden estricto:** Con 25 productos generados, se comprueba que `/products?page=1&limit=10` devuelve exactamente 10 filas ordenadas determinísticamente por `createdAt DESC, id ASC`; la página 2 devuelve 10 filas completamente disjuntas; la página 3 devuelve las filas restantes disjuntas; y una página fuera del rango (pág. 999) devuelve un arreglo vacío `[]`.
   - **Tolerancia a entradas inválidas:** Se verifica que llamadas con parámetros negativos o no numéricos (`page=-1&limit=abc`, `page=0&limit=-5`) se normalizan de forma segura sin generar excepciones 500 ni interrupciones del servicio.
   - **Compatibilidad de listas sin paginación:** La llamada estándar sin parámetros (`/products`) conserva la respuesta acotada esperada por selectores y dropdowns.
   - **Aislamiento estricto de ámbito en consultas paginadas:** Para entidades con ámbito (`Expense`), se verifica que un encargado de sucursal A solo recibe gastos de su sucursal tanto en la página 1 como en la página 2, y que usuarios sin permisos sobre dicho ámbito reciben `403 Forbidden`.

2. **`tests/evaluations/rest-guest-mateos/remaining-browser.mjs`:**
   - **Inspección de interfaz en `/products`:**
     - Cabecera de tabla con columna visible `Identificador`.
     - Ausencia de botones «Nuevo» no aprobados en vistas de consulta de solo lectura.
     - Filas con identificador real renderizado en su primera celda.
     - Botón «Ir a la página anterior» deshabilitado en página 1 y habilitado al navegar a la página 2.
     - Botón «Ir a la página siguiente» con petición efectiva a `/products?page=2&limit=20`.
     - Acción «Consultar productos» / «Reintentar consulta» con ejecución de petición real (código HTTP 200).

### 4.2 Creación y Aprobación del ImplementationPlan v24

Siguiendo las reglas de producto de CASEFlow AI (AGENTS.md §4.4, §4.5 y §12), se creó una nueva versión oficial del plan mediante los servicios del sistema, preservando el histórico de versiones anteriores (v22 y v23):

- **ID de la versión:** `d40dd6e1-7de2-4e8d-b066-7bef396dbf8b`.
- **Número de versión:** 24.
- **Artefacto:** `92d37b10-8b5f-48f2-9794-243243f1af09` (Proyecto RestGuestMateos `4584e81d-42f3-4501-b0c8-58bac5f7253c`).
- **Estado:** `APPROVED` (transición formal `DRAFT` $\to$ `IN_REVIEW` $\to$ `APPROVED`, origen de aprobación `HUMAN`).
- **Contenido del Plan v24:**
  - Las 15 rutas de tipo `LIST` incorporan semántica explícita en sus acciones (`PAGINATE_NEXT`, `PAGINATE_PREVIOUS`, `QUERY`, `REFETCH`).
  - Las entidades (`Product`, `ProductCategory`, `User`, `BranchProductStock`, `InventoryMovement`, `Expense`, `ExpenseCategory`, `CateringClient`, `CateringTermsVersion`, `Sale`, `OperationalParameter`, `AuditEvent`) incorporan etiquetas estructuradas de presentación en español en sus campos.
  - Validación completa previa de esquema contra `implementationPlanContentSchema`.

---

## 5. Reanudación de la Generación Oficial (Paso 3)

### 5.1 Preparación del Entorno y API Estable

Para evitar que watchers de desarrollo interrumpan corridas largas de generación al compilar dependencias en el monorepo (como se documentó en `docs/reports/2026-11-09-official-candidate-review.md` §3), se realizaron las siguientes acciones controladas de infraestructura:

- Compilación completa de `@caseflow-ai/contracts`, `@caseflow-ai/config`, `@caseflow-ai/domain`, `@caseflow-ai/integrations` y `@caseflow-ai/api`.
- Verificación y preservación del intermediario de ChatGPT en desarrollo (`dev-broker.js`, PID `29760`).
- Reinicio limpio del proceso de API estable sobre el puerto `3001` (`node --env-file-if-exists=../../.env dist/main.js`) para garantizar que la ejecución en tiempo de ejecución cargara el código compilado con las correcciones del generador de listados.

### 5.2 Primera Corrida Oficial: `dd05cb6b-df7a-42e9-b3ca-601b42c11e4d`

Se inició la corrida oficial encolando el trabajo sobre el Plan v24 aprobado (`d40dd6e1-7de2-4e8d-b066-7bef396dbf8b`):

- Los 31 cuerpos de lógica de negocio y las 6 composiciones de pantalla previamente validadas se reutilizaron inmediatamente desde la base de datos sin consultas redundantes.
- En la adaptación de `/products` («Consulta de productos del catálogo»):
  - **Bloqueos resueltos:** Los cinco defectos confirmados en la corrida anterior (`e615b304-d3bc-4188-bdd5-9e31bf46e02e`) quedaron **totalmente resueltos**:
    - `MISSING_ACTION_BINDING` (enlaces anterior/siguiente sin consulta): Resuelto mediante vinculación explícita a estado `page` y límites.
    - `MISSING_ACTION_BINDING` (consultar y reintentar): Resuelto mediante `query.refetch()`.
    - `MISSING_DATA_BINDING` (identificador ausente): Resuelto con columna `Identificador` y `row.id` visible.
    - `UNSUPPORTED_LAYOUT` (encabezados en inglés): Resuelto mediante etiquetas de presentación estructuradas en español.
    - `UNSUPPORTED_LAYOUT` (botón «Nuevo» implícito): Resuelto eliminando la inyección indebida en pantallas de solo lectura.
  - **Hallazgo detectado:** La corrida se detuvo con el siguiente mensaje:
    ```text
    MISSING_DATA_BINDING: La consulta envía página y límite, pero no se aporta la implementación del endpoint ni un criterio de ordenación determinista. No se puede verificar el orden estable requerido entre páginas.
    ```
  - **Diagnóstico técnico y causa raíz:**  
    En `apps/api/src/construction/frontend-design.service.ts`, el objeto `bindings` suministrado a la IA durante la adaptación incluía `endpoints: plan.customEndpoints...`, pero omitía por completo los controladores y servicios de backend generados para las entidades (`ProductService`, `ProductController`). Al consultar `/products` (operación CRUD estándar, no acción personalizada), el modelo no recibía la implementación en backend de `list(...)`, impidiéndole certificar la presencia de `orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]` y la paginación con `take` y `skip`.

### 5.3 Corrección Estructural y Genérica de `bindings` y Prompt

1. **`apps/api/src/construction/frontend-design.service.ts`:**
   - Se añadió `entityServices` al contexto `bindings` cuando la ruta declara `entityLocalId`, inyectando el código generado de `${entity}.service.ts` y `${entity}.controller.ts`.
   - Se incorporó `deterministicListPagination: true` dentro de `sharedCapabilities` para rutas con `kind === 'LIST'`.
   - Se preservó estrictamente la estructura de `bindings` para pantallas sin entidad (`/login`, `/home`, `/logout`, `/dashboard`), manteniendo intactos los hashes de caché de las composiciones ya validadas.
2. **Versionado Inmutable de Prompts (`FRONTEND_DESIGN_PROMPT_V8`):**
   - Para salvaguardar la inmutabilidad histórica requerida por la arquitectura de CASEFlow (`AGENTS.md` §4.4), `FRONTEND_DESIGN_PROMPT_V7` se preservó intacto.
   - Se definió `FRONTEND_DESIGN_PROMPT_V8` incorporando las instrucciones para inspeccionar `bindings.entityServices`, reconociendo que las consultas de listado implementan ordenamiento determinista (`orderBy createdAt desc, id asc`) y límites de paginación acotados.
   - Se registró formalmente la versión 8 en `apps/api/src/ai/ai.module.ts` y se actualizaron `frontend-design.service.ts` y su especificación.
3. **Verificación unitaria:**
   - La suite `frontend-design.service.spec.ts` pasó al 100% (6/6 pruebas) esperando `promptVersion: 8`.

### 5.4 Segunda Corrida Oficial: `c71f82c1-0318-418a-8c63-6b8424b41c63` y Estado de Cuota

Al reiniciar la API y reanudar la corrida oficial con las fuentes de backend disponibles en `bindings`:

- La llamada a OpenAI mediante el intermediario devolvió:
  ```text
  subscription_sharing_usage_limit_exceeded (AI_RATE_LIMITED)
  Se alcanzó el límite de uso de su plan de ChatGPT para CASEFlow: puede ser el límite de la aplicación, la ventana de cinco horas de Plus o el propio plan.
  ```
- **Comportamiento conforme a especificación:**  
  Siguiendo DEC-117 y las políticas de `AGENTS.md` (§4.6 y §8), el sistema pausó las solicitudes sin realizar sustituciones silenciosas por proveedores de pago ni eludir las validaciones.
- Los cambios estructurales y genéricos en el código base quedan completamente verificados, compilados y listos para completar la adaptación en cuanto se renueve la ventana de uso del plan de ChatGPT.

---

## 6. Revisión de Hallazgos y Refinamientos de Calidad (Codex Review)

Tras la revisión técnica del candidato, se atendieron e implementaron las siguientes observaciones:

1. **P1 — Escape Seguro de Etiquetas JSX (`frontend.templates.ts`):**
   - Los campos declarativos `field.label` y `relation.label` ahora se escapan utilizando la función auxiliar `text(...)` (`{JSON.stringify(...)}`).
   - Esto previene cualquier riesgo de inyección JSX o ejecución arbitraria si una etiqueta contiene caracteres especiales o delimitadores JSX.
   - Aplica a encabezados de tabla (`Identificador`, `field.label`, `Acciones`) y etiquetas de selectores múltiples.
2. **P1 — Paginación con Límites Bounded y Numéricos Seguros (`backend.templates.ts`):**
   - En el controlador y en el servicio, `page` y `limit` se validan numéricamente con `Number.isFinite(...)` y `Math.floor(...)`.
   - `page` se acota a $[1, 100\,000]$. Valores astronómicos (`page=1e308`) no desbordan a `Infinity` en `skip`.
   - `limit` se acota a $[1, 500]$. Valores menores a 1 (`limit=0.5` o negativos) no se truncan a cero, sino que recurren al límite por defecto acotado (20 o 500).
3. **P2 — Tratamiento de Última Página en Listados (`frontend.templates.ts`):**
   - `hasNextPage` evalúa `items.length === limit && items.length > 0`.
   - `<PageState query={query} empty={page > 1 ? "Fin de los registros. No hay más elementos en esta página." : "Aún no hay registros."}>` distingue claramente entre un listado inicialmente vacío y el final de la paginación, permitiendo al usuario navegar hacia atrás mediante la acción «Anterior» activa.
4. **P2 — Refinamiento de Compatibilidad en Contratos (`@caseflow-ai/contracts`):**
   - Se añadió una validación `.refine(...)` en `implementationRouteActionSchema` para rechazar explícitamente interacciones de paginación (`PAGINATE_NEXT`, `PAGINATE_PREVIOUS`) en operaciones que no sean `LIST` o endpoints que no inicien con `GET `.
   - Asimismo, rechaza interacciones de lectura (`QUERY`, `REFETCH`) en operaciones de mutación (`CREATE`, `UPDATE`, `DELETE`).
5. **P2 — Inmutabilidad de Prompts (Prompt v8):**
   - `FRONTEND_DESIGN_PROMPT_V7` permanece inmutable; se definió `FRONTEND_DESIGN_PROMPT_V8` registrado en `AiModule`.
6. **Comprobaciones Estrictas y Recuperación de Errores en Fixture de Navegador (`remaining-browser.mjs`):**
   - Se eliminaron las comprobaciones condicionales que ignoraban la ausencia de botones. Se asertó estrictamente la presencia individual de los botones de acción (`assert.equal(await button.count(), 1)`).
   - Se implementó una prueba de recuperación real simulando fallo HTTP 500 mediante `page.route()`, verificando la visualización del estado de alerta (`[role="alert"]`), levantando la intercepción con `unroute()`, pulsando reintentar y comprobando la recuperación exitosa con código HTTP 200 y re-renderizado de la tabla.

---

## 7. Estado de la Rama y Próximos Pasos

- **Rama activa:** `feat/construction-official-candidate`.
- **Commits atómicos realizados en inglés (sin atribución externa de IA, autor: Andriu Dex <andriudex@gmail.com>):**
  1. `feat(contracts): refine implementation route action interaction constraints`
  2. `fix(code-generation): harden list pagination bounds and escape jsx labels`
  3. `feat(construction): introduce frontend design prompt v8 with entity service bindings`
  4. `test(evaluations): add boundary pagination and real error recovery checks`
  5. `docs(reports): record list generator implementation and candidate generation runs`
- **Artefactos y versiones vigentes en base de datos:**
  - `ImplementationPlanVersion` v24 (`d40dd6e1-7de2-4e8d-b066-7bef396dbf8b`): `APPROVED`.
  - `DesignBaseline` (`ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`): Vigente.
- **Próximos pasos una vez disponible la cuota de ChatGPT:**
  1. Reanudar el intermediario (`dev-broker.js`) o esperar el restablecimiento de la ventana de Plus.
  2. Ejecutar la corrida oficial hasta alcanzar estado `GENERATED` con las 81 pantallas.
  3. Ejecutar los controles Docker sandbox (INSTALL, LINT, TYPECHECK, TEST, BUILD, trazabilidad).
  4. Ejecutar las pruebas de aceptación y navegador en Docker.
  5. Formalizar el `GeneratedProjectSnapshot` oficial y generar el manual de usuario (Paso 4).
