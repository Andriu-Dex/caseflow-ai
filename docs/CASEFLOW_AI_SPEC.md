# CASEFlow AI — Especificación

Este documento describe el producto tal como es hoy. Es corto a propósito: el detalle de cada decisión está en los ADR de `docs/decisions/`, y la historia completa en git. Cuando el producto cambia, se actualiza este documento y, si la decisión es relevante, se registra un ADR y una fila en el registro de decisiones (§12).

Nada aquí es inamovible. Las reglas de §2 protegen la integridad y la seguridad del producto y solo deben cambiar con una decisión explícita; el resto describe el diseño vigente y puede evolucionar.

---

## 1. Qué es CASEFlow AI

CASEFlow AI es una plataforma I-CASE que acompaña un proyecto de software desde sus fuentes (documentos, entrevistas, notas) hasta una aplicación web generada, validada y desplegada.

- **Genérica:** sirve para cualquier dominio. Los proyectos de demostración (RestGuestMateos y otros) son datos, nunca lógica del núcleo.
- **Multiproyecto y multiusuario:** espacios de trabajo, proyectos y membresías con roles.
- **Estructurada y trazable:** cada artefacto de ingeniería es un registro versionado con relaciones explícitas, no un documento libre.
- **Asistida por IA, no dependiente de ella:** la IA propone; las personas revisan y aprueban. Todo el flujo funciona también de forma manual.
- **Distribución:** instalable de escritorio (Electron) y entorno de desarrollo local. Licencia Apache-2.0, sin pagos. La versión 2 es la versión final del producto.

## 2. Reglas de integridad y seguridad

1. **Aislamiento por proyecto.** Ningún dato, archivo, búsqueda, contexto de IA, exportación ni ejecución de un proyecto puede aparecer en otro. Toda consulta y autorización comprueba usuario → espacio de trabajo → proyecto → recurso.
2. **Historial inmutable.** Una versión aprobada, una línea base congelada, un snapshot oficial y un evento de auditoría no se modifican ni se borran individualmente. Un cambio crea una versión nueva. La única excepción es eliminar un proyecto completo (DEC-134).
3. **Aprobación humana de lo oficial.** La salida de la IA pasa por validación de esquema y de dominio, queda como candidata y una persona la aprueba. En la ruta Solo construcción la aprobación es automática y queda registrada como tal (DEC-116).
4. **Código generado solo en el sandbox.** El código generado nunca se ejecuta en el proceso de CASEFlow. Se valida en contenedores Docker aislados, sin secretos de CASEFlow, con límites de tiempo y recursos y comandos definidos por la plantilla, nunca por la IA.
5. **La IA no instala ni ejecuta.** No añade dependencias fuera del catálogo aprobado ni ejecuta comandos. Recibe solo herramientas acotadas, nunca SQL directo.
6. **Secretos fuera del repositorio.** Contraseñas con Argon2id; tokens y claves solo en configuración local o almacenamiento cifrado; `.env.example` solo con marcadores.
7. **Contenido de usuario no confiable.** Las instrucciones dentro de fuentes o archivos subidos son datos, nunca instrucciones para la IA.
8. **Errores públicos seguros.** La API no expone trazas, SQL, rutas internas ni credenciales.

## 3. Arquitectura técnica

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript en todo el monorepo (pnpm workspaces) |
| Web | Next.js + React, Tailwind, shadcn/ui |
| API | NestJS, REST + OpenAPI |
| Datos | PostgreSQL + Prisma (migraciones), pgvector, búsqueda de texto completo |
| Trabajos | BullMQ + Redis; en escritorio, cola en proceso |
| Archivos | `StorageProvider`: SeaweedFS (S3) o sistema de archivos en escritorio |
| Escritorio | Electron con PGlite (DEC-117, DEC-120) |
| Correo | `EmailProvider` con Mailpit en desarrollo, mediante una bandeja de salida |

Estructura: `apps/web`, `apps/api`, `apps/worker`, `apps/desktop`, `packages/domain`, `packages/contracts`, `packages/ui`, `packages/ai`, `packages/integrations`, `packages/config`, `prisma`, `docs`, `infra`.

Todo servicio externo (IA, Stitch, correo, almacenamiento, sandbox, despliegue, diagramas) se usa detrás de una interfaz propia del proyecto, con degradación controlada: si falla, el resto del producto sigue funcionando.

## 4. Espacios de trabajo, proyectos y rutas

- **Roles de proyecto:** OWNER, EDITOR, REVIEWER y VIEWER. Los permisos se comprueban en el servidor.
- **Rutas de trabajo (DEC-116, ADR-001):**
  - **Completa** (`FULL`): todos los pasos con revisión humana.
  - **Exprés** (`EXPRESS`): la planificación se genera desde un prompt y se aprueba en bloque.
  - **Solo construcción** (`BUILD_ONLY`): la planificación se aprueba automáticamente hasta la aplicación validada.

  Solo se sube de ruta. El origen de cada aprobación (`HUMAN`, `HUMAN_BULK`, `AUTOMATIC`) queda registrado.
- **Coherencia obligatoria** (DEC-121): en los proyectos que la tienen activada, los huecos de cobertura entre etapas bloquean la aprobación y el avance; en los demás son avisos.
- **Eliminación de proyecto** (DEC-134, ADR-009): definitiva, por el propietario, confirmando el nombre.

## 5. Artefactos

- **Identidad y versión:** `Artifact` es la identidad lógica, con un código por proyecto que nunca se reutiliza (RF-001, CU-001, UI-001…). `ArtifactVersion` es cada estado histórico.
- **Estados:** borrador, generado, en revisión, aprobado y rechazado. El origen de cada versión es manual, generado por IA o derivado.
- **Archivado:** archivar oculta sin borrar y puede deshacerse (DEC-145). Archivar algo que estuvo aprobado cuenta como un cambio de su paso.
- **Fuente sobre render:** lo editable y estructurado manda sobre lo derivado. Por ejemplo, el código Mermaid manda sobre la imagen y los datos del proyecto sobre el documento exportado.

