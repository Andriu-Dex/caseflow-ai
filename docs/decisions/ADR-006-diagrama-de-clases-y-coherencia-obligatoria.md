# ADR-006 — Diagrama de clases y coherencia obligatoria entre etapas

- **Estado:** Aprobado
- **Fecha:** 2026-10-07
- **Decisión registrada como:** DEC-121
- **Modifica:**
  - el flujo de planificación (§221.3 pasa de 12 a 13 pasos);
  - el motor de consistencia (§ consistencia), cuyas reglas pasan de advertencias a reglas bloqueantes en los proyectos nuevos;
  - la validación estructural del proyecto generado (§175).
- **No modifica:** las rutas de trabajo (DEC-116), las fuentes provisionales (DEC-119) ni la validación en el sandbox.

## Contexto

Cada etapa de la planificación cita sus fuentes con códigos (`RF-001`, `CU-002`), pero casi nada exige que lo definido arriba aparezca abajo:

- El modelo de datos, el modelo conceptual y el plan de implementación definen sus entidades por separado, de modo que una misma entidad puede llamarse distinto en cada uno.
- Una pantalla del plano de interfaz puede quedar sin ruta en el código, y una acción sin endpoint.
- Las cuatro reglas del motor de consistencia solo advierten y no bloquean nada.

Además falta un paso clásico del análisis y diseño: el **diagrama de clases**.

## Decisión

1. **Diagrama de clases de dominio.** Es un artefacto nuevo, `CLASS_DIAGRAM` (`DC-`), y el paso 6 de la planificación, después del modelo de datos.
   - **Contenido:** clases del negocio con atributos (tipo, visibilidad) y métodos, y relaciones de asociación, agregación, composición, herencia y dependencia, con su multiplicidad.
   - **Diagrama:** se dibuja de forma determinística como Mermaid `classDiagram`.
   - **Sin capas técnicas:** no incluye servicios, controladores ni repositorios, que ya define el plan de implementación.
2. **Referencias por identificador, no por nombre.**
   - Cada clase apunta a la entidad del modelo de datos que representa.
   - Las pantallas apuntan a su nodo de navegación y a sus casos de uso.
   - Las entidades del plan de implementación apuntan a su clase.
   - Las rutas del frontend apuntan a su pantalla.
   - Los endpoints personalizados apuntan a la acción de pantalla que los origina.
3. **Cobertura obligatoria en ambas direcciones.** Lo que se define en una etapa debe aparecer en las siguientes, y lo que aparece abajo debe venir de arriba:
   - requisito funcional → caso de uso → pantalla;
   - entidad del modelo de datos ↔ clase ↔ entidad del plan → modelo de Prisma;
   - nodo de navegación ↔ pantalla ↔ pantalla del boceto ↔ ruta ↔ página generada;
   - acción principal de pantalla → operación o endpoint → control en la página generada;
   - campo de formulario → atributo de la entidad.
4. **Cumplimiento en tres puntos, bloqueante en los proyectos nuevos:**
   - **Al generar:** la IA recibe la lista explícita de lo que debe cubrir, y una propuesta con huecos se marca como error y no puede incorporarse.
   - **Al aprobar:** un artefacto con huecos de cobertura no puede aprobarse.
   - **Al construir:** la validación estructural del proyecto generado comprueba que cada entidad, ruta y acción del plan exista en el código, y si falta algo el proyecto no queda `READY`.
5. **Matriz de coherencia.** Una página muestra cada cadena con sus huecos y un enlace para corregirlos.
6. **Solo proyectos nuevos.** Los proyectos existentes conservan sus aprobaciones; para ellos el diagrama de clases es opcional y las reglas se muestran como advertencias.

## Consecuencias

- **A favor:** lo que se ve en los diagramas es lo que se construye; una omisión se detecta en la etapa donde ocurre, no al probar la aplicación.
- **En contra:** aprobar exige completar la cobertura, lo que implica más correcciones durante la planificación.
- **Límite conocido:** en los bocetos de Stitch se garantiza que estén todas las pantallas y que el prompt incluya todas sus acciones, pero no se verifica el contenido de la imagen. El boceto interno siempre es completo porque se dibuja desde el plano de interfaz.
