import type { APIRequestContext } from '@playwright/test';
import { expect, signedInApi, test } from './auth';

// E2E Scenario B — visual/provenance browser integration (spec: "verify
// browser integration for functionality not covered by Scenario A"). Setup
// (project/Source/Context/Data Model) is prepared directly via the real API
// — sanctioned by the spec for this bounded scenario — but every assertion
// below happens through the real browser. DIAGRAM_RENDERER=kroki here (see
// playwright.config.ts), so the ER diagram is the real
// DiagramEngine → local Kroki → sanitizeDiagramSvg → API → TrustedSvg
// pipeline, never a hardcoded SVG fixture.
async function setupProjectWithDiagramAndProvenance(api: APIRequestContext) {
  const workspaces = await (await api.get('/workspaces')).json();
  const workspaceId = workspaces.items[0].id as string;

  const project = await (
    await api.post('/projects', {
      data: { workspaceId, name: `E2E Visual ${Date.now()}` },
    })
  ).json();
  const projectId = project.id as string;

  const source = await (
    await api.post(`/projects/${projectId}/sources`, {
      multipart: {
        title: 'Notas de la entrevista',
        sourceKind: 'TEXT',
        purpose: 'Conocimiento del proyecto',
        description: 'El cliente necesita registrar pedidos.',
        file: {
          name: 'source.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('El cliente necesita registrar pedidos.'),
        },
      },
    })
  ).json();
  await api.post(
    `/projects/${projectId}/sources/${source.id}/versions/${source.version.id}/transition`,
    { data: { status: 'IN_REVIEW' } },
  );
  await api.post(
    `/projects/${projectId}/sources/${source.id}/versions/${source.version.id}/transition`,
    { data: { status: 'APPROVED' } },
  );

  const context = await (
    await api.post(`/projects/${projectId}/context`, {
      data: {
        problemStatement: 'Los pedidos se gestionan de forma manual.',
        objective: 'Registrar pedidos de forma estructurada.',
        scopeItems: [],
        actors: [{ name: 'Cliente' }],
        needs: [],
        constraints: [],
        businessRules: [],
        sourceVersionIds: [source.version.id],
      },
    })
  ).json();
  await api.post(`/projects/${projectId}/context/versions/${context.version.id}/transition`, {
    data: { status: 'IN_REVIEW' },
  });
  await api.post(`/projects/${projectId}/context/versions/${context.version.id}/transition`, {
    data: { status: 'APPROVED' },
  });

  const dataModel = await (
    await api.post(`/projects/${projectId}/data-models`, {
      data: {
        title: 'Modelo de Pedidos',
        modelKind: 'ER',
        entities: [
          {
            localId: 'e1',
            name: 'Pedido',
            attributes: [
              { name: 'id', type: 'UUID', required: true, primaryKey: true, unique: true },
            ],
          },
        ],
        relationships: [],
      },
    })
  ).json();
  await api.post(
    `/projects/${projectId}/data-models/${dataModel.id}/versions/${dataModel.version.id}/transition`,
    { data: { status: 'IN_REVIEW' } },
  );
  await api.post(
    `/projects/${projectId}/data-models/${dataModel.id}/versions/${dataModel.version.id}/transition`,
    { data: { status: 'APPROVED' } },
  );

  return {
    projectId,
    projectName: project.name as string,
    dataModelCode: dataModel.code as string,
  };
}

test('displays a real Kroki-rendered ER diagram, provenance, readiness and export in the browser', async ({
  page,
}) => {
  const api = await signedInApi();
  const { projectId, projectName, dataModelCode } = await setupProjectWithDiagramAndProvenance(api);
  await api.dispose();

  await page.goto('/');
  await page.getByRole('combobox', { name: 'Proyecto activo' }).click();
  await page.getByRole('option', { name: projectName }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  // --- A. Real visual output: an actual backend-rendered, sanitized SVG ---
  // Navigates directly (not via the sidebar) because this scenario's setup
  // deliberately seeds Source/Context/Data Model through the API only,
  // skipping Requirements/Use Cases — the sidebar's sequential stepper
  // would otherwise treat Data Model as not yet reachable. Scenario A
  // already covers real sequential sidebar navigation end to end.
  await page.goto('/data-model');
  const modelRow = page.locator('li').filter({ hasText: dataModelCode });
  await modelRow.getByRole('button', { name: 'Ver diagrama entidad-relación' }).click();
  // Scoped to the TrustedDiagram <figure>, not the row, so this never matches
  // an unrelated icon svg (e.g. the StatusBadge's Lucide icon) rendered
  // elsewhere in the same row.
  const diagramSvg = modelRow.locator('figure svg');
  await expect(diagramSvg).toBeVisible();
  // A real Kroki-rendered ER diagram contains the entity name inside the SVG
  // markup itself, not just elsewhere on the page — proving Kroki actually
  // rendered this specific structured content, not a placeholder shape.
  await expect(diagramSvg.getByText('Pedido')).toBeVisible();

  // --- B. Traceability: a known ArtifactVersion shows real upstream provenance ---
  // Same reasoning as above: direct navigation, not a sidebar click.
  await page.goto('/traceability');
  await page.getByRole('button', { name: /CTX-001/ }).click();
  await expect(page.getByRole('heading', { name: 'Aguas arriba' })).toBeVisible();
  // The approved source this context was built from is listed upstream (the
  // list on the left shows it too, but only the upstream entry offers its lineage).
  await expect(page.getByRole('button', { name: /SRC-001 v1.*Ver linaje/ })).toBeVisible();

  // --- C. Readiness: real backend stage results are rendered ---
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Preparación / Exportar' })
    .click();
  await expect(page.getByText('Fuentes del proyecto')).toBeVisible();
  await expect(page.getByText('En progreso', { exact: true })).toBeVisible();

  // --- D. Export: JSON and HTML downloads succeed with a reasonable name ---
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Datos estructurados (JSON)' }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toBe(`proyecto-${projectId}.json`);

  // The HTML document opens in a preview first; it can be downloaded from there.
  await page.getByRole('button', { name: 'Documento del proyecto (HTML)' }).click();
  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Descargar HTML/ }).click(),
  ]);
  expect(htmlDownload.suggestedFilename()).toBe(`proyecto-${projectId}.html`);
});
