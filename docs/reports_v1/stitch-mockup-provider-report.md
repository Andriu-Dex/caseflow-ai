# Integración de Stitch para bocetos — reporte de implementación

Fecha: 2026-09-27  
Rama: `feat/stitch-mockup-provider` (creada desde `develop`)  
Estado: implementado para revisión; **sin commit**.

## Alcance y decisiones

Se añadió Stitch (Google Labs) como proveedor preferente opcional para generar un boceto por cada pantalla de un plano de interfaz aprobado. El wireframe SVG interno sigue siendo el fallback y también el comportamiento predeterminado si `MOCKUP_PROVIDER` no se configura. La generación sigue siendo síncrona y crea versiones `SYSTEM_GENERATED` sujetas a revisión humana. El HTML externo no se inserta en el DOM de CASEFlow: únicamente se descarga como archivo adjunto. El plano de interfaz estructurado continúa siendo la fuente canónica.

Una premisa de `instruction.md` resultó incorrecta al contrastarla con npm y la [documentación oficial del SDK](https://github.com/google-labs-code/stitch-sdk): el paquete sin scope `stitch-sdk` (0.0.115) pertenece a otro producto y expone `StitchAppView`; el SDK de Google Labs es `@google/stitch-sdk` (0.3.5). Para conservar el nombre de dependencia e importación solicitado, `apps/api/package.json` utiliza el alias pnpm `stitch-sdk: npm:@google/stitch-sdk@0.3.5`. En esta versión, `StitchToolClient` es el cliente de herramientas; `Stitch` crea el proyecto, `project.generate()` devuelve una pantalla y `getImage()`/`getHtml()` devuelven URLs que se descargan. Al ser ESM-only y la API compilar a CommonJS, la carga del SDK usa `import()` nativo en tiempo de ejecución.

## Cambios implementados

### Persistencia y migración

- `prisma/schema.prisma`: `MockupGeneratorKind` (`INTERNAL_WIREFRAME`, `STITCH`), `MockupDetail.generatorKind` con valor por defecto interno, `svg` opcional y nueva relación `MockupScreenDetail` para una imagen y un HTML por pantalla.
- Migración `20260927130242_add_stitch_mockup_provider` generada y aplicada con `pnpm exec prisma migrate dev --name add_stitch_mockup_provider` desde la raíz (la variante `pnpm --filter @caseflow-ai/api exec prisma ...` del instructivo no encontraba `prisma.config.ts`). El SQL solo crea el enum, modifica las dos columnas indicadas, crea la tabla, su índice único y su clave foránea. No se usó `db push`.
- Las filas históricas conservan `generatorKind=INTERNAL_WIREFRAME` por defecto y su SVG.

### Configuración e integraciones

- `packages/config/src/mockup-config.ts`: `disabled` por defecto; `stitch` exige `STITCH_API_KEY`; timeout configurable de 1 a 120 000 ms, predeterminado en 30 000 ms. `.env.example` contiene únicamente marcadores, sin secretos.
- `packages/integrations/src/mockup-provider.ts`: interfaz, tipos de resultado, errores normalizados, cadena de fallback y fake para pruebas.
- `InternalWireframeMockupProvider` envuelve al renderizador existente. `StitchMockupProvider` crea un proyecto en Stitch, solicita cada pantalla por separado y descarga imagen/HTML. Se validan HTTPS, MIME y tamaño de los archivos. Un timeout global evita que la solicitud quede esperando indefinidamente; ante error, la cadena devuelve el SVG interno.
- `MockupsModule` configura los proveedores y `StorageProvider`. Si no hay almacenamiento configurado, conserva el renderizador interno incluso si se seleccionó Stitch, porque no es seguro generar imágenes que no se puedan persistir.

### API, seguridad y frontend

- `MockupsService` valida que la versión origen sea `APPROVED` y del mismo proyecto. Sanitiza el SVG interno; para Stitch guarda imagen y HTML mediante `StorageProvider` y registra una fila por pantalla junto con `ArtifactVersion` en la transacción. Las claves de almacenamiento nunca aparecen en el contrato público.
- Nuevos endpoints `GET /projects/:projectId/mockups/:mockupId/screens/:screenId/image` y `/html`. Antes de leer almacenamiento, la consulta comprueba conjuntamente ID de pantalla, versión, boceto y proyecto. El HTML se entrega como `attachment`, con `nosniff` y CSP restrictiva; no se renderiza dentro de la aplicación.
- Contrato de vista previa: `generatorKind`, SVG nullable y pantallas nullable con enlaces. El frontend muestra el SVG interno o una imagen por pantalla con descarga de HTML. El botón de generación incluye indicador giratorio.
- La exportación HTML del proyecto conserva los SVG internos y embebe las capturas Stitch aprobadas como `data:` de imagen; no incorpora el HTML de Stitch. El JSON estructurado mantiene enlaces, no binarios.
- Se actualizaron las expectativas OpenAPI para las dos rutas nuevas.

## Verificación

| Comprobación                                                     | Resultado                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm run typecheck`                                             | Correcto                                                                      |
| `pnpm run lint`                                                  | Correcto                                                                      |
| `pnpm run format:check`                                          | Correcto                                                                      |
| `pnpm run test:coverage`                                         | Correcto: 70,26 % ramas; 76,90 % sentencias; 77,54 % líneas                   |
| Migración Prisma                                                 | Generada y aplicada en la base local; SQL revisado                            |
| SDK real, una pantalla con clave local                           | Correcto: `STITCH`, 1 imagen (35 260 bytes) y HTML (15 165 bytes)             |
| Clave inválida                                                   | El SDK falló; la cadena devolvió `INTERNAL_WIREFRAME`                         |
| Sin configuración Stitch                                         | Implementación y pruebas conservan wireframe interno                          |
| Descarga con `screenId` inexistente en proyecto correcto y ajeno | 404 en ambos casos; además hay prueba de consulta con alcance proyecto/boceto |
| Flujo de aprobación                                              | La creación real devolvió estado `GENERATED`; no se aprobó automáticamente    |

La prueba real de un plano aprobado de tres pantallas (`UI-001` del proyecto local «Préstamo de Equipos Deportivos») creó el candidato `58a62fab-215d-4d0a-9718-52ac77923bb0` en estado `GENERATED`, pero con generador `INTERNAL_WIREFRAME`: Stitch no terminó dentro del timeout predeterminado de 30 s y operó el fallback. No se tocó su aprobación. Una prueba directa multípantalla con un timeout mayor permaneció esperando y se interrumpió; por tanto **no se verificó aún el flujo completo Stitch → almacenamiento → vista previa y descargas para ese plano real**. No se presenta esa comprobación como exitosa.

## Riesgos y trabajo posterior

1. **Latencia multípantalla:** el SDK real pudo generar una pantalla, pero la generación concurrente de las tres pantallas del proyecto no terminó en el límite predeterminado. Medir latencia/cuota del proveedor y ajustar `STITCH_TIMEOUT_MS` según resultados; si el flujo síncrono no basta, moverlo a un job en una fase posterior. El timeout global ahora limita la espera de CASEFlow, aunque el SDK no expone cancelación de sus operaciones ya iniciadas.
2. **Activos huérfanos:** los archivos se suben antes de abrir la transacción para no mantener bloqueos durante red. Si la transacción falla después de la subida, pueden quedar objetos sin referencia; `StorageProvider` todavía no tiene operación de borrado. Requiere una limpieza/compensación futura.
3. **Prueba de aislamiento con dos pantallas reales:** se verificó 404 con un ID inexistente y la condición de consulta por proyecto/boceto en pruebas, pero no se creó una segunda pantalla Stitch en otro proyecto para probar cruce real sin añadir datos ajenos.

`requirements.md` preexistente y sin seguimiento se dejó intacto. No se creó commit, no se hizo push y no se tocó `main`.
