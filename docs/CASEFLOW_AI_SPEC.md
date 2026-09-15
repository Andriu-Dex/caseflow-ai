# CASEFlow AI — CASEFLOW_AI_SPEC
> **Producto:** CASEFlow AI  
> **Categoría:** Plataforma CASE integrada asistida por inteligencia artificial  
> **Uso principal:** fuente de verdad funcional y arquitectónica para desarrollo humano y agentes de código

---

## 0. Propósito del documento

Este documento define la especificación maestra de **CASEFlow AI**. Debe utilizarse como referencia principal para arquitectura, implementación, revisión técnica y trabajo con agentes de código.

CASEFlow AI debe evolucionar mediante esta especificación. Cuando una decisión posterior modifique una regla aquí descrita, se debe actualizar este documento y registrar el cambio.

### 0.1 Convenciones normativas

- **MUST / DEBE**: requisito obligatorio.
- **MUST NOT / NO DEBE**: comportamiento prohibido.
- **SHOULD / DEBERÍA**: recomendación fuerte; apartarse requiere justificación.
- **MAY / PUEDE**: capacidad opcional.
- **V1**: primera versión funcional prioritaria.
- **V2**: segundo gran incremento.
- **V3**: visión futura.

### 0.2 Regla fundamental

> **CASEFlow AI debe permanecer funcional incluso sin un proveedor de inteligencia artificial. La IA constituye una capa de asistencia intercambiable y auditable sobre un núcleo CASE determinístico, estructurado, versionado y trazable.**

---

# 1. Visión del producto

## 1.1 Definición

**CASEFlow AI** es una plataforma web CASE integrada, multiusuario y multiproyecto, asistida por inteligencia artificial, orientada a gestionar proyectos de software y producir de forma guiada, trazable, versionada y revisable los artefactos del ciclo de vida del desarrollo.

La plataforma no debe limitarse a generar texto o imágenes. Su propuesta central es mantener un repositorio coherente de artefactos estructurados y relaciones entre ellos.

Los cuatro verbos centrales del producto son:

1. **Generar**
2. **Revisar**
3. **Aprobar**
4. **Relacionar**

## 1.2 Objetivo principal

Permitir que un equipo de software pueda:

- crear y administrar proyectos;
- incorporar fuentes de conocimiento;
- extraer y estructurar información relevante;
- producir artefactos de análisis y diseño;
- revisar y aprobar resultados;
- conservar versiones;
- mantener trazabilidad;
- detectar inconsistencias;
- analizar el impacto de cambios;
- construir documentación viva;
- exportar resultados;
- utilizar IA de forma controlada, explicable e intercambiable.

## 1.3 Generalidad

CASEFlow AI **MUST NOT** contener lógica específica de Restaurante Mateos, del sistema de tutorías ni de ningún dominio particular dentro del núcleo del producto.

RestGest Mateos será un proyecto de validación importante, pero debe existir únicamente como una instancia de `Project`.

Ejemplos válidos de proyectos gestionados por la misma instalación:

- RestGest Mateos.
- Sistema de Tutorías Académicas.
- Sistema de Inventario.
- Sistema de Biblioteca.
- Aplicación empresarial genérica.
- Proyecto creado durante una demostración.

---

# 2. Principios de producto

## 2.1 Human-in-the-loop

La IA propone; CASEFlow valida; el experto decide.

La plataforma **MUST NOT** convertir automáticamente una sugerencia de IA en artefacto oficial sin intervención humana cuando la operación afecte el repositorio formal del proyecto.

## 2.2 Fuente editable antes que render

Cuando un artefacto posea una representación renderizada, la fuente editable debe ser la representación canónica.

Ejemplos:

- Mermaid/PlantUML antes que PNG.
- UI Blueprint antes que screenshot.
- Datos estructurados antes que PDF.
- Artefactos normalizados antes que documento final.

## 2.3 Integración real

La integración no consiste únicamente en poner enlaces a herramientas externas. CASEFlow AI debe mantener relaciones explícitas entre artefactos, versiones, fuentes, revisiones y decisiones.

## 2.4 Auditabilidad

Las decisiones relevantes deben poder explicarse y rastrearse:

- quién creó un artefacto;
- de qué fuentes deriva;
- qué modelo de IA participó;
- qué versión de prompt se utilizó;
- quién lo modificó;
- quién lo aprobó;
- qué relaciones tenía;
- qué cambios posteriores lo afectaron.

## 2.5 No lock-in

CASEFlow AI debe minimizar acoplamiento con:

- un único proveedor de IA;
- un único gateway de IA;
- un único proveedor de almacenamiento;
- un único motor de diagramación;
- una única herramienta de mockups;
- una única metodología.

---

# 3. Usuarios, workspaces y proyectos

## 3.1 Workspace

CASEFlow AI incluirá `Workspace` desde V1.

Un Workspace representa un equipo u organización lógica que agrupa usuarios y proyectos.

```text
Workspace: Equipo DAS
├── RestGest Mateos
├── Sistema Tutorías
└── Proyecto Demo
```

Un usuario puede pertenecer a múltiples workspaces.

## 3.2 Proyecto

`Project` es la unidad funcional principal del sistema.

Cada proyecto posee:

- nombre;
- descripción;
- objetivo;
- plantilla;
- participantes;
- fases;
- fuentes de conocimiento;
- artefactos;
- relaciones;
- revisiones;
- baselines;
- ejecuciones de IA;
- auditoría.

## 3.3 Creación de proyecto

V1 debe permitir:

- crear un proyecto en blanco;
- crear un proyecto basado en una plantilla estándar.

Datos iniciales mínimos:

- nombre;
- descripción;
- objetivo;
- plantilla;
- participantes.

El dominio del proyecto no debe estar codificado como una categoría rígida obligatoria.

## 3.4 Multiproyecto

Los usuarios autorizados pueden participar en varios proyectos.

La información de un proyecto debe permanecer aislada de los demás.

---

# 4. Roles y permisos funcionales

## 4.1 Roles iniciales

V1 incluirá como mínimo:

- **OWNER**
- **ADMIN**
- **ANALYST**
- **DESIGNER_ARCHITECT**
- **REVIEWER**
- **VIEWER**

## 4.2 Modelo extensible

Los roles y permisos deben modelarse separadamente.

```text
Role
Permission
RolePermission
ProjectMemberRole
```

La V1 puede utilizar roles predefinidos. La creación de roles personalizados se considera futura.

## 4.3 Aprobaciones iniciales

Por defecto podrán aprobar artefactos:

- Owner.
- Admin.
- Reviewer.

La política debe poder configurarse por proyecto.

## 4.4 Revisión independiente

La revisión independiente debe estar soportada y activada por defecto.

Cuando esté activa:

- el autor de una versión no debería aprobar su propia versión;
- una aprobación forzada por un administrador requiere justificación;
- la acción queda registrada en auditoría.

---

# 5. Flujo de trabajo del proyecto

## 5.1 Flujo flexible con advertencias

CASEFlow AI adopta un flujo **flexible**, no un bloqueo secuencial rígido.

El usuario puede avanzar a Diseño aun cuando el Análisis no esté completamente aprobado.

La plataforma debe advertir cuando los nuevos artefactos dependan de información no estabilizada.

```text
⚠ El análisis contiene 3 artefactos no aprobados.
Los artefactos de diseño derivados serán considerados provisionales.
```

## 5.2 Estados de artefacto

El ciclo de vida mínimo es:

```text
DRAFT
  ↓
GENERATED
  ↓
IN_REVIEW
 ↙        ↘
APPROVED   CHANGES_REQUESTED
                ↓
              DRAFT
```

Los nombres finales pueden adaptarse en UI, pero el significado debe mantenerse.

## 5.3 Versiones aprobadas

Una versión aprobada no debe sobrescribirse.

Una modificación posterior produce una nueva versión.

## 5.4 Información no estabilizada

Las advertencias de provisionalidad deben derivarse de:

- estados de las dependencias;
- versiones relacionadas;
- validación de relaciones;
- cambios posteriores.

No se debe depender de un booleano manual aislado para representar provisionalidad.

---

# 6. Artefactos

## 6.1 Definición

Todo elemento relevante generado, editado, aprobado, relacionado o versionado dentro de CASEFlow AI debe representarse como un artefacto estructurado o como una vista derivada de artefactos.

## 6.2 Modelo universal

Todo artefacto lógico debe poseer identidad independiente de sus versiones.

```text
Artifact
├── id
├── project_id
├── type
├── code
└── current_state
```

Y sus versiones:

```text
ArtifactVersion
├── id
├── artifact_id
├── version_number
├── title
├── status
├── origin
├── created_by
├── created_at
├── submitted_at
├── approved_at
└── metadata_auxiliary
```

`metadata_auxiliary` no debe convertirse en sustituto del modelado relacional del dominio.

## 6.3 Origen

Una versión debe poder indicar:

- `MANUAL`
- `AI_GENERATED`
- `AI_ASSISTED`
- `IMPORTED`

## 6.4 Artefacto vs vista

Son artefactos, entre otros:

- Actor.
- Stakeholder.
- Functional Requirement.
- Non-Functional Requirement.
- Business Rule.
- Constraint.
- Assumption.
- Use Case.
- Glossary Term.
- Architecture Decision.
- Diagram source.
- UI Blueprint.

Pueden ser vistas derivadas:

- diagrama de casos de uso;
- matriz de trazabilidad;
- listado de requisitos;
- documentación de análisis;
- resumen de cobertura;
- informe final.

---

# 7. Tipos de artefactos de análisis

V1 debe contemplar al menos:

## 7.1 Actor

Representa una entidad que interactúa directamente con el sistema.

## 7.2 Stakeholder

Representa una parte interesada que puede no interactuar directamente con el sistema.

## 7.3 Requisito funcional

Estructura mínima:

- código;
- título;
- descripción;
- actores relacionados;
- prioridad;
- dependencias;
- precondiciones;
- postcondiciones;
- criterios de aceptación;
- evidencias;
- estado;
- versión.

## 7.4 Requisito no funcional

Estructura mínima:

- código;
- categoría;
- descripción;
- métrica;
- valor objetivo;
- unidad;
- método de verificación;
- prioridad;
- evidencias;
- estado;
- versión.

Los RNF deben ser verificables y medibles cuando su naturaleza lo permita.

CASEFlow AI debe detectar requisitos vagos como:

> “El sistema debe ser rápido.”

y advertir que requieren reformulación.

## 7.5 Regla de negocio

Representa políticas o reglas del dominio.

## 7.6 Restricción

Representa una limitación impuesta al proyecto o solución.

## 7.7 Supuesto

Representa una condición asumida que puede necesitar validación posterior.

## 7.8 Glosario

Permite mantener términos y definiciones oficiales del proyecto.

---

# 8. Casos de uso

Cada caso de uso se almacena estructuradamente.

Campos mínimos:

- código;
- nombre;
- objetivo;
- actor principal;
- actores secundarios;
- precondiciones;
- disparador;
- flujo principal;
- flujos alternativos;
- excepciones;
- postcondiciones;
- requisitos relacionados;
- reglas relacionadas;
- estado;
- versión.

Los flujos deben poder modelarse mediante:

- `MAIN`
- `ALTERNATIVE`
- `EXCEPTION`

El diagrama de casos de uso es una representación derivada del repositorio estructurado.

---

# 9. Diseño y artefactos visuales

## 9.1 Arquitectura del sistema

Representa la solución en sentido amplio:

- usuarios;
- dispositivos;
- servicios externos;
- infraestructura;
- comunicaciones;
- servidores;
- dependencias externas.

## 9.2 Arquitectura de software

Representa internamente:

- frontend;
- backend;
- módulos;
- componentes;
- persistencia;
- APIs;
- servicios;
- integraciones.

Ambos conceptos deben mantenerse separados.

## 9.3 Architecture Decision Record

CASEFlow AI soportará artefactos ADR.

```text
ADR-003
Título: Utilizar aplicación web responsive
Estado: APPROVED
Contexto: ...
Alternativas: ...
Decisión: ...
Consecuencias: ...
```

## 9.4 Árbol de navegación

Debe existir como estructura editable, no únicamente como imagen.

```json
{
  "screen": "Dashboard",
  "children": [
    {
      "screen": "Projects",
      "children": []
    }
  ]
}
```

La representación visual se deriva de esta estructura.

---

# 10. UI Blueprint y mockups

## 10.1 UI Blueprint

CASEFlow AI utilizará `UIBlueprint` como representación canónica de una pantalla o interfaz.

```json
{
  "screen": "Registrar venta",
  "purpose": "Registrar el consumo asociado a una mesa",
  "components": [
    {"type": "select", "label": "Mesa"},
    {"type": "list", "label": "Productos"},
    {"type": "button", "label": "Confirmar"}
  ],
  "requirements": ["RF-013"],
  "useCases": ["CU-004"]
}
```

En base de datos, el núcleo se normalizará relacionalmente; el JSON puede utilizarse como representación de intercambio.

## 10.2 Proveedores de mockups

La integración debe estar detrás de:

```text
MockupProvider
```

Implementaciones previstas:

