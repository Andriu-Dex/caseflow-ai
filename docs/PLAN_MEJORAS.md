# Plan de mejoras tras la reunión con el cliente

Estado: planificado, sin ejecutar. Fecha: 2026-11-16.

## Decisiones tomadas

1. La construcción de RestGuestMateos se hace a mano y se incorpora a CASEFlow mediante una función genérica, «Implementación manual». El núcleo no contiene código de RestGuestMateos.
2. RestGuestMateos mantiene el catering.
3. Los bocetos pasan a generarse como HTML y CSS con el sistema de diseño del proyecto, en lugar de Stitch.
4. El código manual parte del snapshot validado `1a1ff376-8ecb-49bd-8e42-281995d11179`.
5. No se lanzan generaciones con IA hasta terminar RestGuestMateos. Las pruebas de funciones que usan IA son deterministas (proveedor simulado).
6. Trabajo repartido entre dos equipos de trabajo, A y B, según las reglas de la sección «Reparto del trabajo».
7. El código de RestGuestMateos no tiene repositorio Git propio: es un proyecto generado y su historial es el de CASEFlow (cada importación queda como una corrida inmutable).
8. La persona responsable aprobó el ADR-023 y autorizó modificar las reglas de la especificación que la implementación manual requiera.

## Reparto del trabajo

- Cada tarea tiene un responsable: **A** o **B**.
- Cada responsable trabaja sobre archivos distintos para no pisarse. Las ramas son en inglés, por ejemplo `feat/manual-implementation`.
- Revisión cruzada: quien no escribió el cambio lo revisa antes de integrarlo.
- Las tareas se describen cerradas (archivos a leer, criterio de aceptación, comandos de comprobación). Una sola revisión por cambio; se repite solo si hubo correcciones.
- Ambos siguen `AGENTS.md`: Conventional Commits, código en inglés e interfaz en español, avisos con sonner y sin emojis.
- Nadie integra en `main` ni publica sin que lo pida la persona responsable del proyecto.

## Fase 1. Pendientes inmediatos

| ID  | Tarea                                                                                                                 | Resp. | Criterio de aceptación                                                |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| 1.1 | La revisión de lógica de negocio rechaza también incluir o seleccionar la entidad de ámbito a través de una relación. | A     | Prueba que lo rechaza; los 34 métodos actuales siguen aceptados.      |
| 1.2 | No se puede aprobar un paso de planificación mientras uno anterior no esté completo; el mensaje dice cuál falta.      | B     | Pruebas de API y de interfaz; los pasos completos siguen aprobándose. |

## Fase 2. Implementación manual (base de la construcción de RestGuestMateos)

| ID  | Tarea                                                                                                                                                                                                                        | Resp. | Criterio de aceptación                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------- |
| 2.1 | ADR-023 «Implementación manual» y actualización de la especificación: quién puede aportarla, qué se valida, cómo se traza y que no usa IA. La exportación ya existe: el ZIP de un snapshot.                                  | A     | Aprobación ya concedida; el ADR y la especificación se actualizan en el mismo cambio. |
| 2.2 | Migración: la corrida de construcción indica su origen (`GENERATED` o `MANUAL`).                                                                                                                                             | A     | Migración de Prisma nueva, sin reescribir las aplicadas.                              |
| 2.3 | API: importar un árbol de código (zip) para una línea base congelada. Valida rutas, tamaño, tipos de archivo y ausencia de secretos (`.env`); guarda los archivos con origen `MANUAL`; autoriza por pertenencia al proyecto. | A     | Pruebas de rutas peligrosas, secretos, tamaño y otro proyecto.                        |
| 2.4 | La validación en sandbox de una corrida manual no usa la reparación automática con IA: si falla, informa la etapa y el error.                                                                                                | A     | Prueba de que no se llama al orquestador de IA.                                       |
| 2.5 | Trazabilidad: el manifiesto del ZIP declara qué elementos del plan implementa cada archivo; solo se aceptan los que el plan define. La cobertura del plan ya la comprueba la etapa de estructura.                            | A     | Prueba con manifiesto completo, con elementos desconocidos y ausente.                 |
| 2.6 | Interfaz en Construcción: botón «Importar implementación manual», resumen de la importación y el mismo flujo de validación, snapshot y despliegue.                                                                           | B     | Prueba de componente; avisos con sonner.                                              |

