# Contribuir a CASEFlow AI

## Preparar el entorno

Usa Node.js 24 y pnpm 11.27.0, las versiones fijadas en el repositorio. Sigue la
[instalación desde código](README.md#local-setup). Copia únicamente los ejemplos
de configuración; nunca incluyas tu `.env`, credenciales ni datos privados en un PR.
Docker es necesario para las pruebas de integración y para validar software generado.
Las pruebas unitarias ordinarias no requieren proveedores externos.

Antes de cambiar el producto, consulta [AGENTS.md](AGENTS.md), las secciones
pertinentes de la [especificación](docs/CASEFLOW_AI_SPEC.md) y las
[decisiones arquitectónicas](docs/decisions/). Reutiliza contratos, componentes y
proveedores existentes. El código y los identificadores son en inglés; la interfaz
y los mensajes para usuarios son en español.

## Proponer un cambio

Describe el problema, los pasos para reproducirlo y el resultado esperado. En una
propuesta de funcionalidad explica a qué usuarios sirve y cómo conserva el flujo
manual, la separación entre proyectos, el historial y la trazabilidad.
No adjuntes tokens, registros sin depurar ni archivos de proyectos privados.

## Ramas y revisión

1. Parte de `develop` actualizado y crea una rama breve en inglés, por ejemplo
   `fix/manual-download` o `feat/documentation-help`.
2. Mantén el cambio enfocado. Separa experimentos y entregas académicas en ramas
   temporales; no los integres automáticamente al producto.
3. Añade pruebas apropiadas a los cambios de comportamiento y actualiza la
   documentación correspondiente. Los cambios de esquema usan migraciones de
   Prisma; no reescribas migraciones históricas ni uses `db push` para desplegar.
4. Abre un pull request hacia `develop` con problema, solución, validaciones
   ejecutadas y limitaciones. Solicita revisión humana antes de integrar.
5. Reserva `main` para versiones finalizadas mediante pull request. No hagas push
   directo ni reescribas historia compartida.

Esta es la política de colaboración. La existencia de protecciones remotas o
revisiones obligatorias debe comprobarse en GitHub; este archivo no las configura.

## Verificar

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
pnpm --filter @caseflow-ai/web run test
```

Con infraestructura local disponible, prepara exclusivamente la base de pruebas:

```bash
pnpm infra:up
pnpm verify:integration
pnpm run test:e2e
```

Lee la configuración de Playwright antes de ejecutar E2E y evita puertos ocupados.
No apuntes pruebas a una base de datos de uso normal. La cobertura global objetivo
es al menos 70%; las comprobaciones deben validar comportamiento, no solo subir
el porcentaje. Nunca debilites pruebas para ocultar un fallo.
`pnpm verify` agrupa los controles principales, pero no sustituye la suite web
separada, las integraciones ni E2E. Informa explícitamente de lo que no ejecutaste.

## Commits, versiones y entregas

Usa mensajes técnicos en inglés, preferiblemente Conventional Commits, por ejemplo
`fix(auth): reject revoked sessions`. Conserva la identidad Git ya configurada y no
añadas atribuciones automáticas. Revisa el diff y los archivos preparados antes de
crear el commit.

Una versión de entrega debe identificar su commit, controles ejecutados y artefacto
distribuido. Las versiones de la API y del instalable pueden diferir: no atribuyas
funcionalidades nuevas a un instalador antiguo solo por su nombre. El CI actual
valida cambios; no publica ni despliega automáticamente. Véase la
[guía de API y verificación](docs/api-guide.md).

## Conducta y licencia

La participación se rige por el [código de conducta](CODE_OF_CONDUCT.md).
El repositorio se distribuye bajo [Apache-2.0](LICENSE); conserva los avisos de
[NOTICE](NOTICE) y comprueba la compatibilidad de nuevas dependencias.
