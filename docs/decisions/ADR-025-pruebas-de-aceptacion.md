# ADR-025 — Pruebas de aceptación por caso de uso

- **Estado:** Aprobado por indicación del usuario el 2026-11-18.
- **Decisión:** DEC-171.
- **Modifica:** la validación de la sección 9 de la especificación añade una etapa de aceptación dentro de las pruebas de extremo a extremo. No modifica ninguna regla de integridad y seguridad de la sección 2.

## Contexto

La validación comprueba que el proyecto se instala, compila, pasa sus pruebas y que cada pantalla abre sin errores. No comprueba que el sistema permita hacer lo que se pidió: que cada actor pueda llegar a sus casos de uso y usar sus acciones. La persona tampoco ve, por requisito, qué está cumplido y qué no. Con la construcción por entregas (ADR-024), una entrega debería aprobarse cuando lo que entrega funciona para quien lo va a usar.

## Decisión

### 1. Criterios derivados de lo aprobado

Cada caso de uso aprobado que el plan realiza produce sus criterios de aceptación **sin IA**:

- **Flujos:** uno por el flujo principal y uno por cada flujo alternativo, con código estable `CA-<caso>-<n>`.
- **Redacción:** «dado / cuando / entonces».
  - **Dado:** las precondiciones y que el actor primario inició sesión.
  - **Cuando:** los pasos del flujo, resumidos.
  - **Entonces:** las postcondiciones o el resultado del flujo alternativo.
- **Aprobación:** no hay un paso de aprobación aparte. Los criterios salen de los casos de uso y del plan, que la persona ya aprobó; cambiar un caso de uso cambia sus criterios.

### 2. Qué se ejecuta

Cada criterio se comprueba con una prueba de extremo a extremo generada de forma determinista:

- **Sesión:** se abre la sesión con el rol que corresponde al actor. Es el rol de la pantalla que coincide con el nombre del actor o, si no coincide ninguno, el primer rol autorizado de la pantalla.
- **Pantallas:** se abre cada pantalla del plan que realiza el caso de uso, sin errores del navegador ni de la API.
- **Acciones:** se comprueba que cada acción de esas pantallas está visible y habilitada para ese rol.

Las pantallas de detalle (con un parámetro en la ruta) quedan fuera, igual que en las pruebas actuales, porque necesitan un registro concreto.

**Límite explícito:** la prueba confirma que el actor puede llegar a su caso de uso y operar sus acciones. No completa formularios ni ejecuta la operación de negocio de principio a fin; eso queda para una mejora posterior con los datos de demostración.

### 3. Dónde se ejecuta

- **Cuándo:** las pruebas de aceptación se añaden en la **validación**, no en la generación. Así cubren por igual el código generado y la implementación manual (ADR-023), y no alteran los puntos de control de la IA.
- **Entregas:** en una entrega solo se prueban los criterios cuyas pantallas están todas incluidas en ella.
- **Resultados:** se leen del informe del ejecutor de pruebas y se guardan por criterio con la validación (`acceptance_results`: validación, criterio, caso de uso, resultado y mensaje).

### 4. Resultado por requisito

- **Cumplido:** todos los criterios de sus casos de uso pasaron.
- **Fallido:** alguno falló.
- **Sin criterio:** ninguna pantalla del plan realiza sus casos de uso todavía.

### 5. Condición de aprobación

- **Validación:** una construcción solo llega a `READY` si pasan todas sus pruebas de extremo a extremo, y las de aceptación forman parte de ellas.
- **Entregas:** aprobar una entrega ya exige un snapshot `READY`, así que exige también que pasen sus criterios.

## Consecuencias

- Una validación responde por requisito, no solo por pantalla.
- La implementación manual pasa por las mismas pruebas de aceptación.
- Un proyecto ya validado conserva su snapshot; los criterios se aplican desde su siguiente validación.
- La comprobación es estructural (llegar y poder operar), no funcional de extremo a extremo. Queda dicho en la interfaz para no dar una falsa garantía.

## Implementación por partes

1. Derivación de los criterios, generación determinista de la prueba y lectura de resultados por criterio.
2. Tabla de resultados, integración en la validación y resultado por requisito en la API.
3. Interfaz: criterios y resultados por requisito en la validación de cada construcción.
4. Especificación (DEC-171), guía de usuario y pruebas.
