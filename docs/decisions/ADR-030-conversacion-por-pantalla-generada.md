# ADR-030 — Conversación por pantalla del código generado

- **Estado:** Aprobado por indicación del usuario el 2026-11-20.
- **Decisión:** DEC-181.
- **Modifica:** la composición de pantallas del software generado (ADR-021, ADR-022). No modifica las reglas de integridad y seguridad de la sección 2 de la especificación.

## Contexto

Las pantallas del código generado se componen con IA a partir del boceto aprobado y de la página funcional. Hasta ahora la persona solo podía aceptar los hallazgos de una pantalla o escribirla a mano. Pidió poder conversar con cada pantalla, igual que con los bocetos (ADR-029): pedir cambios, ver lo pedido y volver atrás.

## Decisión

1. **Peticiones por pantalla.** Cada pantalla del código, identificada por su ruta, tiene una conversación propia en el proyecto. Cada petición se guarda como una fila nueva con todas las peticiones en vigor; el historial no se modifica.
2. **Volver atrás.** Volver a una versión copia su conjunto de peticiones como fila nueva. Volver al diseño del boceto deja la pantalla sin peticiones.
3. **Composición.** En la siguiente construcción, las peticiones en vigor se envían a la IA junto con la pantalla. La IA las aplica solo a la presentación: no añade ni quita datos, acciones, rutas ni operaciones, y la validación de enlaces funcionales sigue igual.
4. **Coste.** Las peticiones entran en la clave de la composición guardada solo cuando existen. Las demás pantallas conservan su composición sin gastar IA, y volver a un conjunto ya compuesto la reutiliza.
5. **Pantallas escritas a mano.** No tienen conversación: se cambian importando otra versión (DEC-161).

## Consecuencias

- La persona ajusta pantalla por pantalla y paga una solicitud por cada pantalla con peticiones nuevas.
- Las peticiones son contenido de usuario no confiable: la IA las trata como preferencias de presentación y las reglas de la composición prevalecen.
- Los cambios se ven después de construir de nuevo la entrega.
