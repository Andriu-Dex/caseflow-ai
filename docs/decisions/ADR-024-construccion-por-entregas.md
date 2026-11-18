# ADR-024 — Construcción por entregas

- **Estado:** Propuesto; pendiente de aprobación.
- **Decisión:** DEC-170.
- **Modifica:** la sección 9 de la especificación («Construcción») gana un segundo modo de construir. No modifica ninguna regla de integridad y seguridad de la sección 2: las entregas se aprueban por una persona, el código solo se ejecuta en el sandbox y el historial sigue siendo inmutable.

## Contexto

Hoy la construcción produce el proyecto completo en una corrida: todas las acciones de negocio, todas las pantallas, los datos de demostración y la validación. En un proyecto grande eso tiene tres problemas:

- **Cuota de IA:** una sola corrida puede necesitar más solicitudes de las que el proveedor gratuito permite, y un fallo a mitad obliga a repetir.
- **Control:** la persona revisa todo al final, cuando corregir cuesta más.
- **Presentación:** no hay nada que enseñar al cliente hasta que todo está terminado.

CASEFlow ya tiene casi todo lo necesario para construir por partes:

- **Módulos:** el plan de implementación asigna cada entidad, acción, ruta y prueba a un módulo.
- **Reutilización:** cada acción y cada pantalla generada por IA queda como punto de control, y una corrida posterior con las mismas entradas la reutiliza sin pedirla de nuevo (DEC-168). La clave de una acción incluye todas las entidades del plan, no solo las de su módulo.
- **Revisión por unidades** (DEC-158) y validación completa en el sandbox, con pruebas de extremo a extremo.

## Decisión

### 1. Dos modos

- **Todo de una vez:** la corrida actual, sin cambios.
- **Por entregas:** el proyecto se construye en entregas sucesivas. Cada entrega añade uno o más módulos a lo ya aprobado.

Los modos no son excluyentes. Construyendo por entregas, la persona puede generar en cualquier momento todo lo que falta de una vez. Esa corrida reutiliza lo ya aprobado, porque sus puntos de control tienen las mismas claves.

### 2. Plan de entregas

- **Pertenencia:** un plan de entregas pertenece a una versión aprobada del plan de implementación.
- **Entrega 0 (base):** comprende el marco de la aplicación (menú y diseño) y los módulos que contienen la autenticación, los usuarios, las sesiones y los roles.
- **Entregas siguientes:** un módulo funcional cada una por defecto. La persona puede juntar varios módulos en una entrega.
- **Orden propuesto:** CASEFlow lo calcula por dependencias. Un módulo va después de los módulos cuyas acciones usan sus rutas y de los que contienen las entidades que sus acciones leen o escriben.
- **Cambios de orden:** la persona puede reordenar las entregas pendientes, pero no puede poner un módulo antes de otro del que depende; se explica cuál y por qué.
- **Entregas aprobadas:** no se reordenan ni cambian de módulos.

### 3. Qué genera una entrega

Una entrega genera un proyecto completo y ejecutable, igual que hoy, a partir de un **plan acotado**:

- **Entidades:** todas las del plan, con su esquema de base de datos. El esquema completo existe desde la entrega 0, así que las entregas siguientes no reescriben las relaciones. Además, las claves de reutilización no cambian.
- **Acciones, rutas, pantallas y pruebas:** las de los módulos de esta entrega y de las entregas aprobadas anteriores.
- **Menú:** muestra solo las pantallas incluidas.
- **Datos de demostración:** se proponen una vez para todas las entidades, en la entrega 0, y se reutilizan.

Solo se pide a la IA lo nuevo de la entrega. Lo de las entregas anteriores se reutiliza desde sus puntos de control. La estimación previa (DEC-168) se calcula sobre el plan acotado, de modo que la persona ve antes de generar cuánto cuesta esa entrega.

### 4. Validación

La corrida de una entrega se valida en el sandbox con las mismas etapas que una corrida completa: instalación, lint, tipos, pruebas, compilación, estructura, trazabilidad y extremo a extremo. Las pruebas cubren todos los módulos incluidos, de modo que cada entrega comprueba también que no rompió las anteriores (regresión).

### 5. Aprobación y congelado

- **Condiciones para aprobar:** una persona con permiso de aprobación aprueba la entrega cuando su corrida tiene un snapshot `READY`. Con la mejora 10.2 se exigirá además que pasen sus pruebas de aceptación.
- **Registro:** la aprobación es inmutable y auditada. Queda unida a la corrida y al snapshot aprobados.
- **Congelado:** una entrega aprobada queda congelada. Las entregas siguientes reutilizan sus acciones y pantallas.
- **Entrega afectada:** si una corrida posterior no puede reutilizar alguno de los puntos de control de una entrega aprobada, esa entrega pasa a **afectada**. Ocurre, por ejemplo, porque cambió una entidad que usa. La persona ve qué cambió y debe aprobarla de nuevo; no se rompe en silencio.
- **Entregas posteriores:** la siguiente entrega solo se puede generar cuando las anteriores están aprobadas y ninguna está afectada.

### 6. Cambio del plan de implementación

- **Plan de entregas nuevo:** una nueva versión aprobada del plan crea un plan de entregas nuevo. Conserva los módulos y el orden que siguen existiendo.
- **Historial:** las aprobaciones anteriores quedan como historial y no se trasladan.
- **Coste:** volver a generar una entrega cuyos elementos no cambiaron no gasta IA, porque todo se reutiliza.

### 7. Lo que no cambia

- **Snapshot, exportación, despliegue, revisión por unidades y manual de usuario:** funcionan con la corrida de una entrega como con cualquier otra. Así se puede publicar la demostración de cada entrega.
- **Implementación manual (ADR-023):** puede importarse para una entrega. Se valida contra el plan acotado.
- **Rutas Exprés y Solo construcción:** siguen construyendo todo de una vez.

### 8. Datos

Se añaden, mediante una migración:

- `delivery_plans`: el plan de entregas de una versión del plan de implementación.
- `deliveries`: cada entrega, con su posición y su nombre.
- `delivery_modules`: los módulos de cada entrega. Un módulo pertenece a una sola entrega del plan.
- `delivery_approvals`: las aprobaciones, solo de anexado, con la corrida, el snapshot, quién y cuándo.
- `generation_runs.delivery_id`: opcional; vacío en el modo «todo de una vez».

El estado de una entrega (pendiente, generada, aprobada o afectada) se calcula a partir de sus corridas y aprobaciones, no se guarda.

## Consecuencias

- **Cuota de IA:** un proyecto grande cabe en tandas pequeñas y un fallo solo repite la entrega en curso.
- **Control:** la persona aprueba el software por partes, con una demostración funcionando desde la entrega 0.
- **Requisito de las claves:** la reutilización depende de que las claves de los puntos de control no cambien al acotar el plan. Por eso el plan acotado conserva todas las entidades. Una prueba lo verifica: una acción generada en una entrega se reutiliza al construir todo de una vez.
- **Coste de cada entrega:** cada entrega valida el proyecto entero hasta ese punto. Una entrega tardía tarda lo mismo en validarse que una corrida completa.
- **Archivos compartidos:** el menú, el enrutado y el esquema se regeneran en cada entrega a partir de la plantilla, sin IA. Lo congelado son las acciones, las pantallas y la aprobación, no esos archivos.

## Implementación por partes

1. Migración, contratos y servicio del plan de entregas: propuesta de orden, validación de dependencias y cambios de orden.
2. Plan acotado y corrida de una entrega, con la estimación previa.
3. Aprobación, detección de entregas afectadas y regla de orden entre entregas.
4. Interfaz: selector de modo, plan de entregas, estado de cada entrega y su aprobación.
5. Especificación (DEC-170), guía de usuario y pruebas de integración de extremo a extremo con el proveedor de IA simulado.