## 6. Flujo de planificación

Pasos, en orden (`PIPELINE_ORDER`): Fuentes, Contexto, Requisitos, Casos de uso, Diagrama de casos de uso, Modelo de datos, Diagrama ER, Diagrama de clases, Navegación, Arquitectura de software, Arquitectura de sistema, Plano de interfaz, Tema y colores, Bocetos. Le siguen la Trazabilidad y la Construcción.

- **Vigencia (DEC-136, ADR-010):** al aprobar un cambio, los pasos posteriores con evidencia anterior quedan por revisar. El primero pendiente es accionable; los demás quedan bloqueados. Se resuelven con una nueva aprobación o con «Confirmar que sigue vigente», que queda auditado.
- **Preparación:** cada paso declara cuándo está satisfecho. La construcción se habilita cuando la planificación está completa y vigente. Los errores de coherencia de artefactos de construcción se resuelven dentro de Construcción y no bloquean la entrada.

### 6.1 Conocimiento

- **Fuentes:** PDF, texto, Word, imagen, audio y notas. Se extrae el texto conservando su estructura (DEC-125). Se revisa y corrige junto al original, y se indexa para la búsqueda.
- **Reporte de la fuente:** resumen opcional, revisado por una persona, que orienta al contexto (DEC-124).
- **Contexto del proyecto:** problema, objetivo, alcance (dentro y fuera), actores, necesidades, restricciones y reglas de negocio, con códigos N-n, RES-n y RN-n.

### 6.2 Análisis

- **Requisitos:** funcionales y no funcionales. Cada uno declara qué elementos del contexto atiende o la decisión del usuario que lo origina. Toda necesidad y regla de negocio del contexto aprobado debe quedar cubierta (DEC-126). Lo que se decide no construir se declara fuera de alcance en el contexto.
- **Casos de uso:** uno por objetivo concreto de un actor, con flujos, alternativas y relaciones de inclusión y extensión (DEC-129). Se dibujan en el diagrama de casos de uso.
- **Modelo de datos, diagrama ER y diagrama de clases:** coherentes entre sí (entidad ↔ clase).

### 6.3 Diseño

- **Árbol de navegación** y **arquitecturas de software y de sistema**.
- **Plano de interfaz** (`UI_BLUEPRINT`): describe cada pantalla con su propósito, formularios, estados, secciones, datos, acciones y actores.
- **Tema y colores** (DEC-118): paleta de tokens con contraste WCAG AA.
- **Bocetos:** Stitch por pantalla, con un renderizador interno como alternativa (DEC-146). Si una versión nueva del plano conserva sin cambios las pantallas de un boceto aprobado, ese boceto se traslada sin regenerar. También se puede importar un boceto hecho a mano en HTML y CSS, con una página y una imagen PNG por pantalla del plano, sin IA (DEC-166). O generarlo con la IA del proyecto en HTML y CSS en lugar de Stitch: CASEFlow pone la página con el tema aprobado, el nombre y el menú, y la IA escribe el contenido de cada pantalla, que se revisa y se dibuja en un navegador aislado (DEC-167).
- **Línea base de diseño:** congela las versiones aprobadas que usará la construcción.

## 7. Trazabilidad, impacto y coherencia

- **Grafo de trazabilidad tipado:** une fuentes, requisitos, casos de uso, diseño, plan, código y pruebas (`CodeTraceLink`).
- **Análisis de impacto:** señala qué queda afectado cuando cambia algo aguas arriba.
- **Motor de coherencia y matriz de coherencia:** muestran los huecos de cobertura entre etapas y las contradicciones explícitas.
- **Documentación viva:** se exporta desde los artefactos aprobados.

## 8. Inteligencia artificial

- **Arquitectura:** dominio → `AIOrchestrator` → enrutado por capacidad → proveedor. Ningún módulo de dominio llama al SDK de un proveedor.
- **Proveedores:** se configura una cadena de proveedores con su capacidad declarada (DEC-127). El proveedor «ChatGPT» usa la cuenta del usuario en escritorio y desarrollo (DEC-117, DEC-128). No hay cobros ni cambios de proveedor silenciosos.
- **Prompts versionados y salida estructurada:** toda respuesta se valida contra un esquema antes de convertirse en candidata.
- **Trabajos largos:** corren en segundo plano, guardan puntos de control y se reanudan sin repetir lo ya hecho. Un reinicio deja el trabajo en un estado claro (DEC-123).
- **Puntos de control de construcción:** lo generado por IA se guarda con una clave de sus entradas y se reutiliza mientras esas entradas no cambien, también entre líneas base.

## 9. Construcción

La construcción es incremental y por etapas, nunca una generación de todo el repositorio en una sola llamada (DEC-111).

1. **Plan de generación** (`GENERATION_PLAN`): qué sistema se construye. Incluye módulos, entidades conceptuales, actores, flujos, pantallas e integraciones. Una versión editada a mano conserva las fuentes de análisis de su última versión generada.
2. **Modelo conceptual del dominio.**
3. **Plan de implementación** (`IMPLEMENTATION_PLAN`): cómo se construye. Incluye módulos, entidades persistentes, acciones con contrato tipado (DEC-156), autenticación y alcance de operación (DEC-154, DEC-155), rutas con sus acciones, pruebas y variables de entorno. Se aprueba después de la línea base de diseño y la referencia.
4. **Generación híbrida:**
   - **Plantillas y generación determinista:** estructura, Prisma, CRUD, contratos Zod y OpenAPI, cliente de API, marco de la aplicación y pruebas base.
   - **Transformaciones AST:** cuando una modificación estructural lo requiere.
   - **IA:** lógica de negocio de las acciones y composición visual de las pantallas.
