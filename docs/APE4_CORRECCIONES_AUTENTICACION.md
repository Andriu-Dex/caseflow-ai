# CASEFlow AI — APE4: REPORTE DE CORRECCIONES DE AUTENTICACIÓN

Corrección de los hallazgos **H1**, **H2** y **H4** de la auditoría de la API (APE4). Fecha: 2026-10-20.
Rama: `fix/auth-validation-rate-limit-cookie`, creada desde `develop` (`eb39bec`). Los hallazgos se documentaron en `docs/APE4_API_INVENTARIO.md` y `docs/APE4_API_CATALOGO.json` (rama temporal de documentación de la APE4); este informe no los modifica ni los reescribe: las evidencias «antes» se conservan aquí tal como se obtuvieron.

## 1. Resumen

| Hallazgo | Defecto                                                                                              | Corrección                                                                                  | Estado                                             |
| -------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **H1**   | `POST /auth/register` aceptaba datos inválidos con 201 (y los campos ausentes provocaban un 500)     | Validación del esquema Zod compartido en registro e inicio de sesión                        | Corregido, verificado en local                     |
| **H4**   | Al cerrar sesión la cookie `refresh_token` no se borraba en el navegador (`Path=/` frente a `/auth`) | Una sola definición de las opciones de la cookie para crearla y para borrarla               | Corregido, verificado en local y en navegador      |
| **H2**   | 60 inicios de sesión fallidos seguidos sin 429 ni límite                                             | Limitador de intentos en inicio de sesión, registro y refresco (Redis compartido o memoria) | Corregido, verificado en local y contra Redis real |

Se hicieron tres commits de código en el orden pedido (H1 → H4 → H2). El estado de CI se anota en la sección 9; hasta que ese CI termine, la verificación es la local descrita aquí.

## 2. Inspección previa

| Comprobación                              | Resultado                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rama y commit de partida                  | `feat/v2.1-distribution` @ `4677496`; trabajo en `fix/auth-validation-rate-limit-cookie` desde `origin/develop` (`eb39bec`)                                                                                                                                                |
| Cambios del usuario que pudieran perderse | Árbol limpio al empezar. La rama temporal `tmp/ape4-docs` no se tocó                                                                                                                                                                                                       |
| `CASEFLOW_AI_SPEC.md` y `AGENTS.md`       | Spec §80: validación estricta de DTO, límites, cabeceras de seguridad y «rate limiting en endpoints sensibles»; el login debe protegerse con throttling y no con bloqueos permanentes. `AGENTS.md` §34 (seguridad obligatoria), §51 (no añadir dependencias sin necesidad) |
| ADR relevantes                            | Ninguno sobre autenticación. Se añadió **ADR-011** con la decisión y los valores                                                                                                                                                                                           |
| Infraestructura existente                 | `ioredis` ya es dependencia de la API; Redis ya lo usa BullMQ en la edición web; la edición de escritorio no tiene Redis (`CASEFLOW_QUEUE_MODE=in-process`)                                                                                                                |
| Dependencias nuevas                       | **Ninguna**                                                                                                                                                                                                                                                                |

## 3. H1 — Validación obligatoria del registro

### 3.1 Descripción y causa raíz

`POST /auth/register` aceptaba un correo inválido, una contraseña de 5 caracteres y un nombre de 1 carácter y respondía 201, aunque `registerRequestSchema` exige correo válido, contraseña ≥ 8 y nombre ≥ 2. Causa raíz: el controlador recibía `@Body()` sin `ZodValidationPipe`; la validación existía solo en la interfaz web. `POST /auth/login` tenía el mismo defecto (sin validar `loginRequestSchema`). Además, con campos ausentes el cuerpo llegaba tal cual a Prisma y la API respondía **500**, con el error de Prisma en el registro del servidor.

### 3.2 Evidencia ANTES

