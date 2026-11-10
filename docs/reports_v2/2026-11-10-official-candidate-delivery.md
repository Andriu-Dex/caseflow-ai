# Reporte de Implementación: Refactorización Estructural, Fidelidad de Diseño y Pipeline de Construcción Oficial

**Fecha:** 10 de noviembre de 2026  
**Rama:** `feat/construction-official-candidate`  
**Autor:** Andriu Dex <andriudex@gmail.com>  
**Proyecto:** RestGuestMateos (`4584e81d-42f3-4501-b0c8-58bac5f7253c`)  
**Versión de ImplementationPlan:** v24 (`d40dd6e1-7de2-4e8d-b066-7bef396dbf8b`, `APPROVED`)  
**Línea Base de Diseño:** `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`  
**Plantilla Objetivo:** `CASEFLOW_WEB_TS_V1` (versión 2)  

---

## 1. Resumen Ejecutivo

En seguimiento a las auditorías técnicas y a las revisiones de fidelidad funcional para la entrega oficial del software, se ejecutó una refactorización profunda e integral en los motores de generación de backend (`backend.templates.ts`), frontend (`frontend.templates.ts`), gestión de prompts (`frontend-design-prompt.ts`), y servicios de ejecución del pipeline de construcción (`generation-runs.service.ts`, `frontend-design.service.ts`).

Se corrigieron todos los hallazgos críticos detectados:
1. **Eliminación de aprobaciones ficticias y estados forzados por texto:** Supresión de banners estáticos y sustitución por roles operativos y estados reales de dominio.
2. **Validación temporal y precedencia de fechas en backend:** Priorización de fechas operativas de negocio sobre marcas de tiempo de auditoría técnica, con validación estricta de rangos en controladores y servicios.
3. **Inmutabilidad y reglas de publicación en servidor:** Protección de versiones de menú publicadas en el backend, impidiendo la alteración de versiones formalizadas y bloqueando la publicación sin componentes registrados.
4. **Validación monetaria exacta y desacoplamiento de regex frágil:** Implementación de un validador numérico de precisión de dos decimales inmune a fallos de escape en interpolaciones dobles de plantillas.
5. **Precarga paginada exhaustiva de colecciones subordinadas:** Eliminación de límites estáticos de 100 registros mediante bucles de recorrido paginado (`while (true)`).
6. **Resolución de orden de inicialización en componentes React (TDZ):** Declaración previa de `editId` y `existing` antes de `optionQueries` en pantallas con relaciones jerárquicas hijo.

Todas las suites de prueba pasan exitosamente (**78/78 pruebas del motor de generación** y **819/819 pruebas unitarias de la API**).

---

## 2. Refactorizaciones Técnicas en Backend (`backend.templates.ts`)

### 2.1 Precedencia y Resolución de Fechas de Dominio (`findPrimaryDateResolution`)
* **Problema anterior:** El filtro de listado seleccionaba indiscriminadamente el primer campo de tipo fecha de la entidad, usando con frecuencia `createdAt` (auditoría técnica) en lugar de fechas comerciales u operativas (`operationalDate`, `saleDate`).
* **Solución implementada:**
  * Se diseñó un algoritmo de resolución con orden estricto de precedencia:
    1. Fechas operativas directas (`operationalDate`, `saleDate`).
    2. Fechas de vigencia comercial (`validFrom`).
    3. Fechas de contexto jerárquico padre (e.g. `dailyMenu.operationalDate`).
    4. Fechas descriptivas no auditadas.
    5. Como último recurso técnico: marcas de auditoría (`createdAt`).

### 2.2 Validación Segura en Controladores y Servicios
* **Controladores (`@Get() list`):** Comprobación de parámetros de fecha mediante `Date.parse()` y verificación de finitud numérica (`Number.isFinite`). Si se envía un string corrupto o una inversión de rango (`from > to`), el controlador arroja inmediatamente un `BadRequestException`.
* **Servicios (`service.list`):** Funciones `parseDateGte` y `parseDateLte` que ajustan de forma segura los límites UTC (con límite superior a las `23:59:59.999Z`), evitando enviar objetos `Date` inválidos a Prisma ORM.

### 2.3 Reglas de Negocio e Inmutabilidad en Publicación de Versiones
* En el método `update()` de `MenuVersion`:
  * Al solicitar el cambio a `status === 'PUBLICADA'`:
    * El backend realiza un recuento de componentes asociados (`menuVersionComponent.count`). Si el conteo es cero, rechaza la operación con `BadRequestException('No se puede publicar una versión de menú sin componentes registrados.')`.
    * Establece en el servidor `publicationDate = new Date()`, eliminando cualquier manipulación o fabricación de fechas desde el cliente.
  * Si un registro ya posee `status === 'PUBLICADA'`, se prohíbe cualquier mutación posterior arrojando `BadRequestException('No se puede modificar una versión publicada; las versiones publicadas son inmutables.')`.

---

## 3. Refactorizaciones en Frontend (`frontend.templates.ts`)

### 3.1 Corrección de Pantallas de Selección y Disponibilidad (`Screen 10`)
* **Problema:** Los checkboxes binarios en modo inicial carecían de estado no seleccionado explícito, y el formulario permitía envíos mientras cargaban las opciones de sucursal.
* **Solución:**
  * Sustitución por un `<select>` tri-estado explícito: `""` (Seleccione una opción), `"true"` (Sí), `"false"` (No) con conversión tipada `setValueAs`.
  * Bloqueo automático del `<fieldset>` y botones de acción mientras `isLoading`, `isError` o mientras las relaciones dependientes no se encuentren cargadas en caché.

