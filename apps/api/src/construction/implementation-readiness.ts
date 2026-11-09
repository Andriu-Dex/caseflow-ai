import type { ImplementationPlanContent } from '@caseflow-ai/contracts';

// Explicit preflight for the current template. Legacy plans remain readable;
// an old approval must not silently authorize an incomplete new delivery.
export function implementationReadinessProblems(plan: ImplementationPlanContent): string[] {
  const problems: string[] = [];
  const local = plan.authentication.local;
  if (plan.authentication.required && !local)
    problems.push(
      'El plan requiere autenticación, pero no vincula cuentas, credenciales y sesiones. Complete esa configuración antes de generar.',
    );
  for (const entity of plan.entities) {
    for (const field of entity.fields) {
      if (
        field.readOnly &&
        field.required &&
        entity.operations.includes('CREATE') &&
        field.serverDefault === undefined
      )
        problems.push(
          `El campo de solo lectura ${entity.name}.${field.name} requiere un valor inicial del servidor para crear registros.`,
        );
      if (
        /^(?:password|passwordHash|secretDigest|accessToken|refreshToken|apiKey)$/i.test(
          field.name,
        ) &&
        !field.internal
      )
        problems.push(
          `El campo ${entity.name}.${field.name} debe declararse interno; no puede exponerse en formularios ni contratos públicos.`,
        );
      if (
        field.internal &&
        field.required &&
        entity.operations.includes('CREATE') &&
        local?.userEntityLocalId !== entity.localId
      )
        problems.push(
          `La entidad ${entity.name} requiere un campo interno y necesita una operación específica para crearse de forma segura.`,
        );
    }
  }
  if (local) {
    if (local.scope)
      for (const builtin of ['AUTH_CONTEXT', 'SELECT_SCOPE'] as const)
        if (plan.customEndpoints.filter((endpoint) => endpoint.builtin === builtin).length !== 1)
          problems.push(`El contexto requiere exactamente una operación ${builtin}.`);
    const account = plan.entities.find((entity) => entity.localId === local.userEntityLocalId);
    if (!account?.operations.includes('CREATE'))
      problems.push('El plan debe permitir preparar cuentas con contraseña protegida.');
    if (!account?.writeRoles.length)
      problems.push(
        'La administración de cuentas requiere roles explícitos; no puede quedar abierta a cualquier cuenta autenticada.',
      );
    if (account?.fields.some((field) => field.name === 'password'))
      problems.push(
        'La contraseña presentada es un dato transitorio del contrato, no un campo persistente de la cuenta.',
      );
    for (const builtin of ['LOGIN', 'LOGOUT', 'AUTHORIZED_OPTIONS'] as const)
      if (plan.customEndpoints.filter((endpoint) => endpoint.builtin === builtin).length !== 1)
        problems.push(
          `El plan debe definir exactamente una operación integrada de autenticación ${builtin}.`,
        );
    const pages = ['POST /auth/login', 'POST /auth/logout', 'GET /auth/options'].map(
      (endpoint) =>
        plan.routes.find((route) => route.actions.some((action) => action.endpoint === endpoint))
          ?.path,
    );
    if (new Set(pages).size !== 3)
      problems.push(
        'El acceso, el inicio de operación y el cierre de sesión requieren pantallas distintas.',
      );
    for (const endpoint of ['POST /auth/login', 'POST /auth/logout', 'GET /auth/options'])
      if (
        !plan.routes.some((route) => route.actions.some((action) => action.endpoint === endpoint))
      )
        problems.push(`Falta la pantalla que sirve ${endpoint}.`);
  }
  for (const route of plan.routes)
    for (const action of route.actions) {
      if (
        route.kind === 'DETAIL' &&
        route.entityLocalId === local?.userEntityLocalId &&
        action.operation === 'CREATE' &&
        /desactiv|inactiv|eliminar/i.test(action.label)
      )
        problems.push(
          `La acción «${action.label}» no puede crear otro registro de la entidad de ${route.path}; necesita su operación de negocio.`,
        );
    }
  return problems;
}