| Origen                                                              | Solicitud                                                         | Respuesta                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Auditoría de la API, ejecución real (registro n.º 3 del inventario) | `{"email":"no-es-correo-…","password":"corta","displayName":"A"}` | **201** con `accessToken`, cookie de refresco y usuario creado |
| Pruebas nuevas ejecutadas contra el código de `develop` (`eb39bec`) | 15 casos de `auth-validation.integration.spec.ts`                 | **12 fallaron y 3 pasaron**                                    |

Detalle de los 12 fallos contra el código original:

| Caso                                                                                  | Esperado |              Obtenido |
| ------------------------------------------------------------------------------------- | -------: | --------------------: |
| Registro con correo inválido / contraseña corta / nombre de 1 carácter                |      400 |    **201** (los tres) |
| Registro con correo, contraseña o nombre ausentes; contraseña no cadena; cuerpo vacío |      400 | **500** (cinco casos) |
| Login con correo inválido / contraseña ausente / contraseña no cadena                 |      400 |    **401** (los tres) |
| Login con correo ausente                                                              |      400 |               **500** |

### 3.3 Archivos modificados (commit `9b32c3f`)

- `apps/api/src/identity/auth.controller.ts`: `@Body(new ZodValidationPipe(registerRequestSchema))` y `@Body(new ZodValidationPipe(loginRequestSchema))`; se documenta el 400 en OpenAPI.
- `apps/api/test/integration/auth-validation.integration.spec.ts` (nuevo).

### 3.4 Solución

Se reutiliza la infraestructura existente (`ZodValidationPipe`), de modo que el error es el mismo que en el resto de la API: `400 {"message":"La solicitud no es válida.","errors":[{"path","message"}]}`. Los contratos **no se modificaron**.

### 3.5 Pruebas incorporadas

`apps/api/test/integration/auth-validation.integration.spec.ts` (HTTP real contra PostgreSQL aislado, 15 casos): registro válido → 201; correo inválido, contraseña corta, nombre corto, campos ausentes, contraseña no cadena y cuerpo vacío → 400, sin cookie ni token y **sin crear usuarios, espacios de trabajo ni sesiones** (se comparan los conteos antes y después en la base); correo duplicado → 409 sin crear nada; login válido → 200, credenciales incorrectas → 401, y login con cuerpo inválido → 400 sin sesión.

### 3.6 Evidencia DESPUÉS

| Solicitud (pila real en modo producción)                                              | Antes | Después                                                                                                              |
| ------------------------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------- |
| Registro con correo inválido, contraseña de 5 caracteres y nombre de 1 carácter       |   201 | **400** `errors`: `email` («Invalid email address»), `password` («>=8 characters»), `displayName` («>=2 characters») |
| Registro con contraseña corta                                                         |   201 | **400** (`password`)                                                                                                 |
| Registro con cuerpo vacío                                                             |   500 | **400** (tres campos)                                                                                                |
| Login sin contraseña                                                                  |   401 | **400** (`password`)                                                                                                 |
| Registro válido                                                                       |   201 | 201 (sin cambios)                                                                                                    |
| Registro duplicado                                                                    |   409 | 409 (sin cambios)                                                                                                    |
| Usuarios guardados para los registros rechazados (consulta SQL en la base de la pila) |     — | **0**                                                                                                                |

Resultado de pruebas: 15/15 pasan (`auth-validation.integration.spec.ts`) y el caso existente `identity.integration.spec.ts` sigue pasando.

## 4. H4 — Eliminación correcta de la cookie de refresco

### 4.1 Descripción y causa raíz

La cookie `refresh_token` se crea con `Path=/auth`, pero `logout` la borraba con `res.clearCookie('refresh_token')`, que usa el `Path=/` por defecto. Un navegador identifica la cookie por nombre, dominio y ruta, así que el borrado no alcanzaba a la original; el servidor sí revocaba la sesión. Causa raíz: las opciones de la cookie estaban escritas en un método privado del controlador y el borrado no las reutilizaba. La prueba unitaria del controlador incluso comprobaba el comportamiento defectuoso (`clearCookie('refresh_token')` sin opciones).

