import type {
  FirstDeliverableExport,
  NavigationTreeContent,
  SoftwareArchitectureContent,
  SystemArchitectureContent,
  UiBlueprintContent,
} from '@caseflow-ai/contracts';

// Every project-controlled or AI-generated string is untrusted (spec §36.5 /
// Phase H "Export security"): escaped before interpolation into HTML. Only
// diagram/mockup `svg` fields are embedded raw, because they already passed
// the trusted sanitizeDiagramSvg() boundary before being persisted — never
// arbitrary uploaded SVG.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const e = (value: string | null | undefined) => escapeHtml(value ?? '');

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  GENERATED: 'Generado',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  CHANGES_REQUESTED: 'Cambios solicitados',
};
const PRIORITY_LABELS: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };
const IMPACT_LABELS: Record<string, string> = {
  CURRENT: 'Vigente',
  NEWER_APPROVED_KNOWLEDGE_AVAILABLE: 'Hay información aprobada más reciente',
  POTENTIALLY_AFFECTED: 'Podría estar desactualizado',
};
const CARDINALITY_LABELS: Record<string, string> = {
  ONE: '1',
  ZERO_OR_ONE: '0..1',
  ONE_OR_MORE: '1..*',
  ZERO_OR_MORE: '0..*',
};

const STYLE = `
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2330;max-width:960px;margin:0 auto;padding:40px 24px;line-height:1.55}
h1{font-size:2rem;margin:0 0 4px}h2{font-size:1.35rem;margin:40px 0 12px;padding-bottom:6px;border-bottom:2px solid #4f46e5}
h3{font-size:1.05rem;margin:20px 0 6px}.muted{color:#64677a;font-size:.9rem}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:.9rem}th,td{border:1px solid #d9dbe5;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1f2f8}.card{border:1px solid #d9dbe5;border-radius:8px;padding:12px 16px;margin:12px 0}
.code{font-family:ui-monospace,Consolas,monospace;color:#4f46e5;font-size:.85rem}
figure{margin:12px 0;padding:12px;border:1px solid #d9dbe5;border-radius:8px;overflow-x:auto;text-align:center}
figure svg{max-width:100%;height:auto}figcaption{color:#64677a;font-size:.85rem;margin-top:6px}
.toc{columns:2;font-size:.95rem}.ok{color:#047857}.pending{color:#b45309}
@media print{h2{page-break-before:always}figure{page-break-inside:avoid}}`;

function list(items: string[], empty = 'Sin elementos.'): string {
  return items.length
    ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
    : `<p class="muted">${empty}</p>`;
}
function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '<p class="muted">Sin elementos.</p>';
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}
function field(label: string, value: string): string {
  return value ? `<p><strong>${label}:</strong> ${value}</p>` : '';
}
function diagram(d: { code: string; svg: string } | null, caption: string): string {
  if (!d) return '<p class="muted">Diagrama no disponible.</p>';
  return `<figure>${d.svg}<figcaption>${e(caption)} (${e(d.code)})</figcaption></figure>`;
}

interface Section {
  id: string;
  title: string;
  body: string;
}

