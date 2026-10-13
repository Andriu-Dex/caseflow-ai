# ADR-007 — El instalable como distribución principal y ChatGPT en desarrollo local

- **Estado:** Aprobado
- **Fecha:** 2026-10-12
- **Decisión registrada como:** DEC-128
- **Modifica:** ADR-002 (DEC-117), punto 3: el proveedor "ChatGPT" ya no existe _solo_ en la edición de escritorio; también puede usarse en desarrollo local.
- **No modifica:** ADR-002 punto 4 (una edición web alojada no ofrece el plan de ChatGPT), §174 (el código generado solo se ejecuta en el sandbox Docker), §36.7 (nada de cobros ni cambios de proveedor silenciosos).

## Contexto

CASEFlow no necesita un despliegue web: se usa en el equipo de quien lo ejecuta. Según ADR-002, OpenAI permite usar la cuota de un plan de ChatGPT en herramientas personales o de código abierto que **corren localmente**, que es el caso tanto del instalable como del entorno `pnpm dev`.

Los proveedores gratuitos configurados son limitados de formas opuestas (DEC-127): Groq admite muchas peticiones pequeñas (8 000 tokens por minuto) y Gemini pocas grandes (20 al día). El plan de ChatGPT tiene un contexto amplio y es la mejor opción para documentos largos, pero hasta ahora solo funcionaba en el instalable, porque el intermediario que guarda las credenciales vive en el proceso principal de Electron.

## Decisión

1. **El instalable (edición de escritorio) es la distribución principal.** No hay despliegue web obligatorio. La web se sigue compilando desde el mismo código, para una posible versión alojada futura; esa versión no ofrecería el plan de ChatGPT.
2. **ChatGPT en desarrollo local.** Con `AI_PROVIDER=chatgpt`, `pnpm dev` inicia un intermediario propio (`apps/desktop/src/dev-broker.ts`) que reutiliza el inicio de sesión del escritorio:
   - Corre como **proceso aparte**, para que los reinicios de la API al cambiar el código no cierren la sesión.
   - Las **credenciales viven solo en memoria**: no hay almacén cifrado del sistema operativo fuera de Electron, así que nada secreto se escribe en disco. En disco solo quedan el identificador del equipo, el del cliente registrado y el modelo (`~/.caseflow/chatgpt-dev.json`), para no registrar una aplicación nueva en cada inicio de sesión.
   - **Salvaguardas:** solo escucha en `127.0.0.1`; la API rechaza un intermediario fuera de este equipo; no arranca con `NODE_ENV=production`.
   - Las reglas de ADR-002 siguen igual: con la cuota agotada se pausa y se pregunta; nunca hay un cambio silencioso de proveedor.

## Consecuencias

- **A favor:** el plan de ChatGPT se puede usar mientras se desarrolla y se prueba, sin compilar el instalable.
- **En contra:** hay que volver a iniciar sesión cada vez que se reinicia `pnpm dev` por completo.
- **Riesgo:** el permiso de OpenAI está en preview y sus términos pueden cambiar. Por eso ChatGPT nunca es el único proveedor posible: Groq, Gemini u otro compatible siguen disponibles.
- **Colaboración:** con el instalable cada equipo es un solo usuario. La revisión por otras personas y los avisos por correo quedan para una versión alojada futura.