### 4.2 Evidencia ANTES

| Origen                                                            | Resultado                                                                                                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auditoría de la API, ejecución real (registro n.º 56 y n.º 60)    | Creación: `Set-Cookie: refresh_token=<…>; Path=/auth; HttpOnly; SameSite=Lax`. Cierre de sesión: `Set-Cookie: refresh_token=; Path=/; Expires=Thu, 01 Jan 1970 …`                                  |
| Prueba de integración nueva contra el código original             | Falla: `AssertionError: expected '/' to be '/auth'` (la ruta de la cookie borrada)                                                                                                                 |
| **Prueba en navegador real (Chromium) contra el código original** | Falla en `expect(cookie).toBeUndefined()`: tras cerrar sesión, el navegador **seguía teniendo** `{"domain":"localhost","httpOnly":true,"name":"refresh_token","path":"/auth","sameSite":"Lax", …}` |

### 4.3 Archivos modificados (commit `f607801`)

- `apps/api/src/identity/refresh-cookie.ts` (nuevo): `REFRESH_COOKIE_NAME`, `refreshCookieOptions()`, `setRefreshCookie()`, `clearRefreshCookie()`.
- `apps/api/src/identity/auth.controller.ts`: usa esas funciones para crear y para borrar la cookie.
- `apps/api/src/identity/auth.controller.spec.ts`: la prueba que fijaba el defecto ahora exige el borrado con los atributos de la cookie original.
- Pruebas nuevas: `apps/api/src/identity/refresh-cookie.spec.ts`, `apps/api/test/integration/auth-session-cookie.integration.spec.ts`, `e2e/auth-session.spec.ts`.

### 4.4 Solución

Una sola definición (`httpOnly`, `secure` solo en producción, `sameSite: 'lax'`, `path: '/auth'`, sin `Domain`) se usa al crear y al borrar. No se cambia la política de seguridad existente y se conserva la revocación de la sesión en el servidor.

### 4.5 Pruebas incorporadas

- **Unitarias** (`refresh-cookie.spec.ts`): las opciones, `Secure` solo en producción, y que el borrado usa el mismo nombre y los mismos atributos que la creación en desarrollo y en producción.
- **Integración HTTP** (`auth-session-cookie.integration.spec.ts`, 4 casos): el inicio de sesión crea la cookie con los atributos esperados; el refresco rota el token y el anterior deja de servir (401); el cierre de sesión borra la **cookie original** (mismo nombre y `Path`, valor vacío, expirada, `HttpOnly`, `SameSite=Lax`) y revoca la sesión (refresco posterior → 401); el cierre de sesión sin cookie responde 200.
- **Navegador real** (`e2e/auth-session.spec.ts`, Playwright/Chromium): inicia sesión por la página real, comprueba la cookie, cierra sesión desde la propia página y comprueba que **ya no está en el navegador**; el refresco posterior devuelve 401.

### 4.6 Evidencia DESPUÉS

| Comprobación                                          | Antes                                   | Después (pila real en modo producción)                                                              |
| ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cookie al iniciar sesión                              | `Path=/auth; HttpOnly; SameSite=Lax`    | `refresh_token=<…>; Path=/auth; HttpOnly; Secure; SameSite=Lax` (`Secure` por ser producción)       |
| Refresco                                              | 200, cookie rotada                      | 200, cookie rotada; el token anterior → **401**                                                     |
| `Set-Cookie` al cerrar sesión                         | `refresh_token=; Path=/; Expires=1970…` | `refresh_token=; Path=/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax` |
| La cookie original en el navegador tras cerrar sesión | **Seguía presente**                     | **Eliminada** (prueba de navegador)                                                                 |
| Refresco posterior al cierre de sesión                | 401                                     | 401                                                                                                 |

## 5. H2 — Protección frente a intentos repetidos

### 5.1 Descripción y causa raíz

