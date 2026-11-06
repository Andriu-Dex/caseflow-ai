# Reintento real de generación y evaluación de ventas

Fecha: 29 de octubre de 2026. Rama: `feat/visual-user-manual`. Sin commit.

## Resultado

Se restableció la conexión con ChatGPT y se generaron las cinco propuestas tipadas de ventas del plan v11. Tras corregir un error de tipos mediante reparación acotada, el código evaluado pasó instalación, lint, tipos, pruebas y compilación en Docker. También pasó 35 comprobaciones HTTP y la interacción de caja en navegador: crear borrador, revisar y confirmar.

**No se produjo una entrega oficial nueva.** La corrida completa terminó `FAILED` porque otras 24 acciones siguen sin una implementación aceptable. Los cinco archivos conservados en esa corrida son checkpoints de propuestas de negocio, no un proyecto publicable. No se creó un snapshot, ZIP o manual nuevo.

La prueba usa las propuestas reales de este proyecto y sus contratos, a diferencia de la fixture determinista de pedidos del reporte anterior. La reparación se aplicó a una copia de evaluación en un runtime desechable; no se sobrescribieron checkpoints históricos ni el snapshot anterior. Su éxito no cambia automáticamente el estado fallido de la corrida completa.

## Conexión y generación

El intermediario de desarrollo conservaba la pausa local del límite anterior. Se reinició únicamente ese proceso, se completó de nuevo el inicio de sesión y el proveedor volvió a responder. No se cambió de proveedor, modelo, variables de entorno o configuración de Git.

| Registro                                     | Identificador o resultado                             |
| -------------------------------------------- | ----------------------------------------------------- |
| Proyecto                                     | `4584e81d-42f3-4501-b0c8-58bac5f7253c`                |
| Plan aprobado v11, conservado                | `d5c1f96d-ebd4-407e-bc4c-738f63d43235`                |
| Corrida real                                 | `26d5e60c-91c6-415f-a44a-4cd5cec48461`                |
| Resultado general                            | `FAILED`, 24 advertencias de acciones sin implementar |
| Propuestas de ventas aceptadas estáticamente | 5                                                     |
| Peticiones de lógica de negocio              | 29, registradas como AIRun                            |
| Peticiones de reparación                     | 2: la primera truncada; la segunda correcta           |

Las acciones de ventas evaluadas fueron creación, modificación y revisión de borrador, confirmación e incorporación de observaciones internas. Las demás propuestas fueron rechazadas porque no implementaban un camino correcto. Por ejemplo, la consulta de indicadores exige un periodo explícito que su endpoint todavía no declara. Ese rechazo se conservó; no se simuló un resultado vacío o satisfactorio.

## Defectos encontrados y correcciones

### Capacidades de datos repetidas

El plan declara algunas capacidades de lectura y escritura de una entidad en entradas separadas. El controlador las convertía mediante `Object.fromEntries`, de modo que una entrada posterior podía eliminar la lectura anterior. Una operación que necesitaba consultar y modificar una venta podía terminar con permisos de persistencia incompletos.

El generador ahora conserva la unión sin duplicados de las operaciones expresamente declaradas para cada entidad. No añade permisos ajenos al plan ni elimina el filtro de sucursal. Se incorporó una prueba de regresión que comprueba la conservación de READ y CREATE sin introducir UPDATE.

### Fecha del contrato tratada como objeto

La primera compilación de las propuestas reales detectó TS2358: la creación de borrador usaba `body.operationalDate instanceof Date`, aunque el contrato valida y entrega una cadena de fecha. El proyecto no superó ese control inicialmente.

La reparación de archivos completos intentó devolver un servicio de 44 453 caracteres y alcanzó el límite de salida. No se aplicó un parche parcial ni se consideró ese intento correcto.

Se añadió `code-repair.generate@2` para diagnósticos TypeScript ubicados dentro de métodos de servicios de acciones. La selección y aplicación usan el AST de TypeScript ya disponible. El proveedor devuelve únicamente el cuerpo diagnosticado; las firmas, importaciones y el resto del archivo se conservan. Se rechazan métodos ajenos, duplicados, código no permitido, `any` y supresiones de tipos o lint. Los diagnósticos que no permiten esa selección conservan el mecanismo anterior.

La segunda reparación sustituyó el tratamiento incompatible por la conversión de la fecha textual, conservando su validación. No cambia el máximo de tres rondas ni evita la repetición de controles. Se añadieron pruebas de límites AST, preservación del archivo, rechazo de propuestas ajenas y selección de la versión nueva del prompt.

| Reparación                  | AIRun                                  | Resultado                                      |
| --------------------------- | -------------------------------------- | ---------------------------------------------- |
| Archivo completo, versión 1 | `881f115c-407e-4ff7-b470-d34c79550e60` | `FAILED`, salida truncada; sin parche aplicado |
| Cuerpo de método, versión 2 | `7d4f0440-2cc0-4c19-8fb1-cb3d5fd48cdc` | `SUCCEEDED`, parche revisado y validado        |

### Ajustes de la prueba, sin cambiar reglas del producto

