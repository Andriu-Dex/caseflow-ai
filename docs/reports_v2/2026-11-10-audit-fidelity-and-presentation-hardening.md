# Reporte de Implementación: Corrección Estructural, Fidelidad de Presentación y Adaptación Visual

**Fecha:** 10 de noviembre de 2026  
**Rama:** `feat/construction-official-candidate`  
**Autor:** Andriu Dex <andriudex@gmail.com>  
**ID de Proyecto:** `4584e81d-42f3-4501-b0c8-58bac5f7253c` (RestGuestMateos)  
**Versión de ImplementationPlan:** v24 (`d40dd6e1-7de2-4e8d-b066-7bef396dbf8b`, `APPROVED`)  
**Diseño Congelado (Design Baseline):** `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`  
**Plantilla Objetivo:** `CASEFLOW_WEB_TS_V1` (versión 2)

---

## 1. Resumen Ejecutivo

En seguimiento a la revisión técnica exhaustiva y a las observaciones planteadas sobre el pipeline de generación y adaptación de interfaces hacia la entrega oficial, se implementó una refactorización integral en los motores de generación de backend (`backend.templates.ts`), frontend (`frontend.templates.ts`), promts de diseño (`frontend-design-prompt.ts`), y servicio de diseño (`frontend-design.service.ts`).

Se corrigieron cinco hallazgos de alta y media criticidad relacionados con aprobación simulada, forzado de estados de borrador, validaciones aparentes, filtros temporales no validados y permisividad en los prompts de evaluación. Adicionalmente, se completó la arquitectura genérica de páginas de detalle (`detailPage`) para satisfacer la visualización completa de datos auditados, relaciones jerárquicas padre-hijo y registros alternativos.

---

## 2. Hallazgos Abordados y Soluciones Técnicas

### 2.1 Alta — Aprobación Ficticia Eliminada

- **Problema previo:** En `frontend.templates.ts` se evaluaba si el nombre de pantalla contenía «condicionado» o «aprobación», inyectando de forma estática un bloque visual que afirmaba: `«Aprobación verificada / Dictamen: APROBADO»` junto con texto hardcodeado específico del dominio de restaurante, sin consultar ningún registro ni evidencia de aprobación en la base de datos.
- **Corrección técnica:**
  - Se eliminó completamente la generación del banner ficticio y cualquier texto no genérico.
  - Se sustituyó por una verificación honesta y basada en el modelo: si la ruta o la entidad declaran roles autorizados (`route.roles` o `entity.writeRoles`), se renderiza un bloque accesible informando el perfil operativo requerido para ejecutar la acción (`Operación habilitada exclusivamente para los roles autorizados: ...`).
  - Si el registro posee un campo real de estado o dictamen, su valor se consulta y visualiza fielmente a partir de `existing.data`.

### 2.2 Alta — Estado de Borrador Estructurado y Aislado

- **Problema previo:** La presencia de la palabra «borrador» o «draft» en la etiqueta o nombre de pantalla forzaba ciegamente `status: 'BORRADOR'` y eliminaba `publicationDate` en el formulario, incluso en rutas de edición (`UPDATE`) de registros ya publicados, sobreescribiendo el estado existente durante el reseteo del formulario y en la persistencia.
- **Corrección técnica:**
  - La inicialización en borrador se restringió exclusivamente al ciclo de creación (`isCreation = route.path.endsWith('/new') || own?.operation === 'CREATE'`).
  - En formularios de edición (`UPDATE` / `editable`), los valores se cargan de forma íntegra e inalterable desde `existing.data`, preservando el estado actual (`status`) y las fechas registradas.
  - Se eliminó la sobreescritura artificial en `onSubmit` (`targetValues.status = 'BORRADOR'`).
  - Se eliminaron los bloques de texto estático no genéricos en favor de metadatos de trazabilidad universales para creación y actualización.

### 2.3 Alta — Eliminación de Validación Aparente de Fecha Operativa

- **Problema previo:** Al cargar las opciones de relaciones vinculadas (como `dailyMenu`), se renderizaba un aviso estático afirmando `«Fecha operativa local validada conforme a la zona horaria y calendario operativo de la sucursal asignada»`, sin que el código efectuara comprobación alguna de fecha, sucursal ni zona horaria.
- **Corrección técnica:**
  - Se retiró dicho bloque informativo engañoso.
  - El selector relacional presenta directamente las propiedades reales del registro consultado (`id`, `código`, `identificación`, `fecha`), y las validaciones de negocio rigen en el backend conforme al contrato de la entidad.

### 2.4 Media — Robustecimiento del Filtro Temporal

