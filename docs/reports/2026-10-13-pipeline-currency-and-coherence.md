# Vigencia del flujo y cobertura del diseño

Fecha: 2026-10-13. Implementación integrada en `feat/v2-construction`.

## Cambios

- Tarea 0: cambios visuales de fuentes y requisitos, commit `dfd4eab`.
- Tarea 1: página local de retorno de ChatGPT, commit `795a021`. Respuesta accesible, modo oscuro, CSP, sin caché ni parámetros OAuth visibles. `CASEFLOW_WEB_URL` es opcional y admite únicamente HTTP localhost/127.0.0.1; el instalable no configura ese enlace.
- Tarea 2: evaluación real de contexto v5, commit `91c343b`. Resultado y alcance en `2026-10-13-context-v5-live-evaluation.md`.
- Tarea 3: revisión ordenada y cobertura, commit `39eb330`; ADR-010 y DEC-136.
- Fusión sin conflictos: `26ee59e`.
- Reconstrucción repetible de la API del escritorio: `2bb1834`. Se reemplaza únicamente `apps/desktop/build/api`, después de comprobar su ubicación real y rechazar enlaces o ubicaciones externas. La instalación de dependencias del workspace se restaura incluso si falla el despliegue. No se elimina código fuente ni datos del usuario; la salida compilada se recupera reconstruyéndola.

`PIPELINE_ORDER` ordena las etapas compartidas por API y web. Una aprobación posterior a la evidencia de una etapa la deja por revisar; solo el primer pendiente es accionable. Las etapas sin evidencia mantienen sus requisitos normales. Crear un borrador no invalida el flujo. Las fechas se agregan por proyecto y tipo, sin consultas por etapa y sin contar artefactos archivados.

Una etapa se recupera con una aprobación posterior o una confirmación de vigencia. La confirmación requiere OWNER, EDITOR o REVIEWER, admite nota de hasta 500 caracteres y registra `STAGE_CONFIRMED_CURRENT` junto con la fila histórica. No cambia versiones aprobadas ni puede ocultar errores de coherencia o ausencia de evidencia. La tabla es de solo añadir; la eliminación integral de proyectos incluye estas filas bajo la excepción DEC-134.

Los avisos muestran qué cambió y dónde continuar, con diálogo de confirmación y modo oscuro. Las rutas compartidas permiten resolver Casos de uso/Diagrama y Modelo/ER. Las páginas posteriores bloqueadas conservan la lectura y deshabilitan sus controles. Las mutaciones notifican a la consulta de preparación para actualizar los avisos.

Congelar diseño, crear planes de construcción y comenzar una generación comprueba la vigencia en el servidor. La excepción de EXPRESS/BUILD_ONLY vive en un contexto asíncrono interno limitado al proyecto; no es una opción de la API pública. EXPRESS deriva de nuevo el diagrama al aprobar sus casos de uso en orden.

El diagrama de casos de uso debe incluir todas las versiones aprobadas vigentes. Las identidades se cuentan una sola vez aunque exista historial aprobado; una versión antigua no tiene que volver a representarse junto a su sucesora. ER comparte la versión y revisión del modelo de datos.

La matriz advierte de RNF sin cobertura explícita en el diseño aprobado. Los diagramas nuevos de arquitectura muestran las responsabilidades y códigos fuente declarados. No se fuerza cada RNF en todos los diagramas: debe atenderse en el elemento pertinente. Una referencia expresa cobertura declarada, no demuestra cumplimiento semántico ni sustituye revisar el contenido.

## Verificación ejecutada en la rama integrada