Una comprobación inicial intentaba revisar precios de una venta ya confirmada mediante el endpoint exclusivo de revisión de borradores. Ese endpoint devuelve correctamente 409. La prueba se corrigió para exigir ese rechazo y consultar el historial mediante los endpoints de venta y línea; ambos conservaron los importes históricos tras cambiar el catálogo.

La prueba de navegador también se ajustó a la etiqueta real del contrato, «Cantidad positiva». No se eliminó la interacción ni se sustituyó por una captura. Los resultados finales corresponden al flujo completo después de esos ajustes.

## Evaluación en Docker

Se generó una copia del proyecto desde el plan v11 con las cinco propuestas reales. Las otras acciones conservaron sus stubs en esa copia; no se ejercitaron ni se certificaron como funcionales. La evaluación parcial no ejecuta una aprobación oficial ni convierte el proyecto completo en `READY`.

Los cinco controles del código reparado terminaron con salida 0:

| Control     | Tiempo observado |
| ----------- | ---------------- |
| Instalación | 38 026 ms        |
| Lint        | 6 456 ms         |
| Tipos       | 10 016 ms        |
| Pruebas     | 15 406 ms        |
| Compilación | 23 867 ms        |

El runtime utilizó una base desechable, sucursales y cuentas de prueba. El código generado se ejecutó exclusivamente dentro de Docker. No se usaron credenciales de la base principal ni se modificaron sus registros comerciales.

### Comprobaciones HTTP

Las 35 comprobaciones finales cubrieron:

- Inicio de sesión de Cajero, ámbito obligatorio, rechazo de ámbito falsificado y acceso ajeno.
- Rechazo de importes e identidad enviados por el cliente y de cantidad cero.
- Creación con precio de catálogo y el caso HALF_UP `0.005 → 0.01`.
- Actualización con revisión, conflicto por revisión obsoleta y rollback de venta, líneas y auditoría.
- Disponibilidad por sucursal, precios negativos, condiciones no interpretables y precios vigentes superpuestos.
- Selección del precio vigente de la sucursal, ignorando precios futuros, vencidos o de otra sucursal.
- Revisión sin escritura y rechazo de confirmación cuando cambia la referencia de precios.
- Confirmación concurrente con la misma clave, un único registro idempotente y recuperación del resultado original.
- Conflicto por reutilización de clave con datos distintos y por segunda confirmación con otra clave.
- Protección de ventas confirmadas y conservación del precio de venta y línea tras modificar el catálogo.
- Observaciones acumulativas, auditoría de cambios y ausencia de movimientos o cambios de inventario.

Es una matriz concreta de pruebas, no una demostración exhaustiva de todas las combinaciones comerciales. No se probaron menús, extras, reparto ni políticas todavía pendientes del plan.

### Navegador

Con una sesión de Administrador y una sucursal seleccionada, Playwright abrió `/checkout/new`, seleccionó un producto y cantidad, creó el borrador y comprobó la navegación al detalle. Después revisó los importes, comprobó la habilitación de confirmación y confirmó la venta. No se observaron errores de página en esa secuencia.

Esto acredita esa interacción de caja. No acredita todavía fidelidad visual con los bocetos aprobados, experiencia móvil, edición completa del borrador desde la interfaz, funcionamiento de todos los roles o de las demás pantallas. La etiqueta y la organización final de los controles de caja requieren revisión de UX antes de una entrega.

## Controles del repositorio y evidencia

La evidencia estructurada, hashes y metadatos de AIRun están en [el registro del reintento](2026-10-29-real-sales-retry-validation.json). La cobertura ejecutada fue de 77.64 % de líneas y 74.59 % de ramas, con 1028 pruebas correctas y tres omisiones existentes. No se añadieron dependencias ni migraciones de CASEFlow.

Los artefactos temporales de evaluación permanecen fuera del repositorio: `caseflow-real-sales-repaired-validation.json`, `caseflow-real-sales-runtime.json` y los parches correspondientes en `%TEMP%`. No contienen una entrega oficial. La documentación del mecanismo se actualizó en ADR-017 y §221.32 de la especificación.

## Lo que sigue pendiente

1. Completar los contratos y políticas de las otras 24 acciones. La indisponibilidad del proveedor dejó de ser el bloqueo principal.
2. Integrar el resultado del flujo parcial en una corrida completa, con trazabilidad y reparación registradas por el proceso oficial. Las propuestas originales conservadas no deben confundirse con la copia reparada evaluada.
3. Revisar el código generado y las convenciones técnicas, incluida la presencia de identificadores locales en español en algunas propuestas.
4. Revisar la experiencia completa de caja, los demás roles y la fidelidad con el diseño aprobado.
5. Crear un snapshot y ZIP nuevos solo tras superar todos los controles obligatorios. El manual se debe generar desde ese snapshot validado.

El [reporte anterior](2026-10-29-typed-actions-and-sales-readiness.md) conserva la evidencia del bloqueo por cuota y de las fixtures genéricas; este documento registra el reintento posterior con propuestas reales.