5. **Pantallas:**
   - **Marco común determinista** desde la navegación y el perfil de diseño (DEC-162).
   - **Composición de cada pantalla:** propuesta por la IA a partir del plano, el boceto y los enlaces funcionales.
   - **Pantallas escritas a mano:** sustituyen a la composición de la IA si conservan todos los enlaces funcionales (DEC-161).
   - **Puerta determinista** (DEC-164, ADR-022): una composición se acepta si conserva todos los controles y estados funcionales y no inventa contenido. Lo que el plano describe y el plan no implementa queda como observación de cobertura, visible en la revisión por unidades. No bloquea; la persona decide si amplía el plan o simplifica el plano.
6. **Datos de demostración** realistas, validados por campo y en la moneda del plan (DEC-163).
7. **Plantilla única:** `CASEFLOW_WEB_TS_V1`, que produce un monolito modular con Next.js, NestJS, Prisma y PostgreSQL. Sus dependencias se limitan a un catálogo aprobado y versionado.
8. **Validación en sandbox:** instalación, lint, comprobación de tipos, pruebas, compilación y validación estructural. Admite como máximo 3 rondas de reparación automática. Un proyecto solo es `READY` si todo pasa.
9. **Snapshot inmutable** de cada generación oficial, con exportación ZIP reproducible y primera ejecución con `pnpm run setup` (DEC-151).
10. **Copias de trabajo** (ADR-018): integran correcciones revisadas sin crear un snapshot oficial.
    - **Implementación manual** (DEC-165, ADR-023): una persona puede importar el código completo de un proyecto en lugar de generarlo. Se valida en el sandbox con las mismas etapas, sin reparación automática ni comprobación del registro de fidelidad, y no se mezcla con los puntos de control de la IA.
    - **Construcción por entregas** (DEC-170, ADR-024): el proyecto puede construirse en entregas aprobadas una a una. La entrega 0 es la base; cada entrega añade módulos, reutiliza lo aprobado y se valida completa.
    - **Pruebas de aceptación** (DEC-171, ADR-025, DEC-178, ADR-027): un criterio por caso de uso realizado, ejecutado en la validación sobre los datos de demostración, con resultado por requisito. Comprueba que el actor llega, encuentra sus acciones y realiza su operación principal (una creación debe completarse; una acción de negocio puede rechazarse si explica el motivo). No comprueba que el resultado sea el correcto para el negocio.
11. **Revisión por unidades de construcción** (DEC-158, ADR-020): módulo, entidad, acción, pantalla, pruebas y evidencias, con diferencias respecto a la generación anterior y marca de revisado.
12. **Despliegue** (DEC-157, ADR-019): un snapshot `READY` se ejecuta en Docker local y se publica con Cloudflare Tunnel, aislado y sin secretos de CASEFlow.
13. **Manual de usuario** del software generado, con capturas reales (DEC-152, DEC-153).

## 10. Seguridad operativa

- **Sesiones:** tokens de acceso cortos y tokens de refresco rotativos y revocables en cookie segura. Se limitan los intentos de autenticación (DEC-150).
- **Archivos privados:** se entregan por streaming autorizado; una clave de almacenamiento no da acceso.
- **Auditoría:** se registran los eventos relevantes de dominio y de seguridad (aprobaciones, construcción, descargas, cambios de configuración). Es de solo anexado y nunca guarda secretos.

## 11. Calidad

- **Antes de integrar un cambio:** `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` y `pnpm build`, más las pruebas de integración y E2E que correspondan.
- **Cobertura:** el objetivo es al menos 70 % global y más en dominio, autorización y versionado.
- **Pruebas sin servicios en vivo:** las pruebas normales no dependen de proveedores de IA. La evaluación con modelos reales es aparte.
- **Generalidad:** la construcción se valida con al menos dos dominios distintos.
- **Bloqueantes:** se consideran defectos bloqueantes la fuga entre proyectos, el salto de autorización, la modificación de historial aprobado, el código generado ejecutado fuera del sandbox y un proyecto marcado `READY` con validaciones fallidas.

## 12. Registro de decisiones

Las decisiones con «(ADR-nnn)» tienen su documento en `docs/decisions/`; los ADR citan números de sección de la especificación anterior, que sigue en el historial de git. Una decisión superada por otra posterior se indica en la fila que la sustituye.

