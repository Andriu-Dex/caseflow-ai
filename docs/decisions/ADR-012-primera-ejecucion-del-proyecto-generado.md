# ADR-012 — Primera ejecución del proyecto generado

- Estado: Aprobado
- Fecha: 2026-10-20
- Decisión: DEC-151
- Origen: una persona sin perfil técnico siguió el README del ZIP exportado y no pudo arrancarlo: `JWT_SECRET=change-me`, `SESSION_SECRET` vacío y `P1000: Authentication failed` al ejecutar `db:migrate`. Cumple `AGENTS.md` §28 y §49: el README del proyecto exportado debe ser una ruta de ejecución válida.

## Causas encontradas

- **Base de datos compartida entre proyectos.** `docker-compose.yml` publicaba el puerto fijo 5432 y no tenía nombre de proyecto: dos proyectos (o un PostgreSQL ya instalado) competían por el puerto, y un volumen de una ejecución anterior conservaba una contraseña distinta de la del `.env` actual (`P1000`).
- **Variables que la persona debía inventar.** Los secretos propios del proyecto quedaban vacíos o con `change-me`.
- **Pasos manuales frágiles.** Copiar `.env`, levantar Docker, instalar y migrar eran comandos sueltos; el de Docker no leía el `.env` porque el archivo Compose vive en `docker/`.

## Decisión

El proyecto generado incluye `scripts/setup.mjs` (solo Node, sin dependencias nuevas), que se invoca con `pnpm run setup`:

1. Comprueba que Docker está instalado y en ejecución.
2. Crea `.env` a partir de `.env.example` **solo si no existe** (nunca sobrescribe): genera un valor aleatorio para cada secreto propio (`*_SECRET`, `*_PASSWORD`, `*_SALT` vacío o con valor `dev-only-*`), elige el primer puerto libre desde 5433 y reconstruye `DATABASE_URL` con ambos. Las variables que solo la persona puede conocer (claves de servicios externos) se avisan, no se inventan.
3. Inicia la base de datos con `docker compose --env-file .env … up -d --wait` (espera al healthcheck).
4. Crea las tablas: `prisma migrate deploy` si existe `prisma/migrations`; si no, `prisma migrate dev --name init`.

`pnpm run setup -- --reset` ejecuta antes `compose down -v` y repite el proceso: es la salida documentada para el caso de la contraseña antigua. Los errores conocidos (`P1000`, puerto ocupado, Docker apagado, Compose antiguo) se traducen a una instrucción en español.

Cambios de plantilla que lo sostienen:

- `docker-compose.yml` declara `name: <slug>` (volúmenes y contenedores propios por proyecto), publica el puerto solo en `127.0.0.1:${POSTGRES_PORT:-5433}` y define un `healthcheck`.
- `DATABASE_URL` usa `127.0.0.1` y no `localhost` (evita resolver a IPv6 donde la base no escucha).
- `.env.example` nunca deja una variable vacía: secretos de ejemplo `dev-only-*`, `replace-with-your-value` para lo obligatorio que solo la persona conoce y líneas comentadas para lo opcional.
- El README es una guía para personas no técnicas: cuatro comandos (`corepack enable`, `pnpm install`, `pnpm run setup`, `pnpm run dev`), una tabla de síntomas y soluciones y la tabla de variables.
- El diálogo «¿Cómo probar el proyecto en tu máquina?» de la web muestra el mismo flujo.

## Alcance y límites

- No cambia la plantilla `CASEFLOW_WEB_TS_V1` ni su catálogo de dependencias.
- Los proyectos ya exportados no se actualizan: hay que regenerarlos.
- Queda fuera de este ADR (siguientes incrementos): ejecución completa en Docker (`docker compose up --build` con web, API y base), acceso sin token de desarrollo y una etapa de validación de primera ejecución.