Una ráfaga de 60 inicios de sesión fallidos consecutivos recibió 60 respuestas 401, sin 429 ni retraso. Causa raíz: la API no tenía ninguna limitación de tasa (ni `@nestjs/throttler` ni código propio); la especificación la exige para los endpoints sensibles.

### 5.2 Evidencia ANTES

Auditoría de la API (ejecución real, `docs/APE4_API_INVENTARIO.md`, comprobaciones adicionales): `60 inicios de sesión fallidos en ráfaga (6 tandas de 10): 60 × 401, ningún 429; el inicio válido posterior respondió 200`.

### 5.3 Diseño y decisiones (detalle en `ADR-011`)

- **Ventanas fijas que terminan solas**; no hay bloqueo permanente. Se cuenta **antes** de atender el intento, con un incremento atómico.
- **Qué se cuenta:** inicio de sesión por **dirección + cuenta** (un inicio correcto la reinicia) y por **dirección**; registro y refresco por **dirección**. No hay un límite «solo por cuenta»: permitiría a un tercero dejar fuera al dueño.
- **Almacén:** Redis cuando existe `REDIS_URL` y no es la edición de escritorio (un script Lua hace `INCR` y la expiración a la vez y repara un contador sin expiración); memoria en escritorio y pruebas. Si Redis falla, la instancia cuenta en memoria y no lo consulta durante 10 s; si el limitador falla, la solicitud pasa y se registra un aviso.
- **Dirección del cliente:** la de la conexión; `X-Forwarded-For` solo se cree si `TRUSTED_PROXIES` lista proxies de confianza (`true` se rechaza). IPv6 se cuenta por /64 e IPv4 mapeada como IPv4.
- **Privacidad:** las cuentas se identifican en las claves por un HMAC del correo normalizado; el almacén no contiene correos, contraseñas ni tokens.
- **Respuesta:** `429` con `Retry-After` (segundos) y mensaje en español `Demasiados intentos. Vuelva a intentarlo en N segundos|minutos.`
- **Alcance:** `login`, `register` y `refresh` (con límites distintos, sección siguiente). `logout` no se limita.

**Valores por defecto** (justificados en `ADR-011`; configurables por entorno, ver `.env.example`):

| Límite                               | Por defecto  | Motivo resumido                                                                                                                       |
| ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio de sesión, dirección + cuenta | 10 / 15 min  | Un error de escritura rara vez pasa de 3–4 intentos; 10 frena la adivinanza de una contraseña                                         |
| Inicio de sesión, dirección          | 300 / 15 min | Una clase detrás de una sola IP pública: 40 personas con 2–3 intentos suman ≈ 120; 100 habría bloqueado a algunas al empezar la clase |
| Registro, dirección                  | 50 / hora    | Una clase puede registrarse en la misma hora; cada registro cuesta un hash Argon2                                                     |
| Refresco, dirección                  | 120 / minuto | Cada recarga de página pide un refresco; el secreto es de 256 bits, el límite es contra abuso de CPU                                  |

### 5.4 Archivos modificados (commit `181e3eb`)

Nuevos: `apps/api/src/identity/rate-limit/{rate-limit-store.ts, auth-rate-limit.config.ts, client-key.ts, auth-rate-limiter.ts}`, `apps/api/src/common/trust-proxy.ts`, `docs/decisions/ADR-011-limitacion-de-intentos-de-autenticacion.md`, pruebas `rate-limit-store.spec.ts`, `auth-rate-limiter.spec.ts`, `auth-rate-limit.integration.spec.ts`, `auth-rate-limit-redis.integration.spec.ts`.
Modificados: `apps/api/src/identity/identity.module.ts`, `auth.controller.ts`, `auth.controller.spec.ts`, `apps/api/src/main.ts` (`trust proxy` desde `TRUSTED_PROXIES`), `apps/api/test/integration/support/use-test-database.ts`, `.env.example`, `infra/docker/compose.app.yml`, `infra/docker/app.env.example`, `docs/install-docker.md`, `playwright.config.ts`.

