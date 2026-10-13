# ADR-009 — Eliminación definitiva de proyectos

- **Estado:** Aprobado
- **Fecha:** 2026-10-12
- **Decisión registrada como:** DEC-134
- **Modifica:**
  - §87: hasta ahora solo se podía eliminar un proyecto sin nada aprobado. Ahora puede eliminarse cualquiera, aunque tenga historial aprobado.
  - §31.2 y AGENTS.md §31.3: esas reglas siguen prohibiendo borrar una versión aprobada, una línea base congelada, un snapshot o un evento de auditoría _por separado_. La eliminación del proyecto completo es la única excepción.
- **Deja para después:** el período de recuperación de §87. Hoy la eliminación es inmediata.

## Contexto

Un proyecto se podía archivar o, si nunca había tenido nada aprobado, eliminar. Al revisarlo se encontraron tres problemas:

1. **Permisos:** cualquier miembro del proyecto podía eliminarlo, incluso uno de solo lectura.
2. **Confirmación:** la página pedía escribir el nombre del proyecto, pero el servidor no lo comprobaba.
3. **Borrado incompleto:** se borraba tabla por tabla y faltaban unas veinte. Un proyecto con bocetos, con requisitos ligados al contexto o con una fuente procesada no se podía eliminar. Además, las secciones indexadas de las fuentes no tienen clave foránea, así que quedaban huérfanas sin que nada avisara.

El propietario del producto decidió que los proyectos también puedan eliminarse definitivamente, con una confirmación como la de GitHub.

## Decisión

1. **Quién:** el propietario del proyecto, o el propietario o un administrador del espacio de trabajo. Se comprueba en el servidor.
2. **Confirmación:** hay que escribir el nombre exacto del proyecto. La página solo habilita el botón cuando coincide, y el servidor lo vuelve a comprobar (`confirmName`), de modo que una llamada directa a la API no basta.
3. **Alcance:** se borra todo:
   - las fuentes y sus archivos, el contexto, los requisitos, los casos de uso, los diagramas, los diseños y los bocetos;
   - las líneas base;
   - las generaciones de código, la validación en el sandbox y los snapshots con sus ZIP;
   - las ejecuciones de IA y la auditoría del propio proyecto.
4. **Protecciones de la base de datos:**
   - Las ocho funciones que impiden borrar historial dejan pasar un borrado solo dentro de la transacción que elimina un proyecto. Esa transacción se identifica con `SET LOCAL caseflow.project_purge = 'on'`.
   - Fuera de esa transacción, el historial sigue protegido igual que antes.
5. **Rastro:** cada eliminación queda en `project_deletions`, una tabla fuera del proyecto y de solo añadir. Guarda el espacio de trabajo, el identificador y el nombre del proyecto, quién lo eliminó y cuándo.
6. **Archivos:**
   - Se borran después de confirmar la transacción.
   - Si alguno falla, se registra en el log y la eliminación sigue en pie, porque el archivo ya no es accesible.
   - El almacenamiento tiene ahora una operación de borrado (`deleteObject`) que no da error si el archivo no existe.
7. **Verificación:** una prueba construye un proyecto completo con la ruta BUILD_ONLY, lo elimina y comprueba que no queda ninguna fila suya. Las tablas a revisar se obtienen del esquema, de modo que una tabla nueva que no se borre hace fallar la prueba.

## Consecuencias

- **A favor:** eliminar un proyecto funciona en todos los casos y deja un rastro de quién lo hizo.
- **En contra:** lo eliminado no se puede recuperar.
- **Mitigación:**
  - Archivar sigue disponible para dejar de usar un proyecto sin perder nada.
  - Pendiente: una papelera con período de recuperación, como prevé §87.
- **Límite conocido:** una generación en segundo plano que siga corriendo cuando se elimina el proyecto falla al guardar, sin efectos.
