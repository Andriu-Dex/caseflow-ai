# CASEFlow AI — CASEFLOW_AI_SPEC
> **Producto:** CASEFlow AI  
> **Categoría:** Plataforma I-CASE integrada asistida por inteligencia artificial  
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

**CASEFlow AI** es una plataforma web **I-CASE** integrada, multiusuario y multiproyecto, asistida por inteligencia artificial, orientada a gestionar proyectos de software y transformar progresivamente conocimiento, análisis y diseño aprobados en documentación, diagramas y **proyectos de software funcionales, ejecutables y verificables**.

La plataforma no debe limitarse a generar texto, imágenes o documentación. Su propuesta central es mantener un repositorio coherente de artefactos estructurados y relaciones entre ellos, y utilizar dicho repositorio como entrada trazable para procesos de forward engineering y generación controlada de software.

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
- planificar la construcción de la solución;
- generar y revisar UI Blueprints y mockups antes de la implementación definitiva;
- generar un proyecto de software funcional dentro de un `TargetTemplate` soportado;
- generar esquema de datos, contratos API, backend, frontend y pruebas;
- validar el proyecto generado en un sandbox aislado;
- exportar documentación y código fuente ejecutable;
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

## 2.6 Forward engineering controlado

CASEFlow AI debe soportar **forward engineering** desde artefactos aprobados hacia software ejecutable.

La generación de software:

- MUST partir de artefactos trazables;
- MUST utilizar un `TargetTemplate` soportado;
- MUST pasar por un `GenerationPlan`;
- MUST incorporar revisión humana del diseño antes de la generación oficial de código;
- MUST validar el resultado mediante herramientas determinísticas;
- MUST conservar trazabilidad entre requisitos, diseño, implementación y pruebas;
- MUST NOT depender de un único LLM para producir el proyecto completo en una sola llamada.

La generación oficial de código sigue el mismo principio del resto de CASEFlow AI:

> **Generar → Revisar → Aprobar → Relacionar → Construir → Validar.**

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
- `SYSTEM_GENERATED` (derivado determinísticamente por CASEFlow, sin autoría manual ni IA — p. ej. el diagrama de casos de uso; Incremento 1F.1, §218.8)
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
- Generation Plan.
- Implementation Plan.
- Conceptual/Logical Data Model.
- API Contract.
- Construction Module.
- Endpoint.
- Generated Source File metadata.
- Generated Test Case.
- Generated Project Snapshot.

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
Screen / UI Blueprint
  ↓ REALIZED_BY
Architecture Component
  ↓ IMPLEMENTED_BY
API / Module / Entity / Source File
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

## 19.1 V1 — Primera versión funcional completa

V1 debe ser un producto I-CASE completo y demostrable. No se considera suficiente producir únicamente documentación o diagramas.

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
- mockups;
- `DesignSystemProfile`;
- revisión y aprobación del diseño previo a construcción.

### Integración CASE

- versionado;
- estados;
- revisiones;
- aprobación;
- evidencia;
- trazabilidad;
- Impact Analysis básico;
- Consistency Engine básico;
- auditoría.

### Construction & Code Generation

V1 MUST incluir:

- `TargetTemplate` único oficialmente soportado;
- `GenerationPlan`;
- modelo de dominio conceptual;
- revisión de UI/UX mediante UI Blueprints y mockups;
- `ImplementationPlan`;
- modelo de datos lógico/físico;
- generación de Prisma Schema y migraciones iniciales;
- generación de contratos REST/OpenAPI;
- generación de backend NestJS;
- generación de cliente TypeScript desde contratos API;
- generación de frontend Next.js/React;
- generación de pruebas;
- catálogo controlado de dependencias;
- validación en sandbox Docker;
- auto-repair limitado;
- `GeneratedProjectSnapshot`;
- trazabilidad hasta componentes de construcción;
- exportación ZIP del proyecto;
- instrucciones de ejecución;
- proyecto que pueda instalarse, probarse, compilarse y ejecutarse.

### Target Stack V1

El único stack de generación oficialmente soportado en V1 será:

```text
CASEFLOW_WEB_TS_V1

Language       → TypeScript
Frontend       → Next.js + React
UI             → Tailwind CSS + shadcn/ui
Forms          → React Hook Form + Zod
Server State   → TanStack Query
Backend        → NestJS
API            → REST + OpenAPI
ORM            → Prisma
Database       → PostgreSQL
Architecture   → Modular Monolith
Workspace      → pnpm workspaces
E2E            → Playwright
Containers     → Docker
```

La arquitectura deberá permitir incorporar otros `TargetTemplate` en versiones posteriores sin reescribir el núcleo.

### Documentación

- documentación viva;
- documentación técnica derivada;
- exportación Markdown/HTML/PDF;
- README del proyecto generado;
- `.env.example` del proyecto generado.

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
- asistencia para Generation Plan;
- asistencia para Implementation Plan;
- implementación de lógica de negocio no trivial;
- reparación controlada de errores de generación;
- resúmenes documentales.

## 19.2 V1.1 / V2

Capacidades que pueden ampliarse después de disponer de un producto V1 completo:

- actividad;
- secuencia;
- clases;
- componentes;
- despliegue;
- ER;
- estados;
- comparación avanzada de baselines;
- comentarios/menciones avanzados;
- Impact Analysis semántico avanzado;
- Consistency Engine semántico avanzado;
- BYOK completo;
- MFA;
- presupuestos de IA;
- roles personalizados;
- ProjectTemplate Builder;
- Project Assistant;
- integración Git;
- push automático a GitHub/GitLab;
- preview gestionado avanzado;
- despliegue automático;
- integración Figma;
- múltiples motores de diagramación.

## 19.3 V2/V3 — múltiples TargetTemplates y reverse engineering

Futuro:

- `CASEFLOW_DJANGO_REACT`;
- `CASEFLOW_SPRING_REACT`;
- stacks móviles;
- arquitecturas de microservicios;
- generación de CI/CD específica del proyecto;
- reverse engineering de repositorios externos;
- sincronización bidireccional con Git;
- plugins de generación;
- API pública;
- edición colaborativa avanzada;
- modelos locales avanzados;
- múltiples metodologías;
- plantillas personalizadas.

V1 deliberadamente soporta un solo Target Stack para garantizar calidad, trazabilidad y verificabilidad.

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
CodeGenerationEngine
SandboxExecutionProvider
SourceArchiveProvider
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

CASEFlow AI utilizará la abstracción:

```text
StorageProvider
```

Implementación S3-compatible preferida para desarrollo local:

```text
S3StorageProvider
→ SeaweedFS
```

Producción/futuro podrá utilizar la misma abstracción con:

```text
AWS S3
Cloudflare R2
otros servicios S3-compatible
```

Un `LocalStorageProvider` simple MAY mantenerse únicamente para tests o desarrollo puntual cuando no se requiera comportamiento S3.

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

TargetTemplate
TargetTemplateVersion
DesignSystemProfile
ApprovedDependency
GenerationPlan
GenerationPlanVersion
ImplementationPlan
ImplementationPlanVersion
GeneratedProjectSnapshot
GeneratedProjectFile
GenerationRun
GenerationStageRun
SandboxValidationRun
SandboxValidationFinding
CodeTraceLink

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
proposeGenerationPlan()
proposeImplementationPlan()
implementBusinessLogic()
repairGeneratedCode()
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

La generación de software debe degradarse de forma segura:

- las partes determinísticas y basadas en plantillas MAY continuar;
- CASEFlow AI MUST NOT fingir que puede completar lógica específica que requiera interpretación semántica si no dispone de un mecanismo válido;
- el usuario debe poder continuar manualmente y exportar el estado alcanzado;
- la indisponibilidad de IA no debe corromper un `GenerationPlan`, `ImplementationPlan` ni snapshot existente.

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
16. No generar código oficial antes de aprobar Generation Plan y diseño requerido.
17. No ejecutar código generado dentro del proceso principal de CASEFlow AI.
18. Utilizar el sandbox definido para instalar, probar y compilar proyectos generados.
19. No instalar dependencias fuera del catálogo aprobado sin validación explícita.
20. No sobrescribir silenciosamente código/snapshots generados previamente.

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

## Bloque 7

- autenticación propia y Argon2id;
- sesiones revocables;
- RBAC + reglas contextuales;
- aislamiento multi-tenant;
- archivos privados;
- auditoría de seguridad;
- EmailProvider + NotificationOutbox;
- MFA preparado para futuro.

## Bloque 8

- Docker y perfiles de despliegue;
- FREE-DEMO sustituible;
- CI/CD;
- observabilidad;
- backups y restore;
- escalabilidad horizontal;
- procesamiento asíncrono;
- política free-first, not free-at-all-costs.

## Bloque 9

- V1 como producto mínimo completo;
- P0/P1/P2;
- estrategia multinivel de pruebas;
- AI Evaluation Suite;
- Definition of Done;
- quality gates;
- generality test;
- release candidates.

## Bloque 10

- roadmap por vertical slices;
- orden de dependencias;
- checkpoints;
- hardening;
- feature freeze;
- prioridad de completar V1 antes de mejoras.

## Bloque 11 — Construction & Code Generation

- forward engineering como P0;
- Target Stack único `CASEFLOW_WEB_TS_V1`;
- Generation Plan antes de código;
- UI Blueprint + Stitch/fallback antes del backend definitivo;
- Design Baseline aprobada;
- Implementation Plan;
- generación híbrida determinística/templates/AST/IA;
- OpenAPI como puente frontend/backend;
- catálogo aprobado de dependencias;
- modular monolith;
- sandbox Docker;
- auto-repair limitado;
- GeneratedProjectSnapshot;
- trazabilidad requisito → diseño → código → prueba;
- ZIP ejecutable como salida V1;
- múltiples stacks posteriores mediante TargetTemplate.

---

# 66. Decisiones abiertas después de los Bloques 1–11

Las decisiones estructurales necesarias para iniciar V1 se consideran cerradas.

Las siguientes decisiones pueden resolverse durante implementación sin bloquear el comienzo:

## Implementación UI de CASEFlow AI

- branding visual definitivo;
- design tokens definitivos;
- layout final del producto CASEFlow;
- contenido de onboarding.

## AI

- proveedor inicial concreto;
- modelos iniciales;
- embedding model;
- configuración operativa final de OmniRoute;
- reranker futuro.

## Infraestructura

- proveedor exacto de API staging;
- proveedor exacto de PostgreSQL staging;
- proveedor exacto de Redis staging;
- proveedor exacto de correo staging;
- dominio público.

## Construction

- detalle final del esquema interno de `GenerationPlan`;
- detalle final del esquema interno de `ImplementationPlan`;
- estrategia exacta de generación de clientes OpenAPI;
- librería concreta de templates (`Handlebars`, `Eta` u otra equivalente);
- límites exactos de CPU/memoria/timeout del sandbox;
- política exacta de network allowlist del sandbox;
- formato interno final del `CodeTraceLink`;
- UX final del visor de generación;
- si la preview temporal entra en V1 o V1.1.

Estas decisiones MUST NOT contradecir silenciosamente decisiones aprobadas.