### 5.5 Pruebas incorporadas

- **Unitarias** (`apps/api/src/identity/rate-limit/*.spec.ts`): almacén en memoria (ventanas con reloj simulado, reinicio, aislamiento de claves, 100 incrementos simultáneos con números distintos, tamaño acotado); almacén con respaldo (cae a memoria, no consulta Redis 10 s y lo reintenta); selección del almacén; limitador (límite → 429 con `Retry-After`, mensaje sin correo, recuperación tras la ventana, reinicio tras un acierto, aislamiento entre cuentas y direcciones, correo en distinto formato = misma cuenta, límite por dirección, registro y refresco, 40 intentos concurrentes → exactamente los permitidos, IPv6 /64 e IPv4 mapeada, desactivación, fallo del almacén, claves sin datos del intento); configuración (valores por defecto, variables, valores absurdos ignorados); `TRUSTED_PROXIES`.
- **Integración HTTP** (`auth-rate-limit.integration.spec.ts`, 10 casos): inicio de sesión normal → 200; 401 mientras no se supera el límite y luego 429 con `Retry-After`, sin cookie y con el cuerpo sin el correo; la contraseña correcta también espera mientras dura el bloqueo; recuperación al terminar la ventana (reloj simulado); los errores corregidos con un acierto no se acumulan; una cuenta no bloquea a otra; 24 solicitudes concurrentes → exactamente 3 pasan; límites de registro y refresco; **`X-Forwarded-For` falsificado no evita el límite**; con `trust proxy` configurado cada cliente detrás del proxy se cuenta aparte; con un proxy que no es el de la conexión, la cabecera se ignora.
- **Integración con Redis real** (`auth-rate-limit-redis.integration.spec.ts`, 7 casos): conteo y expiración; 60 incrementos simultáneos con números distintos; nueva ventana al expirar; un contador sin expiración se repara; reinicio de una clave; **tres instancias de la API comparten un solo límite** (30 intentos → exactamente 6 pasan); Redis inalcanzable → se sigue contando en memoria.

Esta prueba con Redis real encontró un defecto de mi primera versión del almacén (la conexión perezosa fallaba con solicitudes simultáneas y el limitador, al fallar, dejaba pasar todo). Se corrigió antes de confirmar el commit; sin esa prueba no se habría detectado.

### 5.6 Evidencia DESPUÉS

Pila real en modo producción (`infra/docker/compose.app.yml`, almacén Redis, valores por defecto):

| Comprobación                                                                               | Antes      | Después                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 60 inicios de sesión fallidos de una cuenta (6 tandas de 10)                               | 60 × 401   | **10 × 401 y 50 × 429**                                                                                                                                                     |
| Primera respuesta 429                                                                      | —          | `Retry-After: 900`; `{"message":"Demasiados intentos. Vuelva a intentarlo en 15 minutos.","error":"Too Many Requests","statusCode":429}`                                    |
| Contraseña correcta mientras dura el bloqueo                                               | 200        | 429 (`Retry-After: 900`)                                                                                                                                                    |
| Otra cuenta desde la misma dirección                                                       | 200        | **200** (no afectada)                                                                                                                                                       |
| 14 intentos con `X-Forwarded-For` distinto en cada uno                                     | sin límite | `401×10` y `429×4`: **la cabecera falsificada no evita el límite**                                                                                                          |
| 40 intentos concurrentes sobre una cuenta                                                  | sin límite | **10 × 401 y 30 × 429** (exactamente los permitidos)                                                                                                                        |
| Claves en Redis tras las pruebas                                                           | —          | 6 claves `caseflow:ratelimit:…`, p. ej. `…:login:account:172.22.0.1:ff60c6e5…` con TTL 899 s; **ninguna contiene correos ni contraseñas**                                   |
| Recuperación (API con `AUTH_LOGIN_ACCOUNT_MAX=3` y ventana de 15 s, solo para esta prueba) | —          | `401,401,401,429`; la contraseña correcta durante el bloqueo → 429 con `Retry-After: 15`; **16 s después → 200**                                                            |
| Redis detenido a propósito                                                                 | —          | El inicio de sesión sigue respondiendo: la primera solicitud tardó 1565 ms (tiempo máximo del comando) y las siguientes 3–69 ms contando en memoria (`401,401,401,429,429`) |

