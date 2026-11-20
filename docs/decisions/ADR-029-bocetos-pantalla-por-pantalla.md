# ADR-029 — Bocetos pantalla por pantalla, con conversación por pantalla

- **Estado:** Aprobado por indicación del usuario el 2026-11-20.
- **Decisión:** DEC-180.
- **Modifica:** la generación y el refinamiento de bocetos. No modifica las reglas de integridad y seguridad de la sección 2 de la especificación.

## Contexto

Un boceto se generaba de una vez con todas las pantallas del plano de interfaz. Si una pantalla salía mal, la persona solo podía pedir un cambio puntual y no veía qué había pedido antes ni podía volver a una versión anterior. Además, generar todo de golpe gastaba IA en pantallas que la persona aún no iba a revisar.

## Decisión

1. **Generar algunas pantallas.** Al crear un boceto o sobre uno existente, la persona elige qué pantallas del plano dibujar. El trabajo guarda esa selección (`screen_local_ids`); vacía significa todas. Las pantallas que no se vuelven a dibujar se conservan tal cual en la nueva versión del boceto. El menú del boceto sigue mostrando todas las pantallas del plano.
2. **Conversación por pantalla.** Cada pantalla muestra su historial: las versiones del boceto en que cambió, con la instrucción que pidió el cambio. Las versiones en que la pantalla no cambió no se repiten.
3. **Volver atrás.** La persona puede restaurar un dibujo anterior de una pantalla. La restauración crea una versión nueva del boceto (el historial es inmutable) con la nota «Restaurada la versión N.» y sin gasto de IA.
4. **Aprobación completa.** Un boceto solo se aprueba cuando tiene todas las pantallas de su plano de interfaz.

## Consecuencias

- La persona avanza pantalla por pantalla y solo gasta IA en lo que pide.
- Un reintento del trabajo reutiliza las partes ya generadas, igual que antes.
- Pendiente: la misma conversación por pantalla para las pantallas del código generado.
