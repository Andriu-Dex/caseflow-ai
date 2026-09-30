# Procesamiento de fuentes

Una fuente puede registrarse sin procesador externo. El archivo original permanece en el almacenamiento privado del proyecto y el usuario puede aportar una transcripción manual. El texto automático se guarda en una **nueva versión borrador** para revisión; solo una versión aprobada se usa como conocimiento oficial.

Al adjuntar un archivo, el campo de contenido pasa a ser contexto adicional opcional. Para una fuente sin archivo, el contenido escrito sigue siendo obligatorio.

## Formatos y procesamiento

| Archivo               | Procesamiento                                                  |
| --------------------- | -------------------------------------------------------------- |
| TXT y Markdown        | Lectura UTF-8 local durante la carga                           |
| PDF con texto         | Extracción local en un trabajo                                 |
| PDF escaneado o mixto | OCR local solo en páginas sin capa de texto                    |
| DOCX                  | Extracción local de párrafos                                   |
| PNG, JPEG y WebP      | OCR local con Tesseract.js (español e inglés)                  |
| MP3, WAV y M4A/MP4    | `TranscriptionProvider` OpenAI-compatible, si está configurado |

La API valida tamaño (25 MiB), tipo declarado y firma del contenido. El PDF admite hasta 100 páginas, de las cuales hasta 10 pueden necesitar OCR. El texto extraído se limita a 50 000 caracteres; si el archivo no produce texto legible, el trabajo falla y el usuario puede escribirlo manualmente. Se reutiliza texto ya extraído de un archivo con el mismo SHA-256 dentro del **mismo proyecto**.

Los trabajos usan BullMQ/Redis y el worker existente. `INTERNAL_JOBS_SECRET` debe coincidir entre API y worker. La interfaz consulta el estado `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED` o `UNSUPPORTED`, permite reintentar y muestra el texto para corregirlo mediante una nueva versión. No muestra porcentajes estimados.

## Configuración

Ejecute las migraciones Prisma antes de iniciar la API tras actualizar el código (`pnpm db:migrate`). Para transcribir audio, configure `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_API_KEY` y `TRANSCRIPTION_MODEL` con un servicio compatible con `POST /audio/transcriptions`. Si faltan, el audio se registra y queda disponible la transcripción manual. Ninguna clave se envía al navegador.

Tesseract.js descarga sus modelos de idioma en el primer uso y los guarda en caché. Si no puede obtenerlos, el trabajo queda en `FAILED`; el archivo original y la opción manual siguen disponibles. El audio se envía al proveedor configurado únicamente para la transcripción automática.