## 6. Matriz comparativa

| Hallazgo | Antes                                                                                         | Después                                                                                         | Prueba de regresión                                                                                                                         | Estado                               |
| -------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **H1**   | Registro con datos inválidos → 201 (usuario creado); campos ausentes → 500; login sin validar | 400 con la lista de errores; no se guarda nada; login validado                                  | `auth-validation.integration.spec.ts` (15 casos; 12 fallaban antes)                                                                         | Corregido, verificado en local       |
| **H4**   | Cierre de sesión emite `Path=/`; el navegador conserva la cookie                              | Misma definición al crear y borrar; el navegador la elimina                                     | `refresh-cookie.spec.ts`, `auth-session-cookie.integration.spec.ts`, `e2e/auth-session.spec.ts` (fallaban antes)                            | Corregido, verificado en navegador   |
| **H2**   | 60 intentos fallidos → 60 × 401                                                               | 10 × 401 y 429 con `Retry-After`; se recupera al terminar la ventana; no se evita con cabeceras | `rate-limit-store.spec.ts`, `auth-rate-limiter.spec.ts`, `auth-rate-limit.integration.spec.ts`, `auth-rate-limit-redis.integration.spec.ts` | Corregido, verificado con Redis real |

## 7. Resultados de las verificaciones (ejecutadas en local)

| Verificación                                                               | Resultado                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato (`pnpm format:check`)                                              | Sin diferencias                                                                                                                                               |
| Lint (`pnpm lint`)                                                         | Sin errores                                                                                                                                                   |
| Typecheck (`pnpm typecheck`)                                               | Sin errores                                                                                                                                                   |
| Build (`pnpm build`)                                                       | Correcto                                                                                                                                                      |
| Pruebas unitarias con cobertura (`pnpm test:coverage`)                     | **911 aprobadas, 3 omitidas** (en CI de `main`: 874); cobertura global: líneas 75,15 %, ramas 70,50 %, funciones 74,41 %, instrucciones 74,68 % (umbral 70 %) |
| Integración (`pnpm test:integration`, base aislada, Redis y Kroki locales) | **332 aprobadas, 2 omitidas** (en CI de `main`: 296)                                                                                                          |
| E2E (`CI=1 pnpm run test:e2e`)                                             | **3 aprobadas** (las 2 de antes y la nueva de cookies)                                                                                                        |
| OpenAPI (`pnpm openapi:generate`)                                          | Correcto; 257 operaciones (sin cambios); `/auth/register` documenta 201/400/429, `/auth/login` 200/400/429, `/auth/refresh` 200/429                           |
| Configuración Docker                                                       | `docker compose config` válido para `compose.app.yml` (con y sin la capa del sandbox) y `compose.yml`; la pila se construyó y se probó en modo producción     |
| Comprobación en navegador                                                  | Sí (Chromium, Playwright)                                                                                                                                     |

Las 2 pruebas omitidas de integración y las 3 de unidad son las ya existentes que requieren IA real o Docker real (`CASEFLOW_LIVE_AI`, `CASEFLOW_SANDBOX_DOCKER_TESTS`).

## 8. Compatibilidad, configuración y riesgos

### 8.1 Compatibilidad con la API y el frontend

