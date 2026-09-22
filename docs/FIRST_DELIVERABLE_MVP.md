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

| ID   | Incremento                       | Estado    |
| ---- | -------------------------------- | --------- |
| 1A   | Project + Artifact Foundation    | Entregado |
| 1B   | Project Context                  | Entregado |
| 1C   | AI Generation Foundation         | Entregado |
| 1D   | Requirements                     | Entregado |
| 1E   | Use Cases                        | Entregado |
| 1F   | Data Model + Diagram Engine      | Entregado |
| 1F.1 | Diagram Rendering Stabilization  | Entregado |
| 1G   | Navigation + Architecture        | Pendiente |
| 1H   | UI Blueprint + Mockups           | Pendiente |
| 1I   | Traceability + Versions + Export | Pendiente |
| 1J   | First Deliverable Hardening      | Pendiente |

Identity, Workspace/RBAC completos, Knowledge Base, RAG, Construction y Code Generation no se cancelan: se retoman tras 1J.

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

## Probar la API manualmente (desarrollo)

Sin autenticación en 1A, el workspace de desarrollo se crea con un seed explícito:

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:seed:dev        # imprime el workspaceId
pnpm dev:api
```

Rutas (siempre acotadas por proyecto):

| Método | Ruta                                                    | Propósito                                    |
| ------ | ------------------------------------------------------- | -------------------------------------------- |
| POST   | `/projects`                                             | Crear proyecto (`workspaceId`, `name`)       |
| GET    | `/projects?workspaceId=…`                               | Listar proyectos de un workspace             |
| GET    | `/projects/{projectId}`                                 | Leer proyecto                                |
| POST   | `/projects/{projectId}/artifacts`                       | Crear artefacto manual (`type`, `title`)     |
| GET    | `/projects/{projectId}/artifacts/{artifactId}`          | Leer artefacto y su versión vigente          |
| POST   | `/projects/{projectId}/artifacts/{artifactId}/versions` | Crear una nueva versión (editar = versionar) |
| POST   | `/projects/{projectId}/context`                         | Crear el contexto canónico y su versión 1    |
| GET    | `/projects/{projectId}/context`                         | Leer la versión vigente del contexto         |
| POST   | `/projects/{projectId}/context/versions`                | Crear una versión completa nueva             |
| POST   | `/projects/{projectId}/use-cases`                       | Crear un caso de uso manual                  |
| GET    | `/projects/{projectId}/use-cases`                       | Listar casos de uso                          |
