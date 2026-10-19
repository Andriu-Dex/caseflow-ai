# ADR-005 — Base de datos y cola de la edición de escritorio

- **Estado:** Aprobado
- **Fecha:** 2026-10-04
- **Decisión registrada como:** DEC-120
- **Modifica:** ADR-002, punto 2: "PostgreSQL embebido con binarios portables; Redis empaquetado como binario portable".
- **No modifica:** la edición web, el sandbox Docker obligatorio para construir (§174) ni el resto de ADR-002.

## Contexto

Al implementar la edición de escritorio aparecieron dos bloqueos:

- **PostgreSQL embebido:** `embedded-postgres` solo publica versiones beta y no incluye pgvector. Las migraciones existentes lo exigen (`CREATE EXTENSION vector`), y las migraciones históricas no se reescriben.
- **Redis:** no existe un binario portable oficial para Windows, y Redis 7.4+ ya no tiene licencia OSI. Garnet, la alternativa nativa de Microsoft, no es compatible con BullMQ porque le falta `cmsgpack` en Lua.

Revisando el código se vio además algo que el plan aprobado no tuvo en cuenta: las colas solo se usan como `queue.add()` detrás de tokens inyectados, y el worker solo hace un POST autenticado al callback interno de la API.

## Decisión

1. **Base de datos:** PGlite (PostgreSQL compilado a WebAssembly, licencia libre), con pgvector, expuesto por TCP con `pglite-socket` y multiplexación de conexiones. La API usa la misma cadena de conexión y el mismo adaptador de Prisma; las migraciones corren sin cambios al arrancar.
2. **Cola, solo en escritorio:** con `CASEFLOW_QUEUE_MODE=in-process`, cada trabajo se envía, al terminar la petición en curso, al mismo endpoint interno autenticado que usa el worker. No hay Redis ni worker en escritorio.
3. **Almacenamiento:** `FilesystemStorageProvider` en la carpeta de datos del usuario, activado con `STORAGE_DIR`. Confina cada clave a esa carpeta.
4. **Docker** sigue siendo obligatorio solo para la construcción. La planificación funciona sin él.

## Consecuencias

- **A favor:** la planificación completa funciona sin Docker ni servicios externos, la búsqueda semántica con pgvector incluida. El código de colas y de almacenamiento solo gana una fábrica.
- **En contra:**
  - En escritorio se pierden los reintentos automáticos de BullMQ. Cada trabajo ya registra un estado terminal, y los fallidos se reintentan desde la interfaz.
  - PGlite es más lento que un PostgreSQL nativo; es aceptable para un único usuario local.
- **Seguridad:** la API, la web y la base de datos escuchan solo en `127.0.0.1`, nunca en la red local.
  - El socket de PGlite no admite autenticación por contraseña, así que otro proceso del mismo equipo podría conectarse mientras la aplicación está abierta.
  - Se acepta como riesgo: es el mismo límite que los archivos de la base de datos en la carpeta de datos del usuario.
- **Pruebas:**
  - `FilesystemStorageProvider` pasa el mismo contrato que el proveedor S3.
  - La cola en proceso tiene prueba unitaria.
  - El arranque del escritorio con PGlite se valida con una prueba de humo de las migraciones.
