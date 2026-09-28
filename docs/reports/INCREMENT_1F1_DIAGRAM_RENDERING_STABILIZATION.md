# Incremento 1F.1 — Diagram Rendering Stabilization

Rama: `feature/data-model-diagrams` (sin commit/push; ver instrucción original). No se inició el Incremento 1G.

## 1. Arquitectura del renderer

```text
Modelo/Casos de uso estructurados
  → DiagramEngine (fuente determinística MERMAID_ER/PLANTUML + validación local ligera)
  → DiagramProvider (abstracción, packages/integrations)
  → KrokiDiagramProvider (adapter HTTP)
  → Kroki local (self-hosted)
  → SVG real
  → sanitizeDiagramSvg (saneamiento XML explícito, apps/api/src/data-models/svg-sanitizer.ts)
  → SVG confiable persistido/entregado
```

`DiagramEngine` (`apps/api/src/data-models/diagram-engine.ts`) ya no renderiza: solo genera fuente determinística y aplica una validación local ligera (formato/tamaño), consistente con AGENTS.md — el módulo de dominio no depende de Kroki. El renderizado real vive detrás de `DiagramProvider` (`packages/integrations/src/diagram-provider.ts`), con `KrokiDiagramProvider` (`packages/integrations/src/kroki-diagram-provider.ts`) como único adapter concreto y `DisabledDiagramProvider`/`FakeDiagramProvider` para configuración deshabilitada/pruebas. `DataModelsService` inyecta `DiagramProvider` vía el token `DIAGRAM_PROVIDER` (`apps/api/src/data-models/diagram-provider.token.ts`), cableado en `data-models.module.ts` mediante `loadDiagramRendererConfig` (`packages/config/src/diagram-config.ts`).

No se evaluó ni se necesitó otro renderer local: Kroki soporta ambos formatos requeridos (Mermaid ER vía motor Mermaid con contenedor complementario; PlantUML embebido en la imagen principal) con una única infraestructura.

## 2. Versiones exactas

- Kroki (imagen principal): `yuzutech/kroki:0.32.1`.
- Kroki Mermaid (compañero requerido por el motor Mermaid): `yuzutech/kroki-mermaid:0.32.1`.
- Sanitizador XML: `fast-xml-parser@5.11.1` (dependencia nueva, única añadida; XML parser real, no HTML-lenient, con `XMLValidator` + `XMLParser`/`XMLBuilder` en modo `preserveOrder`).
- Sin cambios en TypeScript (5.9.3), Node.js (24), Zod (4.6.5), NestJS (11.2.3), Prisma (7.10.0).

## 3. Cambios de infraestructura local

`infra/docker/compose.yml`: se añadieron los servicios `kroki` y `kroki-mermaid`, ambos con `restart: unless-stopped` y healthcheck. `kroki` usa `wget -q -O /dev/null http://localhost:8000/health` (GET real, no `--spider`: se detectó en verificación que `/health` no responde a HEAD como `wget --spider` espera, aunque un GET normal sí devuelve 200 — corregido en compose y en el service container de CI). `kroki-mermaid` usa una comprobación TCP vía `node -e ...` (no expone un endpoint HTTP de salud propio). `kroki` se expone únicamente en `127.0.0.1:8000` (nunca `0.0.0.0`); `kroki-mermaid` no se expone al host en absoluto, solo es alcanzable internamente por `kroki` vía `KROKI_MERMAID_HOST=kroki-mermaid`. Ninguna imagen usa `latest`/`dev`/`edge`. `pnpm infra:up` ahora también levanta Kroki (confirmado `docker compose ps` → ambos `healthy`).

`.env.example` gana `DIAGRAM_RENDERER=kroki`, `KROKI_BASE_URL=http://localhost:8000`, `DIAGRAM_RENDER_TIMEOUT_MS=10000`. `.github/workflows/ci.yml` añade `kroki`/`kroki-mermaid` como service containers del job `integration` (mismas versiones pinneadas), con `DIAGRAM_RENDERER=kroki`/`KROKI_BASE_URL=http://localhost:8000` como env del job — nunca se usa un endpoint público.

## 4. Resultado real Mermaid ER

Confirmado end-to-end contra Kroki local (`apps/api/test/integration/diagram-rendering.integration.spec.ts`): la fuente `MERMAID_ER` determinística se acepta (HTTP 200) y el SVG resultante contiene `aria-roledescription="er"`, elementos gráficos reales (`<g>`, `<path>`, `<circle>`, `<marker>`, `<foreignObject>`) y el texto de entidades/relaciones del modelo estructurado (`Customer`, `Order`). Ya no aparece `font-family="monospace"` (el patrón de la previsualización textual anterior).

## 5. Resultado real PlantUML (casos de uso)

