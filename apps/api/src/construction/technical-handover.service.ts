import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { findTargetTemplate, type TargetTemplateVersion } from '@caseflow-ai/domain';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { StorageProvider } from '@caseflow-ai/integrations';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { planForRun } from './delivery-scope';
import { ReleaseNotesService } from './release-notes.service';

const ARCHITECTURES = [
  {
    type: 'SYSTEM_ARCHITECTURE',
    title: 'Arquitectura de sistema',
    file: 'arquitectura-de-sistema',
  },
  {
    type: 'SOFTWARE_ARCHITECTURE',
    title: 'Arquitectura de software',
    file: 'arquitectura-de-software',
  },
] as const;

const LAYERS: Record<string, string> = {
  FRONTEND: 'Interfaz web',
  BACKEND: 'Servidor',
  SHARED: 'Compartida',
};

type ArchitectureItem = { name: string; kind?: string; responsibilities?: string[] };

// DEC-174: the package for whoever maintains the system: the validated code
// and, in documentacion/, how to install and run it, its technologies, its
// API, its architecture (with what the diagrams leave out), its accounts and
// its delivery notes. Built from what CASEFlow already knows; nothing is
// invented and no password is included.
@Injectable()
export class TechnicalHandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: ReleaseNotesService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async package(projectId: string, snapshotId: string, userId: string) {
    const snapshot = await this.prisma.generatedProjectSnapshot.findFirst({
      where: { id: snapshotId, projectId },
      include: {
        generationRun: {
          select: { id: true, implementationPlanVersionId: true, deliveryId: true },
        },
        project: { select: { name: true } },
      },
    });
    if (!snapshot) throw new NotFoundException('Proyecto generado no encontrado.');
    const run = snapshot.generationRun;
    const plan = await planForRun(this.prisma, projectId, run);
    const template = findTargetTemplate(
      snapshot.targetTemplateIdentifier,
      snapshot.targetTemplateVersion,
    );
    const zip = new JSZip();
    const code = await JSZip.loadAsync(await this.storage.getObject(snapshot.archiveStorageKey));
    for (const [path, entry] of Object.entries(code.files))
      if (!entry.dir) zip.file(`codigo/${path}`, await entry.async('uint8array'));
    // The folder to enter: the archive's single root folder, if it has one.
    const roots = new Set(Object.keys(code.files).map((path) => path.split('/')[0]));
    const folder = roots.size === 1 ? `codigo/${[...roots][0]}` : 'codigo';

    const docs = (name: string, content: string) => zip.file(`documentacion/${name}`, content);
    const architectures = await this.architectures(projectId);
    for (const architecture of architectures)
      if (architecture.svg) docs(`diagramas/${architecture.file}.svg`, architecture.svg);
    const release = await this.notes.notes(projectId, run.id);
    docs('LEEME.md', readme(snapshot.project.name, snapshot.createdAt, release.title, template));
    docs('INSTALACION.md', installation(plan, template, folder));
    if (template) docs('TECNOLOGIAS.md', technologies(template));
    docs('API.md', apiDocument(plan));
    docs('ARQUITECTURA.md', architectureDocument(architectures));
    docs('CUENTAS.md', accounts(plan, release.demo));
    docs('NOTAS-DE-ENTREGA.md', release.markdown);

    const body = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await this.audit.record({
      projectId,
      actorUserId: userId,
      action: 'TECHNICAL_HANDOVER_DOWNLOADED',
      entityType: 'GENERATED_PROJECT_SNAPSHOT',
      entityId: snapshot.id,
      metadata: { archiveSha256: snapshot.archiveSha256 },
    });
    return { body, filename: `entrega-tecnica-${snapshot.id}.zip` };
  }

  // The approved architectures with their stored diagram and items.
  private async architectures(projectId: string) {
    return Promise.all(
      ARCHITECTURES.map(async ({ type, title, file }) => {
        const version = await this.prisma.artifactVersion.findFirst({
          where: {
            projectId,
            status: 'APPROVED',
            artifact: { artifactTypeCode: type, archivedAt: null },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            structuredAnalysisDetail: { select: { content: true } },
            diagramDetail: { select: { svg: true } },
          },
        });
        const content = version?.structuredAnalysisDetail?.content as {
          components?: ArchitectureItem[];
          nodes?: ArchitectureItem[];
        } | null;
        return {
          title,
          file,
          svg: version?.diagramDetail?.svg ?? null,
          items: [...(content?.nodes ?? []), ...(content?.components ?? [])],
        };
      }),
    );
  }
}

function readme(
  project: string,
  createdAt: Date,
  release: string,
  template: TargetTemplateVersion | undefined,
) {
  return `# Entrega técnica: ${project}

${release}. Proyecto validado el ${createdAt.toLocaleDateString('es-EC')}${
    template ? ` con la plantilla ${template.name} v${template.version}` : ''
  }.

- \`codigo/\`: el código validado. Su \`README.md\` es la referencia para trabajar con él.
- \`INSTALACION.md\`: requisitos, instalación, variables de entorno y comprobaciones.
- \`TECNOLOGIAS.md\`: tecnologías y versiones exactas.
- \`API.md\`: entidades y acciones del servidor.
- \`ARQUITECTURA.md\` y \`diagramas/\`: arquitectura de sistema y de software.
- \`CUENTAS.md\`: roles y cuentas de prueba.
- \`NOTAS-DE-ENTREGA.md\`: qué hace el sistema y qué incluye esta entrega.
`;
}

