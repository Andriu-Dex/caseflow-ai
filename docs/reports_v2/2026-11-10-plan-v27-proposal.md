# Propuesta del plan de implementación v27 — RestGuestMateos

Base: plan v26 aprobado (`10ec9789`). Evidencia: evaluación de las 81 pantallas con el evaluador v36 (`2026-11-10-screen-findings-v36.json`) y una segunda pasada con Gemini Flash-Lite. Ninguna versión aprobada se modifica: v27 se crea como versión nueva y requiere tu revisión y aprobación.

## 1. Cambios con respaldo en las fuentes (se aplican en v27)

| Cambio                                                                                                             | Respaldo                          | Alcance                     |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------- |
| Etiqueta en español para cada campo y relación visible                                                             | Política de idioma de la interfaz | 150 campos, 74 relaciones   |
| `Product.classification` pasa de texto libre a lista cerrada: `DESAYUNO`, `ALMUERZO`, `CARTA`, `EXTRA`, `CATERING` | RF-111                            | Productos y líneas de venta |

Las etiquetas están en `tests/evaluations/rest-guest-mateos/plan-v27-labels.json` para que puedas corregir cualquiera antes de aprobar.

## 2. Mejoras del generador (no cambian el plan; sin IA)

Patrones repetidos en muchas pantallas que se resuelven en las plantillas, para cualquier proyecto:

1. **«Cancelar y volver»** en formularios de alta y edición, hacia el listado de la entidad.
2. **Filtros por estado y por relación** en los listados (además de fechas), validados en el servidor.
3. **Resumen del registro guardado** (identificador, estado y datos principales) en lugar de solo un aviso.
4. Ya corregido: parámetros de ruta en formularios de edición, estados de carga y «no existe».

## 3. Decisiones que te corresponden

Ninguna se infiere: cada una cambia el alcance aprobado.

| #   | Tema                         | Hallazgo                                                                                                 | Opciones                                                                                       |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | Canales de venta             | `Sale.channel` es texto libre; RF-125 solo nombra «domicilio».                                           | Lista cerrada (¿cuáles? p. ej. LOCAL, PARA_LLEVAR, DOMICILIO) o mantener texto libre           |
| D2  | Unidad de venta              | `Product.salesUnit` sin valores en los requisitos.                                                       | Lista cerrada (¿cuáles?) o texto libre                                                         |
| D3  | Componentes del menú         | `MenuVersionComponent.componentType`: el modelo de datos dice «PROTEINA, EXTRA, PLATO, etc.».            | Confirmar la lista completa                                                                    |
| D4  | Descuentos en caja           | El contrato de venta los desactiva (importe cero) pero la pantalla y RF-002 los contemplan.              | Habilitar descuentos autorizados por línea, o quitarlos de la pantalla                         |
| D5  | Proteínas y extras por línea | La caja no permite configurar proteína/extras por almuerzo (RF-002).                                     | Añadir la configuración por línea al contrato del borrador, o dejarlo fuera de esta entrega    |
| D6  | Borrador de venta            | Falta descartar un borrador y editar sus líneas existentes sin rehacerlo.                                | Añadir operaciones «descartar borrador» y edición de líneas, o simplificar el flujo            |
| D7  | Moneda de gastos             | La moneda es texto libre y no hay moneda ratificada.                                                     | Moneda fija del restaurante, lista cerrada, o pendiente de acuerdo con bloqueo de confirmación |
| D8  | Revisión OCR                 | Falta comparar por campo (propuesto/aceptado) y operaciones separadas de guardar, confirmar y descartar. | Implementar la revisión completa o reducirla a confirmar/descartar                             |
| D9  | Disponibilidad por sucursal  | No hay consulta de la disponibilidad de un producto en una sucursal concreta.                            | Añadir esa consulta al plan                                                                    |
| D10 | Catering e informes          | Faltan filtros (cliente, estado, categoría, producto) y paginación en historial e informes.              | Incluirlos (recomendado; parte se cubre con la mejora 2 del generador)                         |

## 4. Después de aprobar

1. Crear v27 con los cambios de la sección 1 y las decisiones de la sección 3.
2. Reevaluar las pantallas con Gemini (sin cuota de ChatGPT) hasta que no queden hallazgos reales.
3. Regenerar solo las acciones cuyo contrato cambie (ChatGPT, pocas llamadas).
4. Validación en Docker con E2E y, si queda cuota, una pasada final de pantallas con ChatGPT.
