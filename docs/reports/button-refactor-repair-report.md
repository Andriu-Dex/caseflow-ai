# Reparación del refactor de botones compartidos

Fecha: 26 de septiembre de 2026. Rama: `fix/button-refactor-styles`. Estado: cambios locales preparados para revisión, sin commit ni PR.

## Alcance

Se completó el refactor previamente preparado de botones nativos a `Button` de `@caseflow-ai/ui` en los 16 archivos de `apps/web` indicados en `instruction.md`. El trabajo se limitó a `variant`, clases visuales, formato y el import no usado en el formulario manual de requisitos. No se alteró la lógica de generación, revisión, navegación ni la apertura bajo demanda de diagramas.

## Correcciones

- Se sustituyeron 58 usos de `variant="outline"` por `ghost` en las páginas y componentes señalados. `outline` agregaba borde, fondo y sombra aunque el botón original no los tuviera. Los botones de agregar filas de los formularios manuales se mantuvieron como estaban por la instrucción específica de conservarlos.
- Se configuró `variant="link"` para «Quitar selección» y «Seleccionar todo(s)/todas» en casos de uso, revisión de candidatos y análisis estructurado. Se eliminaron clases duplicadas que el propio variant aporta.
- Se restituyeron clases necesarias: `self-start` en el submit de contexto y reporte manual, `mt-2` en guardar transcripción, `justify-start` en las filas de requisitos y el fondo ámbar en «Sí, archivar».
- Se completó el estilo de «Cancelar» en los tres formularios manuales y se eliminaron líneas vacías que ocupaban el lugar de `className` en botones cuyo variant ya aporta el estilo apropiado.
- Se eliminó el import sin uso `Trash2, Plus` de `requirement-manual-form.tsx`, que causaba el error de ESLint.
- Se aplicó Prettier a los 16 archivos, incluidos `tag-input.tsx` y `theme-toggle.tsx`, cuyos estilos de botón ya eran correctos.
- Se retiró `requirements.md` del índice de Git sin borrar el archivo. `docs/reports/data-model-and-export-improvements-report.md` no estaba en el índice al iniciar esta tarea y no se tocó.

## Verificación

| Comprobación                                                | Resultado                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corepack pnpm exec prettier --write` sobre los 16 archivos | Correcto.                                                                                                                                                                                                                                                                                             |
| `corepack pnpm run typecheck`                               | Correcto.                                                                                                                                                                                                                                                                                             |
| `corepack pnpm run lint`                                    | Correcto; desapareció el error de import no usado.                                                                                                                                                                                                                                                    |
| `corepack pnpm run format:check`                            | Correcto para el repositorio.                                                                                                                                                                                                                                                                         |
| `git diff HEAD --check`                                     | Sin errores de espacios.                                                                                                                                                                                                                                                                              |
| Revisión visual con Chromium local                          | Contexto, Requisitos, Modelo de datos, Navegación y barra de acciones de `DiagramViewer` revisados a 1440 × 900 con el proyecto de desarrollo «Préstamo de Equipos Deportivos». Los botones corregidos no muestran el borde ni la sombra de `outline`; «Quitar selección» se ve como enlace de texto. |
| Estilo calculado de «Ver en pantalla completa»              | `variant="ghost"`, borde `0px`, sombra `none`.                                                                                                                                                                                                                                                        |

Las capturas se guardaron temporalmente fuera del repositorio, en `%TEMP%/caseflow-button-refactor-review/`. No se agregaron al control de versiones.

## Notas

La revisión visual utilizó una API local que ya estaba escuchando en el puerto 3001. Al intentar arrancar otra instancia de desarrollo, esta informó `EADDRINUSE`; la instancia existente respondió durante toda la verificación. El servidor web de desarrollo usado para las capturas se detuvo al terminar.

Los cambios de esta tarea y el reporte quedan sin commit. El archivo `requirements.md` permanece en el disco como archivo sin seguimiento y fuera del índice.
