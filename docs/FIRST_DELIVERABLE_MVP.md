# Primer Entregable Funcional (First Deliverable MVP)

> Resumen de alcance para el equipo. La fuente de verdad es `docs/CASEFLOW_AI_SPEC.md` (§217–§219, DEC-115). Ante cualquier discrepancia, prevalece la especificación.

## Qué exige el entregable

A partir de Análisis de Requisitos, el propio software CASEFlow AI debe generar los artefactos CASE solicitados:

- requisitos funcionales y no funcionales;
- casos de uso estructurados (mínimo cuatro);
- representación del modelo de casos de uso (diagrama);
- modelo de datos (ER o clases);
- árbol de navegación;
- arquitectura de software y arquitectura de sistema;
- UI Blueprint y bocetos/mockups;
- revisión y edición humana;
- persistencia y versionamiento;
- trazabilidad básica.

Planificación (Gantt/PERT) y reflexión/evidencia del equipo siguen siendo actividades académicas elaboradas por el equipo; no las genera CASEFlow AI.

## Roadmap inmediato

| ID  | Incremento                                                                  | Estado    |
| --- | --------------------------------------------------------------------------- | --------- |
| 1A  | Project + Artifact Foundation                                               | Entregado |
| 1B  | Project Context                                                             | Entregado |
| 1C  | AI Generation Foundation                                                    | Entregado |
| 1D  | Requirements                                                                | Entregado |
| 1E  | Use Cases                                                                   | Entregado |
| 1F  | Data Model + Diagram Engine (+ 1F.1 Diagram Rendering Stabilization)        | Entregado |
| 1G  | Project Sources + Context sources                                           | Entregado |
| 1H  | Cross-stage gates                                                           | Entregado |
| 1I  | Staleness                                                                   | Entregado |
| 1J  | Traceability                                                                | Entregado |
| 1K  | Readiness                                                                   | Entregado |
| 1L  | Traceability/Readiness closure hardening                                    | Entregado |
| 1M  | First Deliverable Export (JSON/HTML)                                        | Entregado |
| 1N  | Frontend core (aplicación web de CASEflow)                                  | Entregado |
| 1O  | Fallback manual sin IA (todos los tipos de artefacto) + cierre Phase H      | Entregado |
| 1P  | Auditoría de formularios manuales contra contrato + tests de frontend en CI | Entregado |
| 1Q  | Ruta manual de Requisito faltante + Playwright Escenario A                  | Entregado |
| 1R  | Dependencias de Requisito + Playwright Escenario B                          | Entregado |
| 1S  | Test de composición de export completo + cierre final                       | Entregado |

Identity, Workspace/RBAC completos, Knowledge Base, RAG, Construction y Code Generation no se cancelan: se retoman después de este entregable.

## Estado tras el Incremento 1A

Existe la base persistente sobre la que se construirán los siguientes incrementos:

- `Workspace` y `Project` mínimos (un proyecto pertenece siempre a un workspace);
- `Artifact` (identidad estable) y `ArtifactVersion` (estado histórico inmutable);
- tipos de artefacto controlados (`artifact_types`): `REQUIREMENT`, `USE_CASE`, `DATA_MODEL`, `USE_CASE_DIAGRAM`, `NAVIGATION_TREE`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE`, `UI_BLUEPRINT`, `MOCKUP`;
- ciclo de vida `DRAFT`, `GENERATED`, `IN_REVIEW`, `APPROVED`, `CHANGES_REQUESTED` y origen `MANUAL`, `AI_GENERATED`, `AI_ASSISTED`, `IMPORTED`;
- API mínima para crear/leer proyectos y crear/leer artefactos y sus versiones.

No incluye todavía generación con IA, diagramas, generadores de requisitos/casos de uso, autenticación ni exportación.

## Estado tras el Incremento 1B

Cada proyecto puede registrar manualmente un único contexto canónico `PROJECT_CONTEXT` (`CTX-001`) y crear versiones completas e inmutables. El contexto estructura problema, objetivo, alcance dentro/fuera, actores, necesidades, restricciones, reglas de negocio y contexto adicional. Este artefacto será la entrada de la generación posterior; todavía no realiza llamadas de IA.

## Estado tras el Incremento 1C

Existe una ruta interna `Feature → AIOrchestrator → AIProvider` para generación estructurada validada con Zod, un adapter OpenAI-compatible sin SDK de proveedor, prompts versionados en código y auditoría `AIRun` basada en hashes. La IA permanece deshabilitada por defecto y no existen endpoints ni generación de Requirements en este incremento.

## Estado tras el Incremento 1D

Los requisitos RF/RNF son artefactos estructurados, versionados y revisables. Pueden crearse manualmente sin IA o generarse como candidatos persistidos desde una versión exacta del contexto; aceptar candidatos crea artefactos `GENERATED`, conserva procedencia y resuelve dependencias seleccionadas.

## Estado tras el Incremento 1E

Los casos de uso CU son artefactos estructurados, versionados y revisables. Actores, pre/postcondiciones, flujo principal, flujos alternativos y vínculos a versiones exactas de requisitos se conservan relacionalmente. La generación opcional usa únicamente versiones `APPROVED`, persiste candidatos antes de crear artefactos oficiales y mantiene procedencia completa. La validación académica informa si existen al menos cuatro casos oficiales sin limitar el producto a cuatro ni fabricar procesos. El diagrama se mantiene fuera de este incremento.

## Estado tras el Incremento 1F

Los modelos conceptuales ER son artefactos `DATA_MODEL` estructurados y versionados, con creación manual y generación candidata desde versiones exactas aprobadas. El motor determinístico deriva Mermaid ER y UML PlantUML de casos de uso desde datos CASE validados y conserva la procedencia, sin permitir que la IA produzca diagramas autoritativos. En 1F el SVG entregado era todavía una previsualización textual fija de la fuente (sin layout gráfico ni compatibilidad demostrada con un motor real) — ver Incremento 1F.1.

## Estado tras el Incremento 1F.1 (Diagram Rendering Stabilization)

El SVG entregado ahora es un render gráfico real: la fuente Mermaid ER/PlantUML determinística se envía a un Kroki local propio (nunca un servicio público) detrás de la abstracción `DiagramProvider`, y el SVG resultante se sanea con un parser XML real antes de persistirse/entregarse. Kroki es la autoridad de compatibilidad — una fuente malformada falla explícitamente en vez de aceptarse por una validación interna superficial. El diagrama de casos de uso pasa a origin `SYSTEM_GENERATED` (nuevo valor aditivo de `ArtifactOrigin`), reflejando que es derivado determinísticamente por CASEFlow sin autoría manual ni IA. Un fallo del renderizador no destruye ni corrompe el modelo/casos de uso estructurados: la solicitud de creación/generación falla limpiamente antes de escribir cualquier fila.

## Estado tras los Incrementos 1G–1M (backend)

- **Project Sources** (1G): ingesta de fuentes tipadas (PDF/AUDIO/IMAGE/FORM/INVOICE/TEXT/NOTES/OTHER), extracción local determinística para texto/PDF, transcripción manual como fallback explícito para audio/imagen, interpretación estructurada (Source Report) manual o candidata por IA, aprobación, y vínculo exacto de versiones de fuente al Contexto del Proyecto.
- **Cross-stage gates** (1H): las etapas posteriores exigen evidencia `APPROVED` exacta de la etapa previa (p. ej. Requisitos exige un Contexto respaldado por fuentes `APPROVED`).
- **Staleness** (1I): análisis determinístico (sin IA) de impacto potencial cuando existe conocimiento de fuente `APPROVED` más reciente que el usado por un artefacto; estados `CURRENT` / `NEWER_APPROVED_KNOWLEDGE_AVAILABLE` / `POTENTIALLY_AFFECTED`, propagado hasta 2 saltos. No implica invalidez semántica, solo revisión recomendada.
- **Traceability** (1J): grafo de procedencia exacta por versión (`GET /projects/{projectId}/traceability`), construido únicamente a partir de relaciones persistidas — nunca inferidas por adyacencia de etapa. Acotado a 500 nodos / 1000 aristas con bandera `truncated` explícita, nunca un corte silencioso.
- **Readiness** (1K–1L): evaluación de solo lectura de 13 etapas (`GET /projects/{projectId}/readiness`), nunca crea ni aprueba nada. La política de "versión autoritativa" (más recientemente aprobada, con desempate `approvedAt` DESC → `versionNumber` DESC → `artifactId` ASC) vive en un único servicio compartido (`FirstDeliverableSnapshotService`), reutilizado también por Export.
- **Export** (1M): `GET /projects/{projectId}/export?format=json|html`. El JSON es la fuente estructurada completa (fuentes, contexto, requisitos, casos de uso, diagramas, modelo de datos, navegación, arquitecturas, UI Blueprint, mockups, resumen de trazabilidad, staleness, readiness); el HTML es un reporte legible equivalente, con todo el contenido controlado por el proyecto o generado por IA escapado antes de insertarse. Los únicos SVG incluidos son los ya saneados por el backend. El nombre de archivo de descarga se deriva únicamente del `projectId`, nunca del nombre del proyecto.

## Frontend (Incrementos 1N–1S)

`apps/web` es la aplicación real para el profesor/usuario final — ya no el scaffold por defecto de Next.js. Arquitectura de información por ciclo de vida (no por tabla de base de datos): Inicio, Conocimiento (Fuentes, Contexto), Análisis (Requisitos, Casos de Uso, Modelo de Datos), Diseño (Navegación, Arquitectura de Software/Sistema, UI Blueprint, Mockups), Trazabilidad, Preparación/Exportar.

- **Descubrimiento de proyecto/workspace**: sin UUID fijo en el código — `GET /workspaces` (endpoint de solo lectura añadido para esto; Identity/Workspace completos siguen diferidos) y `GET /projects` alimentan un selector real; creación de proyecto disponible desde la misma barra.
- **Capa de API tipada** (`apps/web/lib/api.ts`): un único `fetch` compartido, errores normalizados (`ApiError`), sin URLs ni lógica de negocio del backend duplicada en el cliente.
- **Sistema de estado** (`StatusBadge`/`CandidateBadge`): cada estado de ciclo de vida se muestra con ícono + texto, nunca solo color; un candidato de IA es visualmente distinto de un Artifact Version oficial (Aceptar ≠ Aprobar).
- **Frontera de SVG confiable** (`TrustedDiagram`, `apps/web/components/trusted-svg.tsx`): el único componente del frontend que usa `dangerouslySetInnerHTML`, y solo recibe SVG que ya pasó por `sanitizeDiagramSvg()` en el backend (endpoints de diagrama/preview de Mockup). Nunca contenido subido por el usuario, texto de formulario ni cadenas crudas de un candidato de IA. Prueba estática (`trusted-svg-boundary.spec.ts`) más auditoría manual de cada llamador.
- **Rutas manuales sin IA**: cada tipo de artefacto downstream (Requisitos, Casos de Uso, Modelo de Datos, Navegación, Arquitectura de Software, Arquitectura de Sistema, UI Blueprint) tiene un formulario de creación manual estructurado (nunca Mermaid/PlantUML/JSON crudo, nunca un ArtifactVersion UUID escrito a mano) junto a "Generar con IA" — CASEflow permanece utilizable con `AI_PROVIDER=disabled`. Los diagramas/Mockups deterministas se siguen generando igual tras la creación manual.
- **Explicación de etapas bloqueadas**: cuando una acción requiere un prerequisito no cumplido, la UI explica el motivo (p. ej. "Apruebe el Contexto del Proyecto antes de generar Requisitos.") en vez de solo deshabilitar el botón sin contexto; el backend sigue siendo la autoridad final.

## Diagramas y Mockups

Pipeline único y determinístico: contenido estructurado válido → `DiagramEngine` (Mermaid/PlantUML) → Kroki local propio (`KROKI_BASE_URL`, nunca un Kroki público) → `sanitizeDiagramSvg()` (parser XML real) → API → `TrustedSvg` en el navegador. Un renderizador mal configurado (`DIAGRAM_RENDERER=disabled`) falla explícitamente en vez de simular éxito.

## Pruebas y CI

- Backend: unitarias + integración (Postgres real) vía Vitest.
- Frontend: suite Vitest propia con jsdom (`apps/web/vitest.config.mts`), ejecutada por separado con `pnpm --filter @caseflow-ai/web run test` — incluida en el job Quality de CI.
- E2E (Playwright, versión fijada en el lockfile): `pnpm run test:e2e` ejecuta ambos escenarios contra infraestructura local real (Postgres aislado, SeaweedFS, Kroki local):
  - **Escenario A** (obligatorio): flujo completo sin IA (`AI_PROVIDER=disabled`) a través del navegador real — Fuente, interpretación manual, aprobación, Contexto respaldado por fuente, Requisito manual, aprobación, progresión visible en Inicio/Readiness.
  - **Escenario B**: integración visual/procedencia — diagrama ER real renderizado por Kroki local dentro de `TrustedSvg`, Trazabilidad con procedencia real, Readiness con estado real del backend, descargas de exportación JSON/HTML.
- CI (`ci.yml`): el job Integration instala Chromium de forma determinística (`pnpm exec playwright install --with-deps chromium`) y ejecuta `pnpm run test:e2e` después de la suite de integración del backend — nunca IA externa, nunca un Kroki público.

## Arrancar el entorno completo (desarrollo/demo)

```bash
pnpm infra:up                 # Postgres, Redis, SeaweedFS, Kroki, Mailpit
pnpm db:migrate
pnpm db:seed:dev              # crea el workspace de desarrollo
pnpm dev                      # web (3000) + api (3001) + worker
```

Luego abrir `http://localhost:3000`: seleccionar/crear un proyecto, y seguir el flujo Fuentes → Contexto → Requisitos → Casos de Uso → Modelo de Datos → Diseño → Trazabilidad → Readiness/Export (con IA configurada, o con los formularios manuales si `AI_PROVIDER=disabled`).

Para reproducir el flujo de demo del profesor sin intervención manual: `pnpm run test:e2e` (requiere `pnpm infra:up` activo).