- `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck` y `pnpm run build`: aprobados.
- `pnpm run test`: 673 pruebas aprobadas, 3 omitidas por sus condiciones existentes.
- `pnpm --filter @caseflow-ai/web run test`: 140 aprobadas.
- `pnpm run test:integration`: 255 aprobadas, 2 omitidas. Incluye construcción, recuperación de trabajos, eliminación integral, autorización, revisión ordenada, auditoría, protección de confirmaciones y renderizado real local de diagramas.
- Evaluación de ChatGPT real: 1 aprobada; solo se ejecuta con activación explícita, separada de CI determinista.
- Prisma: esquema válido, cliente generado y migraciones aplicadas en desarrollo y pruebas (`localhost:5433`). La migración nueva es `20261013030000_stage_confirmations`; el historial completo también se prueba sobre PGlite en la suite del escritorio.
- La v3 del contexto de RestGuestMateos ya estaba APPROVED. No se volvió a aprobar ni se modificó su historial.
- Configuración local comprobada sin mostrar credenciales: `AI_MAX_OUTPUT_TOKENS=128000`, `AI_TIMEOUT_MS=180000`.

## Entrega e instalable

La rama temporal se fusionó mediante un commit de merge, sin resolver conflictos ni alterar `main`. Se publicó `feat/v2-construction` en `origin`, se comprobó su hash remoto y se eliminó la rama temporal local con `git branch -d`; esta nunca se publicó y sus commits permanecen en la historia de la rama de entrega. No se abrió un PR ni se fusionó con `develop` o `main`.

El instalable se construye con el frontend autónomo para escritorio, la API desplegada con dependencias reales y el proceso Electron compilado. El primer intento detectó una carpeta de API no vacía de una compilación anterior; el ajuste de `build:api` permite sustituir esa salida y repetir el empaquetado.

Se comprobó que los recursos del paquete contienen las 53 migraciones, incluidas:

- `20261012140000_use_case_relations`;
- `20261013010000_context_generation_jobs`;
- `20261013020000_project_deletion`;
- `20261013030000_stage_confirmations`.

El cliente Prisma compilado incluye `StageConfirmation`. No se encontraron archivos `.env` fuera de las dependencias dentro de los recursos empaquetados.

El empaquetado terminó con código 0. Se ejecutó `pnpm --filter @caseflow-ai/desktop run package`; tras corregir la salida de API anterior, se completaron `build:api` y `electron-builder --config electron-builder.yml` con las salidas de frontend y Electron ya compiladas correctamente por ese mismo proceso.

Se repitió `pnpm --filter @caseflow-ai/desktop run build:api` con la carpeta de salida ya existente y la versión final del script: código 0, sin el error de carpeta no vacía y con el workspace restaurado. El hash del instalador se volvió a comprobar después de esta repetición.

- Archivo: `apps/desktop/release/CASEFlow AI Setup 0.1.0.exe`.
- Tamaño: 262.740.924 bytes.
- Fecha de modificación local: 2026-10-13, 02:15:40.
- SHA-256: `003D179FD61AE34BD9AD07E2B04E5C9C74244BFCE817047274F8311DD0A40B64`.
- Firma Authenticode: `NotSigned`. La firma y las actualizaciones automáticas siguen fuera del alcance actual del instalable.

No se sustituyó ni se inició la aplicación instalada del usuario. El ejecutable y sus recursos son salidas locales ignoradas por Git; no se publican como código fuente.

## Cobertura global pendiente, reproducida también antes del cambio

Se comprobó el estado anterior sin esta implementación y se restauraron íntegramente los cambios después de medirlo. No se modificaron umbrales ni se deshabilitaron pruebas.

| Métrica   |   Antes | Después |
| --------- | ------: | ------: |
| Líneas    | 72,71 % | 72,88 % |
| Ramas     | 66,26 % | 66,50 % |
| Funciones | 68,83 % | 69,00 % |

`pnpm run test:coverage` sigue terminando con error por ramas y funciones inferiores al 70 %. Es un déficit previo de la suite global; las tres métricas mejoraron, pero el comando no está aprobado y CI podría seguir fallando en esa puerta. El objetivo de cobertura de líneas de AGENTS.md sí se alcanza. Este reporte no declara todas las puertas de calidad verdes.

## Límites de la verificación

No se ejecutó una instalación interactiva del nuevo ejecutable ni una revisión visual manual del inicio de sesión o del banner. Tampoco se generó un proyecto completo con IA real: la evaluación externa corresponde al contexto v5 y el flujo de construcción se prueba con proveedores deterministas. La fidelidad de todas las respuestas futuras no puede garantizarse automáticamente.
