# Revisión de la vista de construcción

Fecha: 2026-11-08. Rama: `feat/construction-working-copy`. Sin commit.

## Correcciones

El mensaje «Este paso está completo» utilizaba la existencia de cualquier corrida histórica `GENERATED`. Por eso podía aparecer sobre una versión de trabajo incompleta, aunque la entrega antigua perteneciera a otro plan.

Ahora el estado compartido por encabezado y navegación identifica el último plan aprobado por fecha y la generación más reciente de esa versión. La construcción solo se muestra completada cuando esa generación está `GENERATED` y su último intento de validación está `READY` con snapshot. El encabezado dice «Software validado». Una versión de trabajo, un fallo, una corrida activa o una validación pendiente no recuperan el éxito de una corrida anterior. Una corrida archivada conserva su significado histórico; ocultarla no permite sustituirla por una entrega anterior para completar el estado.

Se destaca la generación del plan seleccionado y se conserva el resto en «Historial de generaciones», cerrado inicialmente. Cada entrada histórica permite abrir sus detalles de forma individual. Sus validaciones y archivos no se consultan mientras esos detalles permanezcan cerrados. Las entregas históricas siguen disponibles al solicitarlas, con sus controles de descarga originales.

Las versiones de trabajo muestran el número de acciones con implementación y pendientes leído de `docs/working-copy.json`. Los pendientes se agrupan por el módulo del plan y usan etiquetas de acciones o descripciones disponibles. Las rutas y los avisos 501 permanecen en los detalles técnicos. Los contadores se refieren a acciones personalizadas, no a requisitos satisfechos o a un porcentaje de validación.

La proyección del manifiesto se valida con un esquema compartido. Se comprueban versión de formato, condición no oficial, versión del plan, baseline, límites y ausencia de duplicados o solapamientos entre listas. Ante ausencia, corrupción o incompatibilidad se informa que el resumen no está disponible; no se inventan cifras a partir de las advertencias.

## Cambios del usuario conservados

Se conservaron el bloque introductorio unificado, controles compactos, advertencias plegables, límites de altura para evidencias y el selector de intentos que muestra inicialmente el último. El selector utiliza botones nativos con estado presionado dentro de un grupo accesible; no anuncia pestañas sin implementar su navegación y paneles correspondientes. Se mantuvo la posibilidad de consultar un intento antiguo, volver al último o mostrar todos.

No se realizaron operaciones Git sobre el índice, commits o cambios de rama durante esta revisión. No se modificaron los planes, las corridas o los snapshots de RestGuestMateos, ni se ejecutaron nuevas inferencias o migraciones.

## Verificación

- Suite web completa: **345 pruebas correctas** en 66 archivos.
- Pruebas dirigidas de vista, encabezado, estado compartido y resumen: **36 correctas**.
- Contratos compartidos: **69 pruebas correctas**.
- Typecheck y build de `@caseflow-ai/web`: correctos.
- Lint del repositorio, formato y comprobación de diff: correctos.

Las regresiones cubren: éxito histórico frente a versión de trabajo/fallo/corrida activa posterior, plan anterior, validación más reciente fallida o en curso, `READY` sin snapshot, historial sin consultas anticipadas, selección de intentos y manifiestos ausentes, inválidos, solapados o de otro plan/baseline.

No se realizó una nueva inspección visual completa de la página en un navegador conectado ni una evaluación de todas las resoluciones de pantalla. Las pruebas verifican comportamiento de componentes y compilación; no se presentan como una certificación visual. Tampoco se repitieron las evaluaciones de negocio de ventas e inventario: esta revisión modifica presentación y cálculo de progreso, no sus implementaciones.

La consolidación anterior conserva sus **15 acciones con implementación y 16 pendientes**. Esta revisión no convierte esa versión de trabajo en una entrega oficial ni resuelve esos pendientes de negocio.
