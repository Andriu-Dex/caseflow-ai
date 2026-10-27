# ADR-013 — Manual visual vinculado al software generado

- Estado: Aprobado.
- Fecha: 2026-10-26.
- Decisión: DEC-152.
- Origen: incorporar a la entrega un manual de uso breve y visual para las personas que utilizarán la aplicación generada.

## Decisión

1. Cada `GeneratedProjectSnapshot` validado origina un trabajo independiente que propone un manual `USER_MANUAL`. La generación determinista no requiere servicios externos. Utiliza la versión exacta del ImplementationPlan, el plano seleccionado por la Design Baseline y los archivos de esa generación; no usa el último diseño de otro proyecto o de otra versión.
2. El manual es un artefacto versionado, con tareas, roles y pasos relacionales. Cada tarea conserva su ruta y la referencia al archivo generado. Es una guía candidata hasta revisar las instrucciones en la aplicación; pasar lint, pruebas y build no prueba la interacción de cada tarea.
3. Las guías visuales iniciales consisten en flujos numerados, tarjetas, resultados que comprobar e índice de tareas. Los esquemas se identifican explícitamente como tales. No se presentan bocetos ni pantallas inferidas como capturas reales. La captura automática de una aplicación en ejecución requiere una capacidad de ejecución y evidencia gráfica aislada que esta decisión no introduce.
4. Se puede editar y crear otra versión, revisar, solicitar cambios y aprobar con registro humano. Todas las tareas deben quedar comprobadas explícitamente antes de aprobar. La revisión del manual se mantiene independiente de la automatización del diseño en `BUILD_ONLY`.
5. Se exportan HTML navegable sin conexión y PDF. Los documentos sin aprobación llevan indicación de borrador. El paquete de entrega completo exige un manual aprobado de la misma versión de software.
6. El ZIP de código y el snapshot oficial permanecen inmutables. Se ofrece un ZIP exterior que contiene el archivo de software original, ambos formatos de manual y un manifiesto de identificadores y hashes.
7. El estado de documentación es independiente: fallar o reintentar el manual no revierte `READY` ni reconstruye el software. Las versiones anteriores se conservan y se indica si existe software más reciente. El historial de manuales solo se elimina dentro de la eliminación autorizada del proyecto completo.
8. CASEFlow continúa distribuyéndose principalmente como instalable (ADR-007); no se necesita publicar una web ni empaquetar un ejecutable para desarrollar esta capacidad.

## Consecuencias

Se entrega una guía revisable y visual sin coste de inferencias adicionales. Los datos estructurados siguen siendo canónicos y el PDF es un derivado. La calidad de la explicación y su correspondencia con la interacción real requieren revisión: los textos iniciales son ayudas conservadoras que el responsable debe completar, especialmente en operaciones de negocio complejas. El manual no certifica por sí mismo permisos, ejecución ni disponibilidad de funciones.
