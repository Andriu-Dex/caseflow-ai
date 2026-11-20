# ADR-028 — Estándar visual del software generado

- **Estado:** Aprobado por indicación del usuario el 2026-11-20, tras comparar cuatro propuestas (A Sereno, B Operativo, C Vivo y D Equilibrado) y elegir la D con una paleta unificada.
- **Decisión:** DEC-179.
- **Modifica:** la presentación de la plantilla web, los bocetos y la composición de pantallas. No modifica las reglas de integridad y seguridad de la sección 2 de la especificación.

## Contexto

Las pantallas generadas y los bocetos se veían planos y saturados de texto. En RestGuestMateos, la ficha de un evento de auditoría repartía un texto técnico largo en tres columnas iguales. La persona responsable del producto pidió pantallas modernas que no parezcan un boceto ni estén saturadas de información.

## Decisión

### 1. Estructura

- **Marco:** un menú lateral oscuro, agrupado por módulos con títulos de sección. Abajo, la sesión con la persona y su rol, el cambio de tema y el cierre de sesión. Encima de la página, la ruta de navegación.
- **Banda de cifras:** el inicio y las fichas de detalle abren con una banda oscura que muestra el saludo o el estado y las cifras clave.
- **Listas:** filtros rápidos por estado, con su recuento («En venta · 14»); búsqueda y filtros en la cabecera de la tabla; dos líneas por fila como máximo; paginación al pie.
- **Detalle:**
  - las cifras y el estado arriba;
  - los bloques de datos en lista de clave y valor;
  - el texto largo a lo ancho, con un máximo de 72 caracteres por línea;
  - el historial como línea de tiempo;
  - los datos técnicos plegados.

### 2. Color

Todo sale de la paleta del tema del proyecto, para que combine en cualquier proyecto:

- **Menú y bandas:** tonos oscuros derivados del color primario (`--color-sidebar`, `--color-band`, `--color-band-tile`).
- **Un solo acento:** el color de acento del tema se reserva para la acción principal de la pantalla y para avisar de lo que requiere atención.
- **Estados con significado fijo:**
  - normal: tinte suave del primario;
  - atención: tinte suave del acento;
  - inactivo: gris;
  - error: destructivo.

  No se añaden otros tonos sueltos (ni verdes ni azules brillantes por su cuenta).

### 3. Texto

- **Tipografía:** Inter, en una escala sobria.
- **Cifras:** con dígitos tabulares.
- **Identificadores:** ningún identificador técnico (nombres de entidades, campos o UUID) en los textos visibles.

## Implementación por partes

1. Marco y tonos derivados en la plantilla (`presentation-shell.ts`, `globals.css`).
2. Instrucciones de los bocetos y de la composición de pantallas con este estándar.
3. Comprobación de identificadores técnicos visibles en la validación. La prueba de extremo a extremo de cada pantalla falla si el texto visible muestra un UUID o un nombre del modelo de datos escrito como código (con una mayúscula interior, como `operationalDate`). Los datos técnicos plegados no cuentan. Las listas ya no tienen columna de identificador: la primera columna abre el registro, y el registro de un parámetro de ruta se muestra por su nombre.
4. Chat por pantalla en bocetos y en código.

## Consecuencias

- Los proyectos ya construidos cambian de marco en su siguiente construcción.
- Quitar la columna de identificador cambia el código de las listas: al construir de nuevo un proyecto ya construido, sus pantallas de lista se vuelven a componer con IA.
- **Coste de IA:** la composición de pantallas pasa a la versión 39 de sus instrucciones. Al construir de nuevo un proyecto, sus pantallas se vuelven a componer con IA, una solicitud por pantalla. Hay que estimarlo antes de construir.
- El acento del tema pasa a tener un uso fijo. Un tema con un acento poco visible da una acción principal poco visible, así que el tema generado debe elegir un acento que contraste con el primario.
