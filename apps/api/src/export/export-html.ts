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
const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  PROJECT_CONTEXT: 'Contexto del proyecto',
  REQUIREMENT: 'Requisito',
  USE_CASE: 'Caso de uso',
};
const CARDINALITY_LABELS: Record<string, string> = {
  ONE: '1',
  ZERO_OR_ONE: '0..1',
  ONE_OR_MORE: '1..*',
  ZERO_OR_MORE: '0..*',
};

const STYLE = `
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2330;background:#f6f7fb;margin:0;line-height:1.6}
main{max-width:960px;margin:0 auto;padding:0 24px 56px}
.cover{background:linear-gradient(135deg,#312e81,#4f46e5 60%,#6366f1);color:#fff;padding:56px 24px 64px}
.cover-inner{max-width:960px;margin:0 auto}.cover .eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;opacity:.8;margin:0}
.cover h1{font-size:2.4rem;line-height:1.2;margin:8px 0}.cover .meta{opacity:.85;margin:0;font-size:.95rem}
.panel{background:#fff;border:1px solid #e3e5ee;border-radius:14px;padding:20px 24px;margin:24px 0;box-shadow:0 1px 2px rgba(20,20,50,.04)}
.summary{margin-top:-40px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:12px 0 4px}
.stat{border:1px solid #e3e5ee;border-radius:10px;padding:12px 14px;background:#fafbff}.stat b{display:block;font-size:1.6rem;color:#312e81;line-height:1.2}.stat span{font-size:.82rem;color:#64677a}
.progress{height:10px;border-radius:999px;background:#e7e8f2;overflow:hidden;margin:6px 0}.progress>div{height:100%;background:linear-gradient(90deg,#4f46e5,#10b981)}
h2{font-size:1.4rem;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #e3e5ee;color:#1e1b4b}
h2 .num{display:inline-block;min-width:1.9em;color:#4f46e5}
h3{font-size:1.05rem;margin:22px 0 8px;color:#312e81}.muted{color:#64677a;font-size:.9rem}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:.9rem;border-radius:8px;overflow:hidden}th,td{border-bottom:1px solid #e3e5ee;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#eef0fa;color:#312e81;font-weight:600}tbody tr:nth-child(even){background:#fafbff}
.card{border:1px solid #e3e5ee;border-left:4px solid #4f46e5;border-radius:10px;padding:12px 16px;margin:12px 0;background:#fff}
.code{font-family:ui-monospace,Consolas,monospace;color:#4f46e5;font-size:.85rem;background:#eef0fa;border-radius:4px;padding:1px 5px}
figure{margin:14px 0;padding:14px;border:1px solid #e3e5ee;border-radius:10px;overflow-x:auto;text-align:center;background:#fff}
figure svg,figure img{max-width:100%;height:auto}figcaption{color:#64677a;font-size:.85rem;margin-top:8px}
.toc{columns:2;font-size:.95rem;padding-left:1.2em}.toc a{color:#312e81;text-decoration:none}.toc a:hover{text-decoration:underline}
.ok{color:#047857}.pending{color:#b45309}
.obs-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}.chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 12px;font-size:.82rem;font-weight:600;border:1px solid}
.chip-high{background:#fef3c7;border-color:#f59e0b;color:#92400e}.chip-mid{background:#fff7ed;border-color:#fdba74;color:#9a3412}.chip-low{background:#eef0fa;border-color:#c7cbe8;color:#312e81}.chip-info{background:#f1f5f9;border-color:#cbd5e1;color:#334155}
.obs-group{margin:18px 0}.obs-group h4{margin:0 0 4px;font-size:.98rem;display:flex;align-items:center;gap:8px}.obs-group>p{margin:0 0 8px}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}.dot-high{background:#f59e0b}.dot-mid{background:#fb923c}.dot-low{background:#818cf8}.dot-info{background:#94a3b8}
.card.sev-high{border-left-color:#f59e0b;background:#fffbeb}.card .reasons{margin:6px 0 0;padding-left:18px;color:#475569;font-size:.88rem}
.tag{display:inline-block;font-size:.72rem;font-weight:600;border-radius:4px;padding:1px 6px;background:#eef0fa;color:#4338ca;margin-left:6px}
.code-grid{display:flex;flex-wrap:wrap;gap:6px}
@page{margin:2cm}
@media print{body{background:#fff}.cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}.panel{box-shadow:none;border:none;padding:0}section.panel{page-break-before:always}figure,.card,tr{page-break-inside:avoid}figure svg,figure img{max-width:100%!important}}`;

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

