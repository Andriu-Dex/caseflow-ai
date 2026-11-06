import type { ImplementationPlanContent, UiBlueprintContent } from '@caseflow-ai/contracts';

export function buildUserManual(
  plan: ImplementationPlanContent,
  blueprint: UiBlueprintContent | null,
  files: { id: string; path: string }[],
) {
  const tasks = plan.routes.map((route) => {
    const path =
      route.path === '/' ? 'apps/web/app/page.tsx' : `apps/web/app${route.path}/page.tsx`;
    const file = files.find((item) => item.path === path);
    if (!file) throw new Error('An implementation route has no generated source file.');
    const screen = blueprint?.screens.find((item) => item.localId === route.screenLocalId);
    const entity = plan.entities.find((item) => item.localId === route.entityLocalId);
    const publicAccess =
      route.actions.some((action) => action.endpoint === 'POST /auth/login') &&
      Boolean(plan.authentication.local);
    const roles = publicAccess
      ? []
      : route.roles?.length
        ? route.roles
        : entity?.readRoles.length
          ? [...new Set([...entity.readRoles, ...entity.writeRoles])]
          : plan.authentication.roles;
    return {
      title: route.screenName,
      routePath: route.path,
      generatedFileId: file.id,
      roles,
      verified: false,
      steps: [
        {
          instruction: publicAccess
            ? `Abra la página «${route.screenName}» para acceder al sistema.`
            : `Abra «${route.screenName}» desde la navegación de la aplicación.`,
          expectedResult: 'Compruebe que la pantalla corresponde a la tarea y que tiene acceso.',
        },
        ...(screen?.forms.length
          ? [
              {
                instruction: 'Complete los datos solicitados en la pantalla.',
                expectedResult:
                  'Revise los campos y los mensajes de validación antes de continuar.',
              },
            ]
          : []),
        ...route.actions.map((action) => {
          const allowed = action.endpoint
            ? plan.customEndpoints.find(
                (endpoint) => `${endpoint.method} ${endpoint.path}` === action.endpoint,
              )?.roles
            : action.operation === 'GET' || action.operation === 'LIST'
              ? entity?.readRoles
              : entity?.writeRoles;
          return {
            instruction: `${allowed?.length ? `Con uno de estos roles (${allowed.join(', ')}), seleccione` : 'Seleccione'} «${action.label}».`,
            expectedResult:
              'Compruebe el resultado mostrado antes de repetir la acción. Si el control no está disponible, revise sus permisos con el responsable.',
          };
        }),
        ...(!route.actions.length
          ? [
              {
                instruction: 'Consulte la información disponible en la pantalla.',
                expectedResult:
                  'Compruebe que los datos corresponden a su consulta y a sus permisos.',
              },
            ]
          : []),
      ],
    };
  });
  if (!tasks.length) throw new Error('The implementation plan has no user-facing routes.');
  return {
    introduction:
      'Guía rápida por tareas. Si la aplicación requiere identificación, acceda con su cuenta. Elija la tarea que necesita y siga los pasos. Los esquemas representan el flujo; no son capturas de la aplicación. Las instrucciones deben comprobarse en la versión entregada antes de aprobar este manual.',
    tasks,
  };
}
