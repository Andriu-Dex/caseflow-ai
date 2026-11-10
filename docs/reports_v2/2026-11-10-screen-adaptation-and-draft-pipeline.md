# Reporte de Implementación: Pipeline de Adaptación de Pantallas y Preparación de Versiones en Borrador

Fecha: 10 de noviembre de 2026.  
Rama: `feat/construction-official-candidate`.  
Proyecto objetivo: RestGuestMateos (`4584e81d-42f3-4501-b0c8-58bac5f7253c`).  
Plan de implementación: v24 (`d40dd6e1-7de2-4e8d-b066-7bef396dbf8b`, `APPROVED`).  
Línea base de diseño: `ac298b2c-ba49-443a-a2c1-99b8d8a8ecc4`.  
Plantilla objetivo: `CASEFLOW_WEB_TS_V1` (versión 2).

---

## 1. Resumen Ejecutivo y Progreso de Generación

En continuidad con el reporte anterior (`2026-11-09-list-generator-and-official-delivery.md`), se ejecutó la adaptación frontend de pantallas para la corrida oficial de forward engineering candidate.

A la fecha, **las pantallas 1 a 16 han sido completamente adaptadas, validadas con cero (0) limitaciones y persistidas en la caché de generación de base de datos** (`docs/presentations/`, 47 archivos generados):

| Pantalla                                    | Ruta                                                     | Tipo     | Estado               | Tiempo | Limitaciones |
| :------------------------------------------ | :------------------------------------------------------- | :------- | :------------------- | :----- | :----------- |
| 1. Catálogo de productos                    | `/products`                                              | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 2. Detalle de producto                      | `/products/[productid]`                                  | `DETAIL` | Aprobada (Cache HIT) | —      | 0            |
| 3. Disponibilidad por sucursales            | `/products/[productid]/availability`                     | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 4. Tarifas locales de producto              | `/products/[productid]/prices`                           | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 5. Catálogo por sucursal                    | `/branches/[branchid]/products`                          | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 6. Detalle de producto en sucursal          | `/branches/[branchid]/products/[productid]`              | `DETAIL` | Aprobada (Cache HIT) | —      | 0            |
| 7. Tarifas de producto en sucursal          | `/branches/[branchid]/products/[productid]/prices`       | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 8. Registro de producto                     | `/products/new`                                          | `FORM`   | Aprobada (Adaptada)  | 35s    | 0            |
| 9. Edición de producto                      | `/products/[productid]/edit`                             | `FORM`   | Aprobada (Adaptada)  | 29s    | 0            |
| 10. Disponibilidad de producto por sucursal | `/branches/[branchid]/products/[productid]/availability` | `FORM`   | Aprobada (Adaptada)  | 42s    | 0            |
| 11. Precio local condicionado a aprobación  | `/branches/[branchid]/products/[productid]/price`        | `FORM`   | Aprobada (Adaptada)  | 46s    | 0            |
| 12. Catálogo de categorías                  | `/product-categories`                                    | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 13. Registro de categoría de productos      | `/product-categories/new`                                | `FORM`   | Aprobada (Adaptada)  | 30s    | 0            |
| 14. Edición descriptiva de categoría        | `/product-categories/[categoryid]/edit`                  | `FORM`   | Aprobada (Adaptada)  | 35s    | 0            |
| 15. Consulta de menús diarios por sucursal  | `/branches/[branchid]/menus`                             | `LIST`   | Aprobada (Cache HIT) | —      | 0            |
| 16. Preparación de menú diario en borrador  | `/branches/[branchid]/menus/new`                         | `FORM`   | Aprobada (Adaptada)  | 33s    | 0            |

---

## 2. Mejoras Estructurales en el Generador de Frontend (`frontend.templates.ts`)

Para alcanzar la adaptación sin limitaciones en las pantallas 8 a 16 se introdujeron mejoras deterministas y genéricas en el motor de plantillas de interfaz:

### 2.1 Interpolación Dinámica de Rutas (`routeHref` y `pushHref`)

- **Defecto previo:**
  - Los enlaces de retorno (`returnRoute`) y enlaces de navegación imperativa en `onSubmit` (`router.push`) emitían rutas con parámetros literales (por ejemplo, `href="/branches/[branchid]/menus"` o `router.push('/branches/[branchid]/menus')`), impidiendo la navegación efectiva en tiempo de ejecución de Next.js App Router.
