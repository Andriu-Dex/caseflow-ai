import type {
  ConstructionPreviewResponse,
  ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import { DEPLOYMENT_CONTAINERS } from '@caseflow-ai/integrations';
import { endpointKey } from '../code-generation/engine/backend.templates';
import type { GeneratedProjectFile } from '../code-generation/engine/types';

type Preview = Omit<ConstructionPreviewResponse, 'implementationPlanVersionId'>;
type Container = Preview['containers'][number];

// The containers a project runs in, from the plan alone: the demonstration
// CASEFlow publishes and the Docker Compose file the project ships.
function containers(plan: ImplementationPlanContent): Container[] {
  const modules = plan.modules.map((module) => module.name);
  const tables = `${plan.entities.length} ${plan.entities.length === 1 ? 'tabla' : 'tablas'}`;
  const published = DEPLOYMENT_CONTAINERS;
  const limits = (item: { memory: string; cpus: number }) =>
    `${item.memory} de memoria, ${item.cpus} CPU`;
  return [
    {
      environment: 'DEPLOYMENT',
      name: 'aplicación',
      image: 'Node.js con el código del proyecto en un volumen',
      responsibility:
        'Ejecuta la API y la web del proyecto. Aplica el esquema de datos al arrancar y atiende todas las pantallas y acciones.',
      services: [
        { name: 'Web (Next.js)', port: published.application.webPort },
        { name: 'API (NestJS)', port: published.application.apiPort },
      ],
      modules,
      volumes: ['Código y dependencias del proyecto'],
      exposure: 'Solo a través del túnel; no publica puertos en la máquina.',
      limits: limits(published.application),
      dependsOn: ['base de datos'],
    },
    {
      environment: 'DEPLOYMENT',
      name: 'base de datos',
      image: published.database.image,
      responsibility: `Guarda los datos del proyecto (${tables}). Solo la aplicación puede conectarse.`,
      services: [{ name: 'PostgreSQL', port: published.database.port }],
      modules: [],
      volumes: ['Datos de PostgreSQL'],
      exposure: null,
      limits: limits(published.database),
      dependsOn: [],
    },
    {
      environment: 'DEPLOYMENT',
      name: 'túnel',
      image: published.tunnel.image,
      responsibility:
        'Publica la web en una dirección HTTPS de Cloudflare. Es la única salida a internet del despliegue.',
      services: [{ name: 'Cloudflare Tunnel', port: null }],
      modules: [],
      volumes: [],
      exposure: 'Dirección pública HTTPS de Cloudflare.',
      limits: null,
      dependsOn: ['aplicación'],
    },
    {
      environment: 'LOCAL',
      name: 'web',
      image: 'Imagen construida desde docker/Dockerfile (etapa web)',
      responsibility: 'Sirve las pantallas del proyecto.',
      services: [{ name: 'Web (Next.js)', port: 3000 }],
      modules,
      volumes: [],
      exposure: 'http://localhost:3000',
      limits: null,
      dependsOn: ['api'],
    },
    {
      environment: 'LOCAL',
      name: 'api',
      image: 'Imagen construida desde docker/Dockerfile (etapa api)',
      responsibility: 'Atiende las acciones y consultas de todos los módulos.',
      services: [{ name: 'API (NestJS)', port: 3001 }],
      modules,
      volumes: [],
      exposure: 'http://localhost:3001',
      limits: null,
      dependsOn: ['migrate'],
    },
    {
      environment: 'LOCAL',
      name: 'migrate',
      image: 'Imagen construida desde docker/Dockerfile (etapa migrate)',
      responsibility: 'Crea las tablas al iniciar y termina.',
      services: [],
      modules: [],
      volumes: [],
      exposure: null,
      limits: null,
      dependsOn: ['postgres'],
    },
    {
      environment: 'LOCAL',
      name: 'postgres',
      image: 'postgres:17',
      responsibility: `Guarda los datos del proyecto (${tables}).`,
      services: [{ name: 'PostgreSQL', port: 5432 }],
      modules: [],
      volumes: ['postgres-data'],
      exposure: null,
      limits: null,
      dependsOn: [],
    },
  ];
}

const GENERAL_PURPOSES: [RegExp, string][] = [
  [/^prisma\/schema\.prisma$/, 'Esquema de la base de datos'],
  [/^prisma\//, 'Datos y migraciones'],
  [/^docker\//, 'Contenedores para ejecutar el proyecto'],
  [/(^|\/)package\.json$/, 'Dependencias y comandos'],
  [/(^|\/)e2e\//, 'Pruebas de extremo a extremo'],
  [/^scripts\//, 'Comandos de preparación'],
  [/\.md$/, 'Documentación'],
  [/^packages\/contracts\//, 'Contratos de datos compartidos entre web y API'],
  [/^packages\/api-client\//, 'Cliente de la API para la web'],
  [/^apps\/web\/components\//, 'Componentes compartidos de la interfaz'],
  [/^apps\/api\/src\/auth\//, 'Autenticación y permisos'],
];
const KIND_PURPOSES = {
  SOURCE: 'Código compartido',
  TEST: 'Pruebas',
  CONFIG: 'Configuración',
  DOCUMENTATION: 'Documentación',
} as const;

// What the plan will produce: containers, and each file with what it is for.
export function constructionPreview(
  plan: ImplementationPlanContent,
  files: readonly GeneratedProjectFile[],
): Preview {
  const routes = new Map(plan.routes.map((route) => [`route:${route.path}`, route]));
  const endpoints = new Map(
    plan.customEndpoints.map((endpoint) => [`endpoint:${endpointKey(endpoint)}`, endpoint]),
  );
  const entities = new Map(plan.entities.map((entity) => [`entity:${entity.localId}`, entity]));
  const moduleOf = (element: string) =>
    element.startsWith('module:')
      ? element.slice('module:'.length)
      : (routes.get(element)?.moduleLocalId ??
        endpoints.get(element)?.moduleLocalId ??
        entities.get(element)?.moduleLocalId ??
        null);
  const role = (path: string) =>
    /\.(spec|test)\./.test(path)
      ? 'Pruebas de'
      : path.endsWith('.controller.ts')
        ? 'API de'
        : path.endsWith('.service.ts')
          ? 'Lógica de'
          : 'Código de';
  const described = files.map((file) => {
    // A file that implements exactly one route, action or entity is described
    // by it; the most specific wins (a page also names the entity it lists).
    const single = <T>(known: Map<string, T>) => {
      const found = file.planElements.filter((element) => known.has(element));
      return found.length === 1 ? known.get(found[0]!) : undefined;
    };
    const route = single(routes);
    const endpoint = route ? undefined : single(endpoints);
    const entity = route || endpoint ? undefined : single(entities);
    const owners = [...new Set(file.planElements.map(moduleOf))];
    const general = GENERAL_PURPOSES.find(([pattern]) => pattern.test(file.path))?.[1];
    const purpose = route
      ? `Pantalla «${route.screenName}»`
      : endpoint
        ? `Acción «${endpoint.summary}»`
        : (general ??
          (entity ? `${role(file.path)} la entidad «${entity.name}»` : KIND_PURPOSES[file.kind]));
    return {
      path: file.path,
      kind: file.kind,
      origin: file.origin,
      purpose,
      moduleLocalId: owners.length === 1 ? owners[0]! : null,
      routePath: route?.path ?? null,
      endpoint: endpoint ? endpointKey(endpoint) : null,
    };
  });
  return {
    containers: containers(plan),
    modules: plan.modules.map((module) => ({
      localId: module.localId,
      name: module.name,
      description: module.description,
      entities: plan.entities.filter((item) => item.moduleLocalId === module.localId).length,
      routes: plan.routes.filter((item) => item.moduleLocalId === module.localId).length,
      endpoints: plan.customEndpoints.filter((item) => item.moduleLocalId === module.localId)
        .length,
      files: described.filter((file) => file.moduleLocalId === module.localId).length,
    })),
    files: described.sort((a, b) => a.path.localeCompare(b.path)),
  };
}
