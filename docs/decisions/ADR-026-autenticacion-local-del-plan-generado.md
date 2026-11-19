# ADR-026 — Autenticación local en el plan de implementación generado

- **Estado:** Aprobado por indicación del usuario el 2026-11-19.
- **Decisión:** DEC-177.
- **Modifica:** el plan de implementación por lotes (DEC-144) y la cobertura del plan. No modifica las reglas de integridad y seguridad de la sección 2 de la especificación ni los requisitos de autenticación de ADR-015; los aplica a los planes generados con IA.

## Contexto

ADR-015 exige que un plan con autenticación obligatoria declare `authentication.local`:

- la cuenta, con identificador único, hash interno de contraseña y estado;
- los roles como relación con un catálogo de nombre único;
- la entidad de sesión con sus fechas de vigencia;
- las operaciones integradas de acceso, cierre y opciones autorizadas, cada una en su propia pantalla.

La construcción se niega a empezar sin esa configuración.

El plan generado por lotes nunca la producía. Ningún lote la pedía, y en modo estricto el modelo rellenaba las marcas de operación integrada en cualquier endpoint o ruta. El resultado era un plan inválido o, si se limpiaban esas marcas, uno que la construcción rechazaba. En la demostración de cine, «Iniciar sesión» quedó servida por la creación de cuentas.

## Decisión

### 1. La autenticación local la completa el servidor, sin IA

Cuando la autenticación es obligatoria y el plan no la vincula, tras las entidades y antes de las rutas:

- **Cuenta:** es la entidad del diseño con un campo de contraseña o, si no lo hay, la que se nombra como cuenta o usuario. Si no existe, no se inventa: la comprobación previa a la construcción lo informa.
- **Campos de la cuenta:**
  - El identificador de acceso pasa a ser obligatorio y único.
  - El hash de contraseña pasa a ser interno y obligatorio.
  - Se añade un estado de solo lectura con valor inicial del servidor, salvo que el diseño ya tenga uno.
  - Se retira la sal separada, porque Argon2id la incluye en el hash.
  - El campo de rol se sustituye por una relación con un catálogo de roles de nombre único, que se reutiliza si el diseño ya lo tiene.
- **Sesión:** se añade una entidad de sesión que pertenece a la cuenta, con inicio, última actividad, invalidación opcional y estado, sin CRUD público.
- **Operaciones integradas:** se añaden `POST /auth/login`, `POST /auth/logout` y `GET /auth/options`.

Las rutas se piden después con esas operaciones como endpoints existentes. Las acciones de iniciar sesión, cerrar sesión o consultar las opciones del rol, reconocidas por su texto, se atienden con ellas aunque el modelo haya elegido otra cosa. Las que el plano de interfaz no ofrece se colocan así:

- el acceso, en la página de acceso;
- las opciones, en el inicio;
- el cierre, en una página propia, para que las tres queden en páginas distintas.

Las marcas de operación integrada que el modelo ponga en un lote se ignoran.

### 2. Lo que añade la autenticación no es una brecha de cobertura

La sesión, el catálogo de roles, la página de cierre y las acciones integradas no provienen del diagrama de clases ni del plano de interfaz. La coherencia del plan las reconoce por su vínculo con `authentication.local` y no exige que nombren una clase o pantalla.

### 3. Referencias entre lotes

Un lote puede referirse a lo que otro iba a definir. Al reunir el plan:

- **Navegación:** las acciones que solo llevan a otra pantalla se conservan como navegación.
- **Consultas de contexto:** se descarta una consulta que no es un endpoint GET con contrato.
- **Navegación sin destino:** se descarta la que apunta a una ruta que nadie definió; su acción se resuelve como cualquier otra sin atender.
- **Endpoints usados:** se conservan los que solo leen una consulta o una navegación.
- **Rutas repetidas:** cuando la ruta termina en un parámetro, el sufijo se añade como un segmento propio.

## Consecuencias

- Un plan generado con autenticación obligatoria llega a la construcción con su autenticación local completa, o con un aviso claro si el diseño no tiene cuenta.
- El modelo de la cuenta del plan puede diferir del diagrama de clases en lo que exige la plantilla (estado, roles como relación, sin sal). La diferencia es deliberada y queda en el plan aprobado.
- Los valores técnicos de estado (`ACTIVE`, `INACTIVE`, `CLOSED`) son de la plantilla, no del negocio.
- Reconocer acciones por su texto depende del idioma del proyecto. Lo que no se reconoce se coloca de forma determinista.
