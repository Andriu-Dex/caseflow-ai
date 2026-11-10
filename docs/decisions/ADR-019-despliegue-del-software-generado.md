# ADR-019 — Despliegue del software generado

- Estado: Aprobado para implementación por solicitud del usuario.
- Fecha: 2026-11-10.
- Decisión: DEC-157.
- Sustituye en la versión 2 a DEC-108 (vista previa temporal P1) y a la exclusión del despliegue de §177.3.

## Problema

El resultado de la construcción es un ZIP validado. La persona debe descargarlo, configurar variables, levantar la base de datos e iniciar el proyecto para ver el software funcionando. El cliente requiere que el software generado se entregue ya desplegado y accesible.

## Decisión

Un `GeneratedProjectSnapshot` con validación P0 `READY` puede desplegarse desde CASEFlow mediante una interfaz `DeploymentProvider`. La versión 2 implementa `DockerDeploymentProvider`, que ejecuta el proyecto en el mismo equipo donde corre CASEFlow (la edición de escritorio es la distribución principal, DEC-128). Proveedores externos de alojamiento quedan para después y se agregarán como nuevas implementaciones de la interfaz.

Cada despliegue (`GeneratedProjectDeployment`) registra proyecto, snapshot, estado (`STARTING`, `RUNNING`, `STOPPED`, `FAILED`), URL, puertos, inicio, detención y quién lo inició. El despliegue:

1. Se construye desde los archivos inmutables del snapshot, nunca desde una copia de trabajo ni desde una corrida sin validación.
2. Usa contenedores propios para web, API y una base PostgreSQL exclusiva del despliegue, en una red Docker aislada.
3. Recibe solo las variables del `.env.example` del proyecto generado con valores generados para ese despliegue. Nunca recibe secretos, credenciales ni variables de CASEFlow.
4. Ejecuta los comandos fijos de la TargetTemplate (migraciones, datos iniciales, inicio); ningún comando procede de la IA.
5. Publica sus puertos solo en `127.0.0.1`, con límites de memoria, CPU y procesos.
6. Se detiene a petición y se puede reiniciar; un despliegue nuevo de otro snapshot reemplaza el anterior del mismo proyecto tras detenerlo.

La interfaz de construcción muestra el estado, el enlace «Abrir aplicación», las cuentas iniciales generadas y las acciones Iniciar, Detener y Volver a desplegar. Iniciar, detener y fallar se registran en la auditoría.

## Fronteras

- Desplegar no cambia el snapshot ni su validación; un fallo de despliegue no marca el proyecto como inválido, pero se muestra con su registro saneado.
- El ZIP reproducible sigue siendo la entrega oficial; el despliegue es la forma de usarla desde CASEFlow.
- Sin Docker disponible, el despliegue informa que no está disponible y el ZIP sigue disponible (degradación controlada, AGENTS.md §56).
- La exposición a internet, dominios y TLS no forman parte de esta decisión.
- El código desplegado sigue siendo no confiable: no corre en el proceso de CASEFlow ni comparte red con sus servicios.