- **Problema previo:** El filtro de fechas utilizaba indiscriminadamente el primer campo de fecha de la entidad (`dateFields[0]`), pudiendo seleccionar campos de auditoría técnica (`createdAt`) en lugar de fechas de negocio (`operationalDate`, `saleDate`). Asimismo, no se validaban cadenas inválidas antes de enviarlas a Prisma, provocando excepciones al construir objetos `Date`.
- **Corrección técnica:**
  - Se implementó la función `findPrimaryDateField(entity: Entity): Field | undefined` compartida entre frontend y backend:
    - Prioriza campos de dominio comercial (`operationalDate`, `saleDate`, `publicationDate`, `date`, `fecha`, `validFrom`).
    - Si no existen, prioriza fechas de dominio no auditadas antes de caer en `createdAt`.
  - En `backend.templates.ts` (`service.ts`), se introdujeron funciones seguras de parsing (`parseDateGte`, `parseDateLte`):
    - Utilizan `Date.parse()` y comprueban `Number.isFinite(ms)` antes de instanciar `new Date()`.
    - Ajustan el límite superior (`to`) al final del día en UTC (`T23:59:59.999Z`) para cubrir todo el intervalo.
    - Evitan enviar fechas inválidas a Prisma.
  - En `frontend.templates.ts` (`listPage`), se rotuló explícitamente el campo temporal filtrado (`Filtrar por <nombre_campo>:`), asegurando transparencia operativa.

### 2.5 Media — Disciplina de Versionado y Prompts No Permisivos (`V28`)

- **Problema previo:** El prompt `FRONTEND_DESIGN_PROMPT_V27` instruía al evaluador de diseño a aceptar banners visuales como prueba suficiente de aprobación y validación, y había sido modificado de forma directa sin incrementar versión.
- **Corrección técnica:**
  - Se conservó `FRONTEND_DESIGN_PROMPT_V27` intacto como registro histórico de auditoría.
  - Se creó y registró formalmente `FRONTEND_DESIGN_PROMPT_V28` en `apps/api/src/construction/frontend-design-prompt.ts` y `apps/api/src/ai/ai.module.ts`.
  - En `V28` se exige que todos los estados presentados provengan de campos físicos del esquema o contratos, se describe el gobierno de autorización por roles (`writeRoles`), y se formalizan los requisitos de presentación jerárquica padre-hijo para vistas de detalle.
  - Se actualizó `frontend-design.service.ts` y su suite de pruebas para activar `promptVersion: 28`.

---

## 3. Generalización de la Vista de Detalle (`detailPage`)

Para la Pantalla 17 (`/menus/versions/[versionid]` - _Detalle de versión de menú diario_) y cualquier entidad compuesta del sistema, se enriqueció `detailPage` con capacidades genéricas de primer nivel:

1. **Formato Datetime UTC Completo:**
   - Todo campo `DATETIME` se formatea con hora, minuto y segundo en UTC (`toLocaleString('es', { timeZone: 'UTC' }) + ' UTC'`), satisfaciendo la trazabilidad completa del instante de creación o modificación.
2. **Contexto de Entidades Padre:**
   - Detección automática de relaciones entrantes (`inputRelations`) cuyo destino soporte `GET`.
   - Invocación reactiva de `api.get<Padre>()` para desplegar tarjetas de contexto operativo (por ejemplo, fecha operativa del menú diario y datos de sucursal).
3. **Tablas de Colecciones Hijas:**
   - Inspección del plan para identificar entidades dependientes que apunten a la entidad activa y soporten `LIST` (por ejemplo, `MenuVersionComponent` vinculado a `MenuVersion`).
   - Consulta reactiva y filtrado por clave foránea, renderizando una tabla estructurada con tipo de componente, precio formateado y disponibilidad.
4. **Navegación entre Registros Hermanos / Alternativos:**
   - Si la entidad comparte un ámbito padre, se consultan las versiones alternativas conservadas y se proporcionan enlaces directos de inspección (`data-action="Examinar versión"`).
5. **Navegación y Acciones Secundarias:**
   - Enlaces de retorno al listado general (`data-action="Volver a la consulta de ..."`).
   - Botón de acción principal vinculado a la preparación de nuevas propuestas o borradores.

---

## 4. Métricas de Validación y Estado de Pruebas

- **Compilación TypeScript:** Exitosa (`tsc -p tsconfig.build.json` código de salida 0).
- **Pruebas Unitarias e Integración Ejecutadas:** **312 pruebas en 31 suites: todas pasan.**
  - `apps/api/src/code-generation`: 87/87 pasando.
  - `apps/api/src/construction`: 90/90 pasando.
  - `apps/api/src/structured-analysis`: 111/111 pasando.
  - `apps/api/src/user-manuals`: 24/24 pasando.
- **Proveedor de IA:** Conexión verificada con el intermediario local de desarrollo ChatGPT (`http://127.0.0.1:47833/token` responde HTTP 200).
- **Invariantes Arquitectónicas:**
  - Rigurosa neutralidad de dominio: sin lógica ni textos fijos de proyectos piloto en el núcleo del generador (`AGENTS.md §4.1`).
  - Ausencia absoluta de atribuciones a IA externa o metadatos generativos en commits, código o reportes (`AGENTS.md`).
