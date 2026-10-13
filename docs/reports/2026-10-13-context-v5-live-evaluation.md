# Evaluación real de contexto v5

Fecha: 2026-10-13. Proveedor: ChatGPT conectado mediante el intermediario local. Proyecto de prueba aislado: préstamo de equipos deportivos. La evaluación no usa fuentes ni datos privados del proyecto del usuario.

Comando: `CASEFLOW_LIVE_AI=1 pnpm exec vitest run --config vitest.integration.config.mts apps/api/test/integration/context-v5-live.integration.spec.ts` (en PowerShell, configurar la variable en el proceso antes del comando).

Resultado: 1 prueba aprobada; ejecución total 28,71 segundos. Se recorrió registro y aprobación de fuente, generación de contexto con el servicio real, validación del esquema y persistencia del candidato en `caseflow_test`. CI omite la evaluación cuando no se activa expresamente.

- Actores: Encargado y Administrador. No incluyó al director, asesor, alumno sin acceso ni equipo de desarrollo.
- Necesidades: registro de equipos, préstamos, entregas, devoluciones, usuarios, consulta de historial y auditoría.
- Reglas: identificación del alumno y fecha de devolución, no prestar equipos ya prestados, administración de usuarios restringida al administrador.
- Restricciones: auditoría durante un año e interfaz adaptable.
- Exclusiones: pagos y reservas en línea.
- Contexto adicional: interesados sin acceso y actividades del proyecto (capacitación, piloto y fases). No empezó con frases sobre la propuesta.

La prueba demuestra estos criterios con una fuente controlada. No demuestra que toda respuesta futura sea correcta ni sustituye revisar la cobertura y coherencia de cada proyecto. El historial aprobado del usuario no fue modificado por esta evaluación.
