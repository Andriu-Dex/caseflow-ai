# ADR-020 — Revisión guiada del código generado

- Estado: Aprobado para implementación por solicitud del usuario.
- Fecha: 2026-11-10.
- Decisión: DEC-158.
- Complementa ADR-018 (versiones de trabajo y revisiones de acciones).

## Problema

Una generación produce cientos de archivos. Mostrarlos como una lista continua no permite saber qué se generó, por qué ni qué conviene revisar. La revisión humana del código, exigida por el flujo, se vuelve impracticable.

## Decisión

La vista de una generación presenta el código por **unidades de construcción** derivadas del ImplementationPlan y de los vínculos de trazabilidad existentes (`CodeTraceLink`), no por carpetas:

- módulo de negocio;
- entidad (modelo Prisma, migración, DTO, servicio CRUD);
- acción personalizada (contrato, endpoint, lógica de negocio);
- pantalla (ruta, formulario, tabla, componentes);
- pruebas y configuración del proyecto.

Cada unidad muestra:

1. Un resumen en lenguaje natural de qué se generó y qué hace, construido de forma determinista desde el plan (operaciones, campos, reglas, roles, contrato). No requiere IA.
2. Su origen: «Plantilla» (determinista) o «Asistido por IA». Las unidades asistidas por IA se destacan como prioritarias para revisar.
3. Su trazabilidad: requisitos, casos de uso, pantalla del plano y elemento del plan de los que procede.
4. La lista de archivos; cada archivo se abre bajo demanda con resaltado de sintaxis, nunca todos a la vez.
5. Las diferencias respecto a la generación anterior del mismo plan, cuando existe.
6. Su estado de revisión por la persona (pendiente o revisado), guardado por corrida.

La lógica de una acción asistida por IA puede editarse desde su unidad. La edición usa el mecanismo de revisiones de ADR-018: revisión estática, nueva versión de trabajo y nueva validación Docker. Los archivos generados por plantilla no se editan a mano; sus cambios se hacen en el plan o el diseño, con su ciclo de versión.

## Fronteras

- Marcar unidades como revisadas no sustituye la validación P0 ni cambia el estado `READY`.
- Las ediciones nunca sobrescriben una corrida, un snapshot ni un checkpoint existentes; crean historia nueva.
- El resumen describe lo que el plan declara; no afirma corrección funcional no verificada.
- Los archivos se cargan por unidad y por archivo para no transferir el proyecto completo de una vez.
