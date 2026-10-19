# Reporte de Implementación V2 (Construction)

Rama `feat/v2-construction`. Incrementos 13 a 17 del plan `docs/V2_CONSTRUCTION_IMPLEMENTATION_PLAN.md` y paso de cierre de generalidad (`DEC-114`).

## 1. Implementado

- **Incremento 13 — Construction Foundation:** `TargetTemplate` `CASEFLOW_WEB_TS_V1` y `DesignSystemProfile` `CASEFLOW_STANDARD_WEB_V1` versionados e inmutables; catálogo de dependencias aprobadas con versiones exactas; `DependencyProposal` con decisión humana; `AuditEvent` append-only.
- **Incremento 14 — Generation Plan y Design Gate:** `GenerationPlan` y modelo de dominio conceptual como artefactos versionados y revisables (manual o con IA); `DesignBaseline` congelada e inmutable que registra las versiones exactas aprobadas, incluido el boceto.
- **Incremento 15 — Implementation Plan:** plan con módulos, entidades, relaciones, endpoints, rutas, variables y pruebas, ligado a una línea base aprobada; generación determinística del esquema Prisma y del contrato OpenAPI con vista previa para el revisor.
- **Incremento 16 — Generación de código:** motor determinístico por plantillas (backend NestJS, cliente API derivado del OpenAPI, frontend Next.js, pruebas, Docker); lógica de negocio con IA solo para endpoints no CRUD, revisada y con degradación a 501; `GenerationRun`, `GeneratedFile` y `CodeTraceLink` inmutables; ejecución asíncrona por cola.
- **Incremento 17 — Validación, reparación y exportación:** `SandboxExecutionProvider` con Docker endurecido; pipeline install → lint → typecheck → test → build → estructura → trazabilidad; auto-repair con máximo de 3 rondas impuesto por la base de datos; `GeneratedProjectSnapshot` inmutable con ZIP reproducible, lockfile y manifiesto de trazabilidad; descarga autorizada y auditada; interfaz de validación y descarga.

## 2. Verificado

Batería completa ejecutada sobre el commit del Incremento 17:

| Comprobación                                     | Resultado                                           |
| ------------------------------------------------ | --------------------------------------------------- |
| `pnpm run lint`                                  | sin errores                                         |
| `pnpm run format:check`                          | sin diferencias                                     |
| `pnpm run typecheck`                             | sin errores                                         |
| `pnpm run test:unit`                             | 524 aprobadas, 3 omitidas (Docker real, opcionales) |
| `pnpm run test:integration`                      | 194 aprobadas, 1 omitida (Docker real, opcional)    |
| pruebas web (`apps/web`)                         | 48 aprobadas                                        |
| `pnpm run build`                                 | correcto                                            |
| cobertura global de líneas                       | 75,93 % (objetivo ≥ 70 %)                           |
| `prisma migrate diff` (base migrada vs. esquema) | sin diferencias                                     |

Verificación con Docker real (`CASEFLOW_SANDBOX_DOCKER_TESTS=1`):

- Contrato del sandbox: el contenedor no ve variables de CASEFlow, no corre como root, no tiene red fuera de la instalación, respeta el tiempo máximo y devuelve archivos grandes completos. No quedan contenedores ni volúmenes tras cada ejecución.
- Punta a punta: API → sandbox Docker → `READY` → snapshot → ZIP descargado por la API.
- README del ZIP seguido fuera de CASEFlow (DoD punto 20): `docker compose up`, `pnpm install` (lockfile sin cambios), `pnpm run db:migrate`, `pnpm run dev`; la API respondió salud, creación, listado y validación con mensajes en español, y la web sirvió su página.

### Generalidad (`DEC-114`)

Dos dominios distintos generados y validados en el sandbox Docker real con los comandos de la plantilla, más las comprobaciones de estructura y trazabilidad:

| Dominio                          | Módulos | Entidades | Endpoints de negocio | Rutas | Autenticación | Archivos | Enlaces de trazabilidad | Etapas                                                                  |
| -------------------------------- | ------- | --------- | -------------------- | ----- | ------------- | -------- | ----------------------- | ----------------------------------------------------------------------- |
| Tienda (catálogo y pedidos)      | 2       | 3         | 1                    | 6     | sí, con roles | 80       | 119                     | install, lint, typecheck, test y build OK; estructura y trazabilidad OK |
| Biblioteca municipal (préstamos) | 1       | 3         | 0                    | 4     | no            | 66       | 96                      | install, lint, typecheck, test y build OK; estructura y trazabilidad OK |

Además, el plan mínimo de las pruebas de integración (un módulo, una entidad, sin rutas ni autenticación) llegó a `READY` en Docker real. Ningún dominio requirió cambios en el núcleo de CASEFlow: los tres difieren solo en los datos del plan.

### Definition of Done de Construction (`spec §179`)

| #   | Criterio                                | Estado                                                  |
| --- | --------------------------------------- | ------------------------------------------------------- |
| 1   | Seleccionar el TargetTemplate           | Cumplido (`CASEFLOW_WEB_TS_V1` v1, consultable por API) |
| 2   | Generar y revisar un GenerationPlan     | Cumplido                                                |
| 3   | Modelo conceptual                       | Cumplido                                                |
| 4   | UI Blueprints                           | Cumplido (v1)                                           |
| 5   | Mockup con Stitch o alternativa interna | Cumplido (v1.2)                                         |
| 6   | Aprobar una Design Baseline             | Cumplido                                                |
| 7   | Generar y revisar el ImplementationPlan | Cumplido                                                |
| 8   | Modelo lógico/físico                    | Cumplido (dentro del ImplementationPlan)                |
| 9   | Esquema Prisma                          | Cumplido                                                |
| 10  | Contratos/API                           | Cumplido (OpenAPI)                                      |
| 11  | Backend                                 | Cumplido                                                |
| 12  | Cliente API                             | Cumplido                                                |
| 13  | Frontend                                | Cumplido                                                |
| 14  | Pruebas generadas                       | Cumplido                                                |
| 15  | Validación en sandbox                   | Cumplido y verificado con Docker real                   |
| 16  | Límite del auto-repair                  | Cumplido (3 rondas; también en la base de datos)        |
| 17  | GeneratedProjectSnapshot                | Cumplido                                                |
| 18  | Trazabilidad hasta construcción         | Cumplido (`CodeTraceLink` y manifiesto del ZIP)         |
| 19  | Exportación ZIP                         | Cumplido y verificado                                   |
| 20  | Ejecución siguiendo el README           | Cumplido y verificado manualmente                       |

## 3. No Verificado Localmente

- **Proveedores de IA reales:** la lógica de negocio de endpoints no CRUD y las rondas de auto-repair solo se probaron con dobles deterministas y con la IA deshabilitada (degradación a 501 o `NO_PATCH`). Falta la evaluación separada con un proveedor real (`AGENTS.md §44`).
- **E2E de Playwright:** ni el flujo E2E de CASEFlow ni las pruebas Playwright del proyecto generado se ejecutaron en esta verificación; la etapa `TEST` del sandbox corre las pruebas unitarias del proyecto generado.
- **Planes de generalidad:** los planes de los dos dominios se escribieron a mano con el contrato oficial; no se obtuvieron por todo el flujo de la interfaz con IA.

## 4. Notas y Resoluciones

- La verificación real encontró y corrigió tres fallos del generador, cada uno con prueba de regresión: una importación sin uso en la página de inicio de un plan sin rutas (la detectó la etapa `LINT` del sandbox), `pnpm run dev` sin compilar antes los paquetes internos en una copia limpia y `prisma migrate dev` esperando un nombre de forma interactiva.
- Las caídas transitorias del registro npm durante `INSTALL` (observadas dos veces en esta verificación) se tratan como `ERROR` reintentable del entorno, no como veredicto sobre el código.
- La primera validación descarga todas las dependencias (sin caché compartida entre proyectos, por aislamiento): entre 1 y 3 minutos por proyecto en esta máquina.
- Si la API se detiene durante una validación, ese intento queda en `RUNNING`; no se observó, y el código marca dónde agregar un barrido de intentos huérfanos.