### 3.2 Eliminación de Banners Engañosos y Autorización Real (`Screen 11`)
* Eliminación definitiva de textos como `«Aprobación verificada / Dictamen: APROBADO»`.
* Sustitución por comprobación transparente de roles autorizados (`route.roles` y `entity.writeRoles`), mostrando al operador qué perfiles tienen facultad para condicionar o fijar precios por sucursal.

### 3.3 Formularios de Versiones en Borrador y Edición de Componentes (`Screen 18`)
* **Resolución de Inicialización (TDZ):** Se reorganizó la estructura de la función del componente para declarar `editId` y la consulta `existing` **antes** de `optionQueries` cuando la pantalla contiene componentes hijos (`hasChildComponents`) o ramas resueltas (`needsResolvedBranch`). Esto elimina el error `ReferenceError: Cannot access 'editId' before initialization`.
* **Validador Numérico de Precisión Monetaria (`isValidComponentPrice`):**
  * Para evitar fallos de escape donde expresiones regulares como `/^\d+(\.\d{1,2})?$/` eran corrompidas a `/^d+(.d{1,2})?$/` por doble interpolación en cadenas de plantilla de JavaScript, se implementó un parser de caracteres y números determinista:
    * Normaliza comas a puntos decimales (`replace(',', '.')`).
    * Rechaza notación exponencial (`e`, `E`).
    * Comprueba que las partes entera y decimal contengan estrictamente dígitos `'0'` a `'9'`.
    * Exige un máximo de dos dígitos en la parte decimal.
    * Valida finitud y no negatividad (`Number.isFinite(num) && num >= 0`).
* **Representación Monetaria Exacta (`formatMonetaryPrice`):** Convierte a número redondeado exactamente a 2 decimales (`Math.round(num * 100) / 100`), evitando discrepancias de punto flotante de IEEE 754.
* **Bloqueo y Sincronización en Guardado Global (`onSubmit`):**
  * En lugar de omitir silenciosamente modificaciones inválidas, `onSubmit` recorre todos los borradores pendientes en `componentDrafts`: si alguno no cumple `isValidComponentPrice`, aborta la operación, muestra una alerta descriptiva mediante `toast.error`, y cancela la persistencia de la versión.
  * Si todos son válidos, ejecuta la sincronización mediante `api.updateMenuVersionComponent` antes de actualizar el registro principal de la versión, e invalida las consultas asociadas en TanStack Query.
  * El botón de envío se deshabilita automáticamente mientras `hasInvalidDraftPrices` sea verdadero.
* **Precarga Paginada Exhaustiva:** Se implementó un bucle `while (true)` que recorre todas las páginas del endpoint del backend (`limit: 100`) hasta recopilar y filtrar la totalidad de los componentes y las opciones de productos del catálogo.

### 3.4 Pantalla de Publicación de Menú (`Screen 19`)
* Presentación contextual de la versión en solo lectura vinculando sucursal, identificador del menú diario y fecha operativa.
* Confirmación explícita de transición de estado a `PUBLICADA`.

---

## 4. Gestión de Prompts y Versionado de IA

* Se creó y registró formalmente `FRONTEND_DESIGN_PROMPT_V30` en `apps/api/src/construction/frontend-design-prompt.ts`.
* Se registró la versión 30 en `apps/api/src/ai/ai.module.ts`.
* Se actualizó `apps/api/src/construction/frontend-design.service.ts` para fijar `promptVersion: 30`.
* Se actualizaron las pruebas unitarias en `frontend-design.service.spec.ts`.
* El prompt V30 establece reglas estrictas de fidelidad contractual:
  * Prohibición absoluta de considerar banners estáticos como validación.
  * Exigencia de enlace de datos reales y bloqueo de controles ante estados no confirmados.

---

## 5. Pruebas y Validación de la Suite

Se ejecutaron las pruebas dirigidas y suites completas del monorepo:

1. **Pruebas del Motor de Generación (`vitest run src/code-generation/engine`):**
   * `trace-links.spec.ts`: 4 pruebas pasadas.
   * `presentation.spec.ts`: 21 pruebas pasadas.
   * `project-generator.spec.ts`: 33 pruebas pasadas.
   * `action-contract.templates.spec.ts`: 9 pruebas pasadas.
   * `local-auth.templates.spec.ts`: 11 pruebas pasadas.
   * **Total: 78/78 pruebas pasadas.**
2. **Pruebas de la API (`vitest run src`):**
   * 107 suites de prueba pasadas.
   * **Total: 819/819 pruebas unitarias pasadas.**
3. **Compilación de paquetes y aplicaciones (`pnpm build`):**
   * `@caseflow-ai/contracts`: Compilado sin errores.
   * `@caseflow-ai/domain`: Compilado sin errores.
   * `@caseflow-ai/ai`: Compilado sin errores.
   * `@caseflow-ai/integrations`: Compilado sin errores.
   * `@caseflow-ai/api`: Compilado sin errores.

---

## 6. Estado del Broker de ChatGPT y Cooldown de Ventana

Durante la ejecución continua de adaptaciones directas de interfaz, el proveedor de OpenAI alcanzó la ventana de cuota periódica de mensajes (`subscription_sharing_usage_limit_exceeded`), activando el estado `paused` en el intermediario local de desarrollo (`dev-broker` en puerto 47833).

* Se verificó la conexión de red y la operatividad del broker.
* Se validó el endpoint de reanudación `POST /resume` con autenticación mediante `CHATGPT_BROKER_SECRET`, el cual restablece el intermediario a estado activo (`200 OK`, `accessToken` disponible).
* Las pantallas previas (1 a 17) cuentan con su definición estructural generada de forma determinista para ser resueltas de inmediato sin consumo de cuota adicional tan pronto se reanude la generación oficial de las rutas restantes.
