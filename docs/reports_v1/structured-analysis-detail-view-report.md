# Vista de detalle para artefactos de diseño estructurado

Fecha: 27 de septiembre de 2026. Rama: `feat/structured-analysis-detail-view`. Estado: implementación local sin commit, push ni PR.

## Solicitud y situación inicial

`StructuredKindPage` mostraba el código, el título y el estado de Navegación, Arquitectura de software, Arquitectura de sistema y UI Blueprint. Los tres primeros podían abrir un diagrama, pero este omitía parte del contenido del artefacto. UI Blueprint no dispone de diagrama y, por tanto, su lista no permitía revisar las pantallas generadas antes de aprobarlas. El contrato ya entregaba la información estructurada en `item.content`; no se requirió una consulta adicional.

## Implementación

El único archivo de código modificado fue `apps/web/components/structured-kind-page.tsx`.

1. Se importaron los cuatro tipos de contenido del contrato compartido y se añadió `renderContentDetail`, que presenta texto legible según el tipo de artefacto:
   - **Navegación:** etiqueta, tipo, vista, ruta y descripción de cada nodo; códigos de casos de uso cuando existen.
   - **Arquitectura de software:** estilo, componentes, capa y responsabilidades; dependencias con sus descripciones y decisiones registradas.
   - **Arquitectura de sistema:** límite, nodos con tipo y responsabilidades; enlaces con protocolo y descripción.
   - **UI Blueprint:** nombre y propósito de cada pantalla; actores, secciones, acciones principales/secundarias, datos principales, formularios y estados cuando están presentes.
2. Se agregó el estado local `expandedId` para abrir un solo detalle a la vez. «Ver detalle» cambia a «Ocultar detalle» al expandirlo y declara `aria-expanded` para expresar su estado a tecnologías de asistencia.
3. El botón aparece en los cuatro tipos. Utiliza `Button` con `variant="ghost"`, junto al botón de diagrama en los tres tipos que lo tienen. El detalle y el diagrama mantienen estados independientes, por lo que pueden permanecer abiertos a la vez.
4. `invalidate()` ahora limpia `expandedId` junto con los diagramas al aprobar, archivar o crear una nueva versión. Esto evita mostrar detalle de una lista que acaba de cambiar.

No se cambiaron contratos, rutas, backend, generación, aprobación, persistencia ni lógica de renderizado de diagramas. El detalle se obtiene del `item.content` que ya llega en la respuesta de listado.

## Verificación ejecutada

| Verificación                                                | Resultado                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm run typecheck`                               | Correcto.                                                                                                                                                                                                                                      |
| `corepack pnpm run lint`                                    | Correcto.                                                                                                                                                                                                                                      |
| `corepack pnpm run format:check`                            | Correcto antes de agregar este reporte; se volvió a ejecutar después de formatearlo.                                                                                                                                                           |
| Navegación, proyecto local «Préstamo de Equipos Deportivos» | «Ver detalle» mostró nodos, tipo, `viewName`, rutas, descripciones y códigos de casos de uso.                                                                                                                                                  |
| Arquitectura de software, mismo proyecto                    | Se visualizaron estilo, componentes, capas, responsabilidades, dependencias y decisiones.                                                                                                                                                      |
| Arquitectura de sistema, mismo proyecto                     | Se visualizaron límite, tipos y responsabilidades de nodos, enlaces, protocolos y descripciones.                                                                                                                                               |
| UI Blueprint, mismo proyecto                                | Se visualizaron las pantallas generadas con propósito, actores, secciones, acciones, datos, formularios y estados. No aparece un botón de diagrama para este tipo.                                                                             |
| Independencia de controles                                  | En Navegación se abrieron detalle y diagrama a la vez; cerrar cualquiera de los dos dejó el otro abierto.                                                                                                                                      |
| Invalidación                                                | Se simularon en el navegador las dos respuestas de transición de una aprobación; después del refresco de la lista, «Ocultar detalle» volvió a «Ver detalle». Las peticiones de escritura fueron interceptadas, sin modificar la base de datos. |

La revisión visual se realizó con Chromium a 1440 × 900. Las cuatro capturas están en `%TEMP%/caseflow-structured-detail-review/`, fuera del repositorio y sin agregarse al control de versiones. No se creó una prueba de componente nueva: `instruction.md` pedía verificación manual y el componente no tenía un spec existente.

## Observaciones y límites

- El estado del artefacto UI Blueprint utilizado era «Generado por IA»; esto permitió comprobar que su contenido puede leerse antes de aprobarlo.
- La verificación de invalidación simuló las respuestas de aprobación para evitar cambios persistentes en el proyecto de desarrollo. El código del componente ejecutó la invalidación real de React Query.
- Los campos auxiliares de identificador y asociación que no aparecen en el detalle solicitado permanecen en `item.content` y en los contratos; esta tarea no cambia el modelo de datos.
- `requirements.md` ya estaba sin seguimiento al comenzar y se dejó intacto.
- No se hizo commit. Los archivos quedan disponibles para revisión en la rama indicada.
