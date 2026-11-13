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

## Ejecución completa en Docker

Para quien no tiene Node.js, el proyecto incluye `docker/Dockerfile`, `docker/docker-compose.app.yml` y `.dockerignore`. Un solo comando (`docker compose --project-directory . -f docker/docker-compose.app.yml up --build`) levanta PostgreSQL, un servicio de migración de una sola ejecución, la API y la web.

- El Dockerfile tiene etapas `workspace` (instala y compila los paquetes internos), `api`, `migrate` y `web`. La dirección de la API se fija al construir la web (`NEXT_PUBLIC_API_URL`).
- El generador no produce migraciones: la etapa `migrate` deriva la migración inicial del esquema de Prisma con `prisma migrate diff --from-empty` bajo el nombre fijo `00000000000000_init` y la aplica con `migrate deploy`, de modo que repetir `up` es idempotente.
- Funciona sin `.env`: usa valores de ejemplo (`${VAR:-dev-only-…}`) solo válidos en el equipo local, y lee el `.env` de la raíz si existe. El proyecto Compose se llama `<slug>-app`, distinto del de `pnpm run setup`, por lo que no comparten volumen.
- Los puertos 3000 y 3001 se publican solo en `127.0.0.1` y se cambian con `WEB_PORT` y `API_PORT`.

## Validación de primera ejecución

La etapa `STRUCTURE` de la validación del sandbox incorpora `firstRunProblems`, una comprobación **estática** (el sandbox no ejecuta Docker): existencia de `scripts/setup.mjs`, del Dockerfile y del compose de aplicación; ninguna variable vacía en `.env.example` y secretos de ejemplo `dev-only-*`; `POSTGRES_PORT` coherente con `DATABASE_URL` en `127.0.0.1`; compose con nombre, healthcheck y puerto local; y que cada `pnpm run X` del README exista en `package.json`. Un fallo marca la validación como fallida como cualquier otro problema estructural. No detecta fallos de un Docker real; eso se verifica a mano con una instalación limpia.

## Inicio de sesión de desarrollo

Cuando el plan exige autenticación, la API generada expone `GET/POST /auth/dev-login` (excluido de `/docs`). `POST` emite, para un rol del plan, el mismo token HS256 de 8 horas que `dev-token`; `GET` solo informa si está activo para que la pantalla «Acceso» ofrezca «Entrar como …».

- **Un único interruptor explícito: `DEV_LOGIN=true`.** No depende de `NODE_ENV`, porque la imagen Docker de prueba corre con `NODE_ENV=production`. Desactivado, `POST` responde 404 y `GET` `{enabled:false}`.
- `.env.example` lo deja en `false` (`firstRunProblems` rechaza un ZIP que lo active por defecto). Lo activan `pnpm run setup` en el `.env` local y el compose de Docker (`${DEV_LOGIN:-true}`).
- La API registra una advertencia al arrancar mientras esté activo y el README exige ponerlo en `false` antes de publicar.
- La verificación de tokens no cambia; sin `DEV_LOGIN` solo entra quien tenga un token válido.

## Alcance y límites

- No cambia la plantilla `CASEFLOW_WEB_TS_V1` ni su catálogo de dependencias.
- Los proyectos ya exportados no se actualizan: hay que regenerarlos.
- `setup.mjs` avisa si la ruta de la carpeta es larga en Windows (el motor de Prisma no arranca con rutas muy largas) y el README lo explica.
- Queda fuera de este ADR: una validación con PostgreSQL real dentro del sandbox, que exigiría un nuevo ADR sobre el aislamiento (§26).
