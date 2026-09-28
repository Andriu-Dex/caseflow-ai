import path from 'node:path';
import { expect, test } from '@playwright/test';

// E2E Scenario A — the mandatory no-AI professor-demo flow (spec: "CASEflow
// remains usable without external AI"). The whole API runs with
// AI_PROVIDER=disabled (see playwright.config.ts); no test in this file
// calls a generation/candidate endpoint. Every step goes through the real
// browser UI — no direct API calls stand in for the user journey.
test('professor can progress a project from zero to an approved Requirement without any AI provider', async ({
  page,
}) => {
  const projectName = `E2E Proyecto ${Date.now()}`;
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });

  await page.goto('/');
  await expect(page.getByText('Seleccione o cree un proyecto para continuar.')).toBeVisible();

  // --- Create the project through the UI (no fixed/hardcoded project id) ---
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await page.getByLabel('Nombre del nuevo proyecto').fill(projectName);
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Proyecto activo' })).toHaveValue(/.+/);
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  // --- Create a TEXT/NOTES Project Source ---
  await nav.getByRole('link', { name: 'Fuentes' }).click();
  await page.getByLabel('Título').fill('Notas de la entrevista');
  await page
    .getByLabel('¿Qué representa esta fuente?')
    .fill('Notas manuscritas de la entrevista con el cliente.');
  await page.getByLabel('Contenido').fill('Notas manuscritas de la entrevista con el cliente.');
  await page.getByLabel('Archivo').setInputFiles(path.join(__dirname, 'fixtures/source.txt'));
  await page.getByRole('button', { name: 'Agregar fuente' }).click();

  const sourceCard = page.locator('li').filter({ hasText: 'Notas de la entrevista' });
  await sourceCard.getByRole('button', { name: 'Ver detalle' }).click();

  // --- Provide the manual interpretation/report (no AI provider running) ---
  const manualSummaryBox = sourceCard.getByPlaceholder(
    'O escriba un resumen manual del contenido…',
  );
  await manualSummaryBox.fill(
    'El cliente necesita registrar pedidos con producto, cantidad y dirección de entrega.',
  );
  await sourceCard.getByRole('button', { name: 'Guardar reporte manual' }).click();
  await expect(sourceCard.getByText('El cliente necesita registrar pedidos')).toBeVisible();

  // --- Approve the Source (single-member workspace: one-click approval) ---
  await sourceCard.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(sourceCard.getByText('Aprobado', { exact: true })).toBeVisible();

  // --- Create the Project Context, selecting the Source through the UI ---
  await nav.getByRole('link', { name: 'Contexto del proyecto' }).click();
  await page
    .getByLabel('Planteamiento del problema')
    .fill('Los pedidos se gestionan hoy de forma manual y sin trazabilidad.');
  await page
    .getByLabel('Objetivo')
    .fill('Permitir registrar y confirmar pedidos de forma estructurada.');
  await page.getByLabel(/Notas de la entrevista/).check();
  await page.getByRole('button', { name: 'Crear Contexto' }).click();

  // --- Approve the Context ---
  await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(page.getByText('Aprobado', { exact: true })).toBeVisible();

  // --- Manually create a downstream Requirement (no AI) ---
  await nav.getByRole('link', { name: 'Requisitos' }).click();
  await page.getByRole('button', { name: 'Crear manualmente' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Registrar pedido');
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('El sistema debe permitir registrar un pedido con sus datos básicos.');
  await page.getByRole('button', { name: 'Crear requisito' }).click();

  const requirementRow = page.locator('li').filter({ hasText: 'Registrar pedido' });
  await requirementRow.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await expect(requirementRow.getByText('Aprobado', { exact: true })).toBeVisible();

  // --- Return to Home/Readiness and verify visible progression ---
  await nav.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByText(/etapas completas/)).toBeVisible();
  const main = page.getByRole('main');
  // Anchored to a leading ✓ so this can never ambiguously match the "Ir a
  // ..." next-action link or an unsatisfied "· ..." stage cell — it only
  // resolves once the stage is genuinely satisfied, which is exactly what
  // this assertion is waiting for.
  await expect(main.getByRole('link', { name: /^✓.*Fuentes del proyecto/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /^✓.*Contexto del proyecto/ })).toBeVisible();
  await expect(main.getByRole('link', { name: /^✓.*Requisitos/ })).toBeVisible();
});