Una decisión que modifique arquitectura debe registrarse mediante DEC/ADR y reflejarse en esta especificación.

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
```

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

Los objetos en S3/SeaweedFS/R2 deben permanecer privados.

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
SeaweedFS (S3-compatible)
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
* una herramienta I-CASE funcional;
* una herramienta capaz de producir documentación y diseño;
* una herramienta capaz de generar al menos un proyecto web funcional dentro del Target Stack soportado.

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

### Gestión y seguridad

- Authentication.
- Workspace.
- Project.
- Project members.
- roles/permisos básicos.
- security isolation.
- basic audit.

### Knowledge / Analysis / Design

- Knowledge Sources.
- entrada manual.
- PDF/DOCX/TXT/Markdown.
- Actors.
- RF.
- RNF.
- Use Cases.
- edición manual.
- versionamiento.
- review/approval.
- evidencia.
- use case diagram.
- system architecture.
- software architecture.
- navigation tree.
- UI Blueprint.
- mockup funcional.
- traceability.
- basic Impact Analysis.
- basic Consistency Engine.

### Construction

- `TargetTemplate` `CASEFLOW_WEB_TS_V1`.
- `GenerationPlan`.
- conceptual domain model.
- mockup/UI review antes de construcción definitiva.
- Design Baseline aprobada.
- `ImplementationPlan`.
- Prisma schema/migrations.
- REST/OpenAPI contracts.
- NestJS backend generation.
- generated TypeScript API client.
- Next.js frontend generation.
- test generation.
- Approved Dependency Catalog.
- Docker sandbox validation.
- limited auto-repair.
- `GeneratedProjectSnapshot`.
- code traceability.
- ZIP export.
- README + `.env.example`.
- proyecto generado instalable, compilable y ejecutable.

### Documentation / AI / Generality

- live documentation.
- export documental.
- al menos un provider/gateway de IA operativo para tareas que lo requieran.
- candidate review.
- manual fallback.
- generality validation.

## 120.2 P1 — Alta prioridad

Debe intentarse incluir cuando no amenace P0:

- búsqueda híbrida completa;
- pgvector avanzado;
- semantic duplicate detection;
- semantic consistency;
- semantic impact analysis;
- comentarios;
- baseline comparison;
- Stitch como proveedor preferente;
- OmniRoute avanzado;
- email notifications;
- job progress en tiempo real;
- preview temporal gestionada del proyecto generado;
- visor/diff avanzado de archivos generados;
- reparación IA más sofisticada.

## 120.3 P2 — Posponible

Puede moverse a V1.1/V2:

- BYOK completo;
- MFA;
- roles personalizados;
- ProjectTemplate Builder;
- Figma integration;
- múltiples diagram engines;
- Project Assistant;
- collaborative real-time editing;
- advanced dashboards;
- advanced AI budgets;
- Git push automático;
- deployment automático;
- múltiples TargetTemplates;
- Django/Spring/mobile generation;
- reverse engineering.

Cuando exista conflicto:

```text
P0 > P1 > P2
```

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

Debe existir al menos un E2E principal que atraviese el ciclo I-CASE completo:

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
Architecture / Navigation
 ↓
UI Blueprint
 ↓
Mockup
 ↓
Design Approval
 ↓
Generation Plan
 ↓
Implementation Plan
 ↓
Code Generation
 ↓
Sandbox Validation
 ↓
Generated Project Snapshot
 ↓
ZIP Export
```

La prueba debe verificar, como mínimo:

- que los artefactos utilizados estén aprobados cuando la política lo exija;
- que la generación conserve trazabilidad;
- que el proyecto generado utilice el TargetTemplate esperado;
- que no existan dependencias fuera del catálogo sin aprobación;
- que `lint`, `typecheck`, `test` y `build` se ejecuten en sandbox;
- que el ZIP exportado contenga instrucciones y configuración reproducible.

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

Al menos dos de estos dominios deben recorrer también el pipeline de Construction hasta producir un proyecto generado válido.

El tercer proyecto debe poder gestionarse sin agregar lógica específica al núcleo.

Si implementar o generar un nuevo dominio soportado requiere modificar el núcleo de CASEFlow:

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
* está revisada cuando corresponde;
* conserva trazabilidad hacia/desde construcción cuando aplique;
* no rompe el pipeline de generación cuando afecte artefactos usados para construir software.

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

# 135.1 Definition of Done — Generated Project

Un `GeneratedProjectSnapshot` se considera válido únicamente cuando:

- fue producido desde un `GenerationPlan` aprobado;
- utiliza una Design Baseline válida;
- utiliza un `ImplementationPlan` identificable;
- pertenece a un `TargetTemplate` soportado;
- respeta el Approved Dependency Catalog;
- no contiene secretos reales;
- incluye `.env.example`;
- incluye README de ejecución;
- incluye schema/migraciones requeridas;
- incluye backend y frontend integrados;
- incluye pruebas mínimas derivadas del plan;
- conserva un manifest de trazabilidad;
- pasó las validaciones P0 del sandbox.

Validaciones P0 para `CASEFLOW_WEB_TS_V1`:

```text
install
format/lint
typecheck
test
build
```

Si una validación P0 falla después de agotar el auto-repair permitido:

```text
GeneratedProjectSnapshot.status = VALIDATION_FAILED
```

El resultado puede conservarse para diagnóstico, pero MUST NOT presentarse como proyecto generado exitosamente.

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

CASEFlow AI puede declararse `1.0.0` únicamente cuando sea posible demostrar el ciclo integral.

## Gestión

- autenticación;
- Workspace;
- Project;
- miembros;
- permisos básicos.

## Knowledge

- texto/documentos;
- procesamiento;
- fragmentos;
- evidencia;
- aislamiento.

## Analysis

- actores;
- RF;
- RNF;
- casos de uso;
- edición;
- versionado;
- review;
- approval.

## Design

- use case diagram;
- system architecture;
- software architecture;
- navigation tree;
- UI Blueprint;
- mockup;
- revisión/aprobación de diseño.

## Integration CASE

- relaciones;
- evidencia;
- trazabilidad;
- historial;
- approval;
- Impact Analysis básico;
- Consistency Engine básico.

## Construction

- Generation Plan aprobado;
- modelo conceptual;
- Design Baseline aprobada;
- Implementation Plan;
- TargetTemplate `CASEFLOW_WEB_TS_V1`;
- modelo lógico/físico;
- Prisma Schema/migrations;
- OpenAPI;
- backend NestJS;
- cliente API TypeScript;
- frontend Next.js/React;
- pruebas;
- sandbox aislado;
- auto-repair limitado;
- GeneratedProjectSnapshot;
- manifest de trazabilidad;
- ZIP ejecutable.

## Validación del proyecto generado

Al menos un proyecto representativo debe completar con éxito:

```text
install
→ lint
→ typecheck
→ test
→ build
```

y poder iniciarse siguiendo únicamente las instrucciones exportadas.

## AI

- al menos un provider/gateway operativo;
- candidate flow;
- evidence grounding;
- manual fallback;
- asistencia de construcción cuando la lógica lo requiera.

## Documentation

- living documentation;
- export funcional;
- documentación del proyecto generado.

## Generality

- varios dominios gestionables;
- al menos dos dominios deben demostrar generación de software sin modificar el núcleo.

## Security

- aislamiento entre usuarios/proyectos;
- código generado ejecutado únicamente en sandbox;
- sandbox sin secretos internos de CASEFlow.

## Operations

- despliegue reproducible de CASEFlow;
- CI verde;
- backup;
- restore probado.

V1 requiere cero bugs P0/P1 conocidos.

---

# 144. Bug Severity

## P0 — Blocker

* pérdida/corrupción de datos;
* bypass de autorización;
* aplicación no inicia;
* flujo central roto;
* ejecución de código generado fuera del sandbox definido;
* proyecto marcado como válido sin pasar validaciones P0;
* contaminación de un proyecto generado con datos/código de otro Project.

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

# 149. Bloque 11 extraordinario — Construction & Code Generation

El descubrimiento de que el proyecto I-CASE debe producir no solo documentación y diagramas sino también un proyecto de software completo y funcional modifica el alcance de V1.

Esta capacidad se incorpora como parte central del producto, no como un plugin decorativo.

CASEFlow AI debe realizar **forward engineering controlado**:

```text
Knowledge
   ↓
Analysis
   ↓
Approved Requirements
   ↓
Use Cases
   ↓
Architecture / Navigation
   ↓
Generation Plan
   ↓
Conceptual Domain Model
   ↓
UI Blueprints
   ↓
Mockups
   ↓
Human Design Review
   ↓
Approved Design Baseline
   ↓
Implementation Plan
   ↓
Logical / Physical Data Model
   ↓
API Contracts
   ↓
Backend + Frontend + Tests
   ↓
Sandbox Validation
   ↓
Generated Project Snapshot
   ↓
ZIP / Preview
```

La generación de software NO debe interpretarse como:

> “Enviar todo el proyecto a un LLM y aceptar cientos de archivos sin validación.”

La implementación debe ser incremental, auditable, trazable y verificable.

---

# 150. Definición de proyecto generado funcional

Para V1, un **proyecto generado funcional** es una aplicación web cuya implementación:

- deriva de artefactos aprobados de CASEFlow AI;
- utiliza el TargetTemplate soportado;
- incluye frontend y backend;
- incluye persistencia PostgreSQL/Prisma;
- implementa navegación y flujos P0 derivados de requisitos/casos de uso;
- incorpora autenticación/autorización cuando el proyecto aprobado lo requiera;
- incluye validaciones principales;
- contiene pruebas mínimas derivadas de los criterios de aceptación y flujos;
- contiene configuración reproducible;
- contiene README;
- contiene `.env.example`;
- puede instalarse;
- puede pasar lint;
- puede pasar typecheck;
- puede pasar tests;
- puede compilarse;
- puede iniciarse siguiendo las instrucciones exportadas.

V1 **NO promete** que cualquier software imaginable pueda convertirse automáticamente en un sistema listo para producción sin revisión humana.

La promesa de V1 es más concreta:

> **CASEFlow AI genera aplicaciones web funcionales y verificables dentro de un Target Stack oficialmente soportado, a partir de artefactos aprobados y trazables.**

---

# 151. TargetTemplate

## 151.1 Propósito

`TargetTemplate` describe una familia de software que CASEFlow AI sabe construir.

Debe definir, como mínimo:

- identifier;
- versión;
- lenguaje;
- frontend framework;
- backend framework;
- arquitectura;
- API style;
- ORM;
- database;
- UI stack;
- testing stack;
- generación soportada;
- reglas de código;
- catálogo de dependencias;
- comandos de validación;
- capacidades opcionales.

## 151.2 TargetTemplate V1

V1 incluirá únicamente:

```text
CASEFLOW_WEB_TS_V1
```

La limitación a un único TargetTemplate es deliberada.

Se prioriza:

- consistencia;
- verificabilidad;
- calidad;
- velocidad de desarrollo;
- menor superficie de fallos.

## 151.3 Futuro

La arquitectura puede soportar:

```text
CASEFLOW_WEB_TS_V1
CASEFLOW_DJANGO_REACT
CASEFLOW_SPRING_REACT
CASEFLOW_MOBILE
CASEFLOW_MICROSERVICES
```

La existencia futura de estos templates no debe introducir abstracciones innecesarias antes de necesitarlas.

---

# 152. Target Stack oficial de V1

