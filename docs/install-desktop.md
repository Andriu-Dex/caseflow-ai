# Instalar CASEFlow AI en Windows (edición de escritorio)

La edición de escritorio es la forma más sencilla de usar CASEFlow AI: se instala como cualquier programa, funciona en tu propio equipo y no necesitas servidor, base de datos ni conexión a internet para el trabajo manual. Tus datos se quedan en tu máquina.

## Requisitos

- Windows 10 u 11 de 64 bits.
- Al menos 1 GB libre (el instalador pesa unos 260 MB).
- **Docker Desktop (opcional):** solo hace falta para validar los proyectos generados (instalar, compilar y probar el código en un entorno aislado). Sin Docker puedes hacer todo el análisis, el diseño, el plan de generación y la generación de código; la página de generación te guiará para instalarlo cuando llegues a esa etapa.

## Instalación

1. Descarga `CASEFlow AI Setup 2.0.0.exe` desde la página de [Releases](../../../releases) del repositorio.
2. Ábrelo. Como el instalador todavía no está firmado digitalmente, Windows puede mostrar «Windows protegió su PC»: pulsa **Más información** y luego **Ejecutar de todas formas**.
3. Elige la carpeta de instalación y termina el asistente.
4. Abre **CASEFlow AI** desde el menú Inicio. La primera vez tarda unos segundos en preparar la base de datos.
5. Crea tu cuenta local en la pantalla de registro. Esa cuenta existe solo en tu equipo.

## Configurar la IA (opcional)

CASEFlow AI funciona completo sin IA. Si quieres que proponga borradores, abre **Ajustes de IA** y elige una de estas opciones:

- **Continuar con ChatGPT:** inicia sesión por el navegador y usa tu plan ChatGPT Plus o Pro. Las credenciales se guardan cifradas con el almacén seguro del sistema operativo.
- **Un proveedor compatible con OpenAI** (Groq, Gemini, etc.): indícalo en el archivo `caseflow.env` descrito abajo.

## Opciones avanzadas

Los ajustes opcionales van en `caseflow.env`, dentro de la carpeta de datos de la aplicación (`%APPDATA%\CASEFlow AI`), con una línea `CLAVE=VALOR` por ajuste:

| Clave                                                  | Para qué sirve                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Conectar un proveedor de IA compatible con OpenAI                                      |
| `MOCKUP_PROVIDER`                                      | Bocetos con Stitch (sin él se usa el esquema interno)                                  |
| `KROKI_BASE_URL`                                       | Servidor Kroki propio; por defecto se usa el público `kroki.io` para dibujar diagramas |

Los secretos se generan en el primer arranque y nunca salen de tu equipo.

## Dónde quedan tus datos, copias y desinstalación

- Todo se guarda en `%APPDATA%\CASEFlow AI`. Para hacer una copia de seguridad, cierra la aplicación y copia esa carpeta.
- Desinstalar desde **Configuración → Aplicaciones** quita el programa pero conserva esa carpeta; bórrala si también quieres eliminar tus datos.

## Problemas frecuentes

- **Windows bloquea el instalador:** es el aviso de «editor desconocido» (ver paso 2). No indica un problema del archivo.
- **La generación de código dice que Docker no está disponible:** instala Docker Desktop, ábrelo y espera a que diga «running»; después reintenta.
- **No abre o se cierra al iniciar:** comprueba que los puertos 4800 a 4803 de tu equipo no los use otro programa.

## Generar el instalable desde el código

Para quien desarrolla; requiere Node 24 y pnpm:

```bash
pnpm install
pnpm --filter @caseflow-ai/desktop run package   # deja el instalador en apps/desktop/release
```

Más sobre la arquitectura de esta edición en el [README](../README.md#desktop-edition).