- `StitchMockupProvider` como integración preferida inicial cuando esté disponible.
- `InternalWireframeRenderer` como fallback local/determinístico.
- `FigmaProvider` como posible integración futura.
- otros proveedores en el futuro.

CASEFlow AI **MUST NOT** depender obligatoriamente de Stitch o Figma para conservar el UI Blueprint.

## 10.3 Principio de APIs externas

Se integrarán APIs/SDKs externos cuando resuelvan eficientemente problemas no centrales.

El núcleo intelectual de CASEFlow AI debe permanecer propio:

- artefactos;
- versionado;
- aprobaciones;
- trazabilidad;
- baselines;
- Consistency Engine;
- Impact Analysis;
- Project Knowledge Base;
- permisos.

---

# 11. Diagramación

## 11.1 Motor extensible

La diagramación debe abstraerse mediante:

```text
DiagramProvider
```

Posibles adaptadores:

- Mermaid.
- PlantUML.
- Draw.io/diagrams.net cuando sea conveniente.
- futuros motores.

## 11.2 Fuente canónica

Cada diagrama debe conservar como fuente:

- tipo;
- engine;
- source code;
- versión.

El SVG/PNG/PDF es una representación regenerable.

## 11.3 Alcance por versión

### V1

Obligatorio:

- diagrama de casos de uso;
- arquitectura del sistema;
- arquitectura de software;
- árbol de navegación;
- UI Blueprints y mockups.

### V2

- actividad;
- secuencia;
- clases;
- componentes;
- despliegue;
- entidad-relación;
- estados.

### V3 / futuro

- BPMN u otros lenguajes;
- plugins de diagramación;
- editores visuales especializados;
- reverse engineering.

---

# 12. Trazabilidad

## 12.1 Grafo lógico

CASEFlow AI debe representar trazabilidad mediante relaciones tipadas entre artefactos.

```text
Source
  ↓ DERIVES_FROM
Requirement
  ↓ SATISFIED_BY
UseCase
  ↓ REPRESENTED_BY
Diagram
  ↓ REALIZED_BY
Screen
  ↓ SUPPORTED_BY
Architecture Component
  ↓ VALIDATED_BY
Test Case
```

## 12.2 Tipos iniciales

- `DERIVES_FROM`
- `DEPENDS_ON`
- `SATISFIES`
- `REPRESENTS`
- `REALIZES`
- `VALIDATES`
- `MOTIVATES`
- `AFFECTS`
- `REFINES`
- `CONFLICTS_WITH`

## 12.3 Matriz de trazabilidad

La plataforma debe poder derivar una matriz de trazabilidad automática.

| Requisito | Caso de uso | Pantalla | Arquitectura | Prueba |
|---|---|---|---|---|

## 12.4 Relaciones version-aware

Una relación validada debe poder indicar las versiones sobre las que fue revisada.

Si una versión cambia, CASEFlow AI debe detectar que la relación necesita revalidación.

---

# 13. Impact Analysis

## 13.1 Objetivo

Determinar qué artefactos pueden verse afectados cuando cambia otro elemento.

## 13.2 Dos niveles

### Determinístico

Se basa en:

- relaciones de trazabilidad;
- versiones;
- dependencias;
- baselines;
- reglas.

### Asistido por IA

Busca impactos semánticos adicionales no capturados explícitamente.

## 13.3 Presentación

Los resultados deben distinguir su origen:

```text
3 impactos confirmados por trazabilidad
2 impactos sugeridos por IA
```

## 13.4 Acciones

El usuario puede decidir:

- revisar;
- regenerar;
- mantener;
- justificar que no aplica.

CASEFlow AI no debe modificar automáticamente artefactos dependientes sin autorización.

---

# 14. Consistency Engine

## 14.1 Objetivo

Analizar coherencia estructural y semántica del proyecto.

## 14.2 Reglas determinísticas iniciales

Ejemplos:

- RNF sin métrica verificable.
- requisito sin criterio de aceptación.
- requisito aprobado sin trazabilidad.
- actor sin participación.
- relación con artefacto archivado.
- arquitectura basada en una versión obsoleta.
- códigos duplicados.
- dependencias rotas.

## 14.3 Revisiones semánticas

La IA puede sugerir:

- contradicciones;
- redundancias;
- requisitos ambiguos;
- impactos no registrados;
- inconsistencias conceptuales.

## 14.4 Hallazgos

Estados:

- `OPEN`
- `RESOLVED`
- `WAIVED`

Un hallazgo omitido mediante `WAIVED` debe registrar justificación.

---

# 15. Versionamiento y baselines

## 15.1 Versionamiento individual

Cada artefacto posee versiones propias.

```text
RF-001 v1
RF-001 v2
RF-001 v3
```

## 15.2 Inmutabilidad

Una versión formalizada dentro del historial no debe editarse en sitio.

Los borradores pueden utilizar autosave hasta su envío a revisión.

## 15.3 Baselines

Una baseline congela un conjunto específico de versiones.

```text
ANALYSIS_1.0
├── RF-001 v3
├── RF-002 v2
├── RNF-001 v2
└── CU-001 v4
```

Una baseline congelada es inmutable.

## 15.4 Comparación

La plataforma debe diseñarse para permitir:

- comparar versiones de artefactos;
- comparar baselines;
- mostrar altas, bajas y modificaciones;
- alimentar Impact Analysis.

---

# 16. ProjectTemplate

## 16.1 Propósito

CASEFlow AI debe soportar ciclos de vida configurables mediante plantillas.

## 16.2 Primera plantilla

V1 incluirá:

```text
Software Standard
├── Análisis
├── Diseño
├── Construcción
├── Pruebas
└── Documentación
```

## 16.3 Versionamiento de plantilla

Debe existir `ProjectTemplateVersion`.

Un cambio en la plantilla global no debe modificar proyectos históricos silenciosamente.

## 16.4 ProjectPhase

Al crear un proyecto se instancia la estructura pertinente como fases del proyecto.

Esto permitirá personalización posterior.

## 16.5 Futuro

Si el tiempo lo permite:

- Software Ágil.
- Aplicación Móvil.
- API.
- Sistema Empresarial.
- Plantillas personalizadas.

---

# 17. Documentación viva

## 17.1 Principio

La documentación no se trata como un único PDF editable manualmente.

Debe componerse dinámicamente a partir de artefactos aprobados.

```text
Documento del proyecto
1. Contexto
2. Actores
3. Requisitos
4. Casos de uso
5. Arquitectura
6. Interfaces
7. Trazabilidad
...
```

## 17.2 Exportación

V1 debería permitir al menos:

```text
Structured Data → Markdown → HTML → PDF
```

Futuro:

- DOCX.
- HTML estático.
- otros formatos.

Los documentos exportados son snapshots; no la fuente canónica.

---

# 18. Colaboración

CASEFlow AI debe diseñarse para:

- comentarios sobre versiones;
- solicitudes de revisión;
- decisiones de revisión;
- menciones futuras;
- historial;
- notificaciones.

No es necesario implementar edición simultánea tipo Google Docs en V1.

WebSockets pueden incorporarse para estados de jobs, notificaciones y revisiones.

CRDT/Yjs queda fuera de V1.

---

# 19. Alcance funcional por versiones

## 19.1 V1 — Primera versión funcional

### Gestión

- autenticación;
- workspaces;
- proyectos;
- miembros;
- roles básicos.

### Knowledge

- texto;
- PDF;
- DOCX;
- TXT;
- Markdown;
- notas;
- transcripciones;
- audio mediante pipeline cuando sea viable;
- soporte futuro para imágenes.

### Análisis

- actores;
- stakeholders;
- RF;
- RNF;
- reglas de negocio;
- restricciones;
- supuestos;
- glosario;
- casos de uso;
- diagrama de casos de uso.

### Diseño

- arquitectura del sistema;
- arquitectura de software;
- árbol de navegación;
- UI Blueprint;
- mockups.

### Integración

- versionado;
- estados;
- revisiones;
- aprobación;
- trazabilidad básica;
- Impact Analysis básico;
- Consistency Engine básico;
- auditoría.

### Documentación

- documentación viva;
- exportación inicial.

### IA

- extracción de conocimiento;
- sugerencias de actores;
- extracción de RF/RNF;
- reglas de negocio;
- revisión de claridad;
- duplicados;
- casos de uso;
- diagramas como código;
- sugerencia de arquitectura;
- UI Blueprint;
- Impact Analysis semántico;
- Consistency Review semántico;
- resúmenes documentales.

## 19.2 V2

- actividad;
- secuencia;
- clases;
- componentes;
- despliegue;
- ER;
- estados;
- matriz de trazabilidad completa;
- baselines avanzadas;
- comparación visual de versiones;
- comentarios/menciones mejorados;
- solicitudes de revisión avanzadas;
- Impact Analysis avanzado;
- Consistency Engine semántico mejorado;
- BYOK completo;
- presupuesto de IA;
- integración ampliada con proveedores.

## 19.3 V3 / visión futura

- casos de prueba;
- pruebas automáticas;
- requisito → prueba;
- documentación API;
- scaffolding;
- generación asistida de código;
- reverse engineering;
- Git;
- CI/CD;
- plugins;
- API pública;
- edición colaborativa avanzada;
- modelos locales;
- múltiples metodologías;
- plantillas personalizadas.

---

# 20. Arquitectura tecnológica base

## 20.1 Lenguaje principal

**TypeScript** de extremo a extremo cuando sea razonable.

## 20.2 Frontend

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- biblioteca de componentes accesible seleccionable posteriormente.

## 20.3 Backend

- NestJS.
- TypeScript.
- arquitectura modular.

Módulos conceptuales:

```text
ProjectModule
ArtifactModule
KnowledgeModule
TraceabilityModule
ReviewModule
ImpactAnalysisModule
ConsistencyModule
AIOrchestrationModule
IntegrationModule
AuditModule
```

## 20.4 Base de datos

- PostgreSQL.
- pgvector.
- Prisma como ORM inicial.

## 20.5 No usar Neo4j inicialmente

Aunque la trazabilidad forme un grafo lógico, se modelará en PostgreSQL.

Neo4j solo se considerará si existe una necesidad real futura.

## 20.6 Redis y BullMQ

Operaciones de larga duración deberán poder ejecutarse asíncronamente mediante jobs.

Ejemplos:

- procesar documentos;
- transcribir;
- embeddings;
- generar artefactos;
- mockups;
- Impact Analysis;
- exportaciones.

---

# 21. Integraciones y adapters

CASEFlow AI debe encapsular integraciones externas detrás de contratos propios.

Interfaces previstas:

```text
AIExecutionGateway
AIProvider
MockupProvider
DiagramProvider
StorageProvider
EmbeddingProvider
TranscriptionProvider
DocumentParser
ExportProvider
```

Los módulos funcionales no deben depender directamente de SDKs externos.

---

# 22. API del backend

V1 utilizará:

- REST.
- OpenAPI/Swagger.

Ejemplos:

```text
/projects
/projects/{id}/artifacts
/artifacts/{id}/versions
/artifacts/{id}/relationships
/projects/{id}/knowledge
/projects/{id}/baselines
```

GraphQL no es necesario inicialmente.

---

# 23. Almacenamiento de archivos

## 23.1 Principio

Los archivos grandes no deben almacenarse dentro de PostgreSQL.

## 23.2 StorageProvider

Durante desarrollo:

```text
LocalStorageProvider
```

Producción/futuro:

```text
S3StorageProvider
```

compatible con AWS S3, MinIO y otros servicios S3-compatible.

En base de datos se conserva:

- storage key;
- mime type;
- tamaño;
- SHA-256;
- metadata;
- proveedor.

---

# 24. Monorepo

Estructura inicial recomendada:

```text
caseflow-ai/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── domain/
│   ├── contracts/
│   ├── ui/
│   ├── ai/
│   ├── integrations/
│   └── config/
│
├── prisma/
│
├── docs/
│   └── CASEFLOW_AI_SPEC.md
│
├── infra/
│   ├── docker/
│   └── nginx/
│
├── AGENTS.md
├── package.json
└── README.md
```

Se priorizará `pnpm workspaces`.

Turborepo puede incorporarse si aporta valor.

---

# 25. Principios del modelo de datos

## 25.1 3FN

El dominio debe diseñarse buscando Tercera Forma Normal.

`JSONB` se reservará para:

- configuración;
- metadata variable;
- payloads externos;
- datos auxiliares no nucleares.

`JSONB` no debe utilizarse para evitar modelar entidades o relaciones centrales.

## 25.2 Entidades principales

```text
User
Workspace
WorkspaceMember
Role
Permission
RolePermission
Project
ProjectMember
ProjectTemplate
ProjectTemplateVersion
ProjectPhase

KnowledgeSource
KnowledgeSourceVersion
SourceFragment
EmbeddingModel
FragmentEmbedding

Artifact
ArtifactVersion
ArtifactEvidence
ArtifactRelationship
RelationshipType
RelationshipValidation

ReviewRequest
ReviewDecision
Comment

Baseline
BaselineItem

StorageObject
ArtifactRender

AIRun
ArtifactGeneration

ImpactAnalysisRun
ImpactFinding

ConsistencyRule
ConsistencyRun
ConsistencyFinding

AuditEvent
```

