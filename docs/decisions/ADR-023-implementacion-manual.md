# ADR-023 — Implementación manual de la construcción

- **Estado:** Aprobado por solicitud del usuario.
- **Decisión:** DEC-165.
- **Modifica:** el punto 4 de la sección 9 de la especificación («Generación híbrida») deja de ser el único origen del código de un proyecto. No modifica ninguna regla de integridad y seguridad de la sección 2.

## Contexto

La generación de un proyecto grande consume más cuota de IA de la que el proveedor disponible ofrece. El proyecto de demostración tiene unas 140 necesidades, 72 pantallas y 38 acciones de negocio. Cada cambio de alcance obliga a recomponer pantallas y lógica, y el resultado depende de respuestas que no siempre son coherentes entre sí. En la revisión con el cliente del 2026-11-16 se pidió una demostración completa y cuidada, que la generación por IA no garantiza con esa cuota.

CASEFlow ya admite código escrito por una persona en dos puntos acotados: las pantallas ajustadas a mano (DEC-161) y las correcciones revisadas de una copia de trabajo (ADR-018). Falta poder aportar el proyecto completo.

## Decisión

1. **Una corrida de construcción tiene un origen:** `GENERATED` (plantillas, generación determinista e IA) o `MANUAL` (código escrito por personas e importado).
2. **Importación.** Una persona con permiso de generación sube un ZIP del proyecto para un plan de implementación aprobado y su línea base de diseño aprobada. Se exigen las mismas condiciones previas que para generar: pasos vigentes, plan aprobado y línea base aprobada.
3. **Qué entra.** Solo archivos de texto del proyecto. Se dejan fuera:
   - dependencias instaladas, resultados de compilación y carpetas de herramientas;
   - archivos de entorno (`.env` y variantes, salvo `.env.example`);
   - el archivo de bloqueo y el manifiesto, que CASEFlow escribe en cada snapshot;
   - los puntos de control de una generación con IA (lógica de negocio, composiciones, hallazgos y datos de demostración) y el registro de fidelidad del diseño.

   Se rechazan los archivos binarios, las rutas fuera del proyecto y los proyectos que superan los límites de tamaño.

4. **Los puntos de control de la IA no se mezclan con código manual.** Una corrida manual no aporta ni reutiliza propuestas de IA, y una generación con IA posterior no toma como propuesta revisada nada de una corrida manual.
5. **Misma validación, sin IA.** El código importado se valida en el sandbox con las mismas etapas que el generado: instalación, lint, tipos, pruebas, compilación, estructura, trazabilidad y pruebas de extremo a extremo. La regla 4 de la sección 2 no cambia: el código solo se ejecuta en el sandbox. Diferencias:
   - no hay reparación automática: si una etapa falla, la corrida informa la etapa y el error, y la persona corrige e importa de nuevo;
   - no se comprueba el registro de fidelidad del diseño, porque no hay composición registrada; la fidelidad visual es responsabilidad de quien escribe el código.

   Se mantienen el catálogo de dependencias aprobado, los archivos obligatorios de la plantilla, la cobertura del plan (cada entidad con su modelo, cada ruta con su página y cada acción con su control marcado) y la prohibición de acciones sin implementar.

6. **Trazabilidad.** Cada archivo queda enlazado al plan de implementación. El manifiesto del ZIP puede declarar qué elementos del plan implementa cada archivo; solo se aceptan elementos que el plan aprobado define. El manifiesto nunca aporta identificadores de artefactos.
7. **Historial.** Cada importación es una corrida inmutable y auditada. Un proyecto manual no necesita repositorio propio: su historial son sus corridas y snapshots. El ZIP de un snapshot `READY` es el punto de partida de la siguiente edición.
8. **Lo demás no cambia:** snapshot, exportación, despliegue, revisión por unidades y manual de usuario funcionan igual con una corrida manual.

## Consecuencias

- Un proyecto puede completarse sin gastar cuota de IA, conservando las aprobaciones, la validación y la trazabilidad.
- La función es genérica: el núcleo no contiene código de ningún proyecto concreto.
- Quien escribe el código asume lo que antes garantizaba el generador: la fidelidad visual y la coherencia con los contratos del plan. La validación estructural y las pruebas de extremo a extremo siguen siendo la red de seguridad.
- Un mismo proyecto puede alternar corridas generadas y manuales; cada snapshot indica su origen.
