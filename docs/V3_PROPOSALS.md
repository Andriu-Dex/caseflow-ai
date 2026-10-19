# Propuestas para la versión 3

Lista de lo que quedó fuera de la v2 por decisión, con el motivo y lo que haría falta. No son compromisos: cada punto que se retome necesita su confirmación y, si cambia la arquitectura o el alcance, una decisión registrada (DEC/ADR) y la actualización de `CASEFLOW_AI_SPEC.md`.

Prioridad sugerida: **A** (conviene hacerlo primero), **B** (valioso, no urgente), **C** (depende de una decisión externa o es de largo plazo).

## 1. Interfaz bilingüe completa (EN/ES) — A

- **Estado:** el selector de idioma del proyecto solo afecta al contenido que genera la IA. La interfaz está fija en español. La especificación la lista como planificada para después de cerrar la v2 (§221.4).
- **Tamaño:** unos 85 archivos del frontend con cientos de textos escritos en el código; más de un centenar de mensajes de error de la API en español; además correos, reportes y los textos de la plantilla del proyecto generado.
- **Cómo hacerlo:**
  1. Decidir el alcance: interfaz web y mensajes de la API, o solo la interfaz; y si el idioma de la API sigue al de la interfaz.
  2. Librería estándar para Next.js (por ejemplo `next-intl`) con diccionarios `es` y `en`.
  3. Migrar por bloques (menú, acciones comunes y errores primero; después pantalla por pantalla), cada bloque con sus tests.
  4. Comprobación automática que avise de textos fijos sin migrar.
  5. Preferencia de idioma por usuario o proyecto, con español por defecto.
- **Riesgo:** toca casi todos los archivos de la web; conviene hacerlo como trabajo propio y por fases, no como cambio de última hora.

## 2. Vista previa en vivo del proyecto generado — C (pendiente de confirmar con el cliente)

- **Estado:** prevista como P1 y no bloqueante (DEC-108, §177.2); fuera del alcance de la v2 (§221.4). La guía «Cómo probar el proyecto» cubre mientras tanto la necesidad de ejecutarlo en la máquina de la persona.
- **Requiere una decisión (ADR)** que la incluya en el alcance y defina antes su diseño de seguridad. Proporcionado a una herramienta local, bastaría:
  1. Ejecutarla en un contenedor Docker aislado, como el sandbox, y no en el sistema directamente.
  2. Sin ningún secreto ni variable de entorno de CASEFlow dentro del contenedor.
  3. Escuchar solo en `127.0.0.1`.
  4. Apagado automático por tiempo y límites de memoria y CPU.
- **Por qué hace falta aunque corra en local:** el código generado por IA no es confiable aunque nadie lo pida con mala intención (errores, inyección de instrucciones desde las fuentes subidas); corre con los permisos de la persona; y una vista previa es un servidor encendido con un puerto abierto, a diferencia de la validación, que es breve y desechable. Los filtros de los proveedores de IA no son una barrera de seguridad.
- **Trabajo de infraestructura:** ciclo de vida de contenedores, base de datos propia por proyecto, migraciones y datos de ejemplo, limpieza.

## 3. Mejoras a lo entregado en la v2 — B

- **Guía «Cómo probar el proyecto»:** leer los puertos y las variables del `.env.example` de la generación en vez de tenerlos escritos en el texto (hoy 3000 y 3001 están fijos, aunque coinciden con la plantilla); mostrar las variables de entorno del plan; unificar su contenido con el README generado para que no se contradigan.
- **Celebración al completar la planificación:** si el navegador bloquea el almacenamiento de sesión, el confeti puede repetirse al volver a la pantalla.
- **Código generado:** los roles se generan como textos en español (`@Roles('Administrador')`); el acceso del proyecto generado es con un token de desarrollo y no con inicio de sesión real con usuario y contraseña.
- **Endpoints numerados:** cuando la IA no nombra el endpoint de una acción de escritura, el plan crea uno numerado (`/actions/1`) con una advertencia de calidad; una versión futura podría proponer un nombre y pedir confirmación.
- **Parámetros de ruta:** los planes antiguos tienen parámetros en minúsculas (`:saleid`); los nuevos salen en camelCase.

## 4. Pendientes de la hoja de ruta (`AGENTS.md`)

- **Validación de generalidad:** cumplida en la v2 con dos dominios distintos validados en el sandbox real (DEC-114: tienda y biblioteca). Un siguiente paso razonable es repetirla de punta a punta, desde fuentes y requisitos, con un segundo proyecto real (por ejemplo Tutorías Académicas o Inventario), porque el flujo completo solo se ha recorrido con RestGuestMateos y es donde aparecen los errores.
- Endurecimiento, endurecimiento de la demostración y candidata a lanzamiento.

## 5. Capacidades de la especificación para después de la v2 (§19.2 y §19.3)

- **Integraciones:** Git y push automático a GitHub/GitLab, despliegue automático, integración con Figma, varios motores de diagramación.
- **Seguridad y operación de IA:** BYOK completo, MFA, presupuestos de IA, roles personalizados.
- **Productividad:** Asistente de proyecto, constructor de plantillas de proyecto (ProjectTemplate Builder).
- **Más diagramas:** actividad, secuencia, componentes, despliegue, ER, estados.
- **Análisis avanzado:** comparación avanzada de líneas base, análisis de impacto y de consistencia semánticos, comentarios y menciones avanzados, edición colaborativa avanzada.
- **Más plantillas de destino:** `CASEFLOW_DJANGO_REACT`, `CASEFLOW_SPRING_REACT`, móviles, microservicios.
- **Construcción avanzada:** CI/CD específico del proyecto generado, ingeniería inversa de repositorios externos, sincronización bidireccional con Git, plugins de generación, API pública.