---

# 26. Herencia de artefactos en el modelo relacional

`ArtifactVersion` contiene datos universales.

Los detalles específicos se modelarán en tablas relacionadas.

```text
ActorVersion
StakeholderVersion
FunctionalRequirementVersion
NonFunctionalRequirementVersion
BusinessRuleVersion
ConstraintVersion
AssumptionVersion
UseCaseVersion
ArchitectureDecisionVersion
DiagramVersion
UIBlueprintVersion
```

No se utilizará una tabla `artifacts` con todo el dominio en un JSON gigante.

---

# 27. Normalización de requisitos

## 27.1 RF

```text
FunctionalRequirementVersion
├── artifact_version_id
├── description
└── priority_id
```

Relaciones independientes:

```text
RequirementActor
AcceptanceCriterion
RequirementDependency
ArtifactEvidence
```

No se concatenarán actores o dependencias en un único string.

## 27.2 RNF

```text
NonFunctionalRequirementVersion
├── artifact_version_id
├── category_id
├── description
├── metric_id
├── target_value
├── unit_id
├── verification_method
└── priority_id
```

---

# 28. Normalización de casos de uso

```text
UseCaseVersion
UseCaseActor
UseCasePrecondition
UseCasePostcondition
UseCaseFlow
UseCaseFlowStep
```

El caso de uso debe ser consultable y validable sin parsear texto libre.

---

# 29. Knowledge Sources y evidencia

## 29.1 Modelo

```text
KnowledgeSource
  ↓
KnowledgeSourceVersion
  ↓
SourceFragment
  ↓
FragmentEmbedding
```

## 29.2 Fragmentos

Un fragmento puede conservar:

- página;
- sección;
- párrafo;
- speaker;
- timestamp inicial/final;
- secuencia;
- texto normalizado.

## 29.3 Evidencia

`ArtifactEvidence` relaciona una versión de artefacto con fragmentos de fuente.

```text
RF-013 v1
├── entrevista.pdf — 18:42–19:10
└── acta.docx — sección 4.3
```

La UI debe poder responder:

> ¿De dónde salió este requisito?

---

# 30. Embeddings

Los embeddings se almacenarán separados del fragmento.

Debe registrarse el modelo utilizado.

```text
EmbeddingModel
FragmentEmbedding
```

Esto permite recalcular embeddings con otro modelo sin perder los anteriores.

---

# 31. Versionado y reglas de integridad

## 31.1 Identidad vs versión

`Artifact` = identidad lógica.

`ArtifactVersion` = estado histórico específico.

## 31.2 Versiones históricas

Las versiones históricas no deben eliminarse físicamente desde la aplicación.

## 31.3 Baselines

Las baselines congeladas tampoco se eliminan ni modifican.

## 31.4 Códigos

Cada proyecto mantiene códigos únicos:

```text
RF-001
RNF-001
ACT-001
CU-001
ADR-001
ARQ-001
UI-001
DIA-001
```

Un código no debe reutilizarse.

Si `RF-008` se archiva, el siguiente código debe continuar con `RF-009`.

## 31.5 Borrado

| Estado | Comportamiento |
|---|---|
| Borrador nuevo sin referencias | Puede borrarse |
| Artefacto con historial | Archivar |
| Artefacto relacionado | Archivar |
| Incluido en baseline | No borrar |
| Fuente usada como evidencia | Archivar |
| Versión histórica | No borrar |
| AuditEvent | Append-only |

---

# 32. Aislamiento de proyecto

Debe impedirse una relación accidental entre artefactos de proyectos distintos.

```text
RestGest / RF-001
      ↓
Sistema Biblioteca / CU-004
```

El aislamiento debe aplicarse en:

- consultas;
- servicios de dominio;
- restricciones de BD cuando sea posible;
- RAG;
- embeddings;
- revisiones;
- baselines;
- evidencia.

---

# 33. Auditoría

`AuditEvent` se considera append-only desde la aplicación.

Debe registrar eventos como:

```text
Gabriel creó RF-003
Steven modificó RF-003
Erick aprobó RF-003 v2
CASEFlow ejecutó Impact Analysis
Kevin rechazó CU-004
```

La seguridad y retención avanzada de auditoría se detallarán en bloques posteriores.

---

# 34. Arquitectura de IA

## 34.1 Principio

Los módulos no deben invocar directamente un proveedor.

```text
Domain Module
    ↓
AIOrchestrator
    ↓
ModelRouter
    ↓
AIExecutionGateway / AIProvider
```

## 34.2 Tareas, no proveedores

Los módulos solicitan capacidades como:

```text
extractRequirements()
suggestActors()
generateUseCases()
generateDiagram()
suggestArchitecture()
analyzeImpact()
reviewConsistency()
```

No deben solicitar llamadas directas a un SDK concreto.

---

# 35. Capacidades y perfiles de modelos

## 35.1 Capabilities

- `TEXT_GENERATION`
- `STRUCTURED_OUTPUT`
- `TOOL_CALLING`
- `VISION`
- `LONG_CONTEXT`
- `REASONING`
- `EMBEDDINGS`
- `AUDIO`

## 35.2 Model Profiles

- `FAST`
- `BALANCED`
- `QUALITY`
- `VISION`
- `CHEAP`
- `LOCAL`

El mapeo perfil → modelo debe ser configurable.

---

# 36. Políticas de routing

Políticas previstas:

- `ECONOMICAL`
- `BALANCED`
- `MAX_QUALITY`
- `MANUAL`

Durante desarrollo se debe priorizar la gratuidad sin sacrificar los requisitos mínimos de calidad.

Se puede añadir:

```text
DEVELOPMENT_FREE_FIRST
```

con prioridad:

1. free tier;
2. proveedores keyless/gratuitos;
3. otras cuotas gratuitas;
4. modelo local;
5. detener operación.

El sistema no debe saltar silenciosamente a un servicio pagado cuando `allow_paid_fallback = false`.

---

# 37. Proveedores y gateways de IA

## 37.1 Provider agnostic

El diseño debe soportar de forma intercambiable:

- OpenAI.
- Gemini.
- Anthropic.
- DeepSeek.
- proveedores OpenAI-compatible.
- futuros proveedores.
- modelos locales.

No debe acoplarse a una versión concreta de un modelo.

## 37.2 DeepSeek

DeepSeek se soportará preferentemente a través de:

- un proveedor compatible directo;
- o un gateway compatible.

El código de dominio no debe utilizar nombres rígidos asociados a una versión específica.

## 37.3 OmniRoute

OmniRoute se incorpora como **gateway opcional**, especialmente útil para desarrollo free-first, routing, fallbacks y agregación de proveedores.

```text
AIExecutionGateway
├── DirectProviderGateway
├── OmniRouteGateway
└── LocalGateway
```

CASEFlow AI debe ser:

- provider-agnostic;
- gateway-agnostic.

Si OmniRoute deja de estar disponible, CASEFlow AI debe poder seguir operando mediante proveedores directos o locales.

## 37.4 Responsabilidades

CASEFlow ModelRouter decide:

- capacidad;
- perfil;
- política;
- calidad mínima.

Un gateway puede resolver:

- disponibilidad;
- cuota;
- rate limit;
- costo operacional;
- fallback interno.

---

# 38. BYOK y secretos

La arquitectura debe prepararse para `Bring Your Own Key`.

V1 puede utilizar secretos del entorno administrados por el despliegue.

V2 puede permitir conexiones por workspace.

Las API keys **MUST NOT** almacenarse en texto plano dentro de tablas de configuración ordinarias.

---

# 39. Project Knowledge Base

Cada proyecto tendrá su propia base de conocimiento.

```text
Project Knowledge Base
├── Sources
│   ├── documentos
│   ├── textos
│   ├── actas
│   ├── entrevistas
│   └── transcripciones
│
├── Structured Knowledge
│   ├── actores
│   ├── requisitos
│   ├── reglas
│   ├── decisiones
│   └── glosario
│
└── Approved Artifacts
```

Los proyectos no comparten RAG accidentalmente.

---

# 40. Pipeline de ingestión

```text
UPLOAD
  ↓
VALIDATE
  ↓
HASH / DEDUPLICATE
  ↓
EXTRACT
  ↓
NORMALIZE
  ↓
CHUNK
  ↓
ENRICH METADATA
  ↓
EMBED
  ↓
INDEX
  ↓
SOURCE VALIDATION
```

Las etapas costosas se ejecutan mediante jobs cuando sea apropiado.

La UI debe mostrar progreso por etapa.

---

# 41. Deduplicación

Los archivos se identifican mediante SHA-256.

Si se detecta una fuente idéntica, la plataforma debe evitar reprocesamiento innecesario y ofrecer reutilizarla.

---

# 42. Chunking estructural

CASEFlow AI no debe depender exclusivamente de cortar texto por cantidad fija de caracteres.

Debe priorizar límites semánticos/estructurales.

### Markdown

- heading;
- subheading;
- paragraph.

### Documento

- sección;
- subsección;
- párrafo;
- tabla.

### Entrevista/audio

- speaker;
- timestamp;
- intervención.

### PDF

- página;
- bloque;
- estructura detectada.

Todo fragmento conserva metadata de procedencia cuando esté disponible.

---

# 43. Recuperación híbrida

CASEFlow AI combinará:

## 43.1 Structured Retrieval

Para artefactos y datos normalizados.

## 43.2 Full-Text Search

Para búsquedas léxicas concretas.

## 43.3 Semantic Search

Mediante pgvector.

## 43.4 Hybrid Retrieval

```text
Query
 ├── Structured Search
 ├── Full-Text Search
 └── pgvector Search
          ↓
Candidate Set
          ↓
Ranking
          ↓
Context Builder
```

El reranking avanzado se considera ampliación futura.

---

# 44. Jerarquía de verdad

Orden base:

1. Artefactos aprobados.
2. Decisiones/ADR aprobadas.
3. Fuentes validadas.
4. Fuentes procesadas no validadas.
5. Artefactos en revisión.
6. Borradores.
7. Sugerencias de IA.

Una fuente de menor autoridad no puede sobrescribir silenciosamente una de mayor autoridad.

Las contradicciones deben registrarse como posibles hallazgos.

---

# 45. Context Builder

El modelo no debe recibir automáticamente todo el proyecto.

`ContextBuilder` recibe:

- task;
- project;
- artifact context;
- user request.

Y selecciona contexto relevante.

```text
GenerateUseCasesContext
├── actores aprobados
├── RF relevantes
├── reglas
├── glosario
├── evidencia
└── restricciones
```

Beneficios:

- menor costo;
- menos tokens;
- menos ruido;
- mayor reproducibilidad;
- menor superficie de fuga.

---

# 46. Token budget

Cada tarea puede definir presupuesto máximo de contexto.

La selección prioriza:

1. autoridad;
2. relevancia;
3. estado/versionado;
4. recencia cuando aplique.

---

# 47. Prompts versionados

Los prompts deben tratarse como recursos versionados.

```text
PromptTemplate
  ↓
PromptVersion
```

Una ejecución de IA registra:

- task;
- prompt template;
- prompt version;
- model;
- provider/gateway;
- parámetros;
- context hash.

Los prompts no deben quedar dispersos como strings gigantes sin versión dentro del código.

---

# 48. Composición de prompts

Estructura general:

```text
SYSTEM RULES
+
PROJECT CONTEXT
+
STANDARD / TEMPLATE RULES
+
TASK INSTRUCTIONS
+
OUTPUT SCHEMA
```

La construcción se realizará centralmente.

---

# 49. Structured Output

Siempre que sea viable, las tareas que producen artefactos deben usar salidas estructuradas.

```json
{
  "requirements": [
    {
      "temporaryId": "candidate-1",
      "type": "FUNCTIONAL",
      "title": "...",
      "description": "...",
      "priority": "HIGH",
      "evidence": []
    }
  ]
}
```

Pipeline:

```text
AI Output
  ↓
Schema Validation
  ↓
Domain Validation
  ↓
Candidate
```

Un resultado inválido no debe insertarse directamente en el repositorio oficial.

---

# 50. Artifact Candidates

## 50.1 Zona de candidatos

Las generaciones de IA entran inicialmente como candidatos.

```text
Candidate:
"Registrar transferencia entre sucursales"

[Accept]
[Edit]
[Discard]
```

Al aceptar:

```text
RF-023 v1
```

## 50.2 Lotes

La UI debe poder gestionar lotes:

- aceptar seleccionados;
- editar;
- descartar;
- comparar;
- fusionar duplicados.

---

# 51. Evidencia en generación

Cuando una generación deriva de fuentes, un candidato debe incluir evidencia.

Si la IA propone un artefacto sin evidencia suficiente, debe marcarse claramente como:

> Sugerencia sin sustento directo en las fuentes.

---

# 52. Duplicados y conflictos semánticos

CASEFlow AI puede utilizar embeddings/IA para identificar:

- requisitos similares;
- reglas redundantes;
- posibles contradicciones.

Nunca debe fusionar automáticamente dos artefactos oficiales.

Los hallazgos deben distinguir:

- `DETERMINISTIC`
- `SEMANTIC_AI`

---

# 53. IA explicable

