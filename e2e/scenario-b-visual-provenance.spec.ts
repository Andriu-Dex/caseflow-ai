import { expect, request, test, type APIRequestContext } from '@playwright/test';

// E2E Scenario B — visual/provenance browser integration (spec: "verify
// browser integration for functionality not covered by Scenario A"). Setup
// (project/Source/Context/Data Model) is prepared directly via the real API
// — sanctioned by the spec for this bounded scenario — but every assertion
// below happens through the real browser. DIAGRAM_RENDERER=kroki here (see
// playwright.config.ts), so the ER diagram is the real
// DiagramEngine → local Kroki → sanitizeDiagramSvg → API → TrustedSvg
// pipeline, never a hardcoded SVG fixture.
const API_BASE_URL = 'http://localhost:3001';

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
        sourceKind: 'NOTES',
        purpose: 'Conocimiento del proyecto',
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
  const api = await request.newContext({ baseURL: API_BASE_URL });
  const { projectId, projectName, dataModelCode } = await setupProjectWithDiagramAndProvenance(api);
  await api.dispose();

  await page.goto('/');
  await page
    .getByRole('combobox', { name: 'Proyecto activo' })
    .selectOption({ label: projectName });
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  // --- A. Real visual output: an actual backend-rendered, sanitized SVG ---
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Modelo de datos' })
    .click();
  const modelRow = page.locator('li').filter({ hasText: dataModelCode });
  await modelRow.getByRole('button', { name: 'Ver diagrama ER' }).click();
  const diagramSvg = modelRow.locator('svg');
  await expect(diagramSvg).toBeVisible();
  // A real Kroki-rendered ER diagram contains the entity name inside the SVG
  // markup itself, not just elsewhere on the page — proving Kroki actually
  // rendered this specific structured content, not a placeholder shape.
  await expect(diagramSvg.getByText('Pedido')).toBeVisible();

  // --- B. Traceability: a known ArtifactVersion shows real upstream provenance ---
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Trazabilidad' })
    .click();
  await page.getByRole('button', { name: /CTX-001/ }).click();
  const upstreamSection = page.getByText('Aguas arriba').locator('..');
  await expect(upstreamSection).toBeVisible();
  await expect(upstreamSection.getByText(/SRC-001/)).toBeVisible();

  // --- C. Readiness: real backend stage results are rendered ---
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Preparación / Exportar' })
    .click();
  await expect(page.getByText('Fuentes del proyecto')).toBeVisible();
  await expect(page.getByText(/no listo todavía/i)).toBeVisible();

  // --- D. Export: JSON and HTML downloads succeed with a reasonable name ---
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar JSON' }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toBe(`first-deliverable-${projectId}.json`);

  const [htmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar reporte HTML' }).click(),
  ]);
  expect(htmlDownload.suggestedFilename()).toBe(`first-deliverable-${projectId}.html`);
});
