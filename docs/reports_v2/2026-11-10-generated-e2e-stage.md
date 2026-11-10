# Etapa E2E del software generado (DEC-159, fase 1)

## Qué cambia

- **Generador:** todo proyecto incluye `apps/web/playwright.config.ts`, el script `test:e2e` y `apps/web/e2e/screens.spec.ts`. La prueba abre cada pantalla estática del ImplementationPlan con un rol autorizado (la pantalla de acceso, sin sesión) y exige respuesta correcta, ruta sin redirección, encabezado `h1` visible, ningún error del navegador y ninguna respuesta ≥400 de la API. Se puede ejecutar contra un entorno local con `E2E_BASE_URL`, `E2E_API_URL` y `E2E_SESSIONS`.
- **Ejecutor:** `DockerRuntimeCaptureProvider` implementa `E2ETestProvider.runE2E`. Reutiliza el mismo entorno que las capturas del manual: compilación sin red, PostgreSQL desechable, red interna aislada, sesiones de prueba firmadas con la clave del entorno desechable y el contenedor Playwright endurecido (imagen `caseflow-runtime-capture-browser:1.55.0-v2`, que ahora incluye `@playwright/test`). La configuración de Playwright la escribe el controlador; del proyecto solo se toman los archivos de `apps/web/e2e/`.
- **Validación:** nueva etapa `E2E` (migración `20261110000000_validation_stage_e2e`) tras `TRACEABILITY`. Un fallo deja la validación sin `READY` ni snapshot y sigue el flujo de reparación acotada. Sin ejecutor disponible, la etapa falla; si Docker no responde, el intento termina en `ERROR` reintentable.
- **Interfaz:** la etapa aparece como «Pruebas en navegador».

## Verificación

| Comprobación                                                                                                        | Resultado                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `pnpm run typecheck`, `pnpm run lint`                                                                               | Correctos                            |
| Suite unitaria                                                                                                      | 1071 pasan, 3 omitidas               |
| Integración `construction-sandbox` (incluye: E2E fallida → `VALIDATION_FAILED`, sin snapshot)                       | 9 pasan, 1 omitida                   |
| `node tests/evaluations/lifecycle/run.mjs` (Docker real): 5 etapas, 22 comprobaciones PostgreSQL y E2E en navegador | Correcto; 2 de 2 pantallas sin error |

## Pendiente (fases siguientes)

Flujos CRUD con datos de ejemplo, rutas de detalle (`[param]`), acciones con contrato y pruebas negativas derivadas de las reglas del plan.