export function renderExportHtml(data: FirstDeliverableExport): string {
  const sections: Section[] = [];
  const add = (id: string, title: string, body: string) => sections.push({ id, title, body });

  add(
    'fuentes',
    'Fuentes del proyecto',
    table(
      ['Código', 'Título', 'Estado'],
      data.sources.map((s) => [
        `<span class="code">${e(s.code)}</span>`,
        e(s.source.title),
        e(STATUS_LABELS[s.version.status] ?? s.version.status),
      ]),
    ),
  );

  const c = data.context;
  add(
    'contexto',
    'Contexto del proyecto',
    c
      ? [
          field('Planteamiento del problema', e(c.problemStatement)),
          field('Objetivo', e(c.objective)),
          `<h3>Actores</h3>${list(c.actors.map((a) => e(a.name) + (a.description ? ` — ${e(a.description)}` : '')))}`,
          `<h3>Necesidades</h3>${list(c.needs.map((n) => e(n.description)))}`,
          `<h3>Restricciones</h3>${list(c.constraints.map((n) => e(n.description)))}`,
          `<h3>Reglas de negocio</h3>${list(c.businessRules.map((n) => e(n.description)))}`,
          c.scopeItems.length
            ? `<h3>Alcance</h3>${list(c.scopeItems.map((s) => `${s.type === 'IN_SCOPE' ? 'Incluye' : 'Excluye'}: ${e(s.description)}`))}`
            : '',
          field('Contexto adicional', e(c.additionalContext)),
          field(
            'Fuentes que lo respaldan',
            c.sources.map((s) => e(`${s.code} (${s.title})`)).join(', '),
          ),
        ].join('')
      : '<p class="muted">El contexto del proyecto aún no está aprobado.</p>',
  );

  const reqRow = (r: FirstDeliverableExport['requirements'][number]) => [
    `<span class="code">${e(r.code)}</span>`,
    `<strong>${e(r.requirement.name)}</strong><br>${e(r.requirement.description)}`,
    e(PRIORITY_LABELS[r.requirement.priority] ?? r.requirement.priority),
    e(r.requirement.actors.join(', ')),
  ];
  const functional = data.requirements.filter(
    (r) => r.requirement.requirementType === 'FUNCTIONAL',
  );
  const nonFunctional = data.requirements.filter(
    (r) => r.requirement.requirementType !== 'FUNCTIONAL',
  );
  add(
    'requisitos',
    'Requisitos',
    `<h3>Requisitos funcionales (${functional.length})</h3>${table(['Código', 'Requisito', 'Prioridad', 'Actores'], functional.map(reqRow))}` +
      `<h3>Requisitos no funcionales (${nonFunctional.length})</h3>${table(['Código', 'Requisito', 'Prioridad', 'Actores'], nonFunctional.map(reqRow))}`,
  );

  add(
    'casos-de-uso',
    'Casos de uso',
    data.useCases.length
      ? data.useCases
          .map((u) => {
            const x = u.useCase;
            return `<div class="card"><h3><span class="code">${e(u.code)}</span> ${e(x.name)}</h3>${[
              field('Objetivo', e(x.objective)),
              field('Actor principal', e(x.primaryActor)),
              field('Actores secundarios', e(x.secondaryActors.join(', '))),
              field('Precondiciones', e(x.preconditions.join('; '))),
              field('Postcondiciones', e(x.postconditions.join('; '))),
              `<p><strong>Flujo principal:</strong></p><ol>${x.mainFlow.map((s) => `<li>${e(s.actor)}: ${e(s.action)}</li>`).join('')}</ol>`,
              x.alternativeFlows
                .map(
                  (f) =>
                    `<p><strong>Flujo alternativo — ${e(f.name)}</strong> (si ${e(f.condition)}):</p><ol>${f.steps.map((s) => `<li>${e(s.actor)}: ${e(s.action)}</li>`).join('')}</ol>`,
                )
                .join(''),
            ].join('')}</div>`;
          })
          .join('')
      : '<p class="muted">Aún no hay casos de uso aprobados.</p>',
  );

  add(
    'diagrama-cu',
    'Diagrama de casos de uso',
    diagram(data.useCaseDiagram, 'Diagrama de casos de uso'),
  );

  type Entity = {
    localId: string;
    name: string;
    description?: string;
    attributes: {
      name: string;
      type: string;
      required: boolean;
      primaryKey: boolean;
      unique: boolean;
    }[];
  };
  type Relationship = {
    sourceEntityId: string;
    targetEntityId: string;
    name?: string;
    sourceCardinality: string;
    targetCardinality: string;
  };
  const dm = data.dataModel;
  const entities = (dm?.entities ?? []) as Entity[];
  const entityName = (id: string) => entities.find((x) => x.localId === id)?.name ?? id;
  add(
    'modelo-datos',
    'Modelo de datos',
    (dm
      ? entities
          .map(
            (ent) =>
              `<h3>${e(ent.name)}</h3>${ent.description ? `<p class="muted">${e(ent.description)}</p>` : ''}${table(
                ['Atributo', 'Tipo', 'Restricciones'],
                ent.attributes.map((a) => [
                  e(a.name),
                  e(a.type),
                  [
                    a.primaryKey && 'Clave primaria',
                    a.required && 'Obligatorio',
                    a.unique && 'Único',
                  ]
                    .filter(Boolean)
                    .join(', '),
                ]),
              )}`,
          )
          .join('') +
        `<h3>Relaciones</h3>${list(
          (dm.relationships as Relationship[]).map(
            (r) =>
              `${e(entityName(r.sourceEntityId))} (${CARDINALITY_LABELS[r.sourceCardinality] ?? e(r.sourceCardinality)}) — ${e(r.name ?? '')} — ${e(entityName(r.targetEntityId))} (${CARDINALITY_LABELS[r.targetCardinality] ?? e(r.targetCardinality)})`,
          ),
        )}`
      : '<p class="muted">Aún no hay un modelo de datos aprobado.</p>') +
      (data.erDiagram ? diagram(data.erDiagram, 'Diagrama entidad-relación') : ''),
  );

  const nav = data.navigation?.content as NavigationTreeContent | undefined;
  add(
    'navegacion',
    'Árbol de navegación',
    nav
      ? table(
          ['Pantalla', 'Vista', 'Ruta', 'Depende de'],
          nav.nodes.map((n) => [
            e(n.label),
            e(n.viewName),
            e(n.route ?? ''),
            e(nav.nodes.find((p) => p.localId === n.parentLocalId)?.label ?? ''),
          ]),
        ) + diagram(data.navigationDiagram, 'Diagrama de navegación')
      : '<p class="muted">Aún no hay una navegación aprobada.</p>',
  );

  const sa = data.softwareArchitecture?.content as SoftwareArchitectureContent | undefined;
  add(
    'arquitectura-software',
    'Arquitectura de software',
    sa
      ? field('Estilo arquitectónico', e(sa.style)) +
          table(
            ['Componente', 'Responsabilidades'],
            sa.components.map((x) => [e(x.name), e(x.responsibilities.join('; '))]),
          ) +
          (sa.decisions.length ? `<h3>Decisiones</h3>${list(sa.decisions.map(e))}` : '') +
          diagram(data.softwareArchitectureDiagram, 'Diagrama de arquitectura de software')
      : '<p class="muted">Aún no hay una arquitectura de software aprobada.</p>',
  );

  const sys = data.systemArchitecture?.content as SystemArchitectureContent | undefined;
  const sysName = (id: string) => sys?.nodes.find((n) => n.localId === id)?.name ?? id;
  add(
    'arquitectura-sistema',
    'Arquitectura de sistema',
    sys
      ? field('Límite del sistema', e(sys.boundary)) +
          table(
            ['Nodo', 'Tipo', 'Responsabilidades'],
            sys.nodes.map((n) => [e(n.name), e(n.kind), e(n.responsibilities.join('; '))]),
          ) +
          (sys.links.length
            ? `<h3>Comunicaciones</h3>${list(sys.links.map((l) => `${e(sysName(l.fromLocalId))} → ${e(sysName(l.toLocalId))}${l.protocol ? ` (${e(l.protocol)})` : ''}`))}`
            : '') +
          diagram(data.systemArchitectureDiagram, 'Diagrama de arquitectura de sistema')
      : '<p class="muted">Aún no hay una arquitectura de sistema aprobada.</p>',
  );

  const ui = data.uiBlueprint?.content as UiBlueprintContent | undefined;
  add(
    'ui-blueprint',
    'Diseño de interfaz (UI Blueprint)',
    ui
      ? ui.screens
          .map(
            (s) =>
              `<div class="card"><h3>${e(s.name)}</h3>${[
                field('Propósito', e(s.purpose)),
                field('Usuarios', e(s.targetActors.join(', '))),
                field('Secciones', e(s.sections.join(', '))),
                field('Acciones principales', e(s.primaryActions.join(', '))),
                field('Acciones secundarias', e(s.secondaryActions.join(', '))),
                field('Datos principales', e(s.principalData.join(', '))),
                field('Formularios', e(s.forms.join(', '))),
              ].join('')}</div>`,
          )
          .join('')
      : '<p class="muted">Aún no hay un UI Blueprint aprobado.</p>',
  );

  add(
    'mockups',
    'Bocetos (mockups)',
    data.mockups.length
      ? data.mockups
          .map((m) => `<figure>${m.svg}<figcaption>Boceto ${e(m.code)}</figcaption></figure>`)
          .join('')
      : '<p class="muted">Aún no hay bocetos aprobados.</p>',
  );

  add(
    'trazabilidad',
    'Trazabilidad',
    `<p>El proyecto registra ${data.traceabilitySummary.nodeCount} elementos y ${data.traceabilitySummary.edgeCount} relaciones de trazabilidad entre fuentes, contexto, requisitos, casos de uso y diseño${data.traceabilitySummary.truncated ? ' (resumen parcial)' : ''}.</p>`,
  );

  add(
    'estado',
    'Estado del proyecto',
    `<p class="${data.readiness.ready ? 'ok' : 'pending'}"><strong>${data.readiness.ready ? 'Todas las etapas están completas.' : 'Hay etapas pendientes.'}</strong></p>` +
      table(
        ['Etapa', 'Situación'],
        data.readiness.stages.map((s) => [
          `${s.satisfied ? '<span class="ok">Completa</span>' : '<span class="pending">Pendiente</span>'} — ${e(s.label)}`,
          e(s.summary),
        ]),
      ) +
      (data.readiness.blockers.length
        ? `<h3>Pendientes</h3>${list(data.readiness.blockers.map(e))}`
        : '') +
      (data.readiness.warnings.length || data.stalenessSummary.entries.length
        ? `<h3>Observaciones</h3>${list([
            ...data.readiness.warnings.map(e),
            ...data.stalenessSummary.entries
              .filter((x) => x.impactState !== 'CURRENT')
              .map((x) => `${e(x.code)}: ${e(IMPACT_LABELS[x.impactState] ?? x.impactState)}`),
          ])}`
        : ''),
  );

  const generated = new Date(data.generatedAt).toLocaleString('es-EC', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const toc = `<ol class="toc">${sections.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ol>`;
  const body = sections
    .map((s, i) => `<section id="${s.id}"><h2>${i + 1}. ${s.title}</h2>${s.body}</section>`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(data.projectName)} — Especificación del proyecto</title><style>${STYLE}</style></head><body><header><p class="muted">Especificación del proyecto</p><h1>${e(data.projectName)}</h1><p class="muted">Generado el ${e(generated)}</p></header><nav><h2>Contenido</h2>${toc}</nav>${body}</body></html>`;
}
