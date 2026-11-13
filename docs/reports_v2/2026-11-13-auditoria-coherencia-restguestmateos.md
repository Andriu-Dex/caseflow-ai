# Auditoría de coherencia de RestGuestMateos (2026-11-13)

Alcance: proyecto RestGuestMateos, plan de implementación PI-002 v27, línea base de diseño `ac298b2c`, última generación validada `904594c8` (`READY`, snapshot `05792b51`). Auditoría de solo lectura: no se usó IA.

## 1. Comprobaciones propias de CASEFlow

| Comprobación            | Resultado                                    |
| ----------------------- | -------------------------------------------- |
| Preparación (readiness) | `ready: true`: todas las etapas satisfechas. |
| Motor de coherencia     | 4 avisos y 62 observaciones.                 |
| Vigencia (staleness)    | 271 artefactos evaluados.                    |

Avisos del motor de coherencia:

- RF-097, RF-099 y RF-100: el caso de uso usa el actor «Usuario del sistema», que no figura entre los actores declarados del requisito.
- Entidad «Planificación de catering»: solo define su identidad; falta decidir qué datos captura o confirmar que es conceptual.

Las 62 observaciones son requisitos no funcionales sin decisión de diseño explícita (60) y elementos de contexto sin requisito (2).

## 2. Cadena navegación → plano → plan → código

| Eslabón                                             | Resultado |
| --------------------------------------------------- | --------- |
| Nodos de pantalla del árbol de navegación con plano | 73 de 73  |
| Pantallas del plano con ruta en el plan             | 77 de 77  |
| Rutas del plan con página generada                  | 81 de 81  |

La cadena es estructuralmente completa.

## 3. Pantallas inaccesibles desde la interfaz

29 de las 42 rutas con parámetros no tienen ningún enlace que lleve a ellas desde otra pantalla. Existen y funcionan, pero quien usa la aplicación no puede llegar. Ejemplos: edición de producto, disponibilidad y precio por sucursal, preparación y publicación de menús, corrección y anulación de ventas, comprobantes de gastos, revisión OCR, etapas del catering, edición de usuarios y parámetros por ámbito.

Caso particular: las 5 pantallas de «Menús diarios» no aparecen en el menú porque su entrada (`/branches/[branchid]/menus`) depende de la sucursal y el menú solo ofrece rutas sin parámetros.

Causa: el generador no crea enlaces contextuales hacia las rutas hijas de una entidad (acciones de fila en listados, enlaces en detalles) ni ofrece las rutas cuyo único parámetro es el ámbito de operación. Es un defecto del generador, no del proyecto.

## 4. Hallazgos aceptados del evaluador de pantallas

80 rutas tienen hallazgos aceptados como excepción («simplificación para la demostración»): 395 hallazgos en total.

| Código                                                                         | Hallazgos |
| ------------------------------------------------------------------------------ | --------- |
| `MISSING_DATA_BINDING` (datos del plano que la pantalla no muestra)            | 166       |
| `MISSING_ACTION_BINDING` (acciones del plano sin implementación adecuada)      | 122       |
| `MISSING_FORM_BINDING` (formularios incompletos)                               | 74        |
| `UNSUPPORTED_LAYOUT` (composición no reproducible con los bloques disponibles) | 33        |

En 57 de esas rutas el propio evaluador indica que la discrepancia requiere revisar el plan (contradicciones entre plano, roles y contratos). Las rutas con más hallazgos son caja (`/checkout/[saleid]`, líneas), revisión OCR, planificación de catering, gastos y su corrección, y el detalle de auditoría.

## 5. Conclusión

El proyecto genera, valida y se despliega, y la cadena de artefactos está completa. No es todavía coherente de extremo a extremo: hay pantallas inaccesibles y una brecha amplia entre lo que el plano de interfaz promete y lo que las pantallas hacen, aceptada en bloque. Cerrarla exige (a) corregir el generador para la navegación contextual y (b) reducir o ajustar el alcance aguas arriba (requisitos, plano y plan) para que lo aprobado coincida con lo construido, con una nueva versión del plan y su regeneración.
