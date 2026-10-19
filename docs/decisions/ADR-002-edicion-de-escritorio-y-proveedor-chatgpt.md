# ADR-002 — Edición de escritorio y proveedor "ChatGPT"

- **Estado:** Aprobado
- **Fecha:** 2026-10-03
- **Decisión registrada como:** DEC-117
- **Modifica:** `AGENTS.md` §8 (la lista de trabajo que no debe adelantarse menciona "advanced BYOK"; este proveedor queda aprobado explícitamente) y §5 (baseline tecnológico: se agrega Electron para `apps/desktop`).
- **No modifica:** §174 (el código generado solo se ejecuta en el sandbox Docker), §36 (los módulos de dominio no llaman a proveedores directamente), §36.7 (nada de cobros silenciosos).

## Contexto

OpenAI lanzó (DevDay, 29 de septiembre de 2026) el permiso OAuth `chatgpt.tokens.use.direct` de "Sign in with ChatGPT", que permite a un usuario de ChatGPT Plus o Pro usar la cuota de su plan, incluido Codex, dentro de otra aplicación. Según la documentación oficial, está disponible **para herramientas de código abierto y proyectos personales que corren localmente**; las apps **de pago o alojadas en remoto** necesitan solicitarlo en una lista de espera.

CASEFlow es un proyecto personal, sin pagos, con el repositorio público. Se publica con licencia Apache-2.0.

## Decisión

1. **Licencia Apache-2.0** para todo el monorepo (la edición de escritorio empaqueta la API y la web, así que no basta licenciar solo `apps/desktop`). Ni la edición web ni la de escritorio incluyen pagos.
2. **Edición de escritorio con Electron** en `apps/desktop`:
   - Electron (y no Tauri) porque incluye Node.js, el mismo runtime de la API y el worker, que pueden correr como procesos hijos sin cambios.
   - _(Reemplazado por DEC-120, ADR-005: PGlite, cola en proceso y almacenamiento en disco.)_ PostgreSQL embebido con binarios portables; Redis empaquetado como binario portable (sin reescribir el código de colas basado en BullMQ); almacenamiento en disco mediante un `FilesystemStorageProvider`; correo desactivado.
   - **La construcción sigue exigiendo Docker:** el código generado nunca se ejecuta fuera del sandbox (§174). Sin Docker, la planificación funciona y la construcción muestra un asistente interactivo de instalación.
3. **Proveedor "ChatGPT" solo en la edición de escritorio**, como una implementación más de `AIProvider` sobre la Responses API:
   - OAuth desde el proceso principal de Electron, con un `ext_agent_host_id` persistente por equipo y credenciales cifradas con el almacén seguro del sistema operativo.
   - **429 (cuota agotada):** pausar las llamadas con el plan, avisar al usuario y ofrecer otro modelo configurado **solo con su confirmación**. Nunca un cambio silencioso a un proveedor de pago.
   - **403 (no elegible):** explicar el motivo sin reintentar.
   - **Sesión revocada:** detectarla al fallar, limpiar las credenciales y pedir reconectar. Al cerrar sesión, revocar el token de refresco.
4. **La edición web no ofrece el plan de ChatGPT**, porque es una app alojada en remoto. El botón "Continuar con ChatGPT" existe, pero lleva al asistente de instalación de la edición de escritorio.

## Consecuencias

- **A favor:** un usuario con ChatGPT Plus o Pro puede usar CASEFlow sin conseguir ni pagar una API key aparte.
- **En contra:** la función está en preview y sus términos pueden cambiar. Por eso nunca es el único proveedor posible y vive detrás de la bandera de edición de escritorio.
- **Costo:** se mantienen dos ediciones (web y escritorio) sobre la misma base de código, con instaladores grandes por incluir Postgres y Redis.
- **Pruebas:** el contrato del proveedor se prueba con respuestas simuladas en CI; la evaluación con una cuenta real queda fuera del CI (`AGENTS.md` §44).