```text
Language       → TypeScript

Frontend
├── Next.js
├── React
├── Tailwind CSS
├── shadcn/ui
├── React Hook Form
├── Zod
└── TanStack Query

Backend
├── NestJS
├── REST
└── OpenAPI

Persistence
├── Prisma
└── PostgreSQL

Architecture
└── Modular Monolith

Workspace
└── pnpm workspaces

Testing
├── unit/integration stack del repositorio
└── Playwright para E2E

Runtime / validation
└── Docker
```

CASEFlow AI y los proyectos generados pueden compartir TypeScript, pero son productos/repositorios lógicamente independientes.

---

# 153. Arquitectura del proyecto generado

V1 utilizará un **modular monolith**.

Estructura conceptual:

```text
generated-project/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   └── api-client/
├── prisma/
├── docker/
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

El backend se divide en módulos funcionales:

```text
AuthModule
UsersModule
ProductsModule
OrdersModule
InventoryModule
...
```

Los nombres dependen del proyecto.

Cada módulo puede contener:

```text
controller
service
dto
domain/application rules
persistence integration
tests
```

V1 no generará microservicios salvo que una decisión futura modifique el TargetTemplate.

---

# 154. DesignSystemProfile

La generación visual debe compartir reglas entre mockups y frontend.

V1 incluirá:

```text
CASEFLOW_STANDARD_WEB_V1
```

Este perfil define, como mínimo:

```text
UI library     → shadcn/ui
Styling        → Tailwind CSS
Icons          → Lucide
Forms          → React Hook Form + Zod
Server state   → TanStack Query
Navigation     → responsive application navigation
Tables         → reusable standard data tables
Dialogs        → standard accessible dialogs
Feedback       → consistent toast/alert patterns
```

`DesignSystemProfile` es configuración estructurada.

No debe convertirse en un prompt libre sin versión.

---

# 155. Approved Dependency Catalog

Cada `TargetTemplateVersion` debe tener un catálogo de dependencias permitidas.

Ejemplo conceptual:

```text
Framework
✓ next
✓ react
✓ @nestjs/*
✓ prisma

UI
✓ tailwindcss
✓ shadcn-compatible components
✓ lucide-react

Forms / Validation
✓ react-hook-form
✓ zod

Server state
✓ @tanstack/react-query

Testing
✓ approved testing packages
```

La IA **MUST NOT** instalar libremente cualquier paquete encontrado o imaginado.

Si una capacidad requiere una dependencia no aprobada:

```text
DependencyProposal
        ↓
Validation / Human decision
        ↓
ApprovedDependency
```

o la generación debe resolver la necesidad mediante herramientas ya disponibles.

El catálogo debe versionarse con el TargetTemplate.

---

# 156. GenerationPlan

## 156.1 Objetivo

`GenerationPlan` responde:

> **¿Qué sistema vamos a construir?**

Debe existir antes de la generación oficial.

## 156.2 Entradas

Puede derivarse de:

- requisitos aprobados;
- RNF relevantes;
- actores;
- casos de uso;
- reglas de negocio;
- restricciones;
- arquitectura aprobada;
- ADR;
- navegación existente;
- UI Blueprint existente;
- glosario.

## 156.3 Contenido mínimo

Debe incluir:

- módulos funcionales propuestos;
- entidades conceptuales;
- actores/roles relevantes;
- workflows principales;
- pantallas previstas;
- navegación;
- integraciones externas;
- requisitos de autenticación/autorización;
- requisitos técnicos relevantes;
- riesgos;
- trazabilidad de cada elemento.

## 156.4 Estado

Conceptualmente:

```text
DRAFT
GENERATED
IN_REVIEW
APPROVED
CHANGES_REQUESTED
SUPERSEDED
```

## 156.5 Gate

CASEFlow AI MUST NOT comenzar una generación oficial de código si el `GenerationPlan` requerido no está aprobado.

---

# 157. Conceptual Domain Model

Después o como parte del Generation Plan debe existir un modelo conceptual del dominio.

Ejemplo:

```text
User
Product
Category
Order
OrderItem
Payment
```

Este modelo:

- identifica conceptos;
- identifica relaciones;
- NO es todavía el Prisma Schema definitivo;
- puede evolucionar durante la revisión de UI/UX;
- debe conservar trazabilidad hacia requisitos y casos de uso.

Separación:

```text
Conceptual Model
      ↓
Design Review
      ↓
Logical Model
      ↓
Physical Model / Prisma
```

---

# 158. UI/UX antes de la implementación definitiva

CASEFlow AI debe validar la interacción del usuario antes de congelar backend y persistencia definitivos.

Secuencia:

```text
GenerationPlan
      ↓
Conceptual Domain Model
      ↓
Navigation Tree
      ↓
UI Blueprints
      ↓
Mockups
      ↓
Human Design Review
```

Este orden permite detectar:

- campos omitidos;
- acciones faltantes;
- navegación incorrecta;
- workflows incompletos;
- decisiones que implican datos adicionales;
- inconsistencias entre requisito y pantalla;

antes de generar grandes cantidades de código.

---

# 159. Generación de mockups

La fuente canónica continúa siendo:

```text
UIBlueprint
```

La representación visual se obtiene mediante:

```text
UIBlueprint
     │
     ├── StitchMockupProvider
     │
     └── InternalWireframeRenderer
```

Stitch será el proveedor preferente cuando esté disponible y resulte adecuado.

CASEFlow AI MUST NOT depender de Stitch para conservar o interpretar el diseño.

Contexto recomendado para un proveedor externo:

```text
UIBlueprint
+
NavigationTree
+
Requirements
+
UseCases
+
DesignSystemProfile
+
TargetTemplate UI constraints
```

---

# 160. Human Design Review y Design Baseline

El usuario debe poder:

- aprobar diseño;
- editar UI Blueprint;
- regenerar mockup;
- solicitar cambios;
- justificar excepciones.

Cuando el conjunto requerido de diseño se estabiliza se crea/congela una:

```text
DESIGN_BASELINE
```

Esta baseline puede contener versiones exactas de:

- requisitos relevantes;
- casos de uso;
- arquitectura;
- navegación;
- UI Blueprints;
- ADR.

La generación oficial debe registrar qué Design Baseline utilizó.

---

# 161. ImplementationPlan

`ImplementationPlan` responde:

> **¿Cómo exactamente construiremos el sistema aprobado?**

Se produce después del Design Gate.

Debe mapear, cuando aplique:

- módulos NestJS;
- entidades persistentes;
- relaciones;
- DTO;
- endpoints;
- políticas de autorización;
- servicios;
- Next.js routes;
- screens;
- forms;
- tables;
- reusable components;
- API client operations;
- tests;
- environment variables;
- external adapters.

Ejemplo:

```text
CU-006 Gestionar productos
  ↓
ProductsModule
  ↓
GET /products
POST /products
PATCH /products/{id}
  ↓
ProductsPage
CreateProductDialog
EditProductDialog
  ↓
ProductService tests
ProductsPage E2E
```

El ImplementationPlan debe ser versionable y revisable.

---

# 162. Modelo lógico y físico

Después del Design Gate se finalizan:

```text
Conceptual Domain Model
        ↓
Logical Data Model
        ↓
Physical Data Model
        ↓
Prisma Schema
```

La generación debe respetar:

- 3FN cuando sea apropiado;
- constraints;
- FK;
- unique constraints;
- índices;
- tipos;
- nullability;
- trazabilidad;
- requisitos de seguridad.

La IA puede sugerir el modelo, pero el esquema final pasa por validación determinística y revisión cuando corresponda.

---

# 163. Estrategia híbrida de generación

CASEFlow AI NO utilizará un único mecanismo para generar todo.

Debe combinar:

```text
Templates
+
Deterministic Generation
+
AST Transformations
+
AI Assistance
```

## 163.1 Determinístico

Adecuado para:

- estructura del workspace;
- configuración;
- Dockerfiles;
- `.env.example`;
- tsconfig;
- módulos registrados;
- contratos repetibles;
- rutas predecibles;
- API clients;
- boilerplate;
- manifests.

## 163.2 Templates

Adecuado para:

- módulos estándar;
- CRUD;
- formularios estándar;
- tablas;
- layout;
- paginación;
- respuestas de error;
- configuración repetible.

## 163.3 AST

Adecuado para cambios estructurales TypeScript donde editar strings sea frágil.

## 163.4 IA

Adecuada para:

- reglas de negocio específicas;
- workflows no triviales;
- validaciones semánticas;
- lógica derivada;
- adaptación de componentes complejos;
- generación/reparación acotada que requiera razonamiento.

La IA no debe generar de nuevo archivos enteros si una modificación estructural determinística resulta suficiente.

---

# 164. Template Engine

CASEFlow AI utilizará un motor de templates interno detrás de una abstracción propia.

La implementación concreta puede ser:

- Handlebars;
- Eta;
- otra alternativa equivalente.

La decisión concreta puede tomarse durante Foundation/Construction implementation.

Los templates:

- deben versionarse junto al TargetTemplate;
- deben probarse;
- no deben contener secretos;
- deben producir resultados reproducibles a partir de la misma entrada.

---

# 165. Transformaciones TypeScript con AST

`ts-morph` será la opción inicial recomendada cuando se necesite manipular TypeScript estructuralmente.

Casos:

- agregar imports;
- registrar módulos;
- crear métodos;
- añadir propiedades;
- modificar arrays de metadata;
- analizar exports;
- validar estructura.

Preferir AST sobre reemplazos frágiles de texto cuando la operación requiera comprender código TypeScript.

No utilizar AST mecánicamente cuando un template simple sea suficiente.

---

# 166. OpenAPI como contrato de integración

El backend generado será responsable del contrato API.

Flujo:

```text
ImplementationPlan
      ↓
NestJS DTO / Controllers
      ↓
OpenAPI
      ↓
Generated TypeScript API Client
      ↓
Next.js
```

Objetivo:

- evitar duplicar contratos manualmente;
- reducir inconsistencias frontend/backend;
- permitir validación;
- mantener trazabilidad.

El frontend generado SHOULD consumir el cliente/API layer oficial en lugar de duplicar manualmente cada contrato.

---

# 167. Generación de backend

El generador NestJS debe producir según el plan:

- modules;
- controllers;
- services;
- DTO;
- authorization guards/policies cuando correspondan;
- persistence access;
- validation;
- error handling;
- OpenAPI metadata;
- tests.

Reglas:

- controllers SHOULD mantenerse delgados;
- lógica de aplicación/dominio no debe concentrarse en controllers;
- input externo debe validarse;
- acceso a datos debe respetar las fronteras definidas;
- secretos no deben incorporarse al código;
- endpoints deben derivar del ImplementationPlan.

---

# 168. Cliente API generado

CASEFlow AI debe generar o derivar un cliente TypeScript a partir de OpenAPI.

El cliente:

- centraliza acceso al API;
- contiene tipos;
- evita llamadas dispersas sin contrato;
- permite que TanStack Query consuma operaciones consistentes.

La estrategia concreta de codegen OpenAPI puede definirse durante implementación.

---

# 169. Generación de frontend

El frontend se genera desde:

```text
Approved UI Blueprints
+
Navigation Tree
+
DesignSystemProfile
+
ImplementationPlan
+
Generated API Client
```

Debe producir:

- routes;
- layouts;
- navigation;
- forms;
- tables;
- dialogs;
- loading states;
- empty states;
- success/error feedback;
- authorization-aware UI cuando aplique;
- responsive behavior;
- accessibility básica.

El mockup es guía visual.

El `UIBlueprint` y `DesignSystemProfile` son fuentes estructuradas.

---

# 170. Generación de pruebas

La generación debe crear pruebas proporcionalmente al artefacto.

Fuentes posibles:

```text
Requirement acceptance criteria
Use Case flows
Business rules
RNF verification method
ImplementationPlan
```

Tipos:

- unit;
- integration;
- E2E para flujos principales.

Ejemplo:

```text
RF-014
Acceptance Criterion AC-03
       ↓
TEST-021
       ↓
OrdersService / POST /orders
```

No se exige generar cobertura perfecta automáticamente.

Sí se exige que los tests P0 generados sean ejecutables y formen parte de la validación.

---

# 171. Artefactos de construcción y trazabilidad

La trazabilidad se amplía.

Ejemplo:

```text
SourceFragment
  ↓
RF-014
  ↓
CU-005
  ↓
UI-004
  ↓
ImplementationPlan item
  ↓
POST /orders
  ↓
OrdersModule
  ↓
orders.service.ts
  ↓
TEST-021
```

Tipos de construcción relevantes pueden incluir:

```text
DATA_MODEL
DATABASE_SCHEMA
API_CONTRACT
MODULE
ENDPOINT
SCREEN_IMPLEMENTATION
COMPONENT
TEST_CASE
SOURCE_FILE
BUILD
GENERATED_PROJECT
```

No es necesario convertir cada línea de código en un Artifact.

Debe conservarse granularidad suficiente para:

- Impact Analysis;
- traceability;
- regeneration decisions;
- validation;
- auditoría.

---

# 172. GeneratedProjectSnapshot

Cada generación oficial produce un snapshot identificable.

Ejemplo:

```text
GEN-001
Project: RestGest Mateos
TargetTemplate: CASEFLOW_WEB_TS_V1
GenerationPlan: GP-001 v2
DesignBaseline: DESIGN_1.0
ImplementationPlan: IP-001 v1
Status: VALID
```

Debe registrar:

- project;
- target template/version;
- generation plan/version;
- design baseline;
- implementation plan/version;
- timestamp;
- initiator;
- generation runs;
- archive/storage reference;
- manifest;
- hashes;
- validation result;
- traceability manifest.

Un snapshot formalizado es inmutable.

Una nueva generación produce otro snapshot.

---

# 173. Regeneración y cambios posteriores

CASEFlow AI MUST NOT sobrescribir silenciosamente un snapshot anterior.

Si cambia:

```text
RF-014 v3 → RF-014 v4
```

Impact Analysis puede detectar:

```text
CU-005
UI-004
POST /orders
OrdersService
TEST-021
```

El usuario puede decidir:

- mantener;
- revisar;
- regenerar elemento afectado;
- crear nueva generación;
- justificar que no aplica.

V1 no realizará sincronización bidireccional automática de cambios realizados externamente después de descargar el ZIP.

Reverse engineering / importación de cambios desde Git queda para una fase futura.

---

# 174. SandboxExecutionProvider

El código generado **MUST NOT** ejecutarse dentro del proceso principal de CASEFlow AI.

Debe existir:

```text
SandboxExecutionProvider
```

V1 podrá utilizar Docker como implementación.

El sandbox debe aislar:

- filesystem;
- procesos;
- variables;
- secretos;
- recursos;
- red cuando sea posible.

Requisitos:

- no recibir secretos internos de CASEFlow;
- no montar directorios sensibles del host;
- no utilizar modo privilegiado;
- aplicar timeout;
- aplicar límites de CPU/memoria;
- utilizar workspace temporal;
- destruir/limpiar recursos temporales de forma segura;
- registrar resultados de comandos.

La instalación de dependencias puede requerir acceso a un registry aprobado.

Después de instalar, las etapas posteriores SHOULD operar sin red o con egress mínimo/allowlist cuando sea viable.

---

# 175. Pipeline de validación del proyecto generado

Estados conceptuales:

```text
PLANNED
GENERATING
GENERATED
INSTALLING
LINTING
TYPECHECKING
TESTING
BUILDING
VALIDATING
READY
```

Fallos:

```text
GENERATION_FAILED
INSTALL_FAILED
LINT_FAILED
TYPECHECK_FAILED
TEST_FAILED
BUILD_FAILED
VALIDATION_FAILED
CANCELLED
```

Pipeline P0:

```text
Generate
  ↓
Install
  ↓
Lint / Format validation
  ↓
Typecheck
  ↓
Tests
  ↓
Build
  ↓
Structural validation
  ↓
Traceability validation
  ↓
READY
```

CASEFlow debe mostrar qué etapa falló y evidencia del fallo sin exponer secretos.

---

# 176. Auto-repair controlado

CASEFlow AI puede intentar reparar un proyecto generado cuando falle una etapa.

Regla inicial:

```text
MAX_AUTO_REPAIR_ROUNDS = 3
```

Cada ronda:

1. captura diagnóstico relevante;
2. determina archivos permitidos;
3. construye contexto mínimo;
4. solicita o aplica reparación;
5. registra diff;
6. repite validación afectada;
7. continúa solo si la reparación es válida.

No se permiten ciclos autónomos infinitos.

Después del máximo:

```text
VALIDATION_FAILED
```

y el usuario recibe el diagnóstico para revisión manual.

Una reparación no debe modificar artefactos aprobados de análisis/diseño para “hacer pasar” el código.

Si descubre una inconsistencia aguas arriba, debe crear un finding.

---

# 177. Preview y exportación

## 177.1 ZIP — P0

V1 debe exportar un ZIP que contenga:

- código fuente;
- lockfile;
- workspace config;
- Prisma schema/migrations requeridas;
- `.env.example`;
- Dockerfiles/Compose requerido por el TargetTemplate;
- README;
- instrucciones de instalación;
- instrucciones de ejecución;
- pruebas;
- manifest de generación/trazabilidad apropiado.

No debe contener:

- secretos reales;
- tokens;
- credenciales CASEFlow;
- caches innecesarios;
- `node_modules`.

## 177.2 Preview — P1

CASEFlow puede iniciar temporalmente el proyecto generado dentro de un entorno controlado y ofrecer una preview.

La preview es altamente deseable para demostración, pero no bloquea V1 si el ZIP generado:

- pasa validaciones;
- puede iniciarse reproduciblemente fuera del sandbox.

## 177.3 Futuro

- crear repositorio Git;
- push GitHub/GitLab;
- deploy automático;
- environments generados.

---

# 178. Seguridad de Construction

Además de la seguridad general:

- código generado se considera no confiable hasta validarse;
- ningún LLM recibe secretos del runtime;
- ningún proyecto generado recibe credenciales internas de CASEFlow;
- dependencias se limitan mediante catálogo;
- logs de build deben sanitizarse;
- archives deben almacenarse como objetos privados;
- descargas requieren autorización;
- Project A no puede utilizar artefactos/código de Project B;
- sandbox debe tener lifecycle limitado;
- comandos ejecutables deben provenir del TargetTemplate/validator, no de texto arbitrario devuelto por un modelo.

La IA puede proponer cambios de archivos, pero no comandos arbitrarios con privilegios sobre el host.

---

# 179. Definition of Done — Construction Pipeline

Construction V1 se considera DONE cuando:

1. un usuario puede seleccionar el TargetTemplate;
2. CASEFlow genera/revisa un GenerationPlan;
3. existe modelo conceptual;
4. se producen UI Blueprints;
5. se genera mockup mediante Stitch o fallback;
6. el usuario puede aprobar una Design Baseline;
7. se genera/revisa ImplementationPlan;
8. se genera modelo lógico/físico;
9. se produce Prisma Schema;
10. se producen contratos/API;
11. se genera backend;
12. se genera API client;
13. se genera frontend;
14. se generan pruebas;
15. el proyecto se valida en sandbox;
16. el auto-repair respeta su límite;
17. se genera GeneratedProjectSnapshot;
18. existe trazabilidad hasta construcción;
19. el ZIP se exporta;
20. el proyecto puede ejecutarse siguiendo su README.

---

# 180. Roadmap de implementación actualizado

CASEFlow AI seguirá vertical slices y gates.

Orden actualizado:

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
Design Foundations
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
Construction Foundation
 ↓
Generation Plan
 ↓
UI/Mockup Design Gate
 ↓
Implementation Plan
 ↓
Code Generation
 ↓
Sandbox Validation
 ↓
Generated Project Export
 ↓
Collaboration / Notifications
 ↓
Hardening
 ↓
Generality Validation
 ↓
Demo Hardening
 ↓
Release Candidate
 ↓
1.0.0
```

P0 anterior incompleto tiene prioridad sobre P1/P2 posterior.

> **Nota de priorización (DEC-115):** el orden anterior describe el orden de dependencias a largo plazo. La planificación inmediata de calendario fue reordenada alrededor del **Primer Entregable Funcional (First Deliverable MVP)**. Ver §217–§219. Ningún elemento de este roadmap fue eliminado; Identity, Workspace, RBAC, Knowledge Base, RAG, Construction y Code Generation fueron repriorizados, no cancelados.

---

# 181. Incremento 0 — Foundation

Implementar:

- monorepo;
- pnpm workspaces;
- Next.js;
- NestJS;
- worker;
- Prisma;
- PostgreSQL + pgvector;
- Redis;
- SeaweedFS S3-compatible;
- Mailpit;
- TypeScript;
- ESLint;
- Prettier;
- Docker Compose;
- `.env.example`;
- CI inicial.

Gate:

```text
install
lint
typecheck
test
build
```

Release objetivo conceptual:

```text
0.1.0
```

---

# 182. Incremento 1 — Identity / Workspace / Project

Implementar:

- registration;
- login/logout;
- rotating refresh sessions;
- Workspace;
- memberships;
- Project;
- template inicial;
- phases;
- roles;
- authorization;
- audit inicial.

Gate:

- usuario autorizado accede;
- usuario no autorizado no accede;
- aislamiento probado.

> **Nota de priorización (DEC-115):** este incremento **no** es el siguiente en el calendario inmediato. Su implementación completa (registration, login, sesiones, memberships, RBAC) queda diferida hasta después del Primer Entregable (§218, Incremento 1J). El Incremento 1A introduce únicamente la relación estructural mínima `Workspace → Project` para no contradecir este modelo.

---

# 183. Incremento 2 — Artifact Core

> **Nota de priorización (DEC-115):** la base de identidad/versión de `Artifact` y `ArtifactVersion` se adelanta en el Incremento 1A (§218). Este incremento conserva el alcance restante: ReviewRequest, ReviewDecision, approval, archive, audit y edición de borradores.

Implementar:

- Artifact;
- ArtifactVersion;
- lifecycle;
- ReviewRequest;
- ReviewDecision;
- approval;
- archive;
- audit;
- codes;
- version immutability.

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

---

# 184. Incremento 3 — Knowledge Base

Implementar P0:

- manual text;
- TXT;
- Markdown;
- PDF;
- DOCX;
- hash/dedupe;
- extraction;
- fragments;
- full-text search;
- evidence references.

Después incorporar pgvector/hybrid search.

Gate:

> una fuente puede procesarse, visualizarse y convertirse en evidencia.

---

# 185. Incremento 4 — Manual Analysis

Implementar:

- Actor;
- Stakeholder;
- RF;
- RNF;
- Business Rule;
- Constraint;
- Assumption;
- Glossary;
- AcceptanceCriterion;
- Evidence.

Gate:

> análisis completo manual sin IA.

---

# 186. Incremento 5 — AI-assisted Analysis

Implementar:

- AIOrchestrator;
- ModelRouter;
- AIExecutionGateway;
- ContextBuilder;
- PromptTemplate/Version;
- AIRun;
- ArtifactCandidate.

Primera tarea:

> extracción de candidatos a requisitos con evidencia.

Después:

- actores;
- RNF;
- reglas;
- casos de uso.

Gate:

> IA genera candidatos; humano conserva control.

---

# 187. Incremento 6 — Use Cases

Implementar:

- UseCase;
- actors;
- pre/postconditions;
- flows;
- steps;
- requirements linkage;
- manual creation;
- AI assistance;
- use-case diagram.

Gate:

> casos de uso aprobables y trazables.

---

# 188. Incremento 7 — Design Foundations

Implementar:

- System Architecture;
- Software Architecture;
- ADR;
- Navigation Tree;
- UI Blueprint;
- DesignSystemProfile;
- InternalWireframeRenderer.

Stitch puede agregarse cuando el adapter esté listo.

Gate:

> Use Case → UI/Architecture trazable.

---

# 189. Incremento 8 — Traceability

Implementar:

- ArtifactRelationship;
- RelationshipType;
- RelationshipValidation;
- incoming/outgoing views;
- traceability matrix.

Gate:

```text
Source
→ Requirement
→ Use Case
→ UI
→ Architecture
```

navegable en ambos sentidos.

---

# 190. Incremento 9 — Impact Analysis

Primero determinístico:

- version changes;
- relationships;
- dependencies;
- baselines.

Después semántico si el tiempo permite.

Gate:

> un cambio aguas arriba identifica dependencias potencialmente afectadas.

---

# 191. Incremento 10 — Consistency Engine

Reglas P0:

- RNF missing metric;
- requirement without acceptance criteria;
- approved requirement without expected downstream relationship;
- obsolete relationship;
- orphan actor;
- stale architecture/design dependency.

Gate:

> inconsistencias intencionales producen findings correctos.

---

# 192. Incremento 11 — Baselines

Implementar:

- Baseline;
- BaselineItem;
- freeze;
- basic compare;
- analysis/design baseline types cuando corresponda.

Gate:

> una baseline congelada no cambia.

---

# 193. Incremento 12 — Living Documentation

Generar desde:

```text
Approved Artifacts
+
Project Metadata
+
Traceability
```

Export P0:

- Markdown;
- HTML;
- PDF.

Gate:

> documentación actualizada sin copiar manualmente los artefactos.

---

# 194. Incremento 13 — Construction Foundation

Implementar:

- TargetTemplate;
- TargetTemplateVersion;
- DesignSystemProfile;
- ApprovedDependency;
- GenerationPlan;
- ImplementationPlan;
- GenerationRun;
- GeneratedProjectSnapshot;
- CodeTraceLink;
- CodeGenerationEngine;
- SandboxExecutionProvider contract.

También:

- templates base;
- catálogo de dependencias;
- coding standard del TargetTemplate.

Gate:

> CASEFlow puede representar y versionar una futura generación sin generar todavía el proyecto completo.

---

# 195. Incremento 14 — Generation Plan + Design Gate

Implementar:

```text
Approved Analysis
→ GenerationPlan
→ Conceptual Model
→ Navigation/UIBlueprint
→ Mockup
→ Human Review
→ DESIGN_BASELINE
```

Stitch:

- preferente cuando esté operativo;
- fallback interno siempre disponible.

Gate:

> no existe generación oficial sin plan y diseño requerido aprobados.

---

# 196. Incremento 15 — Implementation Plan + Data/API

Implementar:

```text
Design Baseline
→ ImplementationPlan
→ Logical Model
→ Physical Model
→ Prisma Schema
→ REST/OpenAPI contracts
```

Gate:

- modelo válido;
- Prisma validate pasa;
- endpoints mapeados a requisitos/use cases;
- dependencias permitidas.

---

# 197. Incremento 16 — Backend / Client / Frontend Generation

Implementar incrementalmente:

```text
NestJS Backend
      ↓
OpenAPI
      ↓
TypeScript API Client
      ↓
Next.js Frontend
```

Combinar:

- templates;
- deterministic generation;
- ts-morph cuando corresponda;
- AI para lógica específica.

Gate:

> aplicación generada estructuralmente completa.

---

# 198. Incremento 17 — Tests / Sandbox / Auto-repair / Export

Implementar:

- generated tests;
- sandbox Docker;
- resource limits;
- command allowlist;
- install;
- lint;
- typecheck;
- test;
- build;
- structural validation;
- max 3 auto-repair rounds;
- snapshot;
- ZIP.

Gate:

```text
READY
```

solo si todas las validaciones P0 pasan.

---

# 199. Incremento 18 — Collaboration / Notifications

Implementar según prioridad disponible:

- comments;
- ReviewRequest;
- NotificationOutbox;
- Mailpit;
- EmailProvider;
- review notifications.

Una falla de email no bloquea negocio.

---

# 200. Incremento 19 — Hardening

Detener expansión funcional significativa.

Prioridades:

- P0/P1 bugs;
- authorization;
- sandbox security;
- project isolation;
- code generation reproducibility;
- migrations;
- indexes;
- performance;
- accessibility;
- tests;
- SonarQube;
- Trivy;
- deployment;
- backup/restore.

---

# 201. Incremento 20 — Generality Validation

Probar:

- RestGest Mateos;
- Tutorías Académicas;
- Sistema de Inventario.

Al menos dos deben completar:

```text
Artifacts
→ Design
→ Generation Plan
→ Code
→ Validation
→ ZIP
```

sin modificar el core para ese dominio.

---

# 202. Incremento 21 — Demo Hardening

Preparar:

- demo seeds;
- proyectos de respaldo;
- fuentes;
- AI fallback;
- Stitch fallback;
- generated snapshot válido;
- ZIP prevalidado;
- procedimiento de preview si está disponible;
- contingencia sin Internet.

---

# 203. Incremento 22 — Release Candidate

Publicar:

```text
1.0.0-rc.1
```

Ejecutar:

- full E2E;
- generated-project E2E;
- isolation;
- sandbox security;
- AI evaluation;
- migrations;
- backup/restore;
- exports;
- generality;
- demo rehearsal.

No liberar con P0/P1 conocidos.

---

# 204. Estrategia de vertical slices

Cada incremento debe dejar el producto ejecutable.

Ejemplo de Requirements:

```text
DB
→ Domain
→ API
→ Authorization
→ Frontend
→ Tests
→ Audit
```

Ejemplo de Construction:

```text
GenerationPlan
→ persisted model
→ API
→ UI review
→ tests
→ traceability
```

Luego:

```text
BackendGeneration
→ files
→ sandbox
→ validation
→ UI results
```

No construir todas las capas en aislamiento durante semanas.

---

# 205. Trabajo paralelo

El equipo puede paralelizar dentro del mismo objetivo integrado.

Ejemplo durante Construction:

```text
Developer A → GenerationPlan/domain model
Developer B → template/code engine
Developer C → UI/Design Gate
Developer D → sandbox/validation
Developer E → tests/traceability
Developer F → AI generation/repair
```

Todos deben respetar contratos compartidos.

---

# 206. Pull Requests

Cada PR debe resolver una unidad coherente.

Ejemplos:

```text
feat(generation): add target template persistence
feat(mockups): add design approval gate
feat(codegen): generate NestJS module skeleton
feat(sandbox): validate generated project build
```

Evitar PR que mezcle múltiples etapas no relacionadas.

---

# 207. Uso de agentes de código

Los agentes deben leer:

```text
AGENTS.md
docs/CASEFLOW_AI_SPEC.md
ADRs relevantes
```

Una tarea debe indicar:

- objetivo;
- contexto;
- constraints;
- alcance;
- tests;
- gate esperado.

No solicitar genéricamente:

> “Construye todo CASEFlow.”

---

# 208. Regla de roadmap para agentes

Un agente MUST NOT:

- implementar P1/P2 si bloquea P0;
- saltar el Design Gate;
- generar código oficial antes de aprobar el plan requerido;
- ejecutar código generado fuera del sandbox;
- instalar dependencias arbitrarias;
- sobrescribir snapshots;
- reinterpretar el TargetTemplate por iniciativa propia;
- introducir otro stack sin decisión explícita.

---

# 209. Checkpoints de arquitectura

## Checkpoint A — Artifact Core

Verificar:

- identity/version;
- immutability;
- review;
- approval.

## Checkpoint B — Manual Analysis

Verificar:

> CASEFlow funciona sin IA.

## Checkpoint C — AI Layer

Verificar:

> IA produce candidates y no contamina artefactos oficiales.

## Checkpoint D — Design

Verificar:

> análisis y diseño están trazados.

## Checkpoint E — Construction Planning

Verificar:

> GenerationPlan + Design Gate + ImplementationPlan son coherentes.

## Checkpoint F — Code Generation

Verificar:

> generated project passes sandbox P0 validations.

## Checkpoint G — Pre-RC

Verificar:

> flujo I-CASE completo en varios dominios.

---

# 210. Después de V1

Antes de `1.0.0`:

> completar el producto I-CASE integral.

Después:

> mejorar, ampliar stacks y diferenciar.

Evoluciones candidatas:

```text
1.1 → preview/deployment improvements
1.2 → additional diagrams
1.3 → Project Assistant
1.4 → BYOK + model analytics
1.5 → ProjectTemplate Builder
1.6 → Git integration
1.7 → richer code regeneration
2.0 → additional TargetTemplates / reverse engineering
```

La secuencia se prioriza por valor/impacto/riesgo.

---

# 211. Principio final de implementación

> **CASEFlow AI será desarrollado mediante incrementos verticales integrables. Cada incremento debe dejar el producto ejecutable y verificable. V1 debe completar el ciclo Knowledge → Analysis → Design → Construction → Validation → Export. La IA y los servicios externos apoyan el proceso, pero no sustituyen el núcleo determinístico, la revisión humana ni la validación automática.**

---

# 212. Reglas de arquitectura congeladas para V1

Se consideran estables:

1. TypeScript como lenguaje principal de CASEFlow.
2. Next.js + React para frontend CASEFlow.
3. NestJS para API CASEFlow.
4. PostgreSQL + Prisma.
5. Redis + BullMQ.
6. pgvector.
7. StorageProvider S3-compatible.
8. SeaweedFS como almacenamiento S3-compatible local.
9. REST + OpenAPI.
10. monorepo.
11. 3FN.
12. Artifact + ArtifactVersion.
13. human-in-the-loop.
14. Project Knowledge Base.
15. evidence/provenance.
16. traceability.
17. Impact Analysis.
18. Consistency Engine.
19. Living Documentation.
20. provider/gateway agnostic AI.
21. manual fallback.
22. security isolation.
23. Docker.
24. V1 como producto completo.
25. Construction como P0.
26. `CASEFLOW_WEB_TS_V1` como único TargetTemplate V1.
27. modular monolith para proyectos generados.
28. UI Blueprint como fuente canónica de UI.
29. Stitch opcional + fallback interno.
30. Design Gate antes de generación oficial.
31. generation híbrida.
32. Approved Dependency Catalog.
33. sandbox obligatorio.
34. máximo inicial de 3 auto-repair rounds.
35. GeneratedProjectSnapshot inmutable.
36. ZIP reproducible como salida P0.

Cambios a estas reglas requieren decisión explícita y actualización documental.

---

# 213. Registro de decisiones — continuación

| ID | Decisión | Estado |
|---|---|---|
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
| DEC-115 | El calendario inmediato se repriorizó alrededor del Primer Entregable Funcional (§217–§219); Identity/Workspace/RBAC, Knowledge Base, RAG y Construction se difieren, no se cancelan. Supera solo la priorización de calendario de §180 y §182 | Accepted |

---

# 214. Decisiones abiertas después de los Bloques 1–11

Las decisiones necesarias para iniciar implementación están suficientemente cerradas.

Pueden decidirse durante implementación, sin alterar silenciosamente la arquitectura:

## UI de CASEFlow AI

- branding definitivo;
- design tokens finales;
- onboarding;
- layout refinado.

## AI

- proveedores/modelos iniciales exactos;
- embedding model;
- reranking;
- configuración operacional de OmniRoute.

## Infraestructura

- proveedor exacto de staging para API;
- PostgreSQL staging;
- Redis staging;
- email staging;
- dominio.

## Construction

- template engine concreto;
- OpenAPI client generator concreto;
- parámetros exactos del sandbox;
- network policy exacta del sandbox;
- UX final del diff/visor;
- si preview temporal entra en 1.0 o 1.1;
- formato final del manifest de trazabilidad.

Una decisión abierta no puede contradecir una DEC Accepted.

---

# 215. Source of Truth

Prioridad documental:

```text
1. CASEFLOW_AI_SPEC.md
2. ADRs aprobados
3. AGENTS.md
4. OpenAPI / Prisma / código estructurado
5. README / documentación secundaria
```

Si `AGENTS.md` contradice esta especificación:

> prevalece `CASEFLOW_AI_SPEC.md`.

Un ADR posterior puede modificar una decisión, pero debe actualizarse esta especificación para evitar divergencia.

---

# 216. Estado de esta especificación

Esta versión consolida los **Bloques 1–11**, incluyendo el requisito extraordinario de Construction & Code Generation.

CASEFlow AI queda definido como una plataforma I-CASE que debe cubrir en V1:

```text
Knowledge
→ Analysis
→ Design
→ Construction
→ Validation
→ Documentation
→ Export
```

El siguiente paso de planificación ya no requiere otro bloque arquitectónico principal.

Antes de iniciar implementación significativa deben quedar sincronizados:

```text
docs/CASEFLOW_AI_SPEC.md
AGENTS.md
README.md
```

`AGENTS.md` deberá reflejar especialmente:

- Construction como P0;
- TargetTemplate V1;
- Design Gate;
- catálogo de dependencias;
- sandbox;
- auto-repair limitado;
- prohibición de one-shot generation;
- reglas de snapshot/regeneración;
- Definition of Done del proyecto generado.

---

# 217. Primer Entregable Funcional (First Deliverable MVP)

El instructor del curso aclaró el primer entregable funcional exigido. Las actividades de planificación y gestión del proyecto siguen siendo documentación principalmente elaborada por el equipo; **a partir de Análisis de Requisitos, el software CASEFlow AI mismo debe generar los artefactos CASE solicitados**.

## 217.1 Alcance

El primer entregable funcional académico requiere que el software produzca:

- requisitos funcionales (RF) y no funcionales (RNF);
- casos de uso estructurados (mínimo cuatro para el entregable académico);
- representación del modelo de casos de uso (diagrama);
- modelo de datos (ER o clases);
- árbol de navegación;
- arquitectura de software;
- arquitectura de sistema;
- UI Blueprint;
- bocetos/mockups;
- revisión y edición humana;
- persistencia y versionamiento;
- trazabilidad básica.

## 217.2 Actividades fuera del núcleo P0 de generación

La planificación del proyecto (Gantt, PERT y afines) y la reflexión/evidencia del equipo permanecen como actividades académicas **elaboradas por el equipo**. No forman parte de la generación P0 de CASEFlow AI.

## 217.3 Relación con el resto de la especificación

- El First Deliverable MVP **no reemplaza** la visión V1 de §1–§216; la reordena en el calendario.
- Se mantienen íntegramente las reglas de human-in-the-loop, artefactos estructurados y versionados, fuente canónica sobre render, aislamiento por proyecto y funcionamiento sin IA.
- La IA que genere artefactos en este entregable debe seguir el flujo `AI Output → Schema Validation → Domain Validation → Candidate → Human Review → Official Artifact` (DEC-025). Cada artefacto debe poder crearse y editarse manualmente (DEC-028, DEC-078).
- La generación de código y el resto de Construction siguen siendo P0 de V1 (DEC-084), pero quedan posteriores al primer entregable.

---

# 218. Roadmap inmediato reordenado — Primer Entregable

El siguiente orden gobierna el calendario inmediato. Cada incremento es un vertical slice y deja el repositorio ejecutable.

| ID | Incremento | Alcance |
|---|---|---|
| 1A | Project + Artifact Foundation | `Workspace` y `Project` mínimos, `Artifact`, `ArtifactVersion`, tipos de artefacto controlados, ciclo de vida, migraciones, runtime Prisma y API mínima de persistencia. Sin generación. |
| 1B | Project Context | Contexto del proyecto (objetivo, descripción, alcance) como base de la generación. |
| 1C | AI Generation Foundation | `AIOrchestrator`, `ModelRouter`, gateway/provider, salida estructurada, candidatos y evidencia. |
| 1D | Requirements | RF/RNF estructurados (§27), generación asistida y edición manual. |
| 1E | Use Cases | Casos de uso estructurados (§28), mínimo cuatro. |
| 1F | Data Model + Diagram Engine | Modelo de datos (ER/clases) y motor de diagramas (Mermaid), incluido el diagrama de casos de uso. |
| 1G | Navigation + Architecture | Árbol de navegación, arquitectura de software y de sistema. |
| 1H | UI Blueprint + Mockups | `UIBlueprint` canónico y bocetos/mockups con fallback interno. |
| 1I | Traceability + Versions + Export | Trazabilidad básica, historial/comparación de versiones y exportación. |
| 1J | First Deliverable Hardening | Estabilización, revisión humana de extremo a extremo y preparación de la entrega. |

Tras el Incremento 1J se retoma el orden de dependencias de §180: Identity / Workspace / RBAC completos, Knowledge Base, RAG, Construction y Code Generation, sin cambios de alcance.

## 218.3 Decisiones de implementación del Incremento 1C

- La frontera inicial es `Feature → AIOrchestrator → AIProvider`; el router avanzado se difiere hasta que existan múltiples proveedores o reglas reales de selección.
- `AI_PROVIDER=disabled` es el modo predeterminado y no requiere credenciales. El primer adapter es `openai_compatible`, implementado con `fetch` nativo y sin fallback ni reintentos automáticos.
- Los prompts son definiciones inmutables y versionadas en código. El contenido de proyecto se transporta exclusivamente como mensajes de rol `user`, separado de las instrucciones de sistema.
- La salida se valida con el esquema Zod entregado por el feature antes de producir un `ValidatedGenerationCandidate<T>`.
- `ai_runs` conserva metadatos, hashes SHA-256 y procedencia opcional hacia la versión exacta de contexto; no conserva claves, encabezados de autorización ni payloads completos.
- Incremento 1C no expone endpoints de generación y no persiste artefactos de producto.

## 218.4 Decisiones de implementación del Incremento 1D

- `REQUIREMENT` conserva la identidad genérica de artefacto; su subtipo versionado normaliza tipo, prioridad, actores, precondiciones, postcondiciones y dependencias.
- `FUNCTIONAL` asigna códigos `RF`; `NON_FUNCTIONAL`, `RNF`. El cliente no controla prefijos.
- `requirements.generate@1` produce hasta 20 candidatos estrictos desde una versión explícita de Project Context. Los candidatos se persisten separados de los artefactos oficiales.
- La aceptación es transaccional: una dependencia hacia un candidato no seleccionado se rechaza; dependencias duplicadas, propias, cruzadas o cíclicas se rechazan.
- La procedencia es `RequirementDetail → RequirementCandidate → RequirementGeneration → AIRun → Project Context ArtifactVersion` y también se conservan enlaces directos auditables.

## 218.5 Decisiones de implementación del Incremento 1E

- `USE_CASE` conserva la identidad genérica `Artifact` y el código estable `CU`; cada `ArtifactVersion` posee un snapshot relacional inmutable con nombre, objetivo, actor principal, actores secundarios ordenados, pre/postcondiciones, pasos del flujo principal y flujos alternativos con pasos.
- Cada vínculo apunta a una versión exacta de `REQUIREMENT` del mismo proyecto. La generación acepta exclusivamente versiones `APPROVED`; la creación manual permite versiones válidas del mismo proyecto para conservar el trabajo determinístico sin IA.
- `use-cases.generate@1` admite hasta 20 candidatos. Cada caso admite hasta 100 pasos principales, 25 flujos alternativos y 50 pasos por flujo alternativo. Las referencias emitidas deben pertenecer exactamente al conjunto de fuentes suministrado; una referencia inventada produce `AI_INVALID_OUTPUT` sin persistir candidatos.
- La aceptación seleccionada es transaccional y crea `AI_GENERATED/GENERATED`. La procedencia es `UseCaseDetail → UseCaseCandidate → UseCaseGeneration → AIRun → use-cases.generate@1`, con `UseCaseCandidateSource/UseCaseGenerationSource → Requirement ArtifactVersion` para todas las fuentes exactas.
- La validación académica informa si existen al menos cuatro casos de uso oficiales (`acceptedCount`, `minimumRequired=4`, `satisfied`). No restringe la cardinalidad del producto, no fabrica casos y no bloquea el flujo normal.
- El diagrama de casos de uso se difiere al Incremento 1F. La acumulación Contexto → Requisitos → Casos de Uso ya justifica un próximo flujo frontend coordinado, pero 1E no introduce una interfaz provisional con identificadores hardcodeados.

## 218.6 Compatibilidad con proveedores reales

- La abstracción pública usa `maxOutputTokens` como presupuesto opcional, entero positivo y neutral al proveedor. Cada adapter lo traduce al campo de su protocolo; el adapter OpenAI-compatible usa `max_tokens`.
- `requirements.generate@1` solicita 4096 tokens de salida y `use-cases.generate@1`, 8192. Los presupuestos pertenecen a cada feature y no al adapter reutilizable.
- Para la validación actual de desarrollo, Groq es el proveedor directo de referencia, OmniRoute es el router de desarrollo y Cloudflare Workers AI es el proveedor estructurado de respaldo. Todos siguen siendo reemplazables mediante `AIProvider`; estas elecciones no constituyen dependencias permanentes del dominio.
- Los tests y CI nunca requieren proveedores reales: ejecutan con `AI_PROVIDER=disabled`, `FakeAIProvider` o HTTP simulado. Las validaciones live son manuales y separadas.

## 218.7 Decisiones de implementación del Incremento 1F

- `DATA_MODEL` permite múltiples modelos conceptuales por proyecto y reutiliza `Artifact → ArtifactVersion`, con prefijo `MD`. El P0 es `ER`; una futura variante `CLASS` puede añadirse mediante `modelKind` sin alterar Artifact Core. Cada snapshot normaliza entidades, atributos y relaciones. Se admite una sola clave primaria conceptual por entidad; las claves compuestas se difieren hasta contar con un caso aprobado.
- Los tipos conceptuales controlados son `STRING`, `TEXT`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `DATE`, `DATETIME` y `UUID`. Las cardinalidades son `ONE`, `ZERO_OR_ONE`, `ONE_OR_MORE` y `ZERO_OR_MORE`. Límites: 60 entidades, 50 atributos por entidad, 150 relaciones, nombres de 120 caracteres, descripciones de entidad de 2000 y descripciones de atributo/relación de 1000.
- `data-model.generate@1` recibe identificadores explícitos de versiones `APPROVED` de `REQUIREMENT` y `USE_CASE` del mismo proyecto. Usa `maxOutputTokens=12288`, suficiente para el payload estructurado máximo sin imponer un límite universal al orquestador. La salida persiste primero como `DataModelGeneration → DataModelCandidate`; solo la aceptación humana transaccional crea un `DATA_MODEL` `AI_GENERATED/GENERATED`.
- La procedencia de generación es `DataModelDetail → DataModelCandidate → DataModelGeneration → AIRun → data-model.generate@1`, y `DataModelGenerationSource → ArtifactVersion` conserva todas las versiones exactas suministradas.
- El motor determinístico separa modelo estructurado, generación de fuente y validación ligera de render. ER usa `MERMAID_ER`; UML de casos de uso usa `PLANTUML` porque conserva actores, asociaciones y límite de sistema sin degradarlos a flowchart. `DiagramEngine` nunca ejecuta Mermaid, PlantUML, shell ni texto de IA arbitrario; solo genera fuente determinística desde datos ya validados y aplica una validación local ligera (formato, tamaño). **Superseded por el Incremento 1F.1 (§218.8):** en 1F el render real todavía no existía — el "SVG" era una previsualización textual fija (`caseflow-svg-v1`) que mostraba la fuente escapada como texto monoespaciado, sin layout gráfico ni compatibilidad demostrada con motores oficiales.
- Cada versión de `DATA_MODEL` conserva su fuente/render ER derivado y un vínculo a la misma versión estructurada. Cada generación de `USE_CASE_DIAGRAM` crea un Artifact/ArtifactVersion nuevo con prefijo `DIA` y vínculos exactos a versiones `APPROVED` de `USE_CASE`; no inventa relaciones include/extend. El SVG es derivado y nunca canónico.
- La persistencia del SVG en `diagram_details` se acepta temporalmente para el Primer Entregable por su tamaño acotado y naturaleza determinística. La migración a `StorageProvider` se evaluará cuando existan exports/objetos binarios; la fuente estructurada y la versión del generador siguen siendo autoritativas.

## 218.8 Decisiones de implementación del Incremento 1F.1 (Diagram Rendering Stabilization)

- **Cadena oficial real.** `caseflow-svg-v1` (previsualización textual fija) deja de ser el render oficial. La cadena oficial pasa a ser: modelo/casos de uso estructurados → `DiagramEngine` (fuente determinística `MERMAID_ER`/`PLANTUML` + validación local ligera) → `DiagramProvider` (abstracción) → `KrokiDiagramProvider` (adapter HTTP hacia un Kroki local propio, `yuzutech/kroki:0.32.1` + `yuzutech/kroki-mermaid:0.32.1` para el motor Mermaid) → SVG real → saneamiento XML explícito → SVG confiable persistido/entregado. Ningún módulo de dominio/feature depende directamente de Kroki; solo lo hace el adapter en `packages/integrations`, detrás de `DiagramProvider`.
- **Kroki es autoridad de compatibilidad.** El validador local de `DiagramEngine` sigue existiendo como filtro barato (formato/tamaño), pero ya no certifica compatibilidad Mermaid/PlantUML por sí mismo; una fuente malformada es rechazada por el propio Kroki (`HTTP 400` → `DIAGRAM_INVALID_SOURCE`).
- **Nunca un endpoint público.** `KROKI_BASE_URL` proviene exclusivamente de configuración confiable de CASEFlow (`DIAGRAM_RENDERER`, `KROKI_BASE_URL`, `DIAGRAM_RENDER_TIMEOUT_MS`); el adapter solo acepta `MERMAID_ER`/`PLANTUML` internamente controlados, aplica timeout, cota de tamaño de fuente (heredada de `DiagramEngine.validate`) y cota de tamaño de respuesta (`5 MB`, aplicada en streaming).
- **Saneamiento XML real.** El SVG devuelto por Kroki se trata como contenido derivado no confiable: se parsea como XML real (`fast-xml-parser@5.11.1`, nunca solo regex) y se reconstruye desde una lista explícita de etiquetas/atributos permitidos. `foreignObject` se conserva (Mermaid ER lo requiere para el layout de etiquetas) pero su contenido queda acotado a `div`/`span`/`p`/`br`; `script`, `iframe`, `object`, `embed`, `img`, `a`, `base`, `link`, atributos `href`/`src`/`on*` y valores `javascript:`/`url()` externos nunca sobreviven.
- **Renderer deshabilitado por defecto en pruebas.** `DIAGRAM_RENDERER=disabled` (sin `KROKI_BASE_URL`) es el valor por defecto cuando la variable no está definida, de modo que arrancar sin infraestructura local nunca intenta una llamada saliente; solo un intento real de render falla (`DIAGRAM_NOT_CONFIGURED`). El desarrollo/producción normales configuran `DIAGRAM_RENDERER=kroki` (ver `.env.example`); las pruebas unitarias e de integración ordinarias usan `FakeDiagramProvider` sin red.
- **Falla de render = ninguna escritura.** El render (y su saneamiento) ocurre siempre antes de abrir la transacción de escritura correspondiente (creación/versión manual de `DATA_MODEL`, aceptación de candidatos, generación de `USE_CASE_DIAGRAM`). Si falla, no se abre transacción y no se escribe ninguna fila: el dato estructural canónico nunca se destruye ni se marca con un SVG falso. La entrada manual es responsabilidad del cliente (reintentar la misma solicitud); los candidatos de IA ya persistidos en `generate()` permanecen disponibles para un nuevo intento de `accept()`.
- **`SYSTEM_GENERATED`.** `ArtifactOrigin` gana un quinto valor aditivo (`MANUAL`, `AI_GENERATED`, `AI_ASSISTED`, `SYSTEM_GENERATED`, `IMPORTED`; spec §6.3) para artefactos derivados determinísticamente por CASEFlow sin autoría manual ni IA. El diagrama de casos de uso (`USE_CASE_DIAGRAM`) pasa de `MANUAL/GENERATED` a `SYSTEM_GENERATED/GENERATED`; ningún otro tipo de artefacto cambia de origen. `initialStatusForOrigin` trata `SYSTEM_GENERATED` igual que `AI_GENERATED` (arranca en `GENERATED`, nunca en `DRAFT`).
- **Orden determinístico sin locale.** La generación de fuente PlantUML de casos de uso reemplaza `localeCompare` por comparación ordinal de unidades de código (nunca dependiente del locale del SO/ICU) y deduplica actores dentro de cada caso de uso (identidad normalizada por `trim`) antes de generar asociaciones, evitando asociaciones visuales duplicadas por datos históricos/malformados.
- **Alcance no cambiado.** Se preserva exactamente la política de regeneración/duplicados de 1F (regenerar el mismo conjunto de fuentes puede crear diagramas `USE_CASE_DIAGRAM` duplicados; Impact Analysis sigue diferido) y la ausencia de PK compuestas/UML include-extend-generalización.
- **Regla de frontend (aún sin UI en 1F.1).** El SVG que la API entrega ya está saneado y es confiable; cuando exista UI de diagramas, debe renderizarse mediante una frontera de render segura, no `innerHTML` arbitrario tratando el SVG como contenido de usuario no confiable. El backend sigue siendo la única frontera de saneamiento autoritativa.

## 218.1 Decisiones de modelo del Incremento 1A

- **Workspace → Project.** Todo `Project` pertenece obligatoriamente a un `Workspace` (§3.1). El Incremento 1A crea únicamente las columnas mínimas de `Workspace`. `User`, memberships y RBAC pertenecen al incremento de Identity.
- **Sin autenticación en 1A.** Los workspaces de desarrollo se crean mediante un seed de desarrollo explícito o fixtures de prueba, nunca mediante comportamiento hardcodeado de producción.
- **Tipo de artefacto.** Se representa mediante una tabla de referencia normalizada (`artifact_types`), no un enum de base de datos, para poder añadir tipos sin `ALTER TYPE`. Los tipos iniciales son `REQUIREMENT`, `USE_CASE`, `DATA_MODEL`, `USE_CASE_DIAGRAM`, `NAVIGATION_TREE`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE`, `UI_BLUEPRINT` y `MOCKUP`.
- **Estado y origen.** `ArtifactVersion.status` usa exactamente `DRAFT`, `GENERATED`, `IN_REVIEW`, `APPROVED`, `CHANGES_REQUESTED` (§5.2). `ArtifactVersion.origin` usa exactamente `MANUAL`, `AI_GENERATED`, `AI_ASSISTED`, `SYSTEM_GENERATED`, `IMPORTED` (§6.3; `SYSTEM_GENERATED` añadido de forma aditiva en el Incremento 1F.1, §218.8).
- **`current_state` derivado.** El estado vigente de un artefacto se deriva de su versión vigente (la de mayor `version_number`); no se persiste un duplicado en `Artifact` (coherente con §5.4).
- **Contenido genérico.** `metadata_auxiliary` (JSONB, objeto) es únicamente el mecanismo genérico auxiliar de §6.2. Los detalles de dominio de cada tipo se modelarán en tablas relacionales por su propio slice (§26).
- **Inmutabilidad.** En 1A, una `ArtifactVersion` no se edita en sitio: editar crea una nueva versión. Solo las columnas de ciclo de vida (`status`, `submitted_at`, `approved_at`) pueden cambiar, y nunca en una versión `APPROVED`. Una versión no puede eliminarse. Se aplica en base de datos. El autosave de borradores (§15.2) se define en el Incremento 2.
- **Aislamiento.** `artifact_versions` referencia `(artifact_id, project_id)` con una clave foránea compuesta hacia `artifacts (id, project_id)`, de modo que una versión no puede cruzar la frontera de proyecto. Todo acceso por API usa `projectId` en la ruta.
- **Códigos.** `Artifact.code` es único por proyecto y se asigna con un contador monótono por `(project, prefijo)`; un código nunca se reutiliza (§31.4). El prefijo de código es una capacidad interna del servicio (p. ej. RNF para requisitos no funcionales en el Incremento 1D); la API pública no lo expone y no acepta prefijos arbitrarios.
- **OpenAPI.** El documento OpenAPI se genera desde los mismos esquemas zod de `packages/contracts` que validan las solicitudes (una sola fuente de verdad). La UI interactiva (`/docs`) solo se sirve fuera de producción; el documento JSON se genera de forma determinística con `pnpm openapi:generate`.
- **Versiones secuenciales.** `version_number` es único por artefacto y se asigna dentro de una transacción con bloqueo de la fila del artefacto.

## 218.2 Decisiones de modelo del Incremento 1B

- **Contexto canónico.** Cada proyecto puede tener como máximo un artefacto `PROJECT_CONTEXT`, con prefijo `CTX`. La unicidad se refuerza mediante un índice único parcial en base de datos.
- **Versionamiento común.** Project Context reutiliza `Artifact` → `ArtifactVersion`; cada edición crea una versión completa nueva y nunca modifica una versión previa.
- **Estructura relacional.** El detalle de cada versión conserva `problem_statement`, `objective` y `additional_context`; actores, necesidades, restricciones, reglas de negocio y elementos de alcance se almacenan en tablas relacionadas con posición determinística. `IN_SCOPE` y `OUT_OF_SCOPE` son los únicos tipos de alcance.
- **Inmutabilidad.** El detalle y todas sus colecciones pertenecen a una `ArtifactVersion` específica y la base de datos rechaza su actualización o eliminación.
- **API semántica.** El flujo público es `/projects/{projectId}/context`; la creación genérica de artefactos rechaza `PROJECT_CONTEXT` para impedir bypass de la invariante canónica.
- **Límites de entrada.** Cada colección admite hasta 100 elementos; las descripciones de elementos admiten 2 000 caracteres, `problemStatement` y `additionalContext` 10 000, `objective` 5 000 y nombres de actor 200. Estos límites permiten describir proyectos reales y acotan solicitudes abusivas.
- **Sin IA ni UI provisional.** El contexto funciona manualmente. La IA pertenece a 1C. La pantalla se difiere hasta disponer de selección coherente de proyecto, evitando IDs hardcodeados.

## 218.3 Documento de alcance

`docs/FIRST_DELIVERABLE_MVP.md` resume este alcance para el equipo. Esta especificación es la fuente de verdad; ante discrepancia prevalece este documento.

---

# 219. DEC-115 — Repriorización del calendario alrededor del Primer Entregable

- **Contexto.** El instructor exige que, desde Análisis de Requisitos, el propio software genere los artefactos CASE del primer entregable (§217).
- **Decisión.** Reordenar el calendario inmediato como en §218. La tarea anteriormente planificada «Increment 1A — Identity Persistence Foundation» **no** se implementa; su lugar lo toma «Increment 1A — Project + Artifact Foundation».
- **Supera.** Únicamente la priorización de calendario de §180 (orden de incrementos inmediatos) y §182 (Identity como siguiente incremento). No modifica ninguna decisión aprobada DEC-001…DEC-114.
- **Conserva.** Identity, Workspace, RBAC, Knowledge Base, RAG, Construction y Code Generation permanecen en el alcance de V1.
- **Estado.** Accepted.

# 220. Cierre del Primer Entregable — Frontend, fallback manual, Export completo y E2E

Documenta el comportamiento final implementado tras completar §217–§219
(Incrementos 1G–1S). Es descriptivo del estado real del código, no
aspiracional.

## 220.1 Frontend (`apps/web`)

`apps/web` deja de ser el scaffold por defecto de Next.js y pasa a ser la
aplicación real consumida por el usuario final. Arquitectura de
información organizada por ciclo de vida del usuario, no por tabla de base
de datos: Inicio, Conocimiento (Fuentes, Contexto), Análisis (Requisitos,
Casos de Uso, Modelo de Datos), Diseño (Navegación, Arquitectura de
Software, Arquitectura de Sistema, UI Blueprint, Mockups), Trazabilidad,
Preparación/Exportar.

- **Descubrimiento de proyecto/workspace sin UUID fijo.** `GET
  /workspaces` (endpoint de solo lectura, añadido específicamente para
  esto — Identity/Workspace completos siguen diferidos por DEC-115) y `GET
  /projects` alimentan un selector real, con creación de proyecto y estado
  vacío manejados en la UI.
- **Capa de API tipada** (`apps/web/lib/api.ts`): un único `fetch`
  compartido, errores normalizados como `ApiError`, sin URLs ni lógica de
  negocio del backend duplicadas en componentes individuales.
- **Sistema de estado.** `StatusBadge`/`CandidateBadge` muestran cada
  estado de ciclo de vida con ícono + texto, nunca solo color; un
  candidato de IA se distingue visualmente de un Artifact Version oficial
  (Aceptar ≠ Aprobar).
- **Frontera de SVG confiable.** `TrustedDiagram`
  (`apps/web/components/trusted-svg.tsx`) es el único componente del
  frontend que usa `dangerouslySetInnerHTML`; solo recibe SVG que ya pasó
  por `sanitizeDiagramSvg()` del backend, a través de los endpoints de
  diagrama o de preview de Mockup — nunca contenido de fuente subida,
  texto de formulario, ni una cadena cruda de candidato de IA. Existe una
  prueba estática que falla si `dangerouslySetInnerHTML` aparece en
  cualquier otro archivo del frontend, además de la auditoría manual de
  cada llamador.
- **Explicación de bloqueo de etapa.** Cuando una acción requiere un
  prerequisito no satisfecho, la UI explica la razón en lenguaje natural
  (p. ej. "Apruebe el Contexto del Proyecto antes de generar
  Requisitos.") en vez de solo deshabilitar el control; el backend sigue
  siendo la autoridad — la UI no reproduce la máquina de estados completa.

## 220.2 Fallback manual sin IA (todos los tipos de artefacto downstream)

Todo tipo de artefacto downstream tiene ahora una ruta de creación manual
estructurada expuesta en el frontend, junto a "Generar con IA" cuando hay
un proveedor configurado:

- **Requisitos:** tipo, nombre, descripción, prioridad, actores,
  precondiciones, postcondiciones, y `dependencyArtifactIds` (dependencias
  hacia otros Requisitos del mismo proyecto, presentadas como tarjetas
  seleccionables por código + nombre — nunca un ArtifactVersion UUID
  escrito a mano).
- **Casos de Uso:** incluye editor de flujos alternativos
  (nombre/condición/pasos) y selección de Requisitos relacionados por
  código + nombre.
- **Modelo de Datos:** editor de entidades/atributos (nombre, tipo
  conceptual, requerido/PK/único, descripción) y relaciones (entidad
  origen/destino por nombre, nombre, cardinalidades, descripción) — nunca
  autoría de Mermaid.
- **Navegación, Arquitectura de Software, Arquitectura de Sistema, UI
  Blueprint:** editores de filas estructuradas (nodos/componentes/enlaces/
  pantallas) — nunca PlantUML, Mermaid ni JSON crudo. La capa Componente →
  Capa en Arquitectura de Software usa el único mecanismo que el contrato
  soporta (`layerLocalId`, un string libre, no una capa formal separada),
  expuesto como un campo de texto con autocompletado nativo del navegador
  sobre las capas ya usadas en el mismo formulario.

En todos los casos, la creación manual invoca directamente el endpoint
`create()` oficial del backend (`origin=MANUAL`, `status=DRAFT`), sin
ningún paso de generación/candidato de por medio. Los diagramas y Mockups
deterministas se siguen generando igual después de la creación manual —
el pipeline `DiagramEngine → Kroki → sanitizeDiagramSvg` no distingue
entre contenido manual y contenido aceptado desde un candidato de IA.

### Dependencias de Requisito y ciclo de vida (semántica confirmada)

`dependencyArtifactIds` en el contrato de creación de Requisito referencia
la identidad estable del Artifact Requisito (nunca una versión, nunca un
Requisito de otro proyecto) y **no** exige que el Requisito referenciado
esté `APPROVED`: la especificación exige la garantía `APPROVED`-only
explícitamente para la generación de Casos de Uso/Modelo de Datos/
diagramas a partir de Requisitos/Casos de Uso (§218.5, §218.7), pero nunca
la exige para dependencias Requisito↔Requisito, y la transición a
`APPROVED` de un Requisito tampoco revalida el estado de sus dependencias.
Esto es intencional, no un descuido: se preserva tal cual (sin agregar una
restricción no solicitada), consistente con el único test de integración
existente que aprueba explícitamente esta combinación
(`requirements.integration.spec.ts`).

## 220.3 Export completo (cierre de evidencia)

La suite de integración de Export (`export.integration.spec.ts`) prueba,
sin duplicar condiciones ya probadas: proyecto vacío/incompleto; un
proyecto completamente poblado con los 14 tipos de artefacto relevantes
presentes simultáneamente y sus secciones compuestas juntas (readiness,
staleness y resumen de trazabilidad incluidos); correspondencia exacta
Modelo de Datos↔ER, Navegación/Arquitectura de Software/Arquitectura de
Sistema↔diagrama y UI Blueprint↔Mockup con la versión autoritativa exacta
seleccionada; la política compartida de selección autoritativa entre
múltiples artefactos `APPROVED` del mismo tipo; `Content-Type` JSON/HTML;
`Content-Disposition` seguro y determinístico (derivado únicamente del
`projectId`, nunca del nombre del proyecto); ausencia de cuerpos binarios,
`storageKey` o secretos; y escape HTML contra XSS.

## 220.4 Playwright E2E

Herramienta de repositorio (no un script ad-hoc), versión fijada en el
lockfile (`@playwright/test`), configurada exclusivamente contra
infraestructura local: una base de datos Postgres de pruebas aislada (la
misma que usa la suite de integración del backend), sin proveedor de IA
externo, sin renderizador público.

- **Escenario A (obligatorio, sin IA):** con `AI_PROVIDER=disabled`,
  recorre en un Chromium real el flujo completo — proyecto, Fuente
  TEXT/NOTES, interpretación manual, aprobación de la Fuente, Contexto
  respaldado por esa Fuente a través de la UI, aprobación del Contexto,
  Requisito manual, aprobación del Requisito, y verificación de que Inicio
  refleja la progresión real. Prueba que CASEflow funciona sin IA externa
  de punta a punta, no solo a nivel de unidad.
- **Escenario B (visual/procedencia):** con `DIAGRAM_RENDERER=kroki`
  contra el Kroki local propio del repositorio, prepara el estado
  necesario vía llamadas API directas (aceptable para este escenario
  acotado) y verifica en el navegador: un SVG real renderizado por Kroki y
  saneado por el backend dentro de `TrustedSvg`; procedencia real ascendente
  en Trazabilidad; estado real de Readiness; y descargas de exportación
  JSON/HTML con el nombre de archivo determinístico exacto.

`pnpm run test:e2e` es el comando canónico (ejecuta ambos escenarios). CI
instala Chromium de forma determinística con `pnpm exec playwright
install --with-deps chromium` (resuelve la versión fijada en el lockfile
ya disponible en `PATH` vía `pnpm/action-setup`, en vez de `npx`) y ejecuta
`pnpm run test:e2e` dentro del job Integration, después de la suite de
integración del backend.

## 220.5 CI

El job Quality ejecuta, además de formato/lint/typecheck/build/tests/
coverage del backend, la suite Vitest propia del frontend
(`pnpm --filter @caseflow-ai/web run test`) — antes era un comando
exclusivamente de desarrollador que Quality nunca ejecutaba. El job
Integration ejecuta la suite de integración del backend contra PostgreSQL
real y ambos escenarios de Playwright. Ninguno de los dos jobs usa
`continue-on-error` para verificaciones obligatorias ni debilita el umbral
de cobertura.

## 220.6 Backlog conservado

Confirmar los tipos exactos de diagrama "second-partial" con el
profesor permanece como backlog, sin resolver arbitrariamente.