Una sugerencia relevante debe poder mostrar:

```text
Sugerencia:
Crear RNF sobre disponibilidad.

Razón:
Dos fuentes mencionan continuidad ante fallos.

Evidencia:
- entrevista.pdf p. 5
- reunion.docx §3.2

Confianza:
MEDIUM
```

Niveles:

- `LOW`
- `MEDIUM`
- `HIGH`

La confianza no reemplaza la aprobación humana.

---

# 54. Prompt injection y contenido no confiable

Las fuentes cargadas por usuarios son datos no confiables.

El sistema debe instruir a los modelos para que:

- no ejecuten instrucciones embebidas dentro de fuentes;
- interpreten documentos como contenido;
- no alteren reglas del sistema por texto encontrado en archivos.

---

# 55. Acceso del LLM

El modelo **MUST NOT** disponer de acceso SQL directo.

Las lecturas/escrituras pasan por herramientas/servicios específicos.

Herramientas permitidas pueden incluir:

- `search_project_knowledge`
- `get_artifact`
- `list_actors`
- `validate_requirement`

Herramientas prohibidas:

- `execute_sql`
- operaciones destructivas genéricas;
- acceso genérico a secretos.

Toda escritura pasa por:

```text
Authorization
→ Domain Validation
→ Persistence
→ Audit
```

---

# 56. Privacidad y minimización

El contexto enviado a proveedores externos debe contener únicamente la información necesaria para la tarea.

No deben almacenarse en logs:

- API keys;
- secretos;
- documentos completos innecesariamente;
- tokens sensibles.

La información de un proyecto no debe utilizarse para generar resultados de otro.

La arquitectura debe permitir una política futura:

```text
EXTERNAL_AI_ALLOWED
LOCAL_ONLY
```

---

# 57. Caché de IA

Para tareas aptas para caché, la clave puede depender de:

```text
task
+ prompt version
+ context hash
+ model
+ parameters
```

Uso apropiado:

- embeddings;
- clasificación;
- extracción repetida;
- revisiones determinísticas asistidas.

No aplicar indiscriminadamente a conversación libre.

---

# 58. Costos y métricas

Cada ejecución debe registrar:

- provider;
- gateway;
- model;
- input tokens;
- output tokens;
- costo estimado cuando aplique;
- latencia;
- task type;
- estado.

Futuro:

```text
WorkspaceAIBudget
ProjectAIBudget
```

El fallback pagado debe ser explícito.

---

# 59. Evaluación de modelos

CASEFlow AI debería disponer de una suite de evaluación interna.

```text
fixtures/
├── tutorias/
├── restgest/
└── inventory-demo/
```

Métricas por tarea:

- schema válido;
- aceptación del usuario;
- edición requerida;
- candidatos descartados;
- precisión de evidencia;
- latencia;
- costo;
- errores;
- regeneraciones.

---

# 60. Funcionamiento sin IA

Sin proveedor disponible, CASEFlow AI debe seguir permitiendo:

- crear proyectos;
- cargar información;
- crear artefactos manualmente;
- importar;
- versionar;
- revisar;
- aprobar;
- relacionar;
- ejecutar reglas determinísticas;
- generar trazabilidad;
- documentación estructurada;
- diagramas/manuales cuando el motor local lo permita.

---

# 61. Retrieval strategy por tarea

Cada tarea de IA debe declarar su estrategia.

Opciones iniciales:

- `NONE`
- `ARTIFACT_ONLY`
- `SOURCE_ONLY`
- `HYBRID`
- `FULL_PROJECT`

No utilizar RAG de forma indiscriminada.

---

# 62. Project Assistant futuro

CASEFlow AI puede incorporar un asistente conversacional grounded en el proyecto.

Ejemplos:

- “¿Qué requisitos no tienen caso de uso?”
- “¿Por qué se decidió esta arquitectura?”
- “¿Qué cambió desde la baseline 1.0?”

El chat no será el núcleo del producto.

El núcleo seguirá siendo el repositorio estructurado de artefactos.

---

# 63. OmniRoute y estrategia free-first

Durante el desarrollo se priorizarán herramientas y modelos gratuitos cuando su calidad sea suficiente.

OmniRoute puede utilizarse como gateway preferente para:

- agrupar proveedores;
- aprovechar free tiers;
- efectuar fallback;
- manejar rate limits;
- reducir complejidad operacional.

Sin embargo:

- no se asumirá capacidad gratuita infinita;
- no será dependencia obligatoria;
- no sustituye nuestra abstracción;
- no debe elevar costo silenciosamente.

La compresión automática de contexto deberá configurarse por tarea.

```text
REQUIREMENT_EXTRACTION → CONSERVATIVE
DOCUMENT_SUMMARY → STANDARD
PROJECT_CHAT → STANDARD
```

---

# 64. Reglas para agentes de código derivadas de esta especificación

`AGENTS.md` se redactará por separado, pero cualquier agente debe respetar al menos:

1. Leer `docs/CASEFLOW_AI_SPEC.md` antes de cambios estructurales.
2. No implementar lógica específica de RestGest Mateos en el núcleo.
3. No acoplar módulos de dominio a proveedores externos.
4. No convertir sugerencias de IA en artefactos oficiales sin el flujo definido.
5. No modificar versiones históricas aprobadas.
6. No eliminar baselines congeladas.
7. No reutilizar códigos de artefacto.
8. Mantener aislamiento entre proyectos.
9. Respetar 3FN para el dominio.
10. Utilizar JSONB solo para información auxiliar.
11. Mantener interfaces para proveedores/gateways.
12. Registrar auditoría para acciones relevantes.
13. Priorizar software gratuito cuando no reduzca calidad o confiabilidad de forma inaceptable.
14. No añadir dependencias o servicios externos sin justificar su función.
15. No asumir decisiones marcadas como pendientes.

---

# 65. Decisiones aprobadas — resumen

## Bloque 1

- Plataforma CASE integrada asistida por IA.
- Multiusuario.
- Multiproyecto.
- Artefactos versionados.
- Aprobación humana.
- IA intercambiable.
- Impact Analysis como capacidad central.

## Bloque 2

- Workspace/proyecto colaborativo.
- Fuentes validadas.
- Relaciones tipadas.
- Baselines.
- Documentación viva.
- Comentarios/revisiones.
- Flujo flexible con advertencias.

## Bloque 3

- modelo universal de artefactos;
- evidencia/provenance;
- artefacto vs vista;
- motor de diagramas extensible;
- UI Blueprint;
- ADR;
- grafo de trazabilidad;
- Consistency Engine;
- V1/V2/V3;
- ProjectTemplate extensible;
- artefactos manual/import/IA;
- IA explicable.

## Bloque 4

- TypeScript;
- Next.js + React;
- NestJS;
- PostgreSQL;
- Prisma;
- pgvector;
- Redis/BullMQ;
- S3-compatible;
- REST/OpenAPI;
- monorepo;
- adapters;
- Stitch opcional;
- Mermaid/otros engines;
- auditoría desde V1;
- OmniRoute como gateway opcional.

## Bloque 5

- 3FN;
- Workspace desde V1;
- identidad/versión separadas;
- tablas especializadas;
- fuentes/fragments/embeddings;
- evidencia;
- relaciones version-aware;
- baselines inmutables;
- revisión independiente configurable;
- deletion policy;
- códigos no reutilizables;
- aislamiento fuerte entre proyectos.

## Bloque 6

- AIOrchestrator;
- ModelRouter;
- model profiles;
- routing policies;
- no paid fallback silencioso;
- BYOK futuro;
- Knowledge Base por proyecto;
- ingestión asíncrona;
- chunking estructural;
- RAG híbrido;
- Context Builder;
- prompts versionados;
- structured output;
- candidate zone;
- evidencia;
- IA explicable;
- prompt-injection protection;
- tools limitados;
- evaluación de modelos;
- costos/telemetría;
- funcionamiento sin IA;
- OmniRoute free-first opcional.

---

# 66. Decisiones todavía abiertas

Las siguientes áreas se definirán en bloques posteriores y **NO DEBEN asumirse todavía como cerradas**.

## Bloque 7

- seguridad;
- autenticación detallada;
- autorización;
- aislamiento multi-tenant;
- política de sesiones;
- secretos;
- auditoría de seguridad;
- protección contra abuso.

## Bloque 8

- estrategia de despliegue;
- Docker;
- CI/CD;
- entornos;
- dominio/TLS;
- observabilidad;
- backups;
- disaster recovery;
- infraestructura gratuita/inicial;
- escalabilidad operativa.

## Posteriores

- esquema Prisma final;
- endpoints finales;
- diseño UI definitivo;
- selección de componentes;
- proveedor IA inicial real;
- configuración concreta de OmniRoute;
- proveedor de correo;
- pruebas;
- estrategia de releases;
- licencia;
- branding final.

---

# 67. Registro de decisiones inicial

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

---

# 68 Seguridad — principios generales

La seguridad de CASEFlow AI debe diseñarse desde V1 debido a que la plataforma manejará:

- cuentas de usuario;
- workspaces;
- proyectos privados;
- documentación potencialmente sensible;
- fuentes de conocimiento;
- credenciales de integraciones externas;
- ejecuciones de inteligencia artificial;
- aprobaciones;
- auditoría;
- artefactos históricos.

La seguridad no debe implementarse únicamente en la interfaz de usuario.

Toda operación protegida debe validarse también en el backend.

Principios obligatorios:

1. Denegar por defecto.
2. Aplicar mínimo privilegio.
3. Validar autorización en cada recurso.
4. Mantener aislamiento entre workspaces y proyectos.
5. No confiar en identificadores enviados por el cliente.
6. No registrar secretos.
7. Auditar operaciones críticas.
8. Evitar dependencias de seguridad innecesarias.
9. Diseñar mecanismos sustituibles cuando intervengan servicios externos.
10. Mantener seguridad incluso cuando la IA esté deshabilitada.

---

# 69. Autenticación

## 69.1 V1

CASEFlow AI utilizará inicialmente autenticación propia mediante:

- email;
- contraseña.

La plataforma no dependerá obligatoriamente de Firebase Auth, Auth0, Clerk u otro proveedor externo para autenticación básica.

## 69.2 Almacenamiento de contraseñas

Las contraseñas:

- MUST NOT almacenarse en texto plano;
- MUST NOT almacenarse mediante cifrado reversible;
- MUST almacenarse mediante un algoritmo apropiado de password hashing.

La implementación inicial utilizará:

```text
Argon2id
````

Los parámetros deben poder actualizarse conforme evolucionen las recomendaciones de seguridad.

## 69.3 IdentityProvider

La arquitectura debe permitir futuras integraciones mediante una abstracción de identidad.

Ejemplos futuros:

```text
IdentityProvider
├── LocalIdentityProvider
├── GoogleOIDCProvider
├── MicrosoftOIDCProvider
└── FutureProvider
```

La identidad externa no debe modificar el modelo central de autorización.

---

# 70. Administración global y roles de proyecto

Debe existir una separación clara entre:

```text
SYSTEM_ADMIN
```

y los roles pertenecientes a workspaces/proyectos.

Ser:

```text
Workspace OWNER
```

no convierte automáticamente al usuario en:

```text
SYSTEM_ADMIN
```

El administrador global pertenece al ámbito de operación de CASEFlow AI.

Los roles:

```text
OWNER
ADMIN
ANALYST
DESIGNER_ARCHITECT
REVIEWER
VIEWER
```

pertenecen al ámbito de un Workspace o Project según corresponda.

---

# 71. Gestión de sesiones

## 71.1 Access token

CASEFlow AI utilizará tokens de acceso de vida corta.

Inicialmente pueden utilizarse:

```text
JWT
```

El access token no debe utilizarse como credencial permanente.

## 71.2 Refresh token

Los refresh tokens serán:

* rotatorios;
* revocables;
* asociados a una sesión;
* almacenados de forma segura.

En aplicaciones web se recomienda conservarlos mediante:

```text
HttpOnly
Secure
SameSite
```

cookies.

## 71.3 Rotación

Cada utilización válida de un refresh token debe poder producir uno nuevo.

El refresh token anterior deja de ser válido.

## 71.4 Detección de reutilización

Si un refresh token ya rotado vuelve a utilizarse, CASEFlow AI debe poder tratar el evento como posible compromiso de sesión.

La implementación puede revocar:

* la sesión afectada;
* o la familia completa de refresh tokens.

## 71.5 Revocación

La arquitectura debe permitir:

* cerrar sesión actual;
* cerrar sesiones específicas;
* cerrar todas las sesiones del usuario.

Una interfaz de administración de dispositivos/sesiones puede añadirse posteriormente.

---

# 72. Recuperación de contraseña y verificación

Los tokens utilizados para:

* recuperar contraseña;
* verificar email;
* aceptar invitaciones;

deben ser:

* aleatorios;
* suficientemente impredecibles;
* de un solo uso;
* con expiración.

La base de datos no debe almacenar directamente el token utilizable.

Debe conservarse únicamente una representación segura, por ejemplo:

```text
hash(token)
```

Después del uso exitoso:

```text
token → invalidado
```

---

# 73. Arquitectura de correo electrónico

CASEFlow AI no debe depender de un proveedor específico de correo.

Debe existir:

```text
EmailProvider
```

Posibles implementaciones:

```text
MailpitEmailProvider
SMTPEmailProvider
BrevoEmailProvider
ResendEmailProvider
SESProvider
FutureProvider
```

Los módulos funcionales no deben invocar directamente SDKs de correo.

Ejemplo correcto:

```text
NotificationService
    ↓