Confirmado contra Kroki local: la fuente `PLANTUML` determinística se acepta y el SVG resultante contiene actores como figuras de palo reales (`<ellipse>`), el código de caso de uso (`CU-001`) y los nombres de actor, sin `include`/`extend`/generalización inventados.

## 6. Comportamiento de validación de fuente

`DiagramEngine.validate` sigue existiendo como filtro barato local (formato/tamaño; para Mermaid ER también rechaza `<`/`>` antes de generar la solicitud). Ya no certifica compatibilidad por sí mismo: Kroki es la autoridad de compatibilidad. Una fuente malformada que pase el filtro local es rechazada explícitamente por el renderer real (`HTTP 400` → `DiagramProviderError('DIAGRAM_INVALID_SOURCE')`, verificado contra el Kroki real en `diagram-rendering.integration.spec.ts`).

## 7. Estrategia de saneamiento SVG

`apps/api/src/data-models/svg-sanitizer.ts` usa `fast-xml-parser` (XML real, nunca solo regex): valida estructura con `XMLValidator`, parsea con `XMLParser` (`preserveOrder`), reconstruye desde una lista explícita de etiquetas/atributos permitidos y serializa con `XMLBuilder`. `foreignObject` se conserva (justificado: Mermaid ER lo requiere para el layout de etiquetas de entidad/atributo), pero su contenido queda acotado a `div`/`span`/`p`/`br`. Nunca sobreviven: `script`, `iframe`, `object`, `embed`, `img`, `image`, `a`, `base`, `link`, `meta`, ni atributos `href`/`xlink:href`/`src`/`on*`, ni valores `style` con `url()`/`expression()`/`@import`/`javascript:`. Una aserción final de cadena (no como sanitizador único, solo defensa adicional) rechaza `<script` o `javascript:` residual. Verificado contra: (a) fixtures maliciosos manuales (`svg-sanitizer.spec.ts`, 12 tests) y (b) el SVG real devuelto por Kroki (`diagram-rendering.integration.spec.ts`, 2 tests dedicados de seguridad).

## 8. Decisión SYSTEM_GENERATED

Se introdujo el valor aditivo `SYSTEM_GENERATED` en `ArtifactOrigin` (`MANUAL`, `AI_GENERATED`, `AI_ASSISTED`, `SYSTEM_GENERATED`, `IMPORTED`) en: `docs/CASEFLOW_AI_SPEC.md` (§6.3, §218.1, §218.8), `packages/domain` (vocabulario + `initialStatusForOrigin`), `packages/contracts` (`artifact.contract.ts`), enum PostgreSQL (`prisma/migrations/20260922210000_artifact_origin_system_generated/migration.sql`, aditivo, no se reescribió ninguna migración histórica). `generateUseCaseDiagram` pasa de `MANUAL/GENERATED` a `SYSTEM_GENERATED/GENERATED`. Ningún otro tipo de artefacto (incluido `DATA_MODEL`) cambia de origen. `REQUIREMENT`/`USE_CASE` conservan su enum de origen específico sin tocar (nunca usan `SYSTEM_GENERATED`, fuera de alcance).

## 9. Ordenamiento/deduplicación de actores

`DiagramEngine.generateUseCase` reemplaza `localeCompare` por comparación ordinal de unidades de código (`compareOrdinal`, sin locale) para actores y códigos de caso de uso. Se deduplican los actores dentro de cada caso de uso (identidad normalizada por `trim`, `dedupePreserveOrder`) antes de construir el diagrama-wide actor list y las asociaciones, evitando líneas de asociación duplicadas por datos históricos/malformados (p. ej. actor principal repetido en `secondaryActors`). Cubierto por tests deterministas en `diagram-engine.spec.ts`.

## 10. Comportamiento ante fallo del renderer

El render (y saneamiento) ocurre siempre **antes** de abrir la transacción de escritura correspondiente (creación/versión manual de `DATA_MODEL`, cada candidato de `accept()`, generación de `USE_CASE_DIAGRAM`). Si falla, la transacción nunca se abre y no se escribe ninguna fila: el dato canónico nunca se destruye ni se marca con un SVG falso. Un fallo de renderizado se normaliza a `UnprocessableEntityException({code:'DIAGRAM_INVALID_SOURCE'})` (fuente rechazada por el renderer) o `ServiceUnavailableException({code: 'DIAGRAM_PROVIDER_TIMEOUT'|'DIAGRAM_PROVIDER_UNAVAILABLE'|'DIAGRAM_PROVIDER_ERROR'|'DIAGRAM_RESPONSE_TOO_LARGE'|'DIAGRAM_UNSAFE_OUTPUT'|'DIAGRAM_NOT_CONFIGURED'})`. Para `accept()` (que puede aceptar hasta 5 candidatos en un lote), todos los diagramas se pre-renderizan antes de abrir la transacción; un fallo en cualquiera aborta el lote completo sin escribir nada (se preserva la garantía "todo o nada" ya existente). La fuente determinística no requiere persistencia especial para "sobrevivir" al fallo: la entrada manual es la del propio cliente (reintentar la misma solicitud) y los candidatos de IA ya persistidos en `generate()` permanecen intactos para un nuevo intento de `accept()`. Documentado en `docs/CASEFLOW_AI_SPEC.md` §218.8.

