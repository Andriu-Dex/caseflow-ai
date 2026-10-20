# Instalar CASEFlow AI con Docker Compose

Esta edición levanta toda la aplicación (web, API, worker, base de datos, colas, almacenamiento y diagramas) con un solo comando. Es la opción para un equipo o una clase que comparte una instancia, o para quien prefiere no instalar nada más que Docker. Si solo quieres probarlo tú, la [edición de escritorio](install-desktop.md) es más sencilla.

## Requisitos

- Docker con Compose v2 (en Windows y macOS, Docker Desktop **abierto y en estado «running»**).
- 4 GB de RAM libres y unos 6 GB de disco para las imágenes.
- Git, para clonar el repositorio.

## Puesta en marcha

1. Clona el repositorio y entra en la carpeta.
2. Crea tu archivo de configuración y cambia **todos** los valores `change-me`:

   ```bash
   cp infra/docker/app.env.example infra/docker/app.env
   ```

   Genera cada clave con `openssl rand -hex 24`. Usa solo letras y números en las claves y contraseñas.

3. Construye y arranca:

   ```bash
   docker compose -f infra/docker/compose.app.yml --env-file infra/docker/app.env up -d --build
   ```

   La primera vez tarda varios minutos porque compila las imágenes. Después arranca en segundos.

4. Abre <http://localhost:3000> (o el `WEB_PORT` que hayas puesto) y crea tu cuenta.

Para ver el estado: `docker compose -f infra/docker/compose.app.yml --env-file infra/docker/app.env ps`.

## Validar proyectos generados (sandbox)

La validación del código generado se ejecuta en contenedores desechables que lanza la propia API a través del Docker del equipo. Para permitirlo, añade la capa del sandbox:

```bash
docker compose -f infra/docker/compose.app.yml -f infra/docker/compose.app.sandbox.yml \
  --env-file infra/docker/app.env up -d --build
```

> **Ojo con la seguridad:** esa capa da a la API acceso al motor de Docker del equipo, y quien lo controla controla la máquina. Actívala solo en un equipo de confianza. Sin ella todo lo demás funciona y la página de generación avisa de que el sandbox no está disponible.

## Configuración

Todo está en `infra/docker/app.env`:

| Variable                                                          | Qué hace                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `INTERNAL_JOBS_SECRET`, `S3_*` | Secretos obligatorios; el arranque falla con un mensaje claro si faltan                                                     |
| `WEB_PORT`, `API_PORT`                                            | Puertos publicados en el equipo (por defecto 3000 y 3001)                                                                   |
| `PUBLIC_WEB_URL`, `PUBLIC_API_URL`                                | Direcciones desde las que se accede. La de la API se fija al construir la imagen web: tras cambiarla repite `up -d --build` |
| `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`            | IA opcional; con `disabled` todo el trabajo manual sigue disponible                                                         |
| `MOCKUP_PROVIDER`, `STITCH_API_KEY`                               | Bocetos con Stitch; sin él se usa el esquema interno                                                                        |

Solo se publican la web y la API; la base de datos, Redis, el almacenamiento y Kroki quedan dentro de la red de Compose.

## Uso en red o en un servidor

Las cookies de sesión son `Secure` en producción: funcionan en `localhost`, pero desde otra máquina el navegador las rechazará salvo que sirvas la web y la API por **HTTPS** (por ejemplo con un proxy inverso como Caddy o Nginx). Pon en `PUBLIC_WEB_URL` y `PUBLIC_API_URL` las direcciones HTTPS finales y reconstruye.

## Copias de seguridad, actualización y parada

- **Datos:** viven en tres volúmenes de Docker: `postgres_data` (proyectos y artefactos), `seaweedfs_data` (archivos subidos) y `redis_data` (colas). Para respaldar la base de datos:

  ```bash
  docker compose -f infra/docker/compose.app.yml --env-file infra/docker/app.env \
    exec postgres pg_dump -U caseflow caseflow > respaldo.sql
  ```

- **Actualizar:** `git pull` y repite el comando de arranque con `--build`. Las migraciones de la base de datos se aplican solas.
- **Parar conservando los datos:** `docker compose -f infra/docker/compose.app.yml --env-file infra/docker/app.env down`.
- **Parar y borrar todos los datos:** añade `-v` al comando anterior. Es irreversible.

## Problemas frecuentes

- **«Set POSTGRES_PASSWORD» (o similar) al arrancar:** falta un valor en `app.env`, o no pasaste `--env-file`.
- **La web carga pero no inicia sesión o no llega a la API:** `PUBLIC_API_URL` no coincide con la dirección real o no reconstruiste la imagen web tras cambiarla.
- **«Docker no está disponible» en la generación:** falta la capa `compose.app.sandbox.yml` o Docker del equipo no está en marcha.
- **Un puerto ocupado:** cambia `WEB_PORT` o `API_PORT` en `app.env` y repite el arranque.
- **Ver los registros de un servicio:** `docker compose -f infra/docker/compose.app.yml --env-file infra/docker/app.env logs -f api`.