- **Contratos sin cambios** (`registerRequestSchema`, `loginRequestSchema`, `authResponseSchema`). Cambia el comportamiento ante entradas que ya incumplían el contrato: 400 en lugar de 201/500/401.
- **Frontend sin cambios.** La web ya valida contraseña y confirmación; si el servidor rechaza, muestra `ApiError.message` (para un 400 sería «La solicitud no es válida.»; para un 429, el mensaje en español con el tiempo de espera). Mejorar el texto del 400 sería un cambio de interfaz fuera de este incremento.
- **Edición de escritorio:** usa memoria automáticamente (`CASEFLOW_QUEUE_MODE=in-process`); la API solo escucha en `127.0.0.1`.
- **Nuevas variables** (todas opcionales, en `.env.example`): `AUTH_RATE_LIMIT_ENABLED`, `AUTH_RATE_LIMIT_STORE`, `AUTH_LOGIN_ACCOUNT_{MAX,WINDOW_SECONDS}`, `AUTH_LOGIN_ADDRESS_{MAX,WINDOW_SECONDS}`, `AUTH_REGISTER_ADDRESS_{MAX,WINDOW_SECONDS}`, `AUTH_REFRESH_ADDRESS_{MAX,WINDOW_SECONDS}`, `TRUSTED_PROXIES`. **Dependencias nuevas: ninguna.**
- **Documentos técnicos actualizados:** `ADR-011` (nuevo), `.env.example`, `infra/docker/app.env.example`, `compose.app.yml`, `docs/install-docker.md`.

### 8.2 Riesgos residuales y limitaciones

1. **Ataque distribuido.** Quien pruebe contraseñas desde muchas direcciones queda limitado solo por el coste de Argon2 y la política de contraseñas (sin CAPTCHA ni verificación en dos pasos).
2. **Proxy sin `TRUSTED_PROXIES`.** Detrás de un proxy inverso todas las solicitudes comparten dirección y los límites de dirección se aplican al conjunto. Está documentado en `docs/install-docker.md`.
3. **Ventana fija.** En el borde entre dos ventanas se puede hacer hasta el doble del límite.
4. **Caída de Redis:** la primera solicitud paga hasta 1,5 s y el límite queda por instancia hasta que Redis vuelva.
5. **Contraseña mínima de 8 caracteres** (contrato sin cambios): sin reglas de complejidad.
6. **Sin otros límites de tasa** en la API (IA, cargas, exportaciones) ni cabeceras de seguridad (hallazgo H3 de la auditoría; también lo pide la especificación §80). Quedan para otro incremento, igual que la detección de reutilización de refresh tokens (§71.4).
7. **Entorno local:** al ejecutar E2E después de la suite de integración en la misma base de pruebas, el usuario E2E de una ejecución anterior quedó sin espacio de trabajo (la suite de integración reinicia espacios y membresías pero no los usuarios) y los dos escenarios existentes fallaron. No lo causan estos cambios ni ocurre en CI (base nueva); se resolvió borrando ese usuario de la base de pruebas.

### 8.3 Otras observaciones (no se corrigieron, fuera de alcance)

- Los mensajes de autenticación siguen en inglés (`Invalid credentials`, `User already exists`; hallazgo H9).
- El correo se busca por coincidencia exacta: `Ana@x.com` y `ana@x.com` son cuentas distintas. El limitador los trata como la misma cuenta (conservador).

## 9. Control de versiones y CI

| Commit    | Mensaje                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `9b32c3f` | `fix(auth): validate the register and login bodies against their contracts` |
| `f607801` | `fix(auth): clear the refresh cookie with the attributes it was set with`   |
| `181e3eb` | `feat(auth): rate-limit sign-in, registration and session refresh attempts` |

- Rama: `fix/auth-validation-rate-limit-cookie`; sin force-push; sin merge automático.
- **Pull Request y estado de Quality e Integration:** se anotan tras publicar la rama (sección final de la respuesta al usuario y en el propio PR).

**Estado de los hallazgos:** H1, H4 y H2 cuentan con pruebas reproducibles en el repositorio que fallaban antes (H1 y H4) o que no existían (H2) y pasan ahora, y con evidencia ejecutada «antes» y «después». La confirmación definitiva queda sujeta al CI del PR y a la revisión del usuario.
