# ADR-019 — Despliegue del software generado

- Estado: Aprobado para implementación por solicitud del usuario.
- Fecha: 2026-11-10.
- Decisión: DEC-157.
- Sustituye en la versión 2 a DEC-108 (vista previa temporal P1) y a la exclusión del despliegue de §177.3.

## Problema

CASEFlow AI se distribuye como programa de escritorio (`.exe`, DEC-128). El software que genera se entrega hoy como un ZIP validado: la persona debe configurar variables, levantar la base de datos e iniciarlo por su cuenta. El cliente requiere que el software generado quede **desplegado y accesible por URL**, sin pasos manuales.

## Opciones evaluadas

| Opción                                                 | Ventaja                                              | Inconveniente                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Docker local + Cloudflare Tunnel                       | Sin costo ni cuenta obligatoria; URL pública `https` | En línea solo mientras el equipo esté encendido                                       |
| Proveedor en la nube (Render, Railway, Fly.io) por API | Siempre en línea                                     | Las capas gratuitas casi desaparecieron; PostgreSQL gratuito limitado o con caducidad |
| VPS propio por SSH + Docker Compose                    | Siempre en línea, varios proyectos por servidor      | Costo mensual y administración del servidor                                           |

## Decisión

El software generado se despliega en **Docker en el equipo donde corre CASEFlow** y se publica con **Cloudflare Tunnel**, detrás de la interfaz `DeploymentProvider` (`DockerTunnelDeploymentProvider`). Los proveedores en la nube o un VPS podrán añadirse después como nuevas implementaciones de la misma interfaz, sin cambiar el flujo.

Cada despliegue (`GeneratedProjectDeployment`) registra proyecto, snapshot, estado (`STARTING`, `RUNNING`, `STOPPED`, `FAILED`), modo de túnel, URL pública, inicio, detención y responsable.

### Ejecución

1. Solo se despliega un `GeneratedProjectSnapshot` con validación P0 `READY`, construido desde sus archivos inmutables; nunca una copia de trabajo.
2. Web, API, una base PostgreSQL exclusiva y el conector `cloudflared` corren en una red Docker propia del despliegue. El conector alcanza la web por esa red; no se publican puertos en el equipo.
3. Las variables salen del `.env.example` del proyecto generado, con valores (contraseñas, claves de sesión) generados para ese despliegue y guardados cifrados. Ningún secreto ni variable de CASEFlow entra al despliegue.
4. Migraciones, datos iniciales e inicio usan comandos fijos de la TargetTemplate; ninguno procede de la IA.
5. Límites de memoria, CPU y procesos por contenedor; reinicio automático mientras el despliegue esté en `RUNNING`.

### Modos de túnel

- **Rápido (por defecto):** sin cuenta. Cloudflare asigna una URL aleatoria `*.trycloudflare.com` que cambia en cada inicio. Cloudflare lo describe como uso de prueba y desarrollo: sin garantía de disponibilidad, hasta 200 solicitudes simultáneas y sin Server-Sent Events. Adecuado para demostraciones y revisión.
- **Con nombre:** la persona registra el token de un túnel de su cuenta Cloudflare y un nombre de host en un dominio propio. La URL es fija. El token se guarda cifrado y solo se entrega al contenedor `cloudflared`.

### Interfaz

La vista de construcción muestra estado, URL pública, «Abrir aplicación», «Copiar enlace», las cuentas iniciales generadas y las acciones Iniciar, Detener y Volver a desplegar. Al abrir CASEFlow se ofrece reanudar los despliegues que estaban en `RUNNING`. Iniciar, detener, fallar y cambiar el modo de túnel se registran en la auditoría.

## Fronteras

- El software generado queda accesible por internet: sus propios controles de autenticación y autorización (ADR-015, ADR-016) son su protección. La URL rápida no es secreta ni un control de acceso.
- Desplegar no cambia el snapshot ni su validación. Un fallo se muestra con su registro saneado y no marca el proyecto como inválido.
- El ZIP reproducible sigue siendo la entrega oficial; el despliegue es la forma de usarla.
- Sin Docker o sin conexión, se informa que el despliegue no está disponible y el ZIP sigue disponible (AGENTS.md §56).
- El código desplegado es no confiable: no corre en el proceso de CASEFlow ni comparte red con sus servicios.
- La imagen `cloudflare/cloudflared` se fija por versión y se registra como dependencia de infraestructura, no del proyecto generado.