## 11. OpenAPI

Se cerraron los tres huecos identificados en el anexo técnico de 1F: `POST .../data-models/generate`, `GET .../data-models/generations/{generationId}` y `POST .../data-models/generations/{generationId}/accept` ahora documentan un esquema de respuesta Zod (`dataModelGenerationResponseSchema`, nuevo; `dataModelListResponseSchema`, reutilizado para `accept`). No se tocó ninguna ruta previa no relacionada con 1F.

## 12. Tests añadidos

- `packages/domain/.../artifact-lifecycle.spec.ts`: `SYSTEM_GENERATED` en el vocabulario y en `initialStatusForOrigin`.
- `packages/config/src/index.spec.ts`: `loadDiagramRendererConfig` (disabled por defecto, validación Kroki, timeout).
- `packages/integrations/src/kroki-diagram-provider.spec.ts` (nuevo, 8 tests): request real hacia `/mermaid/svg` y `/plantuml/svg`, normalización 400/404/500/503/504, tamaño de respuesta excedido, timeout, fallo de red — todo con `fetch` simulado, sin red real.
- `apps/api/src/data-models/svg-sanitizer.spec.ts` (nuevo, 12 tests): preserva contenido legítimo (formas, `marker`, `style`, `foreignObject`), elimina `<script>`, `onload`/`onerror`, `javascript:`, `href`/`src` externos, `iframe`/`object`/`embed`/`base`/`link`, valores `style` peligrosos; escapa en vez de ejecutar contenido atacante; rechaza raíz no-SVG y XML mal formado.
- `apps/api/src/data-models/diagram-engine.spec.ts`: fuente ER determinística (sin `renderSvg` fake), deduplicación diagrama-wide y por caso de uso, orden ordinal sin locale, rechazo de nombres de entidad con `<`/`>` (Mermaid) antes de llegar a cualquier renderer.
- `apps/api/src/data-models/data-models.service.spec.ts`: proveedor fake inyectado; dos tests nuevos de fallo de renderizado normalizado sin escritura (`accept` en lote y creación manual); reescritura de la prueba de `accept()` con doble lookup (preview + tx).
- `apps/api/test/integration/data-models-diagrams.integration.spec.ts`: origen `SYSTEM_GENERATED` del diagrama de casos de uso; concurrencia de `DataModelsService.version` (gap 21.A); candidato de IA con relación a entidad inexistente → `AI_INVALID_OUTPUT`, sin generación ni artefacto (gap 21.B).
- `apps/api/test/integration/diagram-rendering.integration.spec.ts` (nuevo, 6 tests): renderizado gráfico real Mermaid ER y PlantUML, rechazo explícito de fuente malformada por el Kroki real, renderer inalcanzable, timeout de red real, `<script>`/`onerror`/`<img>` neutralizados end-to-end contra el Kroki real.
- `apps/api/src/openapi/openapi.spec.ts`: enum de `origin` documentado (incluye `SYSTEM_GENERATED`); respuestas documentadas de los tres endpoints de generación/aceptación.

## 13. Conteo unit/integration

- Unit: **172 tests**, 31 archivos — todos en verde (`pnpm test`, `pnpm test:coverage`).
- Integration: **73 tests**, 12 archivos — todos en verde (`pnpm verify:integration`, contra PostgreSQL real y Kroki local real).

## 14. Cobertura

Global (línea): **81.57%** (statements 80.88%, branches 74.70%, functions 80.25%) — por encima del umbral 70% (AGENTS.md §46). `diagram-engine.ts` 100% líneas, `svg-sanitizer.ts` 94.73% líneas, `data-models.service.ts` 84.82% líneas, `kroki-diagram-provider.ts` 95% líneas.

## 15. Resultado concurrencia DataModel

`protects DataModelsService.version under concurrent version creation` (nuevo): 8 versiones concurrentes sobre el mismo `DATA_MODEL` producen exactamente los números de versión `2..9` sin duplicados ni huecos, confirmando que el bloqueo `SELECT ... FOR NO KEY UPDATE` de `DataModelsService.version` (distinto del genérico de `ArtifactsService`) también es seguro bajo concurrencia.

