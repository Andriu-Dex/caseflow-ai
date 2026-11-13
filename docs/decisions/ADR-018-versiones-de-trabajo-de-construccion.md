# ADR-018 — Versiones de trabajo integradas de construcción

- Estado: Aprobado para implementación por solicitud del usuario.
- Fecha: 2026-11-08.
- Complementa ADR-015, ADR-016 y ADR-017.

## Problema

Las evaluaciones parciales pueden corregir lógica de negocio en copias temporales sin consolidar sus resultados. Repetir una generación puede recuperar un checkpoint anterior, perdiendo una corrección probada. Además, completar las etapas de análisis y diseño no acredita que el código esté implementado o validado.

## Decisión

Una corrida con estado terminal `WORKING_COPY` conserva una versión integrada e incompleta del proyecto generado. Se crea desde un ImplementationPlan aprobado y su Design Baseline aprobado, sin modificar esas versiones ni los snapshots existentes. No es un GeneratedProjectSnapshot ni una entrega oficial.

`POST /projects/{projectId}/generation-runs/working-copies` permite consolidar checkpoints compatibles sin inferencias externas. Las correcciones identifican una acción activa del plan, un archivo de checkpoint de origen del mismo proyecto, baseline y plantilla, su hash esperado y un cuerpo revisado. Se exige permiso de generación y pertenencia al proyecto y workspace. Se rechazan duplicados, origen ajeno, hash distinto y código no admitido por la revisión estática existente.

Los cuerpos nuevos se guardan como checkpoints inmutables de la nueva corrida. Un manifiesto conserva motivo, origen, hashes, acciones implementadas y pendientes. Se generan archivos completos con el generador determinista y trazabilidad al plan. Las acciones sin implementación mantienen el rechazo 501. El renderizador interno conserva una base reproducible; no acredita equivalencia visual con los bocetos ni sustituye la adaptación exigida en una entrega oficial.

La recuperación de checkpoints compatibles selecciona primero la corrida más reciente, con desempate estable. El contexto sigue incluyendo plantilla, prompt, acción, contrato, reglas, persistencia y análisis congelado. Una corrección consolidada puede reutilizarse en la siguiente generación oficial sin volver a una propuesta anterior. Una revisión estática no acredita corrección funcional: todos los controles de publicación siguen siendo obligatorios.

## Fronteras

- `WORKING_COPY` no equivale a `GENERATED` o `READY`.
- El inicio de validación oficial conserva su requisito de corrida `GENERATED`; una versión de trabajo no puede obtener un snapshot, manual o ZIP oficial mediante ese flujo.
- El código de la versión de trabajo no se ejecuta en el proceso principal. Las evaluaciones mantienen Docker como frontera.
- La vista de generación permite consultar sus archivos y pendientes. El inicio de una generación oficial sigue aplicando los controles de completitud y diseño.
- La señal visual de construcción completada requiere que la generación más reciente del último plan aprobado esté generada y que su último intento de validación sea `READY` con snapshot. Una corrida anterior o de otro plan no completa la versión vigente. Archivar una corrida cambia su visibilidad, no este criterio.
- Los contadores de acciones se leen del manifiesto compatible con la corrida; no se deducen del número de advertencias. El historial y sus detalles se consultan de forma plegable y bajo demanda.
- Una corrección no altera requisitos, autorizaciones o decisiones del plan aprobado. Los cambios de alcance requieren su ciclo de versión y revisión.
- Las pantallas de inicio y preparación denominan su progreso «Análisis y diseño» y remiten a construcción para comprobar el estado del software.
- Las migraciones agregan un valor al enum de corridas y extienden la protección de inmutabilidad a las versiones de trabajo terminadas; no modifican registros históricos ni exigen recrear la base.
