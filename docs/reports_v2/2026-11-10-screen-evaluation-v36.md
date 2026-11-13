# Evaluación de pantallas con el evaluador v36 — RestGuestMateos (plan v26)

## Resultado

- Acciones de negocio: 18 de 18 implementadas y revisadas.
- Pantallas: 81 evaluadas; **2 aceptadas** y **79 con hallazgos** (467 en total). No se generó entrega oficial.
- Tipos: `MISSING_DATA_BINDING` 196, `MISSING_ACTION_BINDING` 154, `MISSING_FORM_BINDING` 77, `UNSUPPORTED_LAYOUT` 40.
- Detalle por pantalla: `2026-11-10-screen-findings-v36.json`.

## Clasificación aproximada (por palabras clave)

| Grupo                                                                                                                                                                  | Hallazgos | Dónde se corrige                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------- |
| El evaluador no recibió la evidencia (implementación del servidor, componentes compartidos, estados de página)                                                         | ~121      | Contexto que CASEFlow envía al evaluador |
| Defectos del generador: parámetros de ruta no usados, consultas generales en lugar de la específica, sin precarga, etiquetas en inglés, estados de carga/no encontrado | ~35+      | Plantillas deterministas                 |
| Requieren revisar el plan: contratos, enumeraciones como texto libre, funciones ausentes (p. ej. configuración de componentes por línea)                               | ~56+      | Nueva versión del ImplementationPlan     |
| Sin clasificar automáticamente                                                                                                                                         | ~255      | Revisión manual por grupos               |

## Incidencias de operación resueltas durante la corrida

- La pausa del broker por límite de Subscription Sharing se conserva hasta reanudarla manualmente.
- Las ediciones en `src` reinician la API de `pnpm dev`, que marca como interrumpida una corrida en curso.
- Los errores dentro del stream (`server_is_overloaded`) se clasifican ahora como proveedor no disponible.
- Los hallazgos de cada pantalla se guardan al recibirse y no se vuelven a evaluar sin cambios.