## Fase 3. Planificación: qué se va a construir (puntos 3, 4 y 5 de la reunión)

| ID  | Tarea                                                                                                                                                                                                                                  | Resp.                               | Criterio de aceptación                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| 3.1 | Cálculo determinista de contenedores a partir de la plantilla y la arquitectura de sistema aprobada: nombre, responsabilidad, módulos o servicios, puertos, volúmenes y red. Hoy son 3: aplicación (API y web), base de datos y túnel. | A                                   | Prueba con la plantilla actual.                                        |
| 3.2 | Pestaña «Contenedores e infraestructura» con tarjetas y diagrama de conexiones.                                                                                                                                                        | B                                   | Prueba de componente; sin texto técnico fuera de los desplegables.     |
| 3.3 | Vista previa de la estructura: árbol de carpetas y archivos calculado sin IA a partir del plan, con el propósito de cada archivo, su módulo y la ruta web o de API que implementa.                                                     | A (cálculo) / B (árbol en interfaz) | En una corrida generada o manual, compara lo previsto con lo obtenido. |
| 3.4 | Presentación por módulo: tarjeta con resumen de 1 o 2 líneas, contadores (entidades, pantallas, endpoints, archivos) y pestañas «Resumen / Datos / Pantallas / API / Archivos / Fuentes».                                              | B                                   | Prueba de componente; las fuentes y lo técnico quedan plegados.        |

## Fase 4. Pantallas despejadas en CASEFlow (puntos 2 y 6)

Patrón común: resumen con estado y siguiente acción arriba; pestañas «General / Detalle técnico»; acordeones para justificaciones, fuentes y listas largas; textos de 1 o 2 líneas con «Ver más».

| ID  | Tarea                                                                                                                                          | Resp. |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 4.1 | Componentes compartidos `Tabs`, `Accordion` y `SummaryHeader`, accesibles y con pruebas. Sin dependencias nuevas si `<details>` y ARIA bastan. | A     |
| 4.2 | Construcción → Generación (1.906 líneas).                                                                                                      | B     |
| 4.3 | Fuentes (1.595).                                                                                                                               | B     |
| 4.4 | Bocetos (1.567).                                                                                                                               | B     |
| 4.5 | Manual de usuario (1.502).                                                                                                                     | B     |
| 4.6 | Trazabilidad (1.053) y Contexto (939).                                                                                                         | B     |

Criterio común: las pruebas existentes siguen pasando; ninguna acción se pierde, solo se reubica; revisión visual en las páginas de RestGuestMateos.

## Fase 5. Datos de demostración realistas en CASEFlow (punto 1)

| ID  | Tarea                                                                                                                                                      | Resp. |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 5.1 | Nueva versión del prompt de datos de demostración: datos verosímiles y coherentes con el país, la moneda y el sector del proyecto; sin códigos de relleno. | A     |
| 5.2 | Comprobación determinista que rechaza valores de relleno («demo», «test», «prueba», hexadecimales o identificadores sin sentido) y reintenta una vez.      | B     |
| 5.3 | Cuentas de demostración con nombre de persona y un identificador legible por rol (por ejemplo `admin.mateos`).                                             | B     |

Se prueba solo con un proveedor simulado hasta terminar RestGuestMateos.

## Fase 6. Construcción manual de RestGuestMateos

El código se edita en una carpeta de trabajo sin Git, fuera del repositorio de CASEFlow (`RestGuestMateos/`, junto a `CASEFlow-AI/`), creada con la exportación del snapshot `1a1ff376`. Al ser un proyecto generado, su historial lo lleva CASEFlow:

- Al cerrar cada módulo se importa en CASEFlow, lo que deja una corrida inmutable que sirve de punto de control y de copia de seguridad.
- A y B editan carpetas de módulos distintas para no pisarse. Los archivos compartidos (shell, navegación, contratos, esquema de Prisma, siembra) solo los toca el responsable de la tarea 6.2, y los demás piden los cambios.

Convenciones de interfaz:

- No se muestran identificadores; se muestran nombres.
- La cabecera de cada pantalla es breve, sin repetir la descripción del módulo.
- Las definiciones y fórmulas van en un panel plegable «Cómo se calcula».
- Estados y valores en español.
- Avisos con sonner.

| ID   | Tarea                                                                                                                                            | Resp. |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 6.1  | Crear el repositorio desde el snapshot, comprobar que instala, compila y pasa las pruebas; documento corto de convenciones.                      | A     |
| 6.2  | Diseño base: shell, navegación, componentes de tabla, formularios, tarjetas y panel «Cómo se calcula».                                           | A     |
| 6.3  | Acceso, inicio y usuarios.                                                                                                                       | A     |
| 6.4  | Caja y ventas (borrador, confirmación, corrección, anulación, observaciones).                                                                    | A     |
| 6.5  | Catálogo: productos, categorías, disponibilidad y precio local.                                                                                  | B     |
| 6.6  | Menús diarios: versiones, edición, publicación y copia.                                                                                          | B     |
| 6.7  | Inventario: entradas, salidas, mermas, ajustes, mínimos y alertas.                                                                               | B     |
| 6.8  | Gastos: categorías, gastos, confirmación posterior de un borrador y corrección del importe.                                                      | B     |
| 6.9  | Reportes e indicadores, incluidos los de solicitudes y eventos de catering y la comparación con selector de sucursal.                            | B     |
| 6.10 | Catering: clientes, solicitudes, condiciones, eventos con cambios de estado y vínculo de gastos.                                                 | A     |
| 6.11 | Siembra realista escrita a mano: sucursales de Quito, personal con nombres, platos, menús por día, ventas, gastos y eventos coherentes entre sí. | B     |
| 6.12 | Manifiesto de trazabilidad completo contra el plan v33.                                                                                          | A     |
| 6.13 | Importar en CASEFlow, validar, desplegar y repetir las pruebas por rol y por acción.                                                             | A     |

Cada módulo se cierra con sus pruebas, una revisión del otro responsable y una prueba en el navegador con el rol correspondiente.

## Fase 7. Bocetos en HTML y CSS (después de RestGuestMateos)

| ID  | Tarea                                                                                                                                                            | Resp. |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 7.1 | Proveedor de bocetos que genera HTML y CSS con el tema, los colores y los componentes aprobados del proyecto, detrás de la interfaz `ScreenGenerator` existente. | A     |
| 7.2 | Vista previa y comparación de bocetos en la pantalla de Bocetos.                                                                                                 | B     |
| 7.3 | Alternativa manual: importar bocetos hechos por una persona (HTML o imágenes).                                                                                   | B     |

## Fase 8. Mejoras adicionales (backlog, por prioridad)

1. Estimación de llamadas de IA antes de lanzar una generación, con lo que se reutiliza y lo que se regenera.
2. Panel de la demostración desplegada: cuentas con nombre y rol, copiar, acceso directo y estado de los contenedores.
3. Indicador de progreso de la planificación con el motivo de cada bloqueo.
4. Enlace de despliegue estable con un túnel con nombre de Cloudflare (requiere cuenta).
5. Asistente para dividir un proyecto grande en entregas cuando supera la capacidad de la IA.

## Fase 9. Proyecto del cine

Comprobar el flujo genérico completo con IA en un proyecto pequeño, ya con las fases 3, 4, 5 y 7 terminadas.

## Orden y dependencias

1 → 2 → (3 y 4 en paralelo) → 5 → 6 → 7 → 9. La fase 8 se toma por partes cuando haya hueco.

Dentro de la fase 6, las tareas 6.1 y 6.2 van primero. Después A (6.3, 6.4, 6.10) y B (6.5 a 6.9 y 6.11) avanzan en paralelo.
