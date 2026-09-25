import type { FirstDeliverableExport } from '@caseflow-ai/contracts';

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

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function list(items: string[]): string {
  return items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '<p>(vacío)</p>';
}

function diagramBlock(diagram: { code: string; svg: string } | null, label: string): string {
  if (!diagram) return `<p>No hay ${escapeHtml(label)} disponible.</p>`;
  return `<figure>${diagram.svg}<figcaption>${escapeHtml(diagram.code)}</figcaption></figure>`;
}

export function renderExportHtml(data: FirstDeliverableExport): string {
  const body = [
    section(
      '1. Proyecto',
      `<p>${escapeHtml(data.projectName)}</p><p>Generado: ${escapeHtml(data.generatedAt)}</p>`,
    ),
    section(
      '2. Fuentes del proyecto',
      list(
        data.sources.map(
          (s) =>
            `${escapeHtml(s.code)} — ${escapeHtml(s.source.title)} (${escapeHtml(s.version.status)})`,
        ),
      ),
    ),
    section(
      '3. Contexto del proyecto',
      data.context
        ? `<p>${escapeHtml(data.context.code)}: ${escapeHtml(data.context.problemStatement)}</p><p>${escapeHtml(data.context.objective)}</p>`
        : '<p>No hay Contexto del Proyecto aprobado.</p>',
    ),
    section(
      '4. Requisitos',
      list(
        data.requirements.map(
          (r) =>
            `${escapeHtml(r.code)} v${r.version.versionNumber} — ${escapeHtml(r.requirement.description)}`,
        ),
      ),
    ),
    section(
      '5. Casos de uso',
      list(data.useCases.map((u) => `${escapeHtml(u.code)} — ${escapeHtml(u.useCase.name)}`)),
    ),
    section('6. Diagrama de casos de uso', diagramBlock(data.useCaseDiagram, 'diagrama')),
    section(
      '7. Modelo de datos / Diagrama ER',
      (data.dataModel
        ? list(data.dataModel.entities.map((e) => escapeHtml((e as { name: string }).name)))
        : '<p>No hay Modelo de Datos aprobado.</p>') + diagramBlock(data.erDiagram, 'diagrama ER'),
    ),
    section('8. Navegación', diagramBlock(data.navigationDiagram, 'diagrama de navegación')),
    section(
      '9. Arquitectura de software',
      diagramBlock(data.softwareArchitectureDiagram, 'diagrama de arquitectura de software'),
    ),
    section(
      '10. Arquitectura de sistema',
      diagramBlock(data.systemArchitectureDiagram, 'diagrama de arquitectura de sistema'),
    ),
    section(
      '11. UI Blueprint',
      data.uiBlueprint
        ? `<p>${escapeHtml(data.uiBlueprint.code)}</p>`
        : '<p>No hay UI Blueprint aprobado.</p>',
    ),
    section(
      '12. Mockups',
      data.mockups.length
        ? data.mockups
            .map((m) => `<figure>${m.svg}<figcaption>${escapeHtml(m.code)}</figcaption></figure>`)
            .join('')
        : '<p>No hay Mockups aprobados.</p>',
    ),
    section(
      '13. Trazabilidad y procedencia',
      `<p>Nodos: ${data.traceabilitySummary.nodeCount}, relaciones: ${data.traceabilitySummary.edgeCount}${data.traceabilitySummary.truncated ? ' (truncado)' : ''}.</p>`,
    ),
    section(
      '14. Preparación (Readiness)',
      `<p>${data.readiness.ready ? 'Listo' : 'No listo'}.</p>${list(data.readiness.blockers.map(escapeHtml))}`,
    ),
    section(
      '15. Advertencias / Impacto potencial',
      list([
        ...data.readiness.warnings.map(escapeHtml),
        ...data.stalenessSummary.entries.map(
          (e) => `${escapeHtml(e.code)}: ${escapeHtml(e.impactState)}`,
        ),
      ]),
    ),
  ].join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(data.projectName)} — First Deliverable</title></head><body>${body}</body></html>`;
}
