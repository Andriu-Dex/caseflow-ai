# ADR-022 — Puerta determinista de pantallas y observaciones de cobertura

- **Estado:** Aprobado por solicitud del usuario.
- **Decisión:** DEC-164.
- **Sustituye:** el carácter bloqueante de las observaciones de DEC-160. Las excepciones justificadas siguen existiendo, pero ya no son necesarias para avanzar.

## Contexto

La composición de cada pantalla la propone la IA a partir del plano de interfaz, el boceto y los enlaces funcionales que el generador ya produjo. En la misma respuesta, la IA lista sus «limitaciones»: lo que el plano describe y la pantalla no tiene. Hasta ahora, cualquier limitación bloqueaba la corrida hasta que una persona la aceptara con una justificación ligada a la línea base y al texto exacto de la limitación.

En la regeneración de RestGuestMateos del 2026-11-14 (plan de implementación v29):

- 71 de 72 pantallas tuvieron limitaciones: 349 en total, con una mediana de 5 por pantalla.
- Volver a pasar los hallazgos guardados con reglas de bloqueo más laxas seguía dejando entre 33 y 70 pantallas bloqueadas.
- El prompt de pantallas había crecido hasta 54 KB en 37 versiones, la mayoría excepciones del tipo «no reportes X», varias con rutas de un proyecto concreto. Cada versión nueva invalidaba todas las composiciones guardadas.

La causa es estructural. El plano de interfaz es descriptivo y amplio; el plan de implementación es concreto y más acotado. La IA compara ambos en cada corrida, y la diferencia siempre aparece. Además, al ser texto libre, cada evaluación la redacta distinto, de modo que una aceptación no sobrevive a la siguiente.

## Decisión

1. **Qué hace una pantalla lo define el plan de implementación.** Sus rutas, acciones, contratos, campos y roles son el contrato funcional. El plano de interfaz y el boceto definen cómo se ve y orientan la composición.
2. **La puerta de pantallas es determinista.** Una composición se acepta cuando `validatePresentation` la valida:
   - conserva todos los controles y estados funcionales una sola vez y en su contexto;
   - no inventa controles, datos ni cifras;
   - respeta los límites de estructura y estilo.

   No interviene ningún juicio de la IA.

3. **Las limitaciones son observaciones de cobertura, no bloqueos.** Se guardan con la pantalla, en el registro de fidelidad (`docs/design-fidelity.json`), y se muestran en la revisión del código por unidades (ADR-020). Ante cada observación, la persona decide:
   - ampliar el plan de implementación en una versión nueva;
   - simplificar el plano de interfaz;
   - dejarla como está.
4. **Composiciones no válidas.** Si una composición con observaciones no es válida, la pantalla se entrega con su página funcional y la observación lo indica. Las demás pantallas no se detienen.
5. **Bloquea la corrida:**
   - una pantalla que el proveedor de IA no pudo componer, salvo excepción aceptada, porque se reintenta en la siguiente corrida;
   - una propuesta nueva no válida y sin observaciones.

   Las pantallas escritas a mano (DEC-161) siguen su regla: deben conservar todos los enlaces funcionales.

6. **Coste:** el prompt de pantallas no cambia en esta decisión, de modo que las composiciones ya guardadas se reutilizan sin nuevas llamadas. Reducir el prompt a una versión genérica, sin excepciones de un proyecto concreto, se hará aparte, porque invalida todas las composiciones guardadas.

## Consecuencias

- Una regeneración ya no falla por la redacción de la IA ni por diferencias entre plano y plan. Esas diferencias quedan visibles y trazadas para decidir sobre ellas una vez.
- La fidelidad funcional sigue garantizada por código: ninguna acción o dato del plan puede perderse en la composición.
- Las excepciones registradas (DEC-160) se conservan como historial y siguen marcando las observaciones aceptadas explícitamente.
- Un proyecto puede quedar `READY` con observaciones abiertas. Es intencionado: `READY` certifica que el software funciona y pasa sus validaciones, no que implemente todo lo que el plano describe.