function installation(
  plan: ImplementationPlanContent,
  template: TargetTemplateVersion | undefined,
  folder: string,
) {
  const lines = ['# Instalación y puesta en marcha', '', '## Requisitos', ''];
  if (template)
    lines.push(
      `- Node.js ${template.toolchain.node}`,
      `- ${template.toolchain.packageManager.replace('@', ' ')}`,
      '- Docker, para la base de datos PostgreSQL',
      '',
    );
  lines.push(
    '## Pasos',
    '',
    `1. Abra una terminal en \`${folder}/\`.`,
    '2. Ejecute `pnpm run setup`: instala las dependencias, crea `.env` con secretos aleatorios, levanta la base de datos y aplica las migraciones.',
    '3. Ejecute `pnpm run dev` y abra la aplicación en http://localhost:3000.',
    '4. La documentación interactiva de la API está en http://localhost:3001/docs.',
    '',
    'Para ejecutar todo en Docker, sin Node.js en el equipo, use `pnpm run docker:up`. Si el `README.md` de esa carpeta indica otros pasos, siga el `README.md`.',
    '',
    '## Variables de entorno',
    '',
  );
  if (plan.envVars.length)
    for (const variable of plan.envVars)
      lines.push(
        `- \`${variable.name}\`${variable.required ? ' (obligatoria)' : ''}: ${variable.description}`,
      );
  else lines.push('Solo las de `.env.example`, que `pnpm run setup` completa.');
  if (template) {
    lines.push('', '## Comprobaciones', '', 'La validación de CASEFlow ejecutó:', '');
    for (const command of template.validationCommands)
      lines.push(`- \`${command.argv.join(' ')}\``);
  }
  return `${lines.join('\n')}\n`;
}

function technologies(template: TargetTemplateVersion) {
  const lines = [
    '# Tecnologías',
    '',
    `- Lenguaje: ${template.language}`,
    `- Arquitectura: ${template.architecture}`,
    `- Interfaz web: ${template.frontend}`,
    `- Servidor: ${template.backend}`,
    `- Persistencia: ${template.persistence}`,
    `- API: ${template.apiStyle}`,
    '',
    '## Dependencias',
    '',
    '| Paquete | Versión | Capa | Solo desarrollo |',
    '|---|---|---|---|',
  ];
  for (const dependency of template.dependencies)
    lines.push(
      `| ${dependency.name} | ${dependency.version} | ${LAYERS[dependency.layer] ?? dependency.layer} | ${dependency.dev ? 'Sí' : 'No'} |`,
    );
  return `${lines.join('\n')}\n`;
}

const OPERATIONS: Record<string, string> = {
  LIST: 'listar',
  GET: 'consultar',
  CREATE: 'crear',
  UPDATE: 'modificar',
  DELETE: 'eliminar',
};

function apiDocument(plan: ImplementationPlanContent) {
  const lines = [
    '# API del servidor',
    '',
    'La especificación OpenAPI completa se publica al ejecutar la aplicación en `/docs` (puerto 3001).',
    '',
    '## Entidades',
    '',
  ];
  for (const entity of plan.entities) {
    const operations = (entity as { operations?: string[] }).operations ?? [];
    lines.push(
      `- **${entity.name}**${operations.length ? `: ${operations.map((op) => OPERATIONS[op] ?? op).join(', ')}` : ''}`,
    );
  }
  lines.push('', '## Acciones', '');
  if (!plan.customEndpoints.length)
    lines.push('No hay acciones propias además de las de cada entidad.');
  for (const endpoint of plan.customEndpoints)
    lines.push(
      `- \`${endpoint.method} ${endpoint.path}\`: ${endpoint.summary}${
        endpoint.roles?.length ? ` (roles: ${endpoint.roles.join(', ')})` : ''
      }`,
    );
  return `${lines.join('\n')}\n`;
}

function architectureDocument(
  architectures: { title: string; file: string; svg: string | null; items: ArchitectureItem[] }[],
) {
  const lines = ['# Arquitectura', ''];
  for (const architecture of architectures) {
    lines.push(`## ${architecture.title}`, '');
    if (architecture.svg) lines.push(`Diagrama: \`diagramas/${architecture.file}.svg\``, '');
    if (!architecture.items.length) lines.push('Sin elementos aprobados.', '');
    for (const item of architecture.items) {
      lines.push(`### ${item.name}`, '');
      for (const responsibility of item.responsibilities ?? []) lines.push(`- ${responsibility}`);
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function accounts(
  plan: ImplementationPlanContent,
  demo: {
    url: string | null;
    accounts: { role: string; identifier: string; name: string | null }[];
  } | null,
) {
  const lines = ['# Roles y cuentas', ''];
  if (!plan.authentication.required)
    return `${[...lines, 'La aplicación no requiere iniciar sesión.'].join('\n')}\n`;
  lines.push('## Roles', '');
  for (const role of plan.authentication.roles) lines.push(`- ${role}`);
  lines.push('', '## Cuentas de prueba', '');
  if (demo?.accounts.length) {
    if (demo.url) lines.push(`Demostración: ${demo.url}`, '');
    for (const account of demo.accounts)
      lines.push(
        `- ${account.role}: ${account.identifier}${account.name ? ` (${account.name})` : ''}`,
      );
    lines.push(
      '',
      'La contraseña es la que se indicó al desplegar; no se incluye en esta entrega.',
    );
  } else
    lines.push(
      '`pnpm run setup` crea las cuentas de prueba y las muestra en la consola. Cree cuentas nuevas con `pnpm run account:create`.',
    );
  return `${lines.join('\n')}\n`;
}