## 16. Resultado AI_INVALID_OUTPUT

`rejects an AI data model candidate referencing a nonexistent entity` (nuevo): un candidato con una relación hacia una entidad inexistente produce `AI_INVALID_OUTPUT` (vía `AIOrchestrator`/Zod, sin segunda validación duplicada), no crea ninguna fila `DataModelGeneration` ni ningún `Artifact` `DATA_MODEL`.

## 17. Tests de seguridad

12 tests unitarios de saneamiento (`svg-sanitizer.spec.ts`) + 2 tests de seguridad end-to-end contra el renderer real (`diagram-rendering.integration.spec.ts`) cubren explícitamente: `<script>`, `foreignObject` (preservado mas restringido), `onload`/`onerror`, `javascript:`, `href`/`src` externos, HTML embebido (`iframe`/`object`/`embed`/`base`/`link`/`img`), y escapado de nombres de entidad/atributo/actor/etiqueta de relación con contenido atacante (incluye el caso real observado: PlantUML no logra decodificar un nombre de actor `<img src=x onerror=...>` y lo reemplaza por `(Cannot decode)`, un fallo seguro adicional de la propia herramienta).

## 18. Verificado

Comandos ejecutados realmente, todos exitosos, en este orden:

```text
pnpm install                      (equivalente a --frozen-lockfile + fast-xml-parser nuevo)
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test                     (172/172)
pnpm run test:coverage            (172/172, cobertura reportada arriba)
pnpm run verify                   (gate completo, éxito)
pnpm run db:validate
pnpm run openapi:generate
git diff --check                  (sin errores)
pnpm infra:up                     (incluye kroki/kroki-mermaid; healthchecks verificados: docker compose ps → healthy)
pnpm run verify:integration       (73/73, contra Postgres real y Kroki real)
```

Verificación manual adicional contra el Kroki real (fuera de los tests, para diseñar el sanitizador con evidencia real): `curl` directo a `/health`, `/mermaid/svg`, `/plantuml/svg` con fuentes válidas, malformadas y con payloads `<script>`/`<img onerror>`.

## 19. No verificado

- No se probó el SVG saneado montado en un navegador real ni con una política CSP de frontend (no hay UI de diagramas en 1F.1, coherente con el alcance).
- No se ejecutó una carga/estrés real contra Kroki (diagramas grandes, muchas solicitudes concurrentes) más allá de los límites de tamaño ya aplicados en código.
- No se verificó el comportamiento de Kroki bajo Docker en Linux/macOS nativos (solo Windows + Docker Desktop en este entorno); la configuración es estándar de Compose y no usa nada específico de plataforma.
- No se ejecutaron pruebas de proveedores de IA reales (fuera de alcance de 1F.1 por instrucción explícita).

## 20. Limitaciones conocidas

- El saneamiento usa una lista de etiquetas/atributos deliberadamente acotada; una versión futura de Mermaid/PlantUML que introduzca una construcción SVG legítima nueva fuera de esa lista se eliminaría en vez de fallar (fallo seguro, pero podría recortar detalle visual hasta ampliar la lista).
- `foreignObject` se conserva sin distinguir "es hijo directo de un nodo Mermaid" de cualquier otro contexto; el límite real de seguridad es la lista de etiquetas/atributos internos permitidos, no la posición estructural.
- El fallo de renderizado en `accept()` no persiste un registro parcial "pendiente de render": si falla, no se escribe nada y el candidato queda disponible para un nuevo intento; no existe todavía un endpoint dedicado de "reintentar solo el diagrama".
- Las limitaciones ya documentadas en el anexo de 1F que siguen vigentes sin cambio: sin PK compuestas, sin UML include/extend/generalización, SVG/fuente persistidos en `diagram_details` (migración a `StorageProvider` diferida), regeneración de casos de uso puede crear diagramas duplicados, Impact Analysis diferido.

## 21. Estado de Git

Rama `feature/data-model-diagrams`. No se ejecutó `git add`, `git commit`, `git push` ni merge — se dejó exactamente como se encontró (25 archivos ya staged de la sesión anterior de 1F, permanecen staged; todos los cambios de 1F.1 quedan sin stagear, listos para revisión).

## Nota sobre el entorno de verificación

Durante la verificación se detectó un servicio nativo de Windows (`postgresql-x64-18`) ocupando el puerto 5432, exactamente el conflicto que el README ya documenta en Troubleshooting. No se detuvo automáticamente (requiere privilegios de administrador que esta sesión no tiene); el usuario lo detuvo manualmente para permitir la verificación de integración. El servicio quedó **detenido** al finalizar esta sesión; reiniciarlo (si se necesita para otro propósito) es una decisión del usuario.