EmailProvider
```

## 73.1 Desarrollo local

Durante desarrollo local se utilizará preferentemente:

```text
Mailpit
```

Esto permite probar:

* recuperación de contraseña;
* invitaciones;
* verificación de correo;
* solicitudes de revisión;

sin consumir cuotas reales de proveedores externos.

## 73.2 Staging/demo

Se podrá utilizar un proveedor gratuito o de bajo costo.

La selección concreta podrá cambiar según:

* disponibilidad;
* límites vigentes;
* facilidad de configuración;
* confiabilidad.

No debe existir acoplamiento funcional con ese proveedor.

## 73.3 Producción

Un proveedor transaccional de pago por uso, como Amazon SES u otra alternativa equivalente, podrá utilizarse cuando CASEFlow AI requiera operación real.

---

# 74. Notification Outbox

Las notificaciones importantes no deben depender de una llamada síncrona directa a un proveedor.

Se utilizará un patrón de Outbox.

Conceptualmente:

```text
Application Event
      ↓
NotificationOutbox
      ↓
Queue
      ↓
Worker
      ↓
EmailProvider
```

Estados posibles:

```text
PENDING
PROCESSING
SENT
FAILED
RETRYING
CANCELLED
```

La plataforma debe soportar:

* reintentos;
* idempotencia;
* registro de errores.

Una falla del proveedor de correo no debe revertir una operación de negocio ya completada.

Ejemplo:

> Una solicitud de revisión puede existir aunque el email de notificación falle temporalmente.

---

# 75. Autorización

CASEFlow AI utilizará un modelo híbrido:

```text
RBAC
+
reglas contextuales
```

RBAC determina capacidades generales.

Las reglas contextuales verifican:

* Workspace;
* Project;
* recurso;
* autor;
* estado;
* política de revisión;
* versión.

Ejemplo:

Un usuario puede poseer:

```text
artifact.approve
```

pero no puede aprobar:

* un artefacto de un proyecto al que no pertenece;
* su propia versión cuando la revisión independiente está activa.

---

# 76. Aislamiento multi-tenant

Cada operación que acceda a información de dominio debe validar su pertenencia.

Cadena conceptual:

```text
User
 ↓
WorkspaceMembership
 ↓
ProjectMembership
 ↓
Resource
```

CASEFlow AI MUST NOT asumir que conocer un UUID implica autorización.

Ejemplo prohibido:

```text
GET /artifacts/{uuid}
```

sin comprobar el Project y membresía correspondientes.

## 76.1 Defensa en profundidad

El aislamiento debe implementarse mediante:

* servicios de autorización;
* consultas scoped;
* claves foráneas;
* constraints;
* índices;
* tests de aislamiento.

PostgreSQL Row-Level Security puede evaluarse como capa adicional, pero no sustituirá la autorización del backend.

---

# 77. Archivos privados

Las fuentes y exports privados no deben exponerse mediante URLs públicas permanentes.

Los objetos en S3/MinIO/R2 deben permanecer privados.

El acceso podrá realizarse mediante:

* streaming autorizado;
* URLs firmadas de corta duración.

Conocer:

```text
storage_key
```

no debe permitir descargar un objeto sin autorización.

---

# 78. Validación de uploads

CASEFlow AI debe validar:

* tamaño máximo;
* MIME;
* firma/magic bytes cuando sea viable;
* formato permitido.

No debe confiar exclusivamente en:

```text
filename extension
```

Deben rechazarse tipos peligrosos o no soportados.

La arquitectura debe permitir incorporar posteriormente:

```text
ClamAV
```

u otro mecanismo de análisis antimalware.

También deben considerarse:

* archivos excesivamente grandes;
* documentos corruptos;
* archivos comprimidos maliciosos;
* decompression bombs.

---

# 79. Integridad criptográfica

Cada archivo persistido debe poder conservar:

```text
SHA-256
```

La plataforma también podrá calcular hashes de:

* ArtifactVersion;
* manifest de baseline;
* exports.

Objetivo:

* detectar alteraciones;
* verificar integridad;
* facilitar auditoría.

No se utilizará blockchain para resolver este problema.

---

# 80. Seguridad HTTP y API

La API debe implementar como mínimo:

* validación estricta de DTO;
* límites de request;
* manejo seguro de errores;
* CORS mediante allowlist;
* headers de seguridad;
* HTTPS en producción;
* rate limiting en endpoints sensibles.

Los errores públicos MUST NOT exponer:

* stack traces;
* SQL;
* secrets;
* rutas internas;
* credenciales;
* información del servidor innecesaria.

---

# 81. Protección contra abuso

Deben existir límites diferenciados para:

* login;
* recuperación de contraseña;
* invitaciones;
* generación IA;
* uploads;
* exportaciones costosas.

La protección ante intentos de login debe priorizar:

* throttling;
* rate limiting;
* retraso progresivo;

antes que bloqueos permanentes que puedan utilizarse para provocar DoS contra terceros.

---

# 82. Secretos

Los secretos MUST NOT almacenarse dentro del repositorio.

El archivo:

```text
.env
```

MUST NOT versionarse.

Debe existir:

```text
.env.example
```

sin credenciales reales.

Los secretos pueden almacenarse mediante:

* variables de entorno;
* secrets del proveedor;
* secret manager;
* vault futuro.

---

# 83. BYOK

Cuando se implemente Bring Your Own Key, las credenciales pertenecientes a usuarios/workspaces:

* no se almacenarán en texto plano;
* estarán cifradas;
* no aparecerán en logs;
* no aparecerán en AuditEvent;
* nunca serán enviadas al frontend después de guardarse.

La clave de cifrado maestra MUST NOT almacenarse junto a los secretos cifrados dentro de la misma base de datos.

---

# 84. Auditoría de seguridad

`AuditEvent` continuará siendo append-only.

Debe cubrir, cuando corresponda:

* login;
* logout;
* fallos de autenticación relevantes;
* reset de contraseña;
* creación/cambio de roles;
* cambios de miembros;
* acceso administrativo;
* upload;
* download sensible;
* aprobación;
* rechazo;
* override administrativo;
* cambio de configuración IA;
* conexión/revocación de proveedores;
* operaciones destructivas.

Los eventos deben poder incluir:

```text
correlation_id
```

para relacionar acciones distribuidas entre:

* web;
* API;
* worker;
* servicios externos.

Logs técnicos y AuditEvent son conceptos separados.

---

# 85. Política de IA y egreso de información

Cada Workspace podrá poseer una política de IA.

Inicialmente:

```text
EXTERNAL_AI_ALLOWED
```

Futuro:

```text
LOCAL_ONLY
```

La plataforma también podrá incluir una allowlist de proveedores.

Antes de enviar contenido a servicios externos:

* debe comprobarse autorización;
* debe utilizarse solo contexto necesario;
* debe registrarse proveedor/modelo cuando proceda.

OmniRoute se considera un servicio externo desde el punto de vista de privacidad cuando se utiliza remotamente.

---

# 86. Integridad de aprobaciones

Una aprobación pertenece a:

```text
ArtifactVersion
```

y no al Artifact abstracto.

Ejemplo:

```text
RF-003 v3 → APPROVED
```

Si posteriormente aparece:

```text
RF-003 v4
```

la aprobación de v3 no se hereda automáticamente.

La nueva versión debe seguir el flujo correspondiente.

---

# 87. Eliminación y retención

Las reglas internas permanecen:

* versiones históricas → no eliminar individualmente;
* baselines congeladas → no eliminar individualmente;
* auditoría → append-only;
* fuentes utilizadas → archivar antes que borrar.

Sin embargo, debe distinguirse esto del derecho operacional a eliminar un proyecto/workspace completo.

La arquitectura debe permitir posteriormente:

```text
DeletionRequest
```

con:

* confirmación explícita;
* autorización elevada;
* período de recuperación;
* eliminación física posterior.

---

# 88. Compartición pública

V1 no incluirá enlaces públicos anónimos del tipo:

```text
Anyone with the link
```

La colaboración inicial requiere autenticación.

Una futura funcionalidad de compartir externamente deberá ser:

* explícita;
* revocable;
* limitada;
* auditable;
* opcionalmente expirable.

---

# 89. MFA

La arquitectura debe estar preparada para autenticación multifactor.

MFA no será requisito bloqueante de V1.

V2 podrá incorporar:

* TOTP;
* recovery codes;
* política MFA obligatoria por Workspace.

---

# 90. Deployment Profiles

CASEFlow AI utilizará perfiles de despliegue.

Como mínimo:

```text
LOCAL
TEST_CI
STAGING
PRODUCTION
```

Los comportamientos que dependan del entorno deben centralizarse mediante configuración.

La lógica funcional MUST NOT contener múltiples comprobaciones dispersas como:

```text
if production ...
```

---

# 91. Desarrollo local

El entorno local debe poder ejecutarse mediante Docker Compose.

Servicios previstos:

```text
PostgreSQL + pgvector
Redis
MinIO
Mailpit
```

Aplicaciones:

```text
Next.js Web
NestJS API
Worker
```

El objetivo es que un nuevo integrante pueda:

```text
clone
configure .env
install
docker compose up
pnpm dev
```

sin configurar manualmente infraestructura compleja.

---

# 92. Contenedores

Deben existir Dockerfiles para:

```text
web
api
worker
```

aunque durante desarrollo local puedan ejecutarse mediante procesos de desarrollo.

La contenerización debe permitir mover posteriormente CASEFlow AI entre:

* VPS;
* cloud;
* servidores institucionales;
* plataformas PaaS;
* infraestructura propia.

---

# 93. Perfil FREE-DEMO

Durante desarrollo y demostración se priorizará una infraestructura con costo cercano a cero.

Candidatos iniciales:

```text
Frontend       → Vercel o equivalente
API            → container host gratuito/económico
Database       → Neon PostgreSQL o equivalente
Redis          → Upstash o equivalente
Object Storage → Cloudflare R2 o equivalente S3-compatible
Email          → proveedor gratuito intercambiable
AI             → OmniRoute free-first + proveedores gratuitos
Diagrams       → Mermaid
Mockups        → Stitch + fallback interno
CI/CD          → GitHub Actions
```

Estas son opciones de despliegue, no dependencias arquitectónicas.

Si sus condiciones cambian, deberán poder sustituirse.

---

# 94. Perfil Production

Una primera producción real no necesita Kubernetes.

Una arquitectura inicial válida puede utilizar:

```text
Reverse Proxy
     ↓
API instances
     ↓
PostgreSQL
Redis
Workers
Object Storage
```

Docker Compose sobre un VPS puede considerarse suficiente mientras la escala lo permita.

Kubernetes se evaluará solo ante una necesidad real.

---

# 95. Reverse Proxy y TLS

En infraestructura propia se utilizará inicialmente:

```text
Nginx
```

o equivalente.

Responsabilidades:

* TLS termination;
* reverse proxy;
* compresión;
* límites de requests;
* caching cuando proceda;
* security headers.

TLS podrá utilizar:

```text
Let's Encrypt
```

en infraestructura propia.

Proveedores PaaS pueden administrar TLS directamente.

---

# 96. Configuración tipada

El acceso a variables de entorno debe centralizarse.

No se recomienda utilizar:

```text
process.env.*
```

directamente en múltiples módulos.

Debe existir una capa de configuración validada.

Variables conceptuales:

```text
DATABASE_URL
REDIS_URL
STORAGE_PROVIDER
EMAIL_PROVIDER
AI_GATEWAY
ALLOW_PAID_AI_FALLBACK
```

Si falta una configuración obligatoria, la aplicación debe fallar tempranamente durante startup.

---

# 97. Estrategia Git

CASEFlow AI utilizará inicialmente:

```text
main
 ↑
Pull Request
 ↑
