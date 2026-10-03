# ADR-003 — Tema y paleta de colores del proyecto

- **Estado:** Aprobado
- **Fecha:** 2026-10-03
- **Decisión registrada como:** DEC-118
- **Extiende:** `CASEFLOW_AI_SPEC.md` §154 (`DesignSystemProfile`), §159 (mockups), §160 (Design Baseline) y §169 (generación de frontend). No reemplaza DEC-093: `CASEFLOW_STANDARD_WEB_V1` sigue siendo el perfil base.

## Contexto

El `DesignSystemProfile` es hoy fijo (`CASEFLOW_STANDARD_WEB_V1`): todas las aplicaciones generadas comparten la misma apariencia, y el usuario no puede elegir colores ni modo claro u oscuro antes de que se generen los bocetos y el código.

## Decisión

1. **Nuevo artefacto `DESIGN_THEME`** (prefijo `TEM-`) por proyecto, versionado y revisable como el resto del análisis estructurado:
   - `mode`: `LIGHT`, `DARK` o `BOTH`.
   - Paleta de tokens semánticos (`primary`, `secondary`, `accent`, `background`, `foreground`, `muted`, `destructive`, etc.) para el modo claro y, si aplica, el oscuro.
2. **Generación:** la IA propone tres paletas candidatas a partir del contexto del proyecto; el usuario elige una o la ajusta con un prompt, y cada ajuste es una versión nueva. Sin IA, se puede definir a mano (fallback manual, `AGENTS.md` §4.6).
3. **Accesibilidad obligatoria:** una validación determinística exige contraste WCAG AA entre texto y fondo. Una paleta que no lo cumple no puede aprobarse.
4. **Congelado en la aprobación de diseño:** nuevo rol `DESIGN_THEME` en la `DesignBaseline`, **obligatorio solo para proyectos nuevos**. Los proyectos existentes conservan sus aprobaciones de diseño intactas y siguen usando el perfil estándar.
5. **Una sola fuente de verdad para ver y construir:** el mismo tema se entrega al proveedor de bocetos (Stitch o el renderizador interno) y al generador del frontend, que lo emite como variables CSS de Tailwind y, con `BOTH`, agrega un selector de tema a la app generada.

## Consecuencias

- **A favor:** la aplicación generada se parece a lo que el usuario eligió, y lo que se aprueba en los bocetos es lo que se construye.
- **En contra:** un paso más en la fase de diseño y un rol nuevo en la línea base.
- **Compatibilidad:** no se reescribe ninguna línea base existente (historial inmutable).
