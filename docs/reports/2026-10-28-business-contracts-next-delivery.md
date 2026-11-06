# Contratos pendientes para la siguiente entrega de RestGuestMateos

Estado: propuesta de trabajo, sin aprobación comercial ni implementación de estas operaciones. Fecha: 28 de octubre de 2026.

La matriz de permisos y el contexto de sucursal ya están implementados. Esta propuesta trata el siguiente bloqueo: contratos incompletos de las acciones y reglas a las que el análisis aprobado hace referencia sin una configuración ejecutable suficiente.

## Contrato común propuesto

Cada operación necesita una entrada tipada, respuesta tipada, validaciones, permisos, alcance, efectos, errores esperados y pruebas. El servidor obtiene la identidad y la sucursal del contexto verificado; no confía en una identidad enviada por el formulario.

Las consultas deben aceptar filtros explícitos de periodo cuando lo exige su pantalla. Deben devolver la selección aplicada, zona horaria, instante de cálculo y estados que distingan cero, ausencia de datos, división por cero y regla todavía no disponible. La vista no debe reconstruir esos estados adivinando la forma de un objeto desconocido.

Las confirmaciones deben revalidar condiciones y registrar sus efectos atómicamente. Las claves de idempotencia se vinculan a operación, responsable y alcance. El plan debe indicar cómo detectar cambios concurrentes antes de elegir un mecanismo concreto.

Las referencias a políticas significan versiones identificables y validadas, no cadenas libres interpretadas por cada cuerpo generado. Esta propuesta no fija porcentajes, plazos, conversiones, estados comerciales ni redondeos nuevos.

## Familias de acciones

| Familia                                           | Entrada y salida que falta formalizar                                                                                                              | Decisiones que deben quedar enlazadas                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Indicadores y recomendaciones                     | Periodo explícito; selección aplicada; indicadores con valor, unidad, estado, componentes y definición; advertencias y respaldo de cada conclusión | Política de anulaciones, clasificación histórica, redondeo y reglas de recomendaciones       |
| Reportes de ventas, gastos, inventario y catering | Filtros admitidos, límites, agrupaciones, datos de origen y contexto; respuesta distinta de la exportación                                         | Estados incluidos/excluidos, fechas y moneda/unidades comparables                            |
| Comparación entre sucursales                      | Dos referencias autorizadas, periodos comparables y magnitudes solicitadas; desglose y diferencias con fuentes                                     | Equivalencia temporal, tratamiento de ausencias y compatibilidad de magnitudes               |
| Exportación CSV                                   | Identidad de una consulta autorizada o sus filtros validados; columnas y resultado de descarga                                                     | No aceptar rutas de archivos ni identificadores de otro alcance como autorización            |
| Borrador y confirmación de venta                  | Líneas y selecciones tipadas; revisión de importes calculados en servidor; confirmación y resultado persistido                                     | Catálogo y precios aplicables, descuentos, clasificación histórica y política de existencias |
| Revisión y confirmación de anulación              | Venta original, motivo, revisión de efectos e idempotencia; reversa vinculada al original                                                          | Qué efectos se revierten y cómo se conserva y consulta el historial                          |
| Entradas, salidas, mermas y ajustes               | Productos, cantidades, unidades, fecha operativa, motivo y referencias necesarias; revisión separada de confirmación                               | Conversiones admitidas, fechas válidas, autorizaciones, protección de saldo e idempotencia   |
| Transiciones de catering                          | Entidad y estado esperado, transición solicitada, motivo y resultado persistido                                                                    | Matriz de transiciones, roles, condiciones y efectos de cada cambio                          |
| Historial de catering                             | Filtros autorizados y paginación; eventos, estados y referencias de origen                                                                         | Conservación y visibilidad del historial                                                     |
| Comprobantes de gastos                            | Archivo privado autorizado, metadatos permitidos y gasto relacionado; referencia privada persistida                                                | Tipos y tamaños admitidos, revisión humana y separación de adjuntar, extraer y confirmar     |

## Validación previa a publicación

Para cada acción se debe demostrar un caso correcto y, cuando corresponde, datos ajenos, estado inválido, reintento, concurrencia, fallo intermedio y conservación histórica. Las pruebas de la frontera de alcance no sustituyen estas comprobaciones.

El listado individual de las 26 acciones y sus roles está en [la evidencia estructurada](2026-10-28-operation-scope-validation.json). Veintitrés propuestas fueron rechazadas por no conservar ningún camino correcto; las otras tres solo tienen revisión estática. No deben presentarse como funciones listas para el usuario.

El siguiente cambio del plan debe enlazar estos contratos con sus pantallas, requerimientos y políticas. Hasta entonces, conservar el bloqueo de entrega evita producir un manual que documente controles sin comportamiento real.