feature/*
fix/*
chore/*
```

Se priorizarán:

* ramas cortas;
* integración continua;
* `main` estable.

No se añadirá una rama `develop` permanente salvo necesidad demostrada.

---

# 98. Protección de main

Los cambios significativos deben ingresar mediante Pull Request.

Antes de merge:

```text
lint
format check
typecheck
tests
build
security checks
```

`main` debe permanecer desplegable.

---

# 99. Conventional Commits

Se utilizará una convención basada en Conventional Commits.

Prefijos:

```text
feat:
fix:
docs:
test:
refactor:
chore:
ci:
```

Ejemplos:

```text
feat(requirements): add candidate review workflow

fix(auth): prevent refresh token reuse

docs(spec): document impact analysis
```

---

# 100. Continuous Integration

Toda Pull Request debe ejecutar un pipeline similar a:

```text
Install
 ↓
Lint
 ↓
Format Check
 ↓
Type Check
 ↓
Unit Tests
 ↓
Relevant Integration Tests
 ↓
Prisma Validate
 ↓
Build
 ↓
Security Checks
```

Cuando corresponda:

```text
Docker Build
```

Herramientas open-source como Trivy podrán utilizarse para análisis de seguridad.

---

# 101. Continuous Deployment

Merge hacia `main` podrá desplegar automáticamente:

```text
STAGING
```

Producción debe utilizar inicialmente promoción manual o releases controlados.

Conceptualmente:

```text
main
→ CI
→ staging

release tag
→ production
```

---

# 102. Semantic Versioning

El producto CASEFlow AI utilizará SemVer:

```text
MAJOR.MINOR.PATCH
```

Durante desarrollo inicial:

```text
0.x.x
```

V1 completa:

```text
1.0.0
```

La versión del software es independiente de la versión de `CASEFLOW_AI_SPEC.md`.

Ejemplo:

```text
CASEFlow AI software: 0.7.2
CASEFLOW_AI_SPEC: 0.4.0
```

---

# 103. Migraciones

Prisma Migrate será el mecanismo oficial para evolucionar el esquema.

Producción MUST NOT utilizar:

```text
prisma db push
```

como mecanismo normal de despliegue.

Las migraciones deben:

* estar versionadas;
* revisarse;
* probarse;
* ejecutarse controladamente.

---

# 104. Migraciones compatibles

Los cambios destructivos deben minimizarse.

Cuando sea posible:

```text
1. añadir estructura nueva;
2. migrar datos;
3. actualizar aplicación;
4. verificar;
5. eliminar estructura antigua en release posterior.
```

Esto reduce riesgos y facilita evolución sin downtime.

---

# 105. Observabilidad

CASEFlow AI debe distinguir:

```text
Logs
Metrics
Tracing
```

## 105.1 Logs

Se utilizarán logs estructurados, preferentemente JSON.

Campos útiles:

```text
timestamp
level
request_id
correlation_id
user_id
workspace_id
project_id
module
```

No deben contener secretos.

## 105.2 Metrics

Métricas futuras/iniciales:

* request latency;
* error rate;
* queue depth;
* job duration;
* AI latency;
* AI token usage;
* estimated AI cost;
* ingestion duration;
* export duration.

## 105.3 Tracing

La arquitectura debe ser compatible con:

```text
OpenTelemetry
```

aunque un stack completo de tracing no sea requisito inicial de V1.

---

# 106. Health Checks

La API debe ofrecer:

```text
/health/live
/health/ready
```

`live` verifica que el proceso se encuentre vivo.

`ready` verifica dependencias necesarias para atender tráfico, como:

* PostgreSQL;
* Redis;
* storage cuando corresponda.

No debe realizar llamadas costosas a proveedores externos en cada health check.

---

# 107. Backups

CASEFlow AI no debe depender exclusivamente de las copias ofrecidas por un proveedor cloud.

Debe existir una estrategia propia.

## 107.1 PostgreSQL

Se utilizarán backups mediante:

```text
pg_dump
```

o mecanismo equivalente.

Los backups deben:

* comprimirse;
* protegerse;
* almacenarse fuera de la base operativa.

## 107.2 Object Storage

Los objetos deben protegerse mediante:

* políticas de retención;
* versionamiento cuando se justifique;
* backups adicionales en producción real cuando sea necesario.

---

# 108. RPO y RTO

Objetivos iniciales no contractuales:

```text
RPO <= 6 horas
RTO <= 4 horas
```

Estos objetivos podrán endurecerse en versiones posteriores.

---

# 109. Restore Testing

Un backup no se considerará confiable si nunca ha sido restaurado.

Se deben realizar pruebas periódicas:

```text
Backup
 ↓
Restore temporary environment
 ↓
Integrity checks
```

Antes de una presentación o release importante se debe haber ejecutado al menos una restauración completa exitosa.

---

# 110. Escalabilidad

La arquitectura debe favorecer:

```text
Web        → stateless
API        → stateless
Workers    → horizontally scalable
Files      → external object storage
Database   → PostgreSQL
Queue      → Redis
```

Esto permite escalar:

```text
1 API
```

hacia:

```text
N API instances
```

sin modificar el dominio.

---

# 111. Procesamiento asíncrono

Las operaciones costosas no deben mantener requests HTTP abiertos innecesariamente.

Ejemplos:

* parsing;
* OCR;
* embeddings;
* IA;
* mockups;
* exports;
* análisis masivos.

Flujo:

```text
Request
 ↓
Job created
 ↓
HTTP response with jobId
 ↓
Worker processing
 ↓
Result
```

---

# 112. Estados de Job

Los jobs deben soportar estados claros:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
RETRYING
```

Una operación no debe quedar indefinidamente en:

```text
Processing...
```

después de un fallo.

---

# 113. Concurrencia

Los workers deben limitar concurrencia según tipo de tarea.

Ejemplo conceptual:

```text
AI jobs          → 2
Document parsing → 4
Email            → 5
```

Los valores serán configurables.

Esto permite proteger:

* APIs;
* free tiers;
* rate limits;
* memoria;
* CPU.

---

# 114. Idempotencia

Debe implementarse idempotencia especialmente en:

* emails;
* ingestion;
* generation jobs;
* exports;
* webhooks futuros.

Un retry no debe provocar duplicados.

Ejemplo prohibido:

```text
1 job retried 5 times
→ 5 identical requirements
```

---

# 115. Feature Flags

CASEFlow AI podrá utilizar feature flags simples.

Ejemplo:

```text
FEATURE_STITCH=true
FEATURE_IMPACT_AI=true
FEATURE_PROJECT_ASSISTANT=false
```

Inicialmente pueden implementarse mediante configuración.

No es necesario introducir una plataforma externa de feature management para V1.

---

# 116. Graceful Degradation

Las integraciones externas no deben provocar caída total del producto.

Ejemplos:

```text
Stitch unavailable
→ UI Blueprint + InternalWireframeRenderer
```

```text
OmniRoute unavailable
→ direct provider / manual mode
```

```text
Email provider unavailable
→ NotificationOutbox retries
```

```text
Mermaid rendering failure
→ source code remains available
```

```text
AI unavailable
→ deterministic CASE workflow remains operational
```

---

# 117. Infrastructure as Code

La infraestructura debe mantenerse versionada.

Inicialmente:

```text
infra/
├── docker/
├── nginx/
└── scripts/
```

Terraform/OpenTofu se incorporará únicamente cuando exista suficiente infraestructura cloud que justifique su complejidad.

---

# 118. Política de costos

CASEFlow AI adopta el principio:

> **Free-first, not free-at-all-costs.**

Durante desarrollo y demostración se priorizarán:

* software open-source;
* herramientas gratuitas;
* free tiers;
* servicios de bajo costo.

Siempre que no comprometan de manera significativa:

* calidad;
* seguridad;
* mantenibilidad;
* eficiencia;
* portabilidad.

Una herramienta gratuita no debe seleccionarse únicamente por precio cuando genere dependencia arquitectónica o degradación importante.

---

# 119. V1 Completion Principle

CASEFlow AI priorizará completar un flujo integral y funcional sobre desarrollar simultáneamente todas las capacidades futuras.

V1 debe constituir por sí misma:

* un producto utilizable;
* un producto desplegable;
* un producto demostrable;
* una herramienta CASE funcional.

V2/V3 deben representar mejoras incrementales, no funcionalidades esenciales omitidas de V1.

---

# 120. Prioridad funcional de V1

Las capacidades se clasifican:

```text
P0
P1
P2
```

## 120.1 P0 — Release blockers

V1 no existe sin:

* Authentication.
* Workspace.
* Project.
* Project members.
* Knowledge Sources.
* entrada manual.
* PDF/DOCX/TXT/Markdown.
* Actors.
* RF.
* RNF.
* Use Cases.
* edición manual.
* versionamiento.
* review/approval.
* evidencia.
* use case diagram.
* system architecture.
* software architecture.
* navigation tree.
* UI Blueprint.
* mockup funcional.
* traceability.
* live documentation.
* export.
* al menos un provider/gateway de IA.
* candidate review.
* manual fallback.
* security isolation.
* basic audit.
* basic Impact Analysis.
* basic Consistency Engine.
* generalidad.

## 120.2 P1 — Alta prioridad

Debe intentarse incluir en V1 siempre que no amenace P0:

* búsqueda híbrida;
* pgvector;
* semantic duplicate detection;
* semantic consistency;
* semantic impact analysis;
* comentarios;
* baseline;
* version comparison;
* Stitch;
* OmniRoute avanzado;
* email notifications;
* job progress.

## 120.3 P2 — Posponible

Puede moverse a V1.1/V2:

* BYOK completo;
* MFA;
* roles personalizados;
* ProjectTemplate personalizado;
* Figma integration;
* múltiples diagram engines;
* Project Assistant;
* collaborative real-time editing;
* advanced dashboards;
* advanced AI budgets.

---

# 121. Regla de prioridad

Una capacidad P1/P2 MUST NOT retrasar una capacidad P0 de la que dependa el flujo principal.

Cuando exista conflicto de tiempo:

```text
P0 > P1 > P2
```

---

# 122. Estrategia de pruebas

CASEFlow AI utilizará múltiples niveles:

```text
Unit Tests
Integration Tests
Contract Tests
E2E Tests
AI Evaluation
Security Tests
Migration Tests
```

No se buscará cobertura artificial del 100 %.

El objetivo principal es proteger:

* reglas;
* datos;
* seguridad;
* integraciones;
* flujo central.

---

# 123. Unit Tests

Prioridad alta para lógica determinística.

Ejemplos:

## Versionado

* código no reutilizable;
* nueva versión;
* inmutabilidad;
* baseline congelada.

## Autorización

* Viewer no modifica;
* Reviewer aprueba;
* independent review.

## Consistency

* RNF sin métrica;
* RF sin acceptance criteria;
* relación obsoleta.

## Impact Analysis

Cambio de versión debe marcar dependencias relevantes.

---

# 124. Integration Tests

Deben comprobar integración real entre:

```text
NestJS
Prisma
PostgreSQL
Redis
Storage
```

Ejemplos:

```text
Project
→ Artifact
→ Version
→ Review
→ Approval
→ History
```

```text
Source
→ Fragment
→ Evidence
→ Artifact
```

```text
Baseline
→ Freeze
→ modification rejected
```

---

# 125. Contract Tests

Toda implementación de adapters debe cumplir contratos comunes.

Ejemplo:

```text
AIExecutionGateway
EmailProvider
StorageProvider
MockupProvider
DiagramProvider
```

Los tests deben verificar según corresponda:

* resultado esperado;
* timeout;
* error;
* retry;
* rate limit;
* sanitización;
* metadata.

---

# 126. End-to-End Tests

Debe existir al menos un E2E principal:

```text
Register/Login
 ↓
Workspace
 ↓
Project
 ↓
Knowledge Source
 ↓
Requirements
 ↓
Review
 ↓
Approval
 ↓
Use Cases
 ↓
Design
 ↓
Traceability
 ↓
Quality
 ↓
Documentation
 ↓
Export
```

Si este flujo deja de funcionar, la versión no debe liberarse.

---

# 127. Generality Test

V1 debe probarse con al menos dos dominios diferentes.

Antes de la defensa se recomienda probar:

```text
RestGest Mateos
Tutorías Académicas
Inventory Demo
```

El tercer proyecto debe funcionar sin agregar lógica específica al código.

Si implementar un nuevo dominio requiere cambiar el núcleo:

> existe un problema de generalidad.

---

# 128. Tests de IA

Los tests normales MUST NOT depender de llamadas reales a proveedores.

Se utilizarán mocks/fakes para CI habitual.

La evaluación real de modelos se ejecutará separadamente.

Ejemplo:

```text
pnpm test:ai
```

---

# 129. AI Evaluation Suite

La suite debe evaluar:

* structured output;
* evidence grounding;
* hallucination;
* user acceptance;
* edits;
* discards;
* latency;
* estimated cost.

Fixtures sugeridos:

```text
fixtures/
├── restgest/
├── tutorias/
└── inventory-demo/
```

No se exige coincidencia textual exacta.

Se evalúa calidad funcional.

---

# 130. RAG Tests

Deben existir consultas conocidas con evidencia esperada.

También es obligatorio comprobar aislamiento.

Ejemplo:

```text
Project A query
```

MUST NOT recuperar fragmentos de:

```text
Project B
```

---

# 131. Isolation Tests

Deben existir pruebas explícitas de acceso cruzado.

Usuario A sin acceso al Project B intenta acceder mediante UUID conocido.

El backend debe responder sin revelar contenido.

Esto aplica a:

* Project;
* Artifact;
* Version;
* KnowledgeSource;
* Fragment;
* Evidence;
* Relationship;
* Baseline;
* Export;
* AI context.

Un fallo de aislamiento se considera:

```text
P0 / BLOCKER
```

---

# 132. Security Checks

CI debe incluir cuando sea viable:

* dependency audit;
* secret scanning;
* Trivy;
* authorization tests;
* upload validation tests;
* token/session tests.

No es requisito ejecutar un pentest profesional completo antes de V1.

---

# 133. Migration Tests

Toda migración debe poder ejecutarse:

```text
Empty DB
→ latest
```

Cuando existan releases anteriores:

```text
Previous release DB
→ current release
```

No se permitirán migraciones destructivas silenciosas.

---

# 134. Definition of Done — Feature

Una feature se considera `DONE` únicamente si:

* cumple el requisito;
* respeta CASEFLOW_AI_SPEC;
* no contiene lógica específica de Mateos;
* valida inputs;
* aplica autorización;
* maneja errores;
* contiene tests apropiados;
* lint pasa;
* typecheck pasa;
* build pasa;
* no introduce secretos;
* registra auditoría cuando corresponde;
* maneja loading/empty/error en UI;
* está integrada;
* está revisada cuando corresponde.

---

# 135. Definition of Done — Artifact Capability

Un módulo de artefacto no se considera terminado únicamente por poseer CRUD.

Cuando aplique, debe cubrir:

```text
Create
Read
Edit Draft
Version
Review
Approve / Reject
Archive
Evidence
Traceability
Audit
```

Y si existe asistencia IA:

```text
Generate Candidate
Review Candidate
Accept / Edit / Discard
```

---

# 136. Definition of Done — External Integration

Una integración externa debe poseer:

* adapter propio;
* timeout;
* error handling;
* secrets externos al código;
* logs sanitizados;
* tests de contrato;
* fallback cuando corresponda;
* UI de indisponibilidad.

---

# 137. Quality Gates

Una PR no debe integrarse si falla:

```text
Install
Lint
Format Check
Type Check
Unit Tests
Relevant Integration Tests
Prisma Validate
Build
Security Checks
```

Las excepciones deben ser extraordinarias y documentadas.

---

# 138. Coverage

Objetivo inicial:

```text
Global line coverage >= 70 %
```

Áreas críticas deberían aspirar a:

```text
>= 85 %
```

Especialmente:

```text
domain
auth
authorization
traceability
versioning
consistency
impact-analysis
```

La cobertura no debe aumentarse mediante tests sin valor.

---

# 139. Performance

Objetivo inicial para operaciones API normales, excluyendo IA/servicios externos:

```text
p95 < 500 ms
```

bajo carga razonable de demostración.

Las operaciones pesadas deben ser asíncronas.

El frontend debe recibir rápidamente:

```text
job accepted
```

aunque el procesamiento continúe.

---

# 140. UX Quality

Toda funcionalidad principal debe incluir:

* empty state;
* loading state;
* success feedback;
* error feedback;
* navegación coherente;
* acción principal claramente visible.

V1 debe poder utilizarse sin que los desarrolladores tengan que explicar cada clic durante una demostración.

---

# 141. Demo Project

CASEFlow AI puede incluir seeds/proyectos demo.

Ejemplos:

```text
RestGest Mateos Demo
Tutorías Demo
```

Deben existir únicamente como:

```text
seed/demo data
```

Nunca como lógica especial de dominio.

---

# 142. Graceful Demo Strategy

La demostración debe poder realizarse incluso ante fallos externos.

Ejemplo:

```text
AI online
→ generación en vivo
```

```text
AI offline
→ candidate previamente generado + manual workflow
```

```text
Stitch online
→ external mockup
```

```text
Stitch offline
→ InternalWireframeRenderer
```

---

# 143. Criterios de aceptación V1

CASEFlow AI puede declararse `1.0.0` únicamente cuando sea posible demostrar:

## Gestión

* autenticación;
* Workspace;
* Project;
* miembros;
* permisos básicos.

## Knowledge

* texto/documentos;
* procesamiento;
* fragmentos;
* evidencia;
* aislamiento.

## Analysis

* actores;
* RF;
* RNF;
* casos de uso;
* edición;
* versionado;
* review;
* approval.

## Design

* use case diagram;
* system architecture;
* software architecture;
* navigation tree;
* UI Blueprint;
* mockup.

## Integration CASE

* relaciones;
* evidencia;
* trazabilidad;
* historial;
* approval.

## Quality

* Consistency Engine básico;
* Impact Analysis básico.

## AI

* al menos un provider/gateway operativo;
* candidate flow;
* evidence grounding;
* manual fallback.

## Documentation

* living documentation;
* export funcional.

## Generality

* al menos dos dominios distintos.

## Security

* aislamiento entre usuarios/proyectos.

## Operations

* despliegue reproducible;
* CI verde;
* backup;
* restore probado.

---

# 144. Bug Severity

## P0 — Blocker

* pérdida/corrupción de datos;
* bypass de autorización;
* aplicación no inicia;
* flujo central roto.

## P1 — Critical

* funcionalidad fundamental inutilizable;
* versionado incorrecto;
* aprobación incorrecta;
* export principal roto.

## P2 — Normal

* error secundario;
* problema poco frecuente;
* UX relevante.

## P3 — Minor

* cosmético;
* mejora menor.

V1 requiere:

```text
0 P0 conocidos
0 P1 conocidos
```

---

# 145. Feature Freeze

Antes de una presentación/release principal debe declararse un:

```text
Feature Freeze
```

Durante ese período únicamente se priorizarán:

* bugs;
* tests;
* UX;
* performance;
* documentación;
* seguridad;
* deployment;
* demo.

No se introducirán grandes funcionalidades nuevas.

---

# 146. Release Candidate

Antes de `1.0.0` se generará:

```text
1.0.0-rc.1
```

Debe ejecutarse sobre staging:

* E2E;
* isolation tests;
* security checks;
* AI evaluations;
* generality tests;
* backup;
* restore;
* exports;
* demo rehearsal.

Cuando se detecten problemas:

```text
rc.2
rc.3
...
```

---

# 147. SonarQube

CASEFlow AI podrá utilizar SonarQube como herramienta adicional de calidad.

Objetivos para código nuevo:

* cero vulnerabilidades críticas conocidas;
* cero blocker issues;
* coverage adecuada;
* duplicación controlada;
* maintainability razonable.

SonarQube no debe reemplazar:

* tests;
* code review;
* análisis arquitectónico.

---

# 148. Documentación técnica derivada

Siempre que sea posible, la documentación técnica debe generarse desde fuentes estructuradas.

Ejemplos:

```text
OpenAPI
Prisma Schema
Test Reports
Coverage Reports
```

No se deben mantener manualmente dos fuentes distintas para la misma información cuando pueda evitarse.

---

# 149. Roadmap de implementación

CASEFlow AI se construirá mediante incrementos verticales.

Orden principal:

```text
Foundation
 ↓
Identity / Workspace / Project
 ↓
Artifact Core
 ↓
Knowledge Base
 ↓
Manual Analysis
 ↓
AI-assisted Analysis
 ↓
Use Cases
 ↓
Design
 ↓
Traceability
 ↓
Impact Analysis
 ↓
Consistency Engine
 ↓
Baselines
 ↓
Living Documentation
 ↓
Collaboration / Notifications
 ↓
External Improvements
 ↓
Hardening
 ↓
Generality Test
 ↓
Demo Hardening
 ↓
Release Candidate
 ↓
1.0.0
```

---

# 150. Incremento 0 — Foundation

Objetivo:

> Crear una base estable y reproducible antes de funcionalidades de dominio.

Implementar:

* monorepo;
* pnpm workspaces;
* Next.js;
* NestJS;
* worker;
* Prisma;
* PostgreSQL;
* Redis;
* MinIO;
* Mailpit;
* TypeScript;
* ESLint;
* Prettier;
* Docker Compose;
* `.env.example`;
* CI inicial.

Gate:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Release objetivo:

```text
0.1.0
```

---

# 151. Incremento 1 — Identity / Workspace / Project

Implementar:

* registration;
* login;
* logout;
* refresh;
* sessions;
* Workspace;
* membership;
* Project;
* ProjectTemplate inicial;
* phases;
* roles iniciales;
* audit inicial.

Gate:

Usuario autorizado puede gestionar su Project.

Usuario no autorizado no puede acceder.

Release objetivo:

```text
0.2.0
```

---

# 152. Incremento 2 — Artifact Core

Implementar:

```text
Artifact
ArtifactVersion
ArtifactState
Review
Approval
Archive
Audit
```

Primera validación mediante un artefacto simple como:

```text
NOTE
```

Gate:

```text
Create
Edit Draft
Version
Review
Approve
Reject
Archive
History
```

Release objetivo:

```text
0.3.0
```

---

# 153. Incremento 3 — Knowledge Base

Fuentes P0:

* manual text;
* TXT;
* Markdown;
* PDF;
* DOCX.

Pipeline:

```text
Upload
Validate
Hash
Extract
Normalize
Chunk
Index
```

Primero:

```text
Structured Search
+
Full Text Search
```

Posteriormente:

```text
pgvector
```

Gate:

Una fuente puede procesarse, visualizarse y utilizarse como evidencia.

Release objetivo:

```text
0.4.0
```

---

# 154. Incremento 4 — Manual Analysis

Implementar:

* Actor;
* Stakeholder;
* RF;
* RNF;
* Business Rule;
* Constraint;
* Assumption;
* Glossary;
* AcceptanceCriterion;
* Evidence.

También:

* versioning;
* review;
* approval;
* consistency checks básicos.

Gate:

Se puede realizar análisis completo manual sin IA.

Release objetivo:

```text
0.5.0
```

---

# 155. Incremento 5 — AI-assisted Analysis

Implementar:

```text
AIOrchestrator
ModelRouter
AIExecutionGateway
PromptTemplate
PromptVersion
AIRun
ArtifactCandidate
ContextBuilder
```

Primera función IA:

> Extraer candidatos a requisitos desde fuentes.

Después:

* actores;
* RF;
* RNF;
* reglas de negocio.

Pipeline:

```text
Sources
 ↓
Context
 ↓
AI
 ↓
Structured Output
 ↓
Schema Validation
 ↓
Domain Validation
 ↓
Candidates
 ↓
Human Review
 ↓
Artifacts
```

La IA no escribe directamente artefactos oficiales.

---

# 156. Incremento 6 — Use Cases

Implementar:

```text
UseCase
UseCaseActor
Precondition
Postcondition
UseCaseFlow
UseCaseFlowStep
```

Primero flujo manual.

Después:

```text
AI-assisted Use Case generation
```

Generar vista de casos de uso mediante DiagramProvider.

Gate:

Los casos de uso están relacionados con requisitos y actores.

---

# 157. Incremento 7 — Design

Implementar:

* System Architecture.
* Software Architecture.
* ADR.
* Navigation Tree.
* UI Blueprint.
* Internal Wireframe Renderer.

Después:

```text
StitchMockupProvider
```

Gate:

Un Use Case puede relacionarse con una pantalla/UI Blueprint y componentes de arquitectura.

---

# 158. Incremento 8 — Traceability

Implementar:

```text
ArtifactRelationship
RelationshipType
RelationshipValidation
```

UI debe mostrar:

* incoming relationships;
* outgoing relationships;
* evidence.

Agregar:

```text
Traceability Matrix
```

Gate:

Debe poder navegarse:

```text
Source
→ Requirement
→ Use Case
→ UI
→ Architecture
```

y en sentido inverso.

---

# 159. Incremento 9 — Impact Analysis

Primero:

```text
Deterministic Impact Analysis
```

Basado en:

* version changes;
* relationships;
* dependencies;
* baselines.

Después:

```text
Semantic AI Impact Analysis
```

La UI debe distinguir:

```text
Confirmed by traceability
Suggested by AI
```

---

# 160. Incremento 10 — Consistency Engine

Primero reglas determinísticas.

Ejemplos:

```text
RNF_MISSING_METRIC
REQUIREMENT_WITHOUT_ACCEPTANCE_CRITERIA
APPROVED_REQUIREMENT_WITHOUT_USE_CASE
OBSOLETE_RELATIONSHIP
ORPHAN_ACTOR
ARCHITECTURE_BASED_ON_OLD_VERSION
```

Después:

```text
Semantic Consistency Review
```

Estados:

```text
OPEN
RESOLVED
WAIVED
```

---

# 161. Incremento 11 — Baselines

Implementar:

```text
Baseline
BaselineItem
Freeze
Basic Compare
```

Una baseline congelada es inmutable.

Gate:

Puede congelarse el análisis aprobado de un proyecto y compararse posteriormente.

---

# 162. Incremento 12 — Living Documentation

Generar documentación desde:

```text
Approved Artifacts
+
Project Metadata
+
Traceability
```

Secciones iniciales:

* Project Overview.
* Knowledge Sources.
* Actors.
* Requirements.
* Use Cases.
* Architecture.
* Navigation.
* Interfaces.
* Traceability.
* Decisions.

Exportación P0:

```text
Markdown
HTML
PDF
```

DOCX puede añadirse posteriormente.

---

# 163. Incremento 13 — Collaboration / Notifications

Implementar:

* comments;
* ReviewRequest;
* ReviewDecision;
* NotificationOutbox;
* Mailpit;
* EmailProvider.

Emails mínimos:

* invitation;
* password reset;
* review request.

Una falla de email no bloquea el flujo principal.

---

# 164. Incremento 14 — P1 Improvements

Cuando los P0 se encuentren completos se pueden priorizar:

* Stitch;
* OmniRoute advanced routing;
* pgvector improvements;
* semantic Impact Analysis;
* semantic Consistency;
* advanced AI routing;
* email provider production;
* additional diagrams.

---

# 165. Incremento 15 — Hardening

Durante Hardening se detiene temporalmente la expansión funcional.

Prioridades:

* bugs;
* authorization;
* security;
* UX;
* indexes;
* performance;
* responsive design;
* accessibility;
* tests;
* SonarQube;
* Trivy;
* deployment;
* backup;
* restore.

---

# 166. Incremento 16 — Generality Validation

Antes del Release Candidate deben ejecutarse proyectos de prueba en dominios distintos.

Mínimo:

```text
RestGest Mateos
Tutorías Académicas
Sistema de Inventario
```

El tercero debe poder gestionarse sin modificar el código del núcleo.

---

# 167. Incremento 17 — Demo Hardening

Preparar:

* proyecto demo;
* seeds;
* fallback de IA;
* fallback de mockups;
* fuentes preparadas;
* datos realistas;
* contingencias.

Toda función externa crítica debe tener una forma segura de demostración.

---

# 168. Incremento 18 — Release Candidate

Publicar:

```text
1.0.0-rc.1
```

Ejecutar:

* E2E;
* AI evaluation;
* isolation;
* security;
* performance;
* migrations;
* backup;
* restore;
* exports;
* generality;
* demo rehearsal.

No liberar V1 con P0/P1 conocidos.

---

# 169. Estrategia de vertical slices

CASEFlow AI no debe desarrollarse durante semanas mediante capas aisladas.

Preferir:

```text
Requirement vertical slice
├── DB
├── Domain
├── API
├── Frontend
├── Authorization
├── Tests
└── Audit
```

Después:

```text
Use Case vertical slice
```

Cada incremento debe dejar el repositorio ejecutable.

---

# 170. Trabajo paralelo del equipo

El paralelismo debe ocurrir dentro de un objetivo integrado.

Ejemplo para Requirements:

```text
Developer A → domain + Prisma
Developer B → API
Developer C → frontend
Developer D → review/versioning
Developer E → tests
Developer F → AI candidate workflow
```

No se recomienda que cada integrante construya un subsistema aislado durante semanas y se intente integrar todo al final.

---

# 171. Pull Requests

Cada Pull Request debe resolver una unidad coherente.

Ejemplos correctos:

```text
feat(requirements): add acceptance criteria persistence
feat(review): add independent approval policy
feat(knowledge): add PDF ingestion
```

Evitar PR con múltiples funcionalidades no relacionadas.

---

# 172. Uso de agentes de código

Los agentes no deben recibir instrucciones excesivamente generales como:

> Construye CASEFlow AI.

Cada tarea debe definir:

* objetivo;
* archivos/contexto;
* restricciones;
* alcance;
* tests esperados.

Ejemplo:

```text
Read:
- AGENTS.md
- docs/CASEFLOW_AI_SPEC.md

Goal:
Implement ArtifactVersion creation.

Constraints:
- approved versions are immutable;
- preserve 3NF;
- do not modify auth;
- add tests;
- no new dependency without justification.
```

---

# 173. Regla de roadmap para agentes

Un agente MUST NOT implementar funcionalidad de un incremento posterior cuando dependa de un P0 incompleto de un incremento anterior, salvo instrucción explícita del usuario.

Ejemplo prohibido:

```text
Implement Project Assistant
```

cuando:

```text
Artifact Review
```

todavía se encuentre incompleto.

---

# 174. Checkpoints de arquitectura

## Checkpoint A — Artifact Core

Verificar:

* versioning;
* immutability;
* review;
* approval.

## Checkpoint B — Manual Analysis

Verificar:

> CASEFlow funciona sin IA.

## Checkpoint C — AI Layer

Verificar:

> La IA genera candidates y no escribe directamente en dominio oficial.

## Checkpoint D — Design

Verificar:

> Analysis y Design están conectados mediante trazabilidad real.

## Checkpoint E — Pre-RC

Verificar:

> Flujo completo funcionando en varios dominios.

---

# 175. Después de V1

Antes de:

```text
1.0.0
```

la prioridad es:

> completar el producto.

Después de:

```text
1.0.0
```

la prioridad cambia a:

> mejorar y diferenciar el producto.

Ejemplos de evolución:

```text
1.1 → additional diagrams
1.2 → Project Assistant
1.3 → BYOK + model analytics
1.4 → ProjectTemplate Builder
1.5 → advanced mockup integrations
1.6 → Test Case Generation
1.7 → Git integration
2.0 → expanded Construction/Testing lifecycle
```

La secuencia podrá cambiar según valor y tiempo.

---

# 176. Priorización post-V1

Toda mejora podrá evaluarse mediante:

```text
User Value
+
Evaluation Impact
+
Differentiation
+
Technical Value
-
Implementation Time
-
Risk
```

Debe priorizarse aquello que aumente valor real o diferenciación.

Ejemplo:

```text
Project Assistant
→ alto impacto potencial
```

frente a:

```text
Kubernetes
→ bajo impacto para la demostración inicial
```

---

# 177. Principio final de implementación

> **CASEFlow AI será desarrollado mediante incrementos verticales integrables. Cada incremento debe dejar el producto ejecutable y verificable. El equipo priorizará completar el flujo funcional integral de V1 antes de desarrollar capacidades avanzadas de V2/V3. Las integraciones externas y la inteligencia artificial se construirán sobre capacidades determinísticas previamente funcionales, nunca en sustitución de ellas.**

---

# 178. Reglas de arquitectura congeladas para V1

Las siguientes decisiones se consideran estables para comenzar implementación:

1. TypeScript como lenguaje principal.
2. Next.js + React para frontend.
3. NestJS para API.
4. PostgreSQL como base de datos principal.
5. Prisma como ORM inicial.
6. Redis + BullMQ para jobs.
7. pgvector para búsqueda vectorial inicial.
8. Storage externo mediante StorageProvider.
9. S3-compatible como protocolo preferente de object storage.
10. Monorepo.
11. REST + OpenAPI.
12. 3FN para el dominio.
13. Artifact + ArtifactVersion separados.
14. Human-in-the-loop.
15. Flow flexible.
16. Project Knowledge Base.
17. Evidence/provenance.
18. Traceability graph.
19. Impact Analysis.
20. Consistency Engine.
21. Living Documentation.
22. AI provider-agnostic.
23. AI gateway-agnostic.
24. OmniRoute opcional.
25. Manual fallback.
26. UI Blueprint como fuente canónica.
27. ProjectTemplate extensible.
28. Security isolation obligatorio.
29. Docker para entornos reproducibles.
30. V1 como producto integral.

Estas decisiones pueden cambiar únicamente mediante una decisión arquitectónica explícita y documentada.

---

# 179. Registro de decisiones — continuación

| ID      | Decisión                                                             | Estado   |
| ------- | -------------------------------------------------------------------- | -------- |
| DEC-031 | Autenticación V1 mediante email/password propia                      | Accepted |
| DEC-032 | Argon2id será el algoritmo inicial de password hashing               | Accepted |
| DEC-033 | Access tokens cortos + refresh tokens rotatorios                     | Accepted |
| DEC-034 | La revisión independiente permanece activada por defecto             | Accepted |
| DEC-035 | Autorización mediante RBAC + reglas contextuales                     | Accepted |
| DEC-036 | El aislamiento multi-project será obligatorio en backend y tests     | Accepted |
| DEC-037 | Archivos privados mediante acceso autorizado/signed URLs             | Accepted |
| DEC-038 | Mailpit se utilizará para email local                                | Accepted |
| DEC-039 | EmailProvider será intercambiable                                    | Accepted |
| DEC-040 | Se utilizará NotificationOutbox para notificaciones                  | Accepted |
| DEC-041 | BYOK se diseñará desde ahora pero podrá implementarse posteriormente | Accepted |
| DEC-042 | V1 no tendrá enlaces públicos anónimos                               | Accepted |
| DEC-043 | MFA se prepara pero no bloquea V1                                    | Accepted |
| DEC-044 | Existirán perfiles LOCAL, TEST_CI, STAGING y PRODUCTION              | Accepted |
| DEC-045 | Docker será parte del entorno desde V1                               | Accepted |
| DEC-046 | Se priorizará un perfil FREE-DEMO reemplazable                       | Accepted |
| DEC-047 | Kubernetes no será requisito de V1                                   | Accepted |
| DEC-048 | Nginx será reverse proxy inicial en infraestructura propia           | Accepted |
| DEC-049 | main se mantendrá estable mediante PR y CI                           | Accepted |
| DEC-050 | Se utilizará Conventional Commits                                    | Accepted |
| DEC-051 | La producción se promoverá inicialmente de forma controlada          | Accepted |
| DEC-052 | El software utilizará Semantic Versioning                            | Accepted |
| DEC-053 | Prisma Migrate será el mecanismo de migración                        | Accepted |
| DEC-054 | Se implementarán logs estructurados y correlation IDs                | Accepted |
| DEC-055 | Se implementarán health checks                                       | Accepted |
| DEC-056 | Se realizarán backups propios y pruebas de restauración              | Accepted |
| DEC-057 | RPO inicial objetivo <= 6 h                                          | Accepted |
| DEC-058 | RTO inicial objetivo <= 4 h                                          | Accepted |
| DEC-059 | API/Web deberán ser escalables horizontalmente                       | Accepted |
| DEC-060 | Operaciones pesadas serán asíncronas                                 | Accepted |
| DEC-061 | Se utilizará graceful degradation                                    | Accepted |
| DEC-062 | Se adopta la política free-first, not free-at-all-costs              | Accepted |
| DEC-063 | V1 será un producto mínimo completo, no un prototipo parcial         | Accepted |
| DEC-064 | P0 tendrá prioridad absoluta sobre P1/P2                             | Accepted |
| DEC-065 | El flujo E2E completo será release blocker                           | Accepted |
| DEC-066 | La generalidad se probará con varios dominios                        | Accepted |
| DEC-067 | Los tests normales no dependerán de proveedores IA reales            | Accepted |
| DEC-068 | Existirá AI Evaluation Suite separada                                | Accepted |
| DEC-069 | Cross-project isolation será release blocker                         | Accepted |
| DEC-070 | Definition of Done incluirá seguridad, tests, auditoría y UX         | Accepted |
| DEC-071 | Global coverage objetivo inicial >= 70 %                             | Accepted |
| DEC-072 | Áreas críticas aspirarán a >= 85 % coverage                          | Accepted |
| DEC-073 | V1 requerirá cero bugs P0/P1 conocidos                               | Accepted |
| DEC-074 | Se realizará Feature Freeze antes de release/presentación            | Accepted |
| DEC-075 | Se utilizarán Release Candidates antes de 1.0.0                      | Accepted |
| DEC-076 | SonarQube podrá utilizarse como herramienta de calidad               | Accepted |
| DEC-077 | El desarrollo seguirá vertical slices                                | Accepted |
| DEC-078 | La IA se implementará después del flujo manual correspondiente       | Accepted |
| DEC-079 | Integraciones externas no podrán sustituir al núcleo determinístico  | Accepted |
| DEC-080 | Hardening y Generality Test precederán al Release Candidate          | Accepted |
| DEC-081 | Los agentes respetarán el orden de dependencias del roadmap          | Accepted |
| DEC-082 | Después de V1 la prioridad pasará de completar a diferenciar         | Accepted |
| DEC-083| Local S3-compatible development storage will use SeaweedFS
instead of MinIO due to MinIO Community distribution changes.   | Accepted |

---

# 180. Decisiones abiertas después de los Bloques 1–10

Las decisiones siguientes pueden resolverse durante implementación sin bloquear el inicio del proyecto:

## Implementación UI

* component library definitiva;
* iconografía;
* design tokens;
* layout final;
* branding visual.

## AI

* proveedor inicial concreto;
* modelos iniciales;
* configuración final de OmniRoute;
* embedding model;
* estrategia final de reranking.

## Infraestructura

* proveedor exacto de API staging;
* proveedor exacto de PostgreSQL staging;
* proveedor exacto de Redis staging;
* proveedor exacto de correo staging;
* dominio público.

## Integraciones

* fecha exacta de incorporación de Stitch;
* PlantUML en V1 o V2;
* Figma en V2;
* ClamAV en V1 o V1.x.

## Producto

* nombres definitivos de algunas pantallas;
* branding completo;
* logo;
* contenido de onboarding;
* métricas avanzadas.

Estas decisiones MUST NOT reinterpretar o contradecir silenciosamente las decisiones ya aprobadas.

Cuando una decisión abierta tenga impacto arquitectónico, deberá registrarse como nueva DEC o ADR.

---

# 181. Source of Truth

La prioridad documental del proyecto será:

```text
1. CASEFLOW_AI_SPEC.md
2. ADRs aprobados
3. AGENTS.md para reglas operativas de agentes
4. OpenAPI / Prisma / código estructurado
5. README y documentación secundaria
```

Si `AGENTS.md` contradice `CASEFLOW_AI_SPEC.md`:

> prevalece `CASEFLOW_AI_SPEC.md`.

Si una decisión arquitectónica posterior aprobada mediante ADR modifica esta especificación:

> CASEFLOW_AI_SPEC.md debe actualizarse.