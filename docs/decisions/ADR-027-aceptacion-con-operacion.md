# ADR-027 — Aceptación con la operación principal de cada caso de uso

- **Estado:** Aprobado por indicación del usuario el 2026-11-20.
- **Decisión:** DEC-178.
- **Modifica:** ADR-025 levanta su límite explícito: la prueba de aceptación ya no se queda en llegar a las pantallas, también ejecuta la operación principal. No modifica las reglas de integridad y seguridad de la sección 2 de la especificación.

## Contexto

Las pruebas de aceptación de ADR-025 comprobaban que cada actor llega a las pantallas de su caso de uso y encuentra sus acciones, sobre una base de datos vacía. En la demostración de Cine Aurora eso no bastaba:

- una acción podía estar visible sin funcionar;
- algunos errores solo aparecieron al compilar o al usar la pantalla, como un formulario que no enviaba un dato obligatorio.

## Decisión

### 1. Datos de demostración en la validación

Antes de las pruebas de extremo a extremo, la validación carga los datos de demostración del proyecto con el mismo script que usa el despliegue (`apps/api/src/seed/demo-data.ts`), si el proyecto lo tiene.

- El script omite los registros que incumplen una regla.
- Si falla, la validación sigue, pero las operaciones que necesiten registros relacionados no tendrán opciones.
- Las capturas del manual también se toman con esos datos.

### 2. Operación principal de cada criterio

Cada criterio lleva su operación principal, calculada sin IA: la primera escritura que ofrecen sus pantallas. Primero se buscan las pantallas que no dependen de un registro; si no hay ninguna escritura, las pantallas de un registro del mismo caso de uso.

- **Creación genérica:** una operación `CREATE` de la entidad de la pantalla.
- **Actualización o borrado genérico:** una operación `UPDATE` o `DELETE` en la pantalla de un registro.
- **Acción de negocio:** un endpoint `POST`, `PATCH`, `PUT` o `DELETE`.
- **Pantallas de un registro:** cada parámetro de la ruta (`[screeningId]`) se resuelve con la entidad que nombra o con la entidad de la pantalla. La prueba abre el primer registro que el rol puede listar en esa colección, que viene de los datos de demostración. Si no lo hay, la operación no se ejecuta y el criterio lo dice; no falla.
- **Exclusiones:**
  - Iniciar y cerrar sesión no cuentan; ya se comprueban al abrir sus pantallas.

### 3. Cómo se ejecuta

La prueba abre la pantalla de la operación con la sesión del rol del criterio y rellena el formulario de esa acción a partir de sus propios controles:

- **Listas:** se elige la primera opción con valor.
- **Fechas, números y textos:** se usan valores válidos para el tipo de control.
- **Textos únicos:** llevan una marca de la ejecución, para no repetir un valor de los datos de demostración.

Después pulsa el botón de la acción, acepta una confirmación si la pide y espera la respuesta de la API a esa petición (mismo método y ruta).

### 4. Cuándo pasa

- **Creación o actualización genérica:** debe completarse (respuesta 2xx).
- **Borrado genérico o acción de negocio:** puede completarse o rechazarse (4xx), siempre que la pantalla muestre el motivo en un aviso. Los datos inventados no siempre cumplen una regla de negocio; por ejemplo, unos asientos de otra sala.
- **Falla en cualquier caso:**
  - un error del servidor (5xx);
  - que la acción no envíe su petición;
  - un error del navegador.

### 5. Resultado

El resultado de cada criterio guarda qué hizo su operación: «Se completó …» o «… se rechazó con un aviso a la persona (HTTP …)». La interfaz lo muestra como información y solo destaca en rojo los criterios fallidos.

## Consecuencias

- Una construcción solo llega a `READY` si las operaciones principales funcionan contra la base de datos real del sandbox.
- **Tiempo:** la validación de extremo a extremo tarda más. Los plazos predeterminados del navegador y de la aplicación del sandbox pasan a 360 000 ms y 420 s (ADR-014). Cada paso de una operación espera como mucho entre 5 y 10 segundos, para que una operación rota falle pronto y no agote el plazo de la etapa.
- **Límite:** la prueba no comprueba que el resultado sea el correcto para el negocio, como el importe de un total o qué asientos quedan ocupados. Eso sigue en las pruebas generadas y en la revisión de la persona.
- Una acción sobre un registro solo se ejecuta si los datos de demostración tienen un registro que el rol pueda listar.
- Rellenar a partir de los controles depende de que la pantalla use controles nativos. Un control propio sin elemento nativo puede quedar vacío y hacer fallar una creación.
