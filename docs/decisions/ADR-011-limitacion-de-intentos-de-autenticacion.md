# ADR-011 — Limitación de intentos de autenticación

- Estado: Aprobado
- Fecha: 2026-10-20
- Decisión: DEC-150
- Origen: hallazgo H2 de la APE4 (60 inicios de sesión fallidos seguidos sin respuesta 429). Cumple `CASEFLOW_AI_SPEC.md` §80: «rate limiting en endpoints sensibles» y protección del acceso mediante throttling antes que bloqueos permanentes.

## Decisión

`POST /auth/login`, `POST /auth/register` y `POST /auth/refresh` limitan los intentos repetidos. Al superar el límite la API responde **429** con `Retry-After` (segundos) y un mensaje en español. `POST /auth/logout` no se limita: no es un vector de abuso.

- **Ventanas fijas que terminan solas.** Un contador cuenta intentos desde el primero y se reinicia al acabar la ventana. No hay bloqueo permanente ni se recuerda a un cliente más allá de su ventana.
- **Se cuenta antes de atender el intento**, con un incremento atómico. Así, solicitudes simultáneas no pueden pasar todas por debajo del límite.
- **Claves de conteo:**
  - Dirección del cliente, para los tres endpoints.
  - Para el inicio de sesión, además, **dirección + cuenta**. Una cuenta que se juzga de forma aislada (sin la dirección) permitiría a un tercero dejar fuera a su dueño provocando fallos a propósito; por eso no existe un límite «solo por cuenta».
  - La cuenta se identifica con un HMAC-SHA256 del correo normalizado (clave: `JWT_SECRET`); en el almacén no hay correos, contraseñas ni tokens.
  - Un inicio de sesión correcto reinicia el contador de esa dirección + cuenta, de modo que los errores de escritura no se acumulan.
  - Las direcciones IPv6 se cuentan por su prefijo /64 y las IPv4 mapeadas como la IPv4 que representan.
- **Dirección del cliente.** Es la de la conexión (`req.ip`). `X-Forwarded-For` solo se cree si `TRUSTED_PROXIES` nombra los proxies de confianza (número de saltos, `loopback` o lista de direcciones/CIDR). Sin esa variable un cliente no puede cambiar su dirección con una cabecera. `TRUSTED_PROXIES=true` se rechaza al arrancar.
- **Almacén.** Redis cuando existe `REDIS_URL` y no es la edición de escritorio (misma instancia que usa la cola; el script Lua hace `INCR` y la expiración en una sola operación, y repara un contador que se hubiera quedado sin expiración). Memoria en el escritorio y en las pruebas. Si Redis falla, la instancia cuenta en memoria y deja de consultarlo durante 10 s: el inicio de sesión no se detiene por una caída de Redis, pero el límite queda por instancia mientras tanto. Si el propio limitador falla, la solicitud pasa y se registra un aviso (sin datos del intento).

## Valores por defecto

Configurables por variable de entorno (`.env.example`). Los valores se eligieron para este producto: un docente o laboratorio comparte **una dirección pública** entre decenas de personas que inician sesión a la vez.

| Límite                                   | Por defecto  | Razonamiento                                                                                                                                                                                    |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio de sesión, por dirección + cuenta | 10 / 15 min  | Un error de escritura rara vez pasa de 3 o 4 intentos. 10 deja margen y frena la adivinanza de una contraseña (OWASP recomienda del orden de 5 a 10).                                           |
| Inicio de sesión, por dirección          | 300 / 15 min | 40 estudiantes con 2 o 3 intentos cada uno suman unos 120: 100 habría bloqueado a algunos al empezar la clase. 300 sigue limitando un ataque a unos 20 intentos por minuto desde una dirección. |
| Registro, por dirección                  | 50 / hora    | Una clase completa puede registrarse en la misma hora. Cada registro cuesta un hash Argon2 y varias filas, así que un tope evita la creación masiva de cuentas.                                 |
| Refresco de sesión, por dirección        | 120 / minuto | Cada recarga de página pide un refresco. El secreto del refresco es aleatorio de 256 bits, así que el límite es contra el abuso de CPU, no contra la adivinanza.                                |

## Alternativas descartadas

- **`@nestjs/throttler`:** añadiría una dependencia y un almacén Redis adicional para algo que se resuelve en unas decenas de líneas con `ioredis`, que la API ya usa (`AGENTS.md` §51).
- **Contadores solo en memoria:** no funcionan con varias instancias de la API; quedan solo para el escritorio y las pruebas.
- **Bloqueo de la cuenta tras N fallos:** permite a un tercero dejar fuera al dueño (DoS dirigido). La especificación lo desaconseja.
- **Retraso progresivo:** da una mejor experiencia a quien se equivoca, pero necesita conservar estado por cuenta y complica los reinicios; se deja como mejora futura.

## Riesgos residuales

- **Ataque distribuido.** Quien pruebe contraseñas desde muchas direcciones distintas queda limitado solo por el coste de Argon2 y la política de contraseñas. La mitigación que falta (CAPTCHA, verificación en dos pasos, alertas) no está en este incremento.
- **Ventana fija.** En el borde de dos ventanas un cliente puede hacer hasta el doble del límite en poco tiempo. Aceptado por su sencillez y porque el límite sigue acotado.
- **Dirección compartida.** Detrás de un proxy sin `TRUSTED_PROXIES`, todos los clientes cuentan como uno. Está documentado en `docs/install-docker.md`.
- **Otras rutas.** El resto de la API (IA, cargas, exportaciones) sigue sin limitación; es trabajo posterior.

## Pruebas

- `apps/api/src/identity/rate-limit/*.spec.ts`: almacén, claves, configuración y limitador (ventanas con reloj simulado, concurrencia, aislamiento entre claves, IPv6).
- `apps/api/test/integration/auth-rate-limit.integration.spec.ts`: HTTP real (200, 401, 429, `Retry-After`, recuperación, concurrencia, cabecera `X-Forwarded-For` falsificada, proxy de confianza).
- `apps/api/test/integration/auth-rate-limit-redis.integration.spec.ts`: Redis real (atomicidad, expiración, reparación, varias instancias, caída de Redis).
