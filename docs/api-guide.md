# Guía de consumo y verificación de la API

## Contrato y disponibilidad

CASEFlow expone REST mediante NestJS. Los cuerpos documentados se derivan de los
contratos Zod de `packages/contracts`; los controladores definen rutas y respuestas.
En desarrollo, Swagger está en `http://localhost:3001/docs` y el JSON en
`http://localhost:3001/docs/openapi.json`. Ajusta origen y puerto a tu edición.
Ambas rutas documentales se deshabilitan con `NODE_ENV=production`.

Para generar el contrato del código actual sin conectar una base de datos:

```bash
pnpm --filter @caseflow-ai/api run build
pnpm openapi:generate
```

El resultado es `apps/api/openapi/openapi.json`, ignorado por Git. Regénéralo tras
cambiar controladores o contratos: un archivo antiguo no acredita las rutas de la
versión actual. La versión declarada de API sigue `package.json`; identifica también
el commit cuando entregues un catálogo.

## Autenticación y ámbito

1. `POST /auth/register` crea una cuenta; `POST /auth/login` inicia sesión con el
   cuerpo definido en el contrato del endpoint.
2. Usa el `accessToken` devuelto en `Authorization: Bearer <token>` para las rutas
   protegidas. No registres ni publiques su valor.
3. El servidor entrega el refresh token mediante cookie HttpOnly. Conserva las
   cookies en tu cliente; `POST /auth/refresh` rota la sesión y
   `POST /auth/logout` la cierra. No copies la cookie a `localStorage`.
4. En un navegador, las solicitudes que gestionan esa cookie deben permitir
   credenciales y usar el origen configurado por el servidor. En producción las
   cookies Secure requieren HTTPS, salvo el tratamiento local del navegador.

Conocer un UUID no concede acceso. Cada recurso debe pertenecer al proyecto y
espacio autorizados y la operación requiere un rol suficiente. No reutilices IDs
de otro proyecto ni asumas que lectura permite aprobación.

El Swagger actual no representa de forma completa los esquemas de seguridad ni
todos los ejemplos y errores de cada operación. Esta guía describe el flujo de
autenticación real; la ausencia de un candado en Swagger no convierte una ruta en
pública. Para automatizar un consumidor revisa también los guards y pruebas de
integración del recurso. La ampliación de anotaciones queda pendiente.

## Errores y trabajos

- Valida los cuerpos contra el contrato; un error de entrada no se corrige con
  reintentos repetidos.
- Ante 401 renueva la sesión cuando corresponda o vuelve a autenticarte; ante 403
  comprueba permisos.
- Los límites de autenticación pueden devolver 429 y `Retry-After`. Respeta ese plazo.
- Las respuestas de conflicto pueden señalar una versión desactualizada o un trabajo
  activo. Consulta el estado antes de crear otro.
- Las operaciones largas pueden devolver un trabajo: consulta sus endpoints de
  estado en vez de interpretar la aceptación como finalización.

No todos los endpoints comparten exactamente el mismo cuerpo de error: consulta
las respuestas declaradas y maneja fallos desconocidos sin mostrar datos internos.
No ejecutes ejemplos de creación, eliminación o aprobación contra proyectos ajenos.

## Recursos principales

| Recurso              | Ruta de referencia                                                           |
| -------------------- | ---------------------------------------------------------------------------- |
| Proyectos            | `/projects`                                                                  |
| Contexto versionado  | `/projects/{projectId}/context`                                              |
| Artefactos/versiones | `/projects/{projectId}/artifacts`                                            |
| Manual del software  | `/projects/{projectId}/generated-project-snapshots/{snapshotId}/user-manual` |

En el manual, `GET` consulta, `POST generate` solicita generación y
`GET versions/{versionId}/download?format=html|pdf|zip` descarga.
El ZIP requiere manual aprobado. Las imágenes privadas también requieren
autenticación y coincidencia del snapshot y versión.

## CI, aprobación y despliegue

El workflow `.github/workflows/ci.yml` se activa en pull requests y pushes a `main`.
Comprueba formato, lint, tipos, build, pruebas, cobertura, suite web, integración
y E2E según cada job. Su configuración no demuestra una ejecución exitosa: consulta
la ejecución correspondiente al commit.

La aprobación de un artefacto, la revisión de un PR y la autorización de un
despliegue son procesos distintos. El workflow actual no publica ni despliega
aplicaciones. Las reglas remotas de protección y environments deben verificarse
en GitHub; no se deducen del YAML. DEC-109 deja el despliegue automático fuera de
P0 de V1. Un ZIP reproducible es la salida soportada; no es evidencia de despliegue.
