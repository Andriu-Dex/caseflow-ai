# RestGuestMateos: primera entrega READY (plan v27)

## Resultado

- Corrida de generación `180fe7e4`, plan de implementación v27, línea base de diseño `ac298b2c`.
- Validación `f7f58e7b`: **READY**, snapshot oficial `4ea10675`.

| Etapa        | Resultado | Duración |
| ------------ | --------- | -------- |
| INSTALL      | Correcta  | 54 s     |
| LINT         | Correcta  | 6 s      |
| TYPECHECK    | Correcta  | 11 s     |
| TEST         | Correcta  | 16 s     |
| BUILD        | Correcta  | 24 s     |
| STRUCTURE    | Correcta  | —        |
| TRACEABILITY | Correcta  | —        |
| E2E          | Correcta  | 109 s    |

## Cómo se llegó

- Plan v27: etiquetas en español para 150 campos y 74 relaciones; sin cambios funcionales respecto a v26, por lo que la lógica de negocio de las 18 acciones se reutilizó desde caché.
- Pantallas evaluadas con Gemini Flash-Lite (`AI_ROUTE_FRONTEND_PRESENTATION`); ninguna llamada de ChatGPT en las corridas de esta etapa.
- Las pantallas con hallazgos quedaron cubiertas por excepciones justificadas (DEC-160), registradas por el propietario con la justificación «Simplificación aceptada para la demostración; la funcionalidad completa queda fuera del alcance de esta entrega».
- Cuatro errores de la lógica generada por IA (dos de lint y dos de tipos) se corrigieron como revisiones explícitas en versiones de trabajo (ADR-018), sin nuevas llamadas de IA.
- Correcciones del generador encontradas con el proyecto completo: parámetros de ruta, filtros de listas, botones de paginación con la etiqueta del plan, tipos del formulario de acciones y del login.

## Limitaciones conocidas

- La aceptación de pantallas se hizo sobre la evaluación de Gemini Flash-Lite, más permisiva que el evaluador principal; una pasada final con ChatGPT exigiría nuevas aceptaciones para los hallazgos que cambien.
- La consulta de hallazgos devuelve los últimos registrados por pantalla en cualquier corrida; incluye evaluaciones antiguas (40 excepciones sin efecto práctico).
- Arrancar un proceso auxiliar de CASEFlow mientras corre otro (p. ej. `pnpm dev` en modo `--watch`) marca como interrumpidos los trabajos en curso del otro proceso.

## Entrega desplegable (2026-11-11)

- Corrida `48052a71`, validación `d42f5c2e`: **READY**, snapshot `a3aacd15` (todas las etapas, E2E incluida).
- Incluye el proxy `/api` de la web y `deploy-accounts` (una cuenta inicial por rol), necesarios para el despliegue de ADR-019.
- Prueba del despliegue con Docker real y túnel rápido de Cloudflare: web, inicio de sesión y consultas autenticadas respondieron 200 desde la URL pública; la aplicación no tiene salida a internet (red interna) y la eliminación no dejó contenedores, volúmenes ni redes.
- Mejoras cerradas: consulta de hallazgos solo con los vigentes; latido de trabajos para que el arranque de otro proceso no interrumpa generaciones o validaciones en curso.

## Entrega con datos de ejemplo (2026-11-11)

- Corrida `776f57dc`, validación `98b896ab`: **READY**, snapshot `521722fe` (todas las etapas, E2E incluida), ejecutada por el worker de `pnpm dev` sin interrupciones.
- Incluye `seed/demo-data` (DEC-159): al desplegar, tras las cuentas iniciales, se crean 3 registros por cada entidad con alta CRUD (19 entidades en RestGuestMateos: productos, categorías, precios y disponibilidad por sucursal, gastos, catering…). Ventas, menús e inventario se crean con las acciones de negocio de la aplicación.
- Verificado con un despliegue de prueba: los registros se consultan desde la URL pública con la cuenta de administrador.
