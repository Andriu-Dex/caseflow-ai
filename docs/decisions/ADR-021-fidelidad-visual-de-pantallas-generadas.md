# ADR-021 — Fidelidad visual de las pantallas generadas

- Estado: Aprobado por solicitud del usuario.
- Fecha: 2026-11-12.
- Decisiones: DEC-161 (pantallas ajustadas manualmente), DEC-162 (composición v37 y marco común), DEC-163 (datos de demostración realistas).
- Modifica: DEC-160 (excepciones de diseño), DEC-159 (datos de ejemplo).

## Problema

Las pantallas del proyecto generado funcionaban, pero no se parecían a los bocetos aprobados. La composición propuesta por la IA solo podía reordenar los bloques funcionales y aplicarles clases: no añadía títulos, textos de ayuda ni iconos del boceto, y no cambiaba el aspecto interno de los controles. Además, el marco común (navegación, tema, tipografía) era genérico, y los datos de ejemplo eran marcadores sin sentido («Nombre 1»).

## Decisión

1. **Marco común determinista (DEC-162).** El marco de la aplicación generada sigue el boceto sin IA: cabecera con la navegación agrupada por las ramas de primer nivel del árbol de navegación aprobado, migas de pan, chip de sesión, tema claro por defecto, tipografía, radios y controles del perfil de diseño. Estos archivos no forman parte de las entradas de la evaluación de pantallas, así que cambiarlos no invalida composiciones ya evaluadas.
2. **Composición v37 (DEC-162).** La propuesta de la IA admite nodos estáticos `TEXT` (títulos, descripciones y guías; sin cifras ni código) e `ICON` (lista cerrada de lucide). El compilador conserva el color propio de los componentes envueltos y garantiza texto legible sobre fondos sólidos.
3. **Pantallas ajustadas manualmente (DEC-161).** Una persona con permiso de generación puede registrar el código de una pantalla escrito a mano para un diseño aprobado (`ScreenDesignOverride`), con justificación. Es inmutable, se audita (`SCREEN_DESIGN_OVERRIDE_RECORDED`) y la última versión de cada ruta sustituye a la composición de la IA en la generación oficial, sin llamarla. Solo se acepta si conserva todos los enlaces funcionales de la página generada (marcas de acción, campos registrados y llamadas del cliente de API); el archivo queda con origen `MANUAL` y figura en `docs/design-fidelity.json`. La validación del sandbox (lint, tipos, pruebas, build, E2E) se aplica igual.
4. **Pantallas no evaluadas (modifica DEC-160).** Si el proveedor de IA no puede evaluar una pantalla, el resultado `NOT_EVALUATED` se registra como un hallazgo más y puede aceptarse con justificación; aceptado, la pantalla sale con su página funcional. Sin aceptación, la siguiente generación vuelve a pedir la evaluación.
5. **Datos de demostración realistas (DEC-163, modifica DEC-159).** En cada generación la IA propone unos seis registros por entidad, coherentes con el dominio y en la moneda que nombra el plan. El servidor conserva solo los valores que cumplen el tipo de su campo (enumeraciones, decimales, fechas, unicidad) y fija la moneda del plan en los campos de moneda. La propuesta se guarda como punto de control y se reutiliza mientras el modelo de datos no cambie. Sin IA se usan los valores deterministas, con una advertencia. También nombra el ámbito de operación inicial que crea el despliegue.

## Consecuencias

- La fidelidad visual depende de la calidad del boceto: lo que el boceto inventa (campos, datos o afirmaciones que no están en el modelo) no se reproduce, para que el código siga al modelo aprobado y no al dibujo.
- Las pantallas ajustadas a mano no se regeneran solas: un cambio del modelo que las afecte hará que su comprobación de enlaces falle y exija un ajuste nuevo.
- Regenerar los bocetos cambia el diseño aprobado e invalida las composiciones y excepciones existentes.