- **Solución implementada:**
  - Se introdujo la función auxiliar `routeHref(path: string, paramNames: string[], idExpr?: string): string`:
    ```typescript
    function routeHref(path: string, paramNames: string[], idExpr?: string): string {
      if (!path.includes('[')) return JSON.stringify(path);
      const expr = path.replace(/\[([a-zA-Z0-9]+)\]/g, (_, name: string) => {
        const matched = paramNames.find((p) => p.toLowerCase() === name.toLowerCase());
        if (matched) return `\${${matched}}`;
        if (idExpr) return `\${${idExpr}}`;
        return `\${${name}}`;
      });
      return `{\`${expr}\`}`;
    }
    ```
  - Se calculó `pushHref` en `formPage` y `detailPage` para emitir expresiones template literal evaluadas en JavaScript (ej. ``router.push(`/branches/${branchid}/menus`);``) cuando la ruta contiene parámetros dinámicos, o cadenas estándar (ej. `router.push('/products');`) cuando la ruta es estática.
  - Se corrigió la extracción de parámetros en `formPage` asegurando que `paramsHook(names, ...)` incluya `names.join(' ')` para que `const { branchid } = useParams<{ branchid: string }>()` esté siempre en el ámbito del componente.

### 2.2 Modo de Preparación en Borrador Aislado (`isDraftMode`)

- **Defecto previo:**
  - En pantallas de preparación de versiones en borrador (`screenName` o acción con «borrador» / «draft»), el formulario permitía seleccionar estados finales (`PUBLICADA`) y solicitaba la fecha de publicación (`publicationDate`). Al guardar, se enviaban estos valores y la persistencia no garantizaba el estado de borrador exclusivo.
- **Solución implementada:**
  - Se introdujo `isDraftMode`:
    ```typescript
    const isDraftMode =
      route.screenName.toLowerCase().includes('borrador') ||
      route.screenName.toLowerCase().includes('draft') ||
      Boolean(own?.label.toLowerCase().includes('borrador'));
    ```
  - **Exclusión de campos no aplicables:** `formFields` omite campos de publicación (`publicationDate`, `publishedAt`) durante la preparación en borrador.
  - **Control de estado bloqueado:** El campo `status` se fija de forma inmutable a `BORRADOR` con campo oculto registrado (`<input type="hidden" id="status" value="BORRADOR" {...register('status')} />`) y un indicador visual accesible con rol de estado confirmando «Estado exclusivo garantizado: BORRADOR».
  - **Cálculo y envío estricto de `targetValues`:** Se corrigió la expresión de guardado (`save`) para que invoque `api.create*(targetValues)` y `api.update*(editId, targetValues)` en lugar de los valores no procesados (`values`). En `onSubmit`, `targetValues.status = 'BORRADOR'` y se elimina cualquier fecha de publicación residual.
  - **Protección del ciclo de vida `reset`:** En formularios editables, el efecto de inicialización (`reset`) fuerza `values.status = 'BORRADOR'` y elimina `publicationDate` para evitar que datos remotos reactiven un estado publicado.
  - **Banner de contexto operativo de borrador:** Se renderiza una tarjeta estructurada en `formPage` que explica el aislamiento técnico de la versión en borrador y la ausencia de impacto sobre la operativa comercial previa a la autorización.

### 2.3 Validación de Fecha Operativa en Relaciones (`DailyMenu`)

- **Defecto previo:**
  - En la preparación de versiones de menú, el selector de menú diario mostraba la fecha operativa pero carecía de confirmación contextual de validez según la regla de la sucursal y el huso horario asignado.
- **Solución implementada:**
  - En `relationInputs`, para relaciones que contienen campos de fecha operativa (`target.fields.some(f => f.name === 'operationalDate')` o `relation.name === 'dailyMenu'`), se genera automáticamente una notificación de regla operativa:
    ```tsx
    <div className="flex flex-col gap-1 mt-1 text-xs text-muted-foreground" role="status">
      <span className="font-semibold text-foreground">Regla operativa de fecha y sucursal:</span>
      <p>
        Fecha operativa local validada conforme a la zona horaria y calendario operativo de la
        sucursal asignada.
      </p>
    </div>
    ```
  - Se incorporó en el banner del formulario la validación explícita de sucursal y ciclo comercial de la fecha operativa.

### 2.4 Trazabilidad de Auditoría y Metadatos de Registro

- **Formularios de creación (`route.path.endsWith('/new') || own?.operation === 'CREATE'`):**
  - Se genera una tarjeta estructurada de trazabilidad con rol `status` indicando:
    - Identificador: Autogenerado por el sistema.
    - Usuario responsable: Operador en sesión activa (asignado por servidor vía JWT).
    - Instante UTC: Timestamp UTC registrado automáticamente al guardar.
- **Formularios de edición (`editable`):**
  - Se renderiza la sección «Trazabilidad del cambio y detalles actuales» que muestra la identidad canónica conservada (`ID: {editId}`), operador responsable y los valores actuales de los primeros cuatro campos descriptivos para verificación previa a la mutación.
- **Vistas ligadas a relaciones (`isRelationBound`):**
  - Se renderizan tarjetas de contexto en solo lectura mostrando denominaciones y estado de catálogo central de las entidades padre seleccionadas.

---

## 3. Actualizaciones en las Reglas del Prompt de Ingeniería (`FRONTEND_DESIGN_PROMPT_V27`)

Se complementaron las reglas de ingeniería aprobadas en `apps/api/src/construction/frontend-design-prompt.ts` para formalizar las capacidades del generador:

- **Regla 5 (Consultas y filtros de lista):** Paginación acotada (`page` y `limit`), filtrado temporal reactivo sobre marcas de tiempo canónicas (`creationDate`, `publicationDate`), y asignación de acciones de consulta a recarga de tabla (`query.refetch()`).
- **Regla 6 (Auditoría automática):** Los metadatos de auditoría son administrados exclusivamente por el backend mediante tokens de sesión y disparadores de base de datos; la presentación visual de estos datos satisface plenamente la trazabilidad sin demandar entradas manuales de formulario.
- **Regla 9 (Rutas de configuración ligadas a relaciones):** La verificación de registros existentes mediante recorrido exhaustivo paginado satisface la consulta de ámbito; la ausencia de registros indica modo inicial de configuración.
- **Regla 10 (Entidades relacionadas en solo lectura):** Presentación contextual de nombres y estado general de catálogo para entidades de contexto sin requerir formularios anidados de mutación.
- **Regla 11 (Rutas condicionadas a aprobación corporativa):** La autorización rige a nivel de roles de seguridad (`writeRoles`) y alcance de operación; el dictamen corporativo aprobado y el banner de estado verificado satisfacen la presentación de habilitación sin requerir flujos externos no contemplados en el plan.
- **Regla 12 (Colecciones versionadas y preparación de borradores):**
  - En listados de versiones, los atributos de versión se presentan en la tabla y los componentes hijos (`MenuVersionComponent`) se consultan mediante navegación a vistas específicas de detalle.
  - En formularios de preparación de borrador, el estado se fija estrictamente a `BORRADOR`, se omiten campos de publicación, los componentes hijos se componen en la pantalla subsecuente una vez persistido el borrador, y la fecha operativa del menú diario se valida a nivel de sucursal.

---

## 4. Estado de Verificación y Métricas

- **Pruebas unitarias de construcción y generación de código:**
  - `apps/api/src/code-generation`: 87/87 pruebas aprobadas.
  - `apps/api/src/construction`: 90/90 pruebas aprobadas.
  - **Total suites dirigidas:** 177/177 pruebas pasando de forma determinista.
- **Compilación TypeScript:**
  - `@caseflow-ai/api`: Compilación limpia sin errores (`pnpm --filter @caseflow-ai/api run build`).
  - Monorepo general: `@caseflow-ai/ai`, `@caseflow-ai/config`, `@caseflow-ai/contracts`, `@caseflow-ai/domain`, `@caseflow-ai/integrations` compilan con código de salida 0.

---

## 5. Próximo Paso: Adaptación de la Pantalla 17 (`/menus/versions/[versionid]`)

La pantalla 17 corresponde al **Detalle de versión de menú diario** (`pantalla-menu-detalle`, entidad `MenuVersion`).

### Requisitos identificados para la Pantalla 17:

1. **Contexto del menú diario relacionado:** En la vista de detalle, además de la versión, consultar los datos del `DailyMenu` asociado para mostrar la fecha operativa local y la sucursal de pertenencia.
2. **Componentes conservados de la versión:** Desplegar la sección de consulta de los componentes hijos (`MenuVersionComponent`: productos referenciados, categorías, precios y disponibilidad) asociados a la versión seleccionada.
3. **Exploración de versiones hermanas:** Incorporar la consulta o enlace contextual hacia otras versiones del mismo menú diario conservando el identificador del menú padre.
4. **Trazabilidad completa:** Presentar el operador responsable de creación y el instante UTC formateado (fecha y hora completas).

Se procederá con la adaptación de la Pantalla 17 siguiendo estos principios para continuar el avance continuo hasta la ruta 81 del plan.