export function renderExportHtml(
  data: FirstDeliverableExport,
  mockupImages = new Map<string, string>(),
): string {
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
  const quality = data.requirementQuality;
  add(
    'requisitos',
    'Requisitos',
    `<h3>Requisitos funcionales (${functional.length})</h3>${table(['Código', 'Requisito', 'Prioridad', 'Actores'], functional.map(reqRow))}` +
      `<h3>Requisitos no funcionales (${nonFunctional.length})</h3>${table(['Código', 'Requisito', 'Prioridad', 'Actores'], nonFunctional.map(reqRow))}` +
      (quality
        ? `<h3>Calidad de requisitos (${e(quality.standard)})</h3>` +
          (quality.issues.length
            ? `<p class="pending">${quality.issues.length} observación(es) sobre ${quality.totalRequirements} requisito(s).</p>` +
              table(
                ['Código', 'Observación'],
                quality.issues.map((issue) => [
                  `<span class="code">${e(issue.code)}</span>`,
                  e(issue.message),
                ]),
              )
            : `<p class="ok">Sin observaciones de calidad sobre ${quality.totalRequirements} requisito(s).</p>`)
        : ''),
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
    'Diseño de interfaz (Plano de interfaz)',
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
      : '<p class="muted">Aún no hay un plano de interfaz aprobado.</p>',
  );

  add(
    'mockups',
    'Bocetos',
    data.mockups.length
      ? data.mockups
          .map((m) =>
            m.generatorKind === 'INTERNAL_WIREFRAME'
              ? `<figure>${m.svg ?? ''}<figcaption>Boceto ${e(m.code)}</figcaption></figure>`
              : (m.screens ?? [])
                  .map((screen) => {
                    const src = mockupImages.get(screen.id);
                    const image = src
                      ? `<img src="${e(src)}" alt="${e(screen.screenName)}"/>`
                      : '<p class="muted">Imagen no disponible.</p>';
                    return `<figure>${image}<figcaption>Boceto ${e(m.code)}: ${e(screen.screenName)}</figcaption></figure>`;
                  })
                  .join(''),
          )
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
      observations(data),
  );

  const generated = new Date(data.generatedAt).toLocaleString('es-EC', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const toc = `<ol class="toc">${sections.map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`).join('')}</ol>`;
  const body = sections
    .map(
      (s, i) =>
        `<section id="${s.id}" class="panel"><h2><span class="num">${i + 1}.</span>${s.title}</h2>${s.body}</section>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(data.projectName)} — Especificación del proyecto</title><style>${STYLE}</style></head><body><header class="cover"><div class="cover-inner"><p class="eyebrow">Especificación del proyecto</p><h1>${e(data.projectName)}</h1><p class="meta">Generado el ${e(generated)}</p></div></header><main>${executiveSummary(data)}<nav class="panel"><h2>Contenido</h2>${toc}</nav>${body}</main></body></html>`;
}

// Observations grouped by severity instead of one flat list. Impact data
// comes from the staleness analysis (structured, with reasons); the IMPACT
// stage's own warnings would repeat those same artifacts, so only its
// downstream (dependency) warnings are kept, and every other stage's
// warnings are shown as general notices.
function observations(data: FirstDeliverableExport): string {
  const entries = data.stalenessSummary.entries;
  const direct = entries.filter((x) => x.impactState === 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE');
  const affected = entries.filter((x) => x.impactState === 'POTENTIALLY_AFFECTED');
  const impactWarnings = data.readiness.stages.find((s) => s.key === 'IMPACT')?.warnings ?? [];
  const affectedPrefixes = affected.map((x) => `${x.code} (v`);
  // Our own deterministic format: "<CODE> depende de …" (readiness.service impactStage).
  const downstream = impactWarnings
    .filter((w) => !affectedPrefixes.some((prefix) => w.startsWith(prefix)))
    .map((w) => w.split(' ')[0]!);
  const general = data.readiness.warnings.filter((w) => !impactWarnings.includes(w));
  if (!direct.length && !affected.length && !downstream.length && !general.length) return '';

  const reasons = (x: (typeof entries)[number]) =>
    x.reasons.length
      ? `<ul class="reasons">${x.reasons.map((r) => `<li>${e(r.message)}</li>`).join('')}</ul>`
      : '';
  const typeLabel = (type: string) => e(ARTIFACT_TYPE_LABELS[type] ?? type);
  const group = (dot: string, title: string, hint: string, body: string) =>
    `<div class="obs-group"><h4><span class="dot dot-${dot}"></span>${title}</h4><p class="muted">${hint}</p>${body}</div>`;
  const chip = (level: string, count: number, label: string) =>
    count ? `<span class="chip chip-${level}">${count} ${label}</span>` : '';

  const affectedRows = [...affected]
    .sort((a, b) => a.artifactType.localeCompare(b.artifactType) || a.code.localeCompare(b.code))
    .map((x) => [
      `<span class="code">${e(x.code)}</span><span class="tag">v${x.versionNumber}</span>`,
      typeLabel(x.artifactType),
      x.reasons.map((r) => e(r.message)).join('<br>') || '—',
    ]);

  return (
    `<h3>Observaciones</h3><div class="obs-chips">${[
      chip('high', direct.length, 'con información más reciente'),
      chip('mid', affected.length, 'potencialmente desactualizados'),
      chip('low', downstream.length, 'a revisar por dependencia'),
      chip('info', general.length, general.length === 1 ? 'aviso general' : 'avisos generales'),
    ].join('')}</div>` +
    (direct.length
      ? group(
          'high',
          'Información aprobada más reciente disponible',
          'Estos artefactos no incluyen fuentes aprobadas posteriores; actualícelos primero, porque el resto depende de ellos.',
          direct
            .map(
              (x) =>
                `<div class="card sev-high"><strong><span class="code">${e(x.code)}</span> ${typeLabel(x.artifactType)}</strong><span class="tag">v${x.versionNumber}</span>${reasons(x)}</div>`,
            )
            .join(''),
        )
      : '') +
    (affected.length
      ? group(
          'mid',
          'Artefactos potencialmente desactualizados',
          'Se derivaron de un artefacto que tiene información más reciente. Revíselos después de actualizar su origen.',
          table(['Código', 'Tipo', 'Motivo'], affectedRows),
        )
      : '') +
    (downstream.length
      ? group(
          'low',
          'Revisión recomendada por dependencia',
          'Dependen, según la trazabilidad, de alguno de los artefactos anteriores.',
          `<div class="code-grid">${downstream.map((code) => `<span class="code">${e(code)}</span>`).join('')}</div>`,
        )
      : '') +
    (general.length
      ? group(
          'info',
          'Avisos generales',
          'Otras observaciones de las etapas del proyecto.',
          list(general.map(e)),
        )
      : '')
  );
}

// Cover summary: headline counts and stage progress, so a reader gets the
// project's state before diving into the sections. Derived only from data
// already in the export — nothing new is computed or stored.
function executiveSummary(data: FirstDeliverableExport): string {
  const stages = data.readiness.stages;
  const done = stages.filter((s) => s.satisfied).length;
  const percent = stages.length ? Math.round((done / stages.length) * 100) : 0;
  const functional = data.requirements.filter(
    (r) => r.requirement.requirementType === 'FUNCTIONAL',
  ).length;
  const screens = data.mockups.reduce(
    (total, m) => total + (m.generatorKind === 'INTERNAL_WIREFRAME' ? 1 : (m.screens?.length ?? 0)),
    0,
  );
  const stats: [number, string][] = [
    [data.sources.length, 'Fuentes'],
    [functional, 'Requisitos funcionales'],
    [data.requirements.length - functional, 'Requisitos no funcionales'],
    [data.useCases.length, 'Casos de uso'],
    [
      (data.uiBlueprint?.content as UiBlueprintContent | undefined)?.screens.length ?? 0,
      'Pantallas planificadas',
    ],
    [screens, 'Bocetos'],
    [data.traceabilitySummary.edgeCount, 'Relaciones de trazabilidad'],
  ];
  const objective = data.context?.objective ? `<p>${e(data.context.objective)}</p>` : '';
  return `<section class="panel summary"><h2>Resumen ejecutivo</h2>${objective}<div class="stats">${stats
    .map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`)
    .join(
      '',
    )}</div><p class="${data.readiness.ready ? 'ok' : 'pending'}"><strong>${done} de ${stages.length} etapas completas (${percent}%)</strong>${
    data.readiness.blockers.length ? ` · ${data.readiness.blockers.length} pendiente(s)` : ''
  }</p><div class="progress" role="img" aria-label="${percent}% completo"><div style="width:${percent}%"></div></div></section>`;
}