| ID | Decisión | Estado |
|---|---|---|
| DEC-001 | El producto se denomina CASEFlow AI | Accepted |
| DEC-002 | Será una plataforma CASE integrada asistida por IA | Accepted |
| DEC-003 | Será multiproyecto y multiusuario | Accepted |
| DEC-004 | El núcleo no tendrá lógica específica de Mateos | Accepted |
| DEC-005 | El flujo será flexible con advertencias | Accepted |
| DEC-006 | Los artefactos serán estructurados y versionados | Accepted |
| DEC-007 | Las versiones aprobadas serán inmutables | Accepted |
| DEC-008 | Se implementará trazabilidad tipada | Accepted |
| DEC-009 | Impact Analysis será capacidad central | Accepted |
| DEC-010 | Consistency Engine será capacidad central | Accepted |
| DEC-011 | Se aplicará 3FN al dominio | Accepted |
| DEC-012 | PostgreSQL será la base relacional | Accepted |
| DEC-013 | pgvector será la primera opción vectorial | Accepted |
| DEC-014 | Next.js/React será frontend | Accepted |
| DEC-015 | NestJS será backend | Accepted |
| DEC-016 | TypeScript será lenguaje principal | Accepted |
| DEC-017 | Prisma será ORM inicial | Accepted |
| DEC-018 | Redis + BullMQ manejarán jobs | Accepted |
| DEC-019 | Proveedores externos se integrarán mediante adapters | Accepted |
| DEC-020 | La IA será provider-agnostic | Accepted |
| DEC-021 | CASEFlow también será gateway-agnostic | Accepted |
| DEC-022 | OmniRoute será opcional y preferente para free-first durante desarrollo | Accepted |
| DEC-023 | No habrá paid fallback silencioso | Accepted |
| DEC-024 | Los prompts serán versionados | Accepted |
| DEC-025 | La IA generará candidates antes de artefactos oficiales | Accepted |
| DEC-026 | La evidencia de origen será parte del modelo | Accepted |
| DEC-027 | Se utilizará RAG híbrido | Accepted |
| DEC-028 | CASEFlow deberá funcionar sin IA | Accepted |
| DEC-029 | UI Blueprint será fuente canónica de mockups | Accepted |
| DEC-030 | ProjectTemplate preparará ciclos de vida configurables | Accepted |
| DEC-031 | Autenticación V1 mediante email/password propia | Accepted |
| DEC-032 | Argon2id será el algoritmo inicial de password hashing | Accepted |
| DEC-033 | Access tokens cortos + refresh tokens rotatorios | Accepted |
| DEC-034 | La revisión independiente permanece activada por defecto | Accepted |
| DEC-035 | Autorización mediante RBAC + reglas contextuales | Accepted |
| DEC-036 | El aislamiento multi-project será obligatorio en backend y tests | Accepted |
| DEC-037 | Archivos privados mediante acceso autorizado/signed URLs | Accepted |
| DEC-038 | Mailpit se utilizará para email local | Accepted |
| DEC-039 | EmailProvider será intercambiable | Accepted |
| DEC-040 | Se utilizará NotificationOutbox para notificaciones | Accepted |
| DEC-041 | BYOK se diseñará desde ahora pero podrá implementarse posteriormente | Accepted |
| DEC-042 | V1 no tendrá enlaces públicos anónimos | Accepted |
| DEC-043 | MFA se prepara pero no bloquea V1 | Accepted |
| DEC-044 | Existirán perfiles LOCAL, TEST_CI, STAGING y PRODUCTION | Accepted |
| DEC-045 | Docker será parte del entorno desde V1 | Accepted |
| DEC-046 | Se priorizará un perfil FREE-DEMO reemplazable | Accepted |
| DEC-047 | Kubernetes no será requisito de V1 | Accepted |
| DEC-048 | Nginx será reverse proxy inicial en infraestructura propia | Accepted |
| DEC-049 | main se mantendrá estable mediante PR y CI | Accepted |
| DEC-050 | Se utilizará Conventional Commits | Accepted |
| DEC-051 | La producción se promoverá inicialmente de forma controlada | Accepted |
| DEC-052 | El software utilizará Semantic Versioning | Accepted |
| DEC-053 | Prisma Migrate será el mecanismo de migración | Accepted |
| DEC-054 | Se implementarán logs estructurados y correlation IDs | Accepted |
| DEC-055 | Se implementarán health checks | Accepted |
| DEC-056 | Se realizarán backups propios y pruebas de restauración | Accepted |
| DEC-057 | RPO inicial objetivo <= 6 h | Accepted |
| DEC-058 | RTO inicial objetivo <= 4 h | Accepted |
| DEC-059 | API/Web deberán ser escalables horizontalmente | Accepted |
| DEC-060 | Operaciones pesadas serán asíncronas | Accepted |
| DEC-061 | Se utilizará graceful degradation | Accepted |
| DEC-062 | Se adopta la política free-first, not free-at-all-costs | Accepted |
| DEC-063 | V1 será un producto mínimo completo, no un prototipo parcial | Accepted |
| DEC-064 | P0 tendrá prioridad absoluta sobre P1/P2 | Accepted |
| DEC-065 | El flujo E2E completo será release blocker | Accepted |
| DEC-066 | La generalidad se probará con varios dominios | Accepted |
| DEC-067 | Los tests normales no dependerán de proveedores IA reales | Accepted |
| DEC-068 | Existirá AI Evaluation Suite separada | Accepted |
| DEC-069 | Cross-project isolation será release blocker | Accepted |
| DEC-070 | Definition of Done incluirá seguridad, tests, auditoría y UX | Accepted |
| DEC-071 | Global coverage objetivo inicial >= 70 % | Accepted |
| DEC-072 | Áreas críticas aspirarán a >= 85 % coverage | Accepted |
| DEC-073 | V1 requerirá cero bugs P0/P1 conocidos | Accepted |
| DEC-074 | Se realizará Feature Freeze antes de release/presentación | Accepted |
| DEC-075 | Se utilizarán Release Candidates antes de 1.0.0 | Accepted |
| DEC-076 | SonarQube podrá utilizarse como herramienta de calidad | Accepted |
| DEC-077 | El desarrollo seguirá vertical slices | Accepted |
| DEC-078 | La IA se implementará después del flujo manual correspondiente | Accepted |
| DEC-079 | Integraciones externas no podrán sustituir al núcleo determinístico | Accepted |
| DEC-080 | Hardening y Generality Test precederán al Release Candidate | Accepted |
| DEC-081 | Los agentes respetarán el orden de dependencias del roadmap | Accepted |
| DEC-082 | Después de V1 la prioridad pasará de completar a diferenciar | Accepted |
| DEC-083 | El almacenamiento S3-compatible local utilizará SeaweedFS en lugar de MinIO debido a cambios de distribución de MinIO Community | Accepted |
| DEC-084 | Construction & Code Generation pasa a ser capacidad P0 de V1 | Accepted |
| DEC-085 | V1 soportará un único TargetTemplate oficial: CASEFLOW_WEB_TS_V1 | Accepted |
| DEC-086 | Los proyectos generados utilizarán arquitectura modular monolith en V1 | Accepted |
| DEC-087 | El frontend generado usará Next.js + React + Tailwind CSS + shadcn/ui | Accepted |
| DEC-088 | Los formularios generados usarán React Hook Form + Zod y el estado servidor TanStack Query | Accepted |
| DEC-089 | El backend generado usará NestJS + REST/OpenAPI + Prisma + PostgreSQL | Accepted |
| DEC-090 | Todo run oficial de construcción requiere un GenerationPlan aprobado | Accepted |
| DEC-091 | UI Blueprint y mockups se revisarán antes de congelar la implementación definitiva | Accepted |
| DEC-092 | Stitch será proveedor preferente de mockups cuando esté disponible; existirá fallback interno | Accepted |
| DEC-093 | CASEFLOW_STANDARD_WEB_V1 será el DesignSystemProfile inicial | Accepted |
| DEC-094 | Un Design Baseline aprobado precede a la generación oficial de código | Accepted |
| DEC-095 | ImplementationPlan se genera después de aprobar el diseño | Accepted |
| DEC-096 | El modelo conceptual precede al diseño y el modelo lógico/físico se finaliza después del Design Gate | Accepted |
| DEC-097 | La generación combinará templates, generación determinística, AST y asistencia IA | Accepted |
| DEC-098 | ts-morph será la opción inicial para transformaciones estructurales TypeScript cuando aporte seguridad | Accepted |
| DEC-099 | OpenAPI será el contrato principal para derivar el cliente TypeScript frontend-backend | Accepted |
| DEC-100 | La IA no podrá incorporar dependencias arbitrarias fuera del Approved Dependency Catalog | Accepted |
| DEC-101 | El código generado nunca se ejecutará dentro del proceso principal de CASEFlow AI | Accepted |
| DEC-102 | La validación de proyectos generados se ejecutará en sandbox Docker aislado | Accepted |
| DEC-103 | El auto-repair tendrá un máximo inicial de 3 rondas por validación fallida | Accepted |
| DEC-104 | Cada generación oficial produce un GeneratedProjectSnapshot identificable e inmutable | Accepted |
| DEC-105 | La regeneración no sobrescribirá silenciosamente snapshots o cambios existentes | Accepted |
| DEC-106 | La trazabilidad se extenderá desde fuente/requisito hasta API, módulos, archivos y pruebas | Accepted |
| DEC-107 | ZIP ejecutable y reproducible será salida P0 de V1 | Accepted |
| DEC-108 | Preview temporal será P1 y no bloqueará V1 | Accepted |
| DEC-109 | Git push y despliegue automático quedan fuera del P0 de V1 | Accepted |
| DEC-110 | Django, Spring y otros stacks se incorporarán como futuros TargetTemplates | Accepted |
| DEC-111 | La generación será incremental por etapas y no una generación one-shot del repositorio completo | Accepted |
| DEC-112 | Un GeneratedProject válido debe pasar install, lint, typecheck, test y build | Accepted |
| DEC-113 | V1 no implementará sincronización bidireccional automática de cambios externos del código generado | Accepted |
| DEC-114 | La generalidad de Construction se validará generando software en al menos dos dominios distintos | Accepted |
| DEC-115 | El calendario inmediato se repriorizó alrededor del Primer Entregable Funcional; Identity/Workspace/RBAC, Knowledge Base, RAG y Construction se difieren, no se cancelan. Supera solo la priorización de calendario de | Accepted |
| DEC-116 | Tres rutas de trabajo por proyecto (Completa, Exprés, Solo construcción); solo se sube de ruta; la ruta Solo construcción genera sin revisión humana intermedia pero conserva sandbox, catálogo, generación por etapas y snapshots (ADR-001) | Accepted |
| DEC-117 | Licencia Apache-2.0; edición de escritorio con Electron; proveedor "ChatGPT" (plan usage de OpenAI) solo en escritorio, sin pagos en ninguna edición (ADR-002) | Accepted |
| DEC-118 | Tema (claro/oscuro/ambos) y paleta por proyecto como artefacto `DESIGN_THEME`, congelado en la Design Baseline y obligatorio solo en proyectos nuevos (ADR-003) | Accepted |
| DEC-119 | En la ruta Exprés la generación puede partir de borradores (fuentes provisionales); la base de datos impide aprobar una versión antes que las versiones de las que se generó, en cualquier ruta (ADR-004) | Accepted |
| DEC-120 | La edición de escritorio usa PGlite con pgvector en lugar de PostgreSQL embebido, una cola en proceso en lugar de Redis y almacenamiento en disco (ADR-005) | Accepted |
| DEC-121 | Diagrama de clases de dominio como paso 6 de la planificación, y coherencia obligatoria entre etapas (referencias por identificador y cobertura en ambas direcciones, bloqueante al generar, aprobar y construir) en los proyectos nuevos (ADR-006) | Accepted |
| DEC-122 | Tipos de fuente que siguen al formato del archivo (Factura y Formulario retirados para fuentes nuevas), motivo de fallo de extracción visible y revisión del original junto al texto extraído | Accepted |
| DEC-123 | Trabajos interrumpidos por un reinicio del servidor: se reanudan los que son seguros de repetir (fuentes, rutas de trabajo) y se marcan como interrumpidos, para reintentar, los que tienen costo o historial auditado (bocetos, generación, validación); en Solo construcción la validación se reintenta una vez | Accepted |
| DEC-124 | El reporte aprobado de una fuente guía la generación del contexto del proyecto: solo el de la versión exacta citada, el texto extraído prevalece ante contradicción y el candidato registra qué reportes se usaron | Accepted |
| DEC-125 | El texto extraído de las fuentes se guarda con su estructura en Markdown (títulos por tamaño de letra en PDF, títulos, listas y tablas de Word, saltos de línea del texto plano) y puede volver a extraerse del original en una versión nueva | Accepted |
| DEC-126 | Cada requisito declara su origen: los elementos del contexto aprobado que atiende (necesidades N-x, restricciones RES-x, reglas de negocio RN-x) o una decisión del usuario con su justificación. La IA cita esos códigos, debe cubrir todas las necesidades y reglas, y puede proponer hasta 5 ideas adicionales que el usuario decide incluir | Accepted |
| DEC-127 | Cada proveedor de IA declara lo que admite su plan (tamaño máximo por solicitud, tokens por minuto, reinicio de la cuota diaria) y cada solicitud va al primero en que cabe. El texto de una fuente se guarda completo (hasta 500 000 caracteres) y se indexa por secciones con búsqueda de texto completo; el reporte de una fuente larga se genera por partes en segundo plano y el contexto y los requisitos leen una entrada acotada | Accepted |
| DEC-128 | El instalable (edición de escritorio) es la distribución principal y no hay despliegue web obligatorio. El plan de ChatGPT también puede usarse en desarrollo local con un intermediario propio que guarda las credenciales solo en memoria y solo escucha en 127.0.0.1 (ADR-007) | Accepted |
| DEC-129 | Los casos de uso propuestos por la IA tienen la granularidad de un objetivo concreto de un actor (prompt `use-cases.generate@2`) y un caso de uso registra relaciones «include» y «extend» hacia otros casos del proyecto, que el diagrama dibuja (ADR-008) | Accepted |
| DEC-130 | Convención de cardinalidad del modelo de datos y de multiplicidad del diagrama de clases: cada lado indica cuántas instancias de su entidad corresponden a una del otro lado; los prompts `data-model.generate@2` y `class-diagram.generate@2` la declaran, y los diagramas de arquitectura dibujan capas y protocolos | Accepted |
| DEC-131 | Cada tarea de IA declara el mínimo de salida que necesita y cada proveedor puede declarar cuánto puede escribir (`AI_MAX_OUTPUT_TOKENS`, `AI_PROVIDER_n_MAX_OUTPUT_TOKENS`); se usa el mayor. `AI_TIMEOUT_MS` es siempre el mínimo de espera. La propuesta del contexto conserva el detalle de la fuente e incluye alcance y descripción de actores | Accepted |
| DEC-132 | La propuesta del contexto se genera en segundo plano y sobrevive a salir o recargar la página; muestra su avance real (lo que la IA lleva escrito frente a lo que tomaron las anteriores) y el tiempo transcurrido. El aviso de carga de las demás generaciones muestra el tiempo transcurrido y avisa de las esperas largas | Accepted |
| DEC-133 | La propuesta del contexto describe el producto, no el proyecto: solo actores que interactúan con el software, y lo del proyecto (fases, capacitación, piloto, proceso de desarrollo) va resumido en el contexto adicional; el prompt no contiene frases sobre la propia propuesta (`project-context.generate@5`) | Accepted |
| DEC-134 | Un proyecto puede eliminarse definitivamente, también con historial aprobado: solo su propietario o el propietario o un administrador del espacio de trabajo, y tras escribir su nombre exacto, comprobado en el servidor. Se borran sus filas y archivos y queda constancia en `project_deletions` (ADR-009) | Accepted |
| DEC-135 | El retorno de conexión de ChatGPT usa una página local accesible con modo oscuro, cabeceras de seguridad y enlace opcional de regreso a CASEFlow en desarrollo | Accepted |
| DEC-136 | Al aprobar un cambio se revisan en orden los pasos posteriores; el primero pendiente puede rehacerse o confirmarse vigente con auditoría. Los pendientes bloquean congelar diseño y construir (ADR-010) | Accepted |
| DEC-137 | Fuentes: reemplazar el archivo crea la versión siguiente de la misma fuente; una fuente archivada se puede restaurar; archivar o restaurar algo con historial aprobado cuenta como cambio de su paso; la lista se filtra y pagina, con las archivadas ocultas por defecto | Accepted |
| DEC-138 | Requisitos: la lista se pagina de 25 en 25 y admite aprobar, archivar o eliminar varios a la vez (todos o ninguno; eliminar solo los nunca aprobados y sin referencias); las restricciones transversales se cubren con su propio requisito no funcional (prompt `requirements.generate@5`) y las prioridades se reparten con criterios explícitos (`@6`); el diagrama de clases y el modelo conceptual no esperan citar requisitos no funcionales | Accepted |
| DEC-139 | Casos de uso: la generación con IA se hace por lotes en segundo plano (seis requisitos funcionales por lote, los no funcionales como contexto compartido, los casos ya propuestos como contexto de cada lote), con avance visible, un punto de control por lote y reanudación; admite más de 50 requisitos y más de 20 propuestas | Accepted |
| DEC-140 | Los análisis grandes no se rechazan: el modelo de datos, los artefactos de diseño y los diagramas aceptan hasta 500 fuentes, y lo que se envía a la IA se ajusta a un presupuesto de entrada reduciendo primero el detalle de los casos de uso y después el de los requisitos, sin omitir ninguno | Accepted |
| DEC-141 | Diagramas grandes legibles: el de casos de uso agrupa los casos de cada actor primario en un paquete y da a las líneas de cada actor su propio color; el visor desplaza con la rueda, hace zoom con Ctrl + rueda y resalta las conexiones del elemento señalado o pulsado | Accepted |
| DEC-142 | El diagrama de clases se genera por lotes en segundo plano (ocho entidades del modelo de datos por lote), con avance visible, punto de control por lote y reanudación; lo que el modelo omite de una entidad se completa desde el modelo de datos; las ejecuciones de IA que quedaron «en ejecución» por un reinicio se cierran como fallidas al arrancar | Accepted |
| DEC-143 | El plano de interfaz se genera por lotes en segundo plano, vista a vista del árbol de navegación aprobado (seis por lote), con el mismo mecanismo de trabajos, avance, puntos de control y reanudación; lo que el modelo omite se vuelve a pedir y, como último recurso, se dibuja una pantalla simple desde el árbol de navegación | Accepted |
| DEC-144 | El modelo conceptual se genera por lotes en segundo plano, clase a clase del diagrama de clases aprobado (ocho por lote), con el mismo mecanismo de trabajos, avance, puntos de control y reanudación; lo que el modelo omite se vuelve a pedir y, como último recurso, la entidad sale de la propia clase, y las relaciones del diagrama que no llegaron se trasladan con su cardinalidad; lo mismo con el plan de generación (esqueleto y detalle por módulos) y con el plan de implementación (esqueleto, entidades y rutas, a partir de la línea base de diseño) y con el modelo de datos (descubrimiento y detalle por entidades) | Accepted |
| DEC-145 | Lo archivado se puede ver y restaurar: `GET …/artifacts/archived?types=` lista los artefactos archivados y `POST …/artifacts/:id/restore` los devuelve al trabajo, con auditoría de ambos (`ARTIFACT_ARCHIVED`/`ARTIFACT_RESTORED`). Restaurar nunca se rechaza por lo que cambió mientras tanto: cuenta como cambio de su paso (DEC-137) y lo que depende de él queda por rehacer; si ya hay otro aprobado de un tipo que el proyecto usa una vez, se avisa | Accepted |
| DEC-146 | Los bocetos de Stitch se generan pantalla por pantalla en segundo plano: unas pocas a la vez (`STITCH_CONCURRENCY`, 4 por defecto), cada una con su propio límite de tiempo y hasta tres intentos, guardando cada pantalla en cuanto llega; un trabajo que se detiene se reanuda con las que faltan al volver a generar el mismo boceto, y solo si no se obtuvo ninguna pantalla se usa el esquema interno, diciendo por qué | Accepted |
| DEC-147 | Las pantallas de un boceto comparten el nombre de la aplicación (el del proyecto) y el menú principal de la navegación aprobada, con la entrada de cada pantalla resaltada; no se pide al generador datos de seguridad, usuarios ni fechas inventados, códigos internos ni varias vistas de estados | Accepted |
| DEC-148 | Generar un boceto con Stitch se confirma antes (pantallas, tiempo estimado y uso de créditos) y una generación en curso se puede cancelar: las pantallas ya dibujadas se conservan y se reanuda con las que faltan | Accepted |
| DEC-149 | Las generaciones por lotes (requisitos, casos de uso, modelo de datos y artefactos de diseño estructurados) se pueden cancelar: el trabajo pasa a `CANCELLED`, se detiene antes del siguiente lote, conserva los lotes completados y se reanuda como uno fallido | Accepted |
| DEC-150 | Limitación de intentos de autenticación con ventanas fijas por dirección y por dirección y cuenta (ADR-011) | Accepted |
| DEC-151 | Primera ejecución del proyecto generado con `pnpm run setup`: entorno, base de datos y migraciones sin pasos manuales (ADR-012) | Accepted |
| DEC-152 | Cada snapshot validado propone un manual visual versionado, con revisión humana y descarga HTML/PDF; la entrega conjunta conserva el ZIP original y añade el manual aprobado y un manifiesto (ADR-013) | Accepted |
| DEC-153 | El manual incorpora capturas reales del snapshot mediante un RuntimeCaptureProvider aislado en Docker, con evidencia privada por rol, nuevas versiones y continuidad del esquema ante fallos (ADR-014) | Accepted |
| DEC-154 | La versión 2 de CASEFLOW_WEB_TS_V1 incorpora enlaces explícitos de autenticación local, composición validada desde el diseño congelado y comprobaciones de entrega que distinguen fidelidad estructural de revisión visual (ADR-015) | Accepted |
| DEC-155 | El contexto de operación del proyecto generado declara permisos, asignaciones y rutas de propiedad; el servidor verifica su alcance en cada solicitud y la interfaz conserva únicamente contextos autorizados (ADR-016) | Accepted |
| DEC-156 | Las acciones personalizadas admiten contratos estructurados compartidos entre validación, OpenAPI, cliente y formularios; las revisiones y claves de reintento se enlazan explícitamente y las comprobaciones de alcance utilizan la misma transacción (ADR-017) | Accepted |
| DEC-157 | La versión 2 despliega el software generado desde un snapshot `READY` en Docker local publicado con Cloudflare Tunnel mediante `DeploymentProvider`, sin secretos de CASEFlow; sustituye a DEC-108 (ADR-019) | Accepted |
| DEC-158 | El código generado se revisa por unidades de construcción con resumen determinista, origen, trazabilidad y diferencias; la lógica asistida por IA se edita mediante revisiones validadas (ADR-020) | Accepted |
| DEC-159 | Requisitos de cierre de la versión 2: pruebas E2E del software generado, estimación de cuota, datos de ejemplo, motivos de pendientes, panel de salud, regeneración por impacto, pruebas negativas desde reglas, recorrido guiado, comparación de planes, respaldo y limpieza | Accepted |
| DEC-160 | Los hallazgos del evaluador de pantallas pueden aceptarse con una justificación escrita que cubre solo esos hallazgos exactos, por pantalla y línea base de diseño; inmutable y auditada | Accepted |
| DEC-161 | Pantallas ajustadas manualmente: código escrito a mano por pantalla y diseño aprobado, inmutable y auditado, que sustituye a la composición de la IA solo si conserva todos los enlaces funcionales (ADR-021) | Accepted |
| DEC-162 | Fidelidad visual: marco común determinista desde el árbol de navegación y el perfil de diseño, y composición v37 con textos e iconos estáticos (ADR-021) | Accepted |
| DEC-163 | Datos de demostración realistas propuestos por IA, validados por campo, en la moneda del plan y reutilizados como punto de control; sin IA, valores deterministas (ADR-021) | Accepted |
| DEC-164 | Puerta determinista de pantallas: lo que hace una pantalla lo define el plan de implementación; las limitaciones de la composición son observaciones de cobertura que no bloquean (ADR-022) | Accepted |
| DEC-165 | Implementación manual: una corrida de construcción puede importar código escrito por personas, validado en el sandbox sin reparación automática y sin mezclarse con los puntos de control de la IA (ADR-023) | Accepted |
| DEC-166 | Bocetos hechos a mano: un ZIP con `id.html` e `id.png` por cada pantalla del plano y un `styles.css` común opcional se importa como boceto `MANUAL` (origen manual, empieza en borrador). El HTML es contenido no confiable: se rechazan scripts, manejadores de eventos, enlaces `javascript:` y recursos externos. Se revisa la fidelidad como un boceto de Stitch y se cambia importando una versión nueva | Accepted |
| DEC-167 | Bocetos en HTML y CSS con IA: al generar un boceto se elige Stitch o HTML y CSS. Con HTML y CSS, CASEFlow construye la página de cada pantalla (hoja de estilos desde el tema aprobado, nombre de la aplicación y menú con la entrada activa) y la IA, a través de `AIOrchestrator`, escribe solo su contenido con las clases de esa hoja. La página pasa la misma revisión que un boceto hecho a mano y se dibuja como PNG en el navegador aislado de las capturas (sin red, sin JavaScript, con seccomp). Usa el mismo flujo pantalla por pantalla de Stitch (reintentos, avance conservado, cancelación) y cada pantalla puede editarse con instrucciones a partir de su contenido anterior | Accepted |
| DEC-168 | Antes de generar se muestra el uso de IA previsto: las acciones de negocio y los datos de demostración que ya tienen un punto de control con las mismas entradas se reutilizan (cálculo exacto, con las mismas claves que usa la generación) y las pantallas se cuentan como máximo, porque una pantalla sin cambios solo se sabe reutilizable cuando están implementadas las acciones que llama | Accepted |
| DEC-169 | Cada diagrama muestra solo lo que corresponde a su tipo: la arquitectura de sistema, lo que se ejecuta o se despliega (cliente, entornos, bases de datos, almacenamiento, servicios externos) con enlaces rotulados por protocolo; la de software, los componentes por capa con una flecha por dependencia; el de clases, atributos de negocio sin identificadores técnicos, métodos por nombre y enumeraciones por sus valores. Responsabilidades, descripciones y requisitos de calidad se ven en la ficha de cada elemento. Un nodo de despliegue que no es de un tipo desplegable o que no se comunica con otro genera un aviso | Accepted |
| DEC-170 | La construcción admite dos modos: todo de una vez o por entregas (ADR-024). Un plan de entregas por versión aprobada del plan de implementación; la entrega 0 es la base (inicio de sesión, usuarios y roles); cada entrega añade módulos, conserva todas las entidades, se valida completa y la aprueba una persona; las aprobaciones son historial inmutable | Accepted |
| DEC-171 | Cada caso de uso aprobado que las pantallas del plan realizan tiene un criterio de aceptación derivado sin IA («dado / cuando / entonces»). La validación añade una prueba de extremo a extremo por criterio (el actor llega a sus pantallas sin errores y encuentra sus acciones) y guarda su resultado; cada requisito funcional queda cumplido, fallido, sin ejecutar o sin criterio (ADR-025) | Accepted |
| DEC-172 | Desde un requisito o caso de uso se consulta dónde está implementado: sus casos de uso, las pantallas del plan que los realizan, las acciones que llaman, los archivos de la última construcción que implementan esas pantallas y acciones (sin el marco compartido por todos los módulos), los elementos de arquitectura que lo citan y sus resultados de aceptación | Accepted |
| DEC-173 | Cada entrega o construcción tiene notas en lenguaje sencillo, escritas sin IA: qué puede hacer cada rol (los casos de uso que realizan sus pantallas), el resultado de sus requisitos, cómo probarla (enlace y cuentas de la demostración en línea, nunca la contraseña) y qué hay de nuevo respecto de la entrega anterior o de la construcción previa. Se pueden copiar o descargar en Markdown | Accepted |
| DEC-174 | Un snapshot validado se descarga también como entrega técnica: el código y una documentación para quien lo mantendrá (instalación con los requisitos reales y las variables de entorno, tecnologías y versiones, entidades y acciones del servidor, arquitecturas con sus diagramas y responsabilidades, roles y cuentas de prueba sin contraseñas, y notas de entrega), armada sin IA con lo que CASEFlow ya sabe | Accepted |
| DEC-175 | Las pantallas del boceto aprobado se recorren como prototipo antes de construir: unidas por el árbol de navegación, filtradas por rol según el plano de interfaz y mostradas en un marco aislado, sin scripts ni acceso a la página, porque su HTML es contenido del proyecto | Accepted |
| DEC-176 | Un proyecto puede partir de otro parecido. Un punto de partida reúne requisitos, casos de uso y modelo de datos aprobados de un proyecto del espacio de trabajo, o viene incluido con CASEFlow como datos genéricos; al usarlo se copian como borradores enlazados como estaban, con su origen indicado, para adaptarlos y aprobarlos como cualquier artefacto | Accepted |
| DEC-177 | Un plan de implementación generado con autenticación obligatoria recibe del servidor, sin IA, su autenticación local: la cuenta del diseño se completa (identificador único, hash interno, estado, roles como relación), se añaden la sesión y las operaciones integradas de acceso, cierre y opciones, y las acciones de pantalla que las piden se atienden con ellas en páginas distintas; esos elementos no cuentan como brechas de cobertura (ADR-026) | Accepted |
| DEC-178 | La validación carga los datos de demostración del proyecto y cada criterio de aceptación ejecuta su operación principal: la primera escritura de sus pantallas que no depende de un registro, con el formulario rellenado a partir de sus controles. Una creación genérica debe completarse; una acción de negocio puede rechazarse si la pantalla explica el motivo; un error del servidor, una petición que no se envía o un error del navegador la hacen fallar (ADR-027) | Accepted |
| DEC-179 | Estándar visual del software generado: menú lateral oscuro agrupado por módulos, banda de cifras clave en inicio y detalle, listas con filtros por estado y dos líneas por fila, detalle con cifras arriba, texto largo a lo ancho e historial en línea de tiempo. Todo el color sale del tema: menú y bandas son tonos oscuros del primario y el acento es el único color de la acción principal y de los avisos (ADR-028) | Accepted |
| DEC-180 | Los bocetos se generan pantalla por pantalla: la persona elige qué pantallas del plano dibujar y las demás se conservan. Cada pantalla tiene su conversación (versiones en que cambió con su instrucción) y se puede restaurar un dibujo anterior como versión nueva, sin IA. Un boceto se aprueba solo con todas las pantallas del plano (ADR-029) | Accepted |
| DEC-181 | Cada pantalla del código generado tiene su conversación: la persona pide cambios de presentación, que se aplican en la siguiente construcción recomponiendo solo esa pantalla, y puede volver a una versión anterior o al diseño del boceto sin gasto de IA cuando ya estaba compuesta. Las peticiones no añaden ni quitan datos, acciones ni rutas (ADR-030) | Accepted |
