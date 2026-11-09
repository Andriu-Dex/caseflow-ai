import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const fetch = globalThis.fetch;
if (process.env.CASEFLOW_EVALUATION_DISPOSABLE !== '1')
  throw new Error('Run this evaluation only inside a disposable generated-project Docker sandbox.');
(async () => {
  const { PrismaService } = await import('/app/apps/api/dist/prisma/prisma.service.js');
  const { UserService } =
    await import('/app/apps/api/dist/users-and-authorizations/user.service.js');

  const p = new PrismaService(),
    checks = [];
  const ok = (value, label, detail) => {
    assert.ok(
      value,
      label +
        (detail
          ? ' ' +
            JSON.stringify(detail, (key, item) =>
              key === 'base64' ? '[file content omitted]' : item,
            )
          : ''),
    );
    checks.push(label);
    console.log('CHECK', label);
  };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }),
    date = new Date(today + 'T00:00:00Z');
  const period = '?from=' + today + '&to=' + today;
  let branchA,
    branchB,
    admin,
    manager,
    cashier,
    operator,
    inventory,
    foreign,
    product,
    expenseCategory;
  const api = async (url, method = 'GET', body, user = admin, scope = branchA?.id) => {
    const r = await fetch('http://127.0.0.1:3001' + url, {
      method,
      headers: {
        ...(user?.token ? { Authorization: 'Bearer ' + user.token } : {}),
        ...(scope ? { 'x-operation-scope': scope } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try {
      data = await r.json();
    } catch {
      data = {};
    }
    return { status: r.status, data };
  };
  const actor = async (role, branches = [branchA.id]) => {
    const loginIdentifier = randomUUID(),
      user = await new UserService(p).create({
        individualIdentification: loginIdentifier,
        loginIdentifier,
        password: 'temporary-test-password',
        status: 'ACTIVE',
        roleNames: [role],
        branchIds: branches,
        branch2Ids: [],
      });
    const r = await api(
      '/auth/login',
      'POST',
      { identifier: loginIdentifier, password: 'temporary-test-password' },
      null,
      null,
    );
    assert.equal(r.status, 200);
    return { id: user.id, token: r.data.token };
  };
  const sale = async ({
    scope = branchA.id,
    status = 'CONFIRMADA',
    amount = '0.01',
    classification = 'SIMPLE',
    quantity = '0.10',
    price = '0.05',
  } = {}) => {
    const s = await p.sale.create({
      data: {
        branchId: scope,
        userId: admin.id,
        saleDate: new Date(),
        operationalDate: date,
        channel: 'MOSTRADOR',
        status,
        subtotal: amount,
        totalDiscount: '0',
        total: amount,
        revision: 1,
      },
    });
    const line = await p.saleLine.create({
      data: {
        saleId: s.id,
        productId: product.id,
        quantity,
        historicalUnitPrice: price,
        appliedDiscount: '0',
        subtotal: amount,
        historicalClassification: classification,
      },
    });
    return { ...s, line };
  };
  const expense = async ({
    scope = branchA.id,
    status = 'CONFIRMADO',
    amount = '2.00',
    concept = '=HYPERLINK("invalid")',
    currency = 'USD',
  } = {}) =>
    p.expense.create({
      data: {
        branchId: scope,
        userId: admin.id,
        date,
        concept,
        amount,
        currency,
        status,
        confirmedAt: status === 'CONFIRMADO' ? new Date() : null,
        expenseCategoryId: expenseCategory.id,
      },
    });
  const stockState = async () =>
    JSON.stringify({
      stock: await p.branchProductStock.findMany({ orderBy: { id: 'asc' } }),
      movements: await p.inventoryMovement.findMany({ orderBy: { id: 'asc' } }),
    });
  const request = async (scope = branchA.id) =>
    p.cateringRequest.create({
      data: {
        branchId: scope,
        cateringClientId: client.id,
        contact: 'Local contact',
        scheduledAt: new Date(today + 'T18:00:00Z'),
        location: 'Venue',
        expectedAttendees: 10,
        serviceScope: 'Servicio de prueba',
      },
    });
  const transition = async (
    record,
    type,
    operation,
    user = operator,
    key = randomUUID(),
    extra = {},
  ) =>
    api(
      '/catering/records/' + record.id + '/transition',
      'POST',
      {
        recordType: type,
        operation,
        expectedRevision: record.revision,
        reason: 'Prueba trazable',
        notes: '',
        idempotencyKey: key,
        ...extra,
      },
      user,
    );
  let client;
  try {
    const newBranch = (name) =>
      p.branch.create({
        data: {
          identification: randomUUID(),
          name,
          address: 'Test',
          timeZone: 'America/Guayaquil',
          status: 'ACTIVE',
        },
      });
    branchA = await newBranch('Remaining A');
    branchB = await newBranch('Remaining B');
    admin = await actor('Administrador', [branchA.id, branchB.id]);
    manager = await actor('Encargado de sucursal');
    cashier = await actor('Cajero');
    operator = await actor('Responsable de catering');
    inventory = await actor('Responsable de inventario');
    foreign = await actor('Encargado de sucursal', [branchB.id]);
    product = await p.product.create({
      data: {
        name: 'Fixture product',
        salesUnit: 'unit',
        referencePrice: '0.05',
        status: 'ACTIVO',
        classification: 'SIMPLE',
      },
    });
    expenseCategory = await p.expenseCategory.create({
      data: { name: 'Operational', scope: 'GLOBAL', branchId: null },
    });
    const a = await sale();
    await sale({ status: 'BORRADOR', amount: '10.00', quantity: '1', price: '10' });
    await sale({ status: 'ANULADA', amount: '20.00', quantity: '1', price: '20' });
    await sale({ scope: branchB.id, amount: '9.00', quantity: '1', price: '9' });
    const e = await expense();
    await expense({ status: 'BORRADOR', amount: '500' });
    await expense({ scope: branchB.id, amount: '7' });
    const st = await p.branchProductStock.create({
      data: {
        branchId: branchA.id,
        productId: product.id,
        balance: '0.50',
        stockUnit: 'unit',
        configuredMinimum: '0.50',
        revision: 1,
      },
    });
    const zeroProduct = await p.product.create({
      data: {
        name: 'Zero minimum',
        salesUnit: 'unit',
        referencePrice: '1',
        status: 'ACTIVO',
        classification: 'SIMPLE',
      },
    });
    const zero = await p.branchProductStock.create({
      data: {
        branchId: branchA.id,
        productId: zeroProduct.id,
        balance: '0',
        stockUnit: 'unit',
        configuredMinimum: '0',
        revision: 1,
      },
    });
    const noMinimumProduct = await p.product.create({
      data: {
        name: 'Unconfigured',
        salesUnit: 'kg',
        referencePrice: '1',
        status: 'ACTIVO',
        classification: 'SIMPLE',
      },
    });
    const missing = await p.branchProductStock.create({
      data: {
        branchId: branchA.id,
        productId: noMinimumProduct.id,
        balance: '1',
        stockUnit: 'kg',
        configuredMinimum: null,
        revision: 1,
      },
    });
    const movement = await p.inventoryMovement.create({
      data: {
        branchProductStockId: st.id,
        userId: admin.id,
        type: 'ENTRADA',
        occurredAt: new Date(),
        quantity: '0.50',
        unit: 'unit',
        stockUnitChange: '0.50',
        previousBalance: '0',
        resultingBalance: '0.50',
        operationalDate: date,
        origin: 'Fixture',
      },
    });
    let inventoryBefore = await stockState();
    let r = await api('/reports/sales' + period);
    ok(
      r.status === 200 &&
        r.data.total === '0.01' &&
        r.data.recordCount === 1 &&
        r.data.rows.length === 1 &&
        r.data.rows[0].sourceId === a.line.id,
      'Sales report reconciles confirmed origin and excludes drafts/cancellations',
      r,
    );
    const originalReport = r.data;
    const csv = Buffer.from(r.data.file.base64, 'base64');
    ok(
      csv.toString('utf8').includes(branchA.id) && csv.toString('utf8').includes(today),
      'Sales CSV includes exact selected scope and period',
    );
    await p.product.update({ where: { id: product.id }, data: { referencePrice: '99.99' } });
    r = await api('/reports/sales' + period);
    ok(
      r.status === 200 && r.data.total === '0.01' && r.data.recordCount === 1,
      'Repeating sales report does not inflate totals or use current prices',
      r,
    );
    await p.sale.update({ where: { id: a.id }, data: { status: 'ANULADA', revision: 2 } });
    const replacement = await sale({ amount: '0.02', quantity: '0.30' });
    r = await api('/reports/sales' + period);
    ok(
      r.status === 200 &&
        r.data.total === '0.02' &&
        r.data.recordCount === 1 &&
        r.data.rows[0].parentId === replacement.id,
      'Rectified sale contributes once while original remains excluded',
      r,
    );
    r = await api('/reports/' + originalReport.reportId + '/export/csv');
    ok(
      r.status === 200 && r.data.file.base64 === originalReport.file.base64,
      'CSV export preserves previously consulted bytes after data changes',
      r,
    );
    r = await api('/reports/' + originalReport.reportId + '/export/csv?from=2020-01-01');
    ok(r.status === 400, 'Export rejects manipulated alternative filters', r);
    r = await api(
      '/reports/' + originalReport.reportId + '/export/csv',
      'GET',
      undefined,
      admin,
      branchB.id,
    );
    ok(r.status === 404, 'Export cannot switch selected scope', r);
    r = await api('/reports/' + originalReport.reportId + '/export/csv', 'GET', undefined, manager);
    ok(r.status === 404, 'Another account cannot export private consulted result', r);
    r = await api('/reports/' + randomUUID() + '/export/csv');
    ok(r.status === 404, 'Unknown report export rejected', r);
    await new UserService(p).update(admin.id, { roleNames: ['Responsable de inventario'] });
    r = await api('/reports/' + originalReport.reportId + '/export/csv');
    ok(
      r.status === 403,
      'Export revalidates current permission after owner loses financial role',
      r,
    );
    await new UserService(p).update(admin.id, { roleNames: ['Administrador'] });
    r = await api('/auth/options', 'GET', undefined, inventory);
    ok(
      r.status === 200 && r.data.some((route) => route.path === '/reports/inventory'),
      'Inventory report is available in authorized navigation',
      r,
    );
    r = await api('/auth/options', 'GET', undefined, operator);
    ok(
      r.status === 200 && r.data.some((route) => route.path === '/reports/catering/costs'),
      'Catering cost report is available to its operational role',
      r,
    );
    const meal = await sale({ classification: 'ALMUERZO', quantity: '2', price: '4', amount: '8' });
    await p.proteinExtraSelection.create({
      data: {
        saleLineId: meal.line.id,
        productId: product.id,
        selectionType: 'PROTEINA',
        quantity: '1.25',
      },
    });
    await p.proteinExtraSelection.create({
      data: {
        saleLineId: meal.line.id,
        productId: product.id,
        selectionType: 'EXTRA',
        quantity: '0.50',
      },
    });
    r = await api('/reports/sales' + period);
    ok(
      r.status === 200 &&
        r.data.total === '8.02' &&
        r.data.quantities.some((q) => q.category === 'ALMUERZO' && q.quantity === '2.00') &&
        r.data.quantities.some((q) => q.category === 'PROTEINA' && q.quantity === '1.25') &&
        r.data.quantities.some((q) => q.category === 'EXTRA' && q.quantity === '0.50'),
      'Sales quantities remain structured and selections are not multiplied by lunch quantity',
      r,
    );
    await p.sale.update({ where: { id: meal.id }, data: { status: 'ANULADA' } });
    r = await api('/reports/expenses' + period);
    ok(
      r.status === 200 &&
        r.data.total === '2.00' &&
        r.data.recordCount === 1 &&
        r.data.rows[0].sourceId === e.id &&
        r.data.groups[0].amount === '2.00',
      'Expense report reconciles confirmed rows and categories',
      r,
    );
    ok(
      Buffer.from(r.data.file.base64, 'base64').toString('utf8').includes("'=HYPERLINK"),
      'CSV neutralizes spreadsheet formulas in untrusted concepts',
    );
    await p.expense.update({ where: { id: e.id }, data: { currency: 'EUR' } });
    r = await api('/reports/expenses' + period);
    ok(r.status === 409, 'Expense report rejects mixed or unsupported currency', r);
    await p.expense.update({ where: { id: e.id }, data: { currency: 'USD' } });
    r = await api('/reports/inventory' + period, 'GET', undefined, inventory);
    ok(
      r.status === 200 &&
        r.data.total === null &&
        r.data.rows.some(
          (row) => row.sourceId === st.id && row.state === 'LOW' && row.minimum === '0.50',
        ) &&
        r.data.rows.some((row) => row.sourceId === movement.id && row.actorId === admin.id),
      'Inventory report distinguishes current balance and dated movement sources',
      r,
    );
    ok(
      r.data.rows.some(
        (row) => row.sourceId === missing.id && row.state === 'NO_MINIMUM' && row.minimum === null,
      ),
      'Inventory report preserves missing minimum instead of assuming zero',
    );
    r = await api('/reports/' + r.data.reportId + '/export/csv', 'GET', undefined, inventory);
    ok(
      r.status === 200 && r.data.file.mimeType === 'text/csv',
      'Inventory operator can export own authorized inventory result',
      r,
    );
    r = await api('/management/stock-alerts', 'GET', undefined, inventory);
    ok(
      r.status === 200 &&
        r.data.configuredCount === 2 &&
        r.data.alerts.length === 2 &&
        r.data.alerts.some((alert) => alert.stockId === zero.id) &&
        !r.data.alerts.some((alert) => alert.stockId === missing.id),
      'Alerts include exact equality and configured zero but exclude absent minimum',
      r,
    );
    ok(
      (await stockState()) === inventoryBefore,
      'Reports and initial alerts preserve all inventory columns',
    );
    await p.branchProductStock.update({ where: { id: st.id }, data: { balance: '0.51' } });
    r = await api('/management/stock-alerts');
    ok(
      r.status === 200 && !r.data.alerts.some((alert) => alert.stockId === st.id),
      'Alert becomes inactive after balance exceeds threshold',
      r,
    );
    await p.branchProductStock.update({ where: { id: st.id }, data: { balance: '0.50' } });
    inventoryBefore = await stockState();
    r = await api('/management/indicators' + period);
    ok(
      r.status === 200 &&
        r.data.metrics.find((m) => m.name === 'SALES_TOTAL').value === '0.02' &&
        r.data.metrics.find((m) => m.name === 'EXPENSES_TOTAL').value === '2.00' &&
        r.data.metrics.find((m) => m.name === 'PARTIAL_BALANCE').value === '-1.98' &&
        r.data.metrics.find((m) => m.name === 'AVERAGE_SALE').value === '0.02',
      'Indicators use exact confirmed values, correct average and partial balance',
      r,
    );
    ok(
      r.data.metrics.every((m) => m.definition && Array.isArray(m.sourceIds)),
      'Every indicator exposes definition and source identifiers',
    );
    r = await api('/management/recommendations' + period);
    ok(
      r.status === 200 &&
        r.data.advisory === true &&
        ['RESTOCK', 'REVIEW_PARTIAL_BALANCE', 'CONFIGURE_MINIMUM'].every((code) =>
          r.data.recommendations.some(
            (item) => item.code === code && item.rule && item.sourceIds.length,
          ),
        ),
      'Recommendations apply approved rules with evidence and no causal claim',
      r,
    );
    r = await api('/management/indicators?from=2020-01-01&to=2020-01-01');
    ok(
      r.status === 200 &&
        r.data.metrics.find((m) => m.name === 'SALES_TOTAL').value === '0.00' &&
        r.data.metrics.find((m) => m.name === 'AVERAGE_SALE').value === null &&
        r.data.metrics.find((m) => m.name === 'AVERAGE_SALE').state === 'NOT_APPLICABLE',
      'Empty activity preserves measured zero and non-applicable division',
      r,
    );
    r = await api('/management/recommendations?from=2020-01-01&to=2020-01-01');
    ok(
      r.status === 200 &&
        r.data.recommendations.some(
          (item) => item.code === 'NO_ACTIVITY' && item.observed === null,
        ),
      'No-activity recommendation preserves absent evidence',
      r,
    );
    for (const url of [
      '/reports/sales',
      '/reports/expenses',
      '/reports/inventory',
      '/management/indicators',
      '/management/recommendations',
    ]) {
      r = await api(url + '?from=2026-02-02&to=2026-01-01');
      ok(r.status === 400, 'Reverse period rejected ' + url, r);
      r = await api(url + '?from=2020-01-01&to=2026-01-01');
      ok(r.status === 400, 'Unbounded period rejected ' + url, r);
      r = await api(url + period, 'GET', undefined, cashier);
      ok(r.status === 403, 'Cashier report access denied ' + url, r);
      r = await api(url + period, 'GET', undefined, foreign);
      ok(r.status === 403, 'Foreign operator cannot select another scope ' + url, r);
    }
    r = await api('/reports/sales' + period, 'GET', undefined, admin, null);
    ok(r.status === 403, 'Report requires verified selected scope', r);
    r = await api('/reports/branch-comparison' + period + '&otherBranchId=' + branchB.id);
    ok(
      r.status === 200 &&
        r.data.branches.length === 2 &&
        r.data.branches.find((b) => b.branchId === branchA.id).salesTotal === '0.02' &&
        r.data.branches.find((b) => b.branchId === branchB.id).salesTotal === '9.00' &&
        r.data.stocks.every((s) => s.branchId === branchA.id),
      'Branch comparison preserves independent scope totals and stock units',
      r,
    );
    r = await api(
      '/reports/branch-comparison' + period + '&otherBranchId=' + branchB.id,
      'GET',
      undefined,
      manager,
    );
    ok(r.status === 403, 'Non-global role cannot compare branches', r);
    r = await api('/reports/branch-comparison' + period + '&otherBranchId=' + branchA.id);
    ok(r.status === 403, 'Comparison requires distinct branches', r);
    r = await api('/reports/branch-comparison' + period + '&otherBranchId=' + randomUUID());
    ok(r.status === 403, 'Comparison rejects forged branch', r);
    ok(
      (await stockState()) === inventoryBefore,
      'Reports, indicators and recommendations do not alter inventory',
    );
    client = await p.cateringClient.create({
      data: { identification: 'Fixture client', contactDetails: 'Minimal contact' },
    });
    let req = await request();
    ok(
      req.status === 'RECEIVED' && req.revision === 1,
      'Request receives server-owned initial state and revision',
    );
    r = await api('/catering-requests/' + req.id, 'PATCH', { status: 'CONFIRMED' }, operator);
    ok(
      r.status === 400 &&
        (await p.cateringRequest.findUnique({ where: { id: req.id } })).status === 'RECEIVED',
      'Generic CRUD cannot bypass request transition state',
      r,
    );
    r = await api('/catering-requests/' + req.id, 'PATCH', { revision: 99 }, operator);
    ok(r.status === 400, 'Generic CRUD cannot forge lifecycle revision', r);
    r = await transition(req, 'REQUEST', 'CONFIRM');
    ok(
      r.status === 409 &&
        (await p.acceptedCateringTransition.count({ where: { cateringRequestId: req.id } })) === 0,
      'Confirmation without approved terms has no transition effect',
      r,
    );
    await p.cateringTermsVersion.create({
      data: {
        cateringRequestId: req.id,
        userId: admin.id,
        versionNumber: 1,
        content: 'Condiciones aceptadas para prueba',
        date: new Date(),
      },
    });
    const key = randomUUID();
    let both = await Promise.all([
      transition(req, 'REQUEST', 'CONFIRM', operator, key),
      transition(req, 'REQUEST', 'CONFIRM', operator, key),
    ]);
    ok(
      both.every((x) => x.status === 200) &&
        JSON.stringify(both[0].data) === JSON.stringify(both[1].data) &&
        (await p.acceptedCateringTransition.count({ where: { cateringRequestId: req.id } })) === 1,
      'Concurrent request confirmation is idempotent and records one history row',
      both,
    );
    req = await p.cateringRequest.findUniqueOrThrow({ where: { id: req.id } });
    r = await transition({ ...req, revision: 1 }, 'REQUEST', 'CONFIRM', operator, key);
    ok(r.status === 200, 'Request transition retry recovers original response', r);
    r = await transition({ ...req, revision: 1 }, 'REQUEST', 'CONFIRM', operator, key, {
      reason: 'Changed',
    });
    ok(r.status === 409, 'Transition key rejects changed payload', r);
    let event = await p.cateringEvent.create({
      data: { cateringRequestId: req.id, referenceDate: new Date() },
    });
    ok(
      event.status === 'PLANNED' && event.revision === 1,
      'Event receives server-owned initial state and revision',
    );
    r = await api('/catering-events/' + event.id, 'PATCH', { status: 'COMPLETED' }, operator);
    ok(r.status === 400, 'Generic CRUD cannot directly complete an event', r);
    r = await transition(event, 'EVENT', 'COMPLETE');
    ok(r.status === 409, 'Invalid direct event completion rejected', r);
    r = await transition(event, 'EVENT', 'CONFIRM');
    ok(
      r.status === 200 && r.data.newStatus === 'CONFIRMED',
      'Event confirms only after valid confirmed request and terms',
      r,
    );
    event = await p.cateringEvent.findUniqueOrThrow({ where: { id: event.id } });
    r = await transition(event, 'EVENT', 'START_PREPARATION');
    ok(r.status === 409, 'Preparation requires consistent plan', r);
    await p.cateringPlan.create({ data: { cateringRequestId: req.id, cateringEventId: event.id } });
    r = await transition(event, 'EVENT', 'START_PREPARATION');
    ok(
      r.status === 200 && r.data.newStatus === 'PREPARING',
      'Preparation accepts a consistent event plan',
      r,
    );
    event = await p.cateringEvent.findUniqueOrThrow({ where: { id: event.id } });
    await p.cateringRequest.update({ where: { id: req.id }, data: { status: 'RECEIVED' } });
    r = await transition(event, 'EVENT', 'COMPLETE');
    ok(r.status === 409, 'Event progress requires a still-confirmed parent request', r);
    await p.cateringRequest.update({ where: { id: req.id }, data: { status: 'CONFIRMED' } });
    r = await transition(event, 'EVENT', 'COMPLETE');
    ok(r.status === 200 && r.data.newStatus === 'COMPLETED', 'Prepared event can be completed', r);
    event = await p.cateringEvent.findUniqueOrThrow({ where: { id: event.id } });
    r = await transition(event, 'EVENT', 'CLOSE');
    ok(r.status === 200 && r.data.newStatus === 'CLOSED', 'Completed event can be closed', r);
    r = await transition(req, 'REQUEST', 'CLOSE');
    ok(
      r.status === 200 && r.data.newStatus === 'CLOSED',
      'Request closes after all related events close',
      r,
    );
    req = await p.cateringRequest.findUniqueOrThrow({ where: { id: req.id } });
    r = await transition(req, 'REQUEST', 'REOPEN', operator, randomUUID(), { notes: 'Reason' });
    ok(r.status === 403, 'Reopening requires administrator', r);
    r = await transition(req, 'REQUEST', 'REOPEN', admin);
    ok(r.status === 403, 'Reopening requires explanatory notes', r);
    r = await transition(req, 'REQUEST', 'REOPEN', admin, randomUUID(), {
      notes: 'Revisión autorizada',
    });
    ok(
      r.status === 200 && r.data.newStatus === 'RECEIVED',
      'Administrator reopens with retained history',
      r,
    );
    let canceled = await p.cateringEvent.create({
      data: { cateringRequestId: req.id, referenceDate: new Date() },
    });
    r = await transition(canceled, 'EVENT', 'CANCEL');
    ok(r.status === 200, 'Planned event can be canceled', r);
    canceled = await p.cateringEvent.findUniqueOrThrow({ where: { id: canceled.id } });
    r = await transition(canceled, 'EVENT', 'COMPLETE');
    ok(r.status === 409, 'Canceled event cannot be marked completed without reopening', r);
    r = await transition(canceled, 'EVENT', 'REOPEN', admin, randomUUID(), {
      notes: 'Reapertura justificada',
    });
    ok(
      r.status === 200 && r.data.newStatus === 'PLANNED',
      'Authorized event reopening starts from planned state',
      r,
    );
    const activeParent = await p.cateringRequest.findUniqueOrThrow({ where: { id: req.id } });
    r = await transition(activeParent, 'REQUEST', 'CANCEL');
    ok(
      r.status === 409 &&
        (await p.cateringRequest.findUniqueOrThrow({ where: { id: req.id } })).status ===
          'RECEIVED',
      'Request cannot be canceled while related events remain active',
      r,
    );
    r = await transition(req, 'REQUEST', 'CANCEL', cashier);
    ok(r.status === 403, 'Cashier cannot transition catering records', r);
    const foreignRequest = await request(branchB.id);
    r = await transition(foreignRequest, 'REQUEST', 'CANCEL', operator);
    ok([403, 404].includes(r.status), 'Catering transition cannot cross branch scope', r);
    r = await api('/catering/history' + period, 'GET', undefined, operator);
    ok(
      r.status === 200 &&
        r.data.transitions.length >= 7 &&
        r.data.transitions.every((t) => t.actorId && t.reason) &&
        new Set(r.data.records.map((x) => x.recordType + x.recordId)).size ===
          r.data.records.length,
      'Catering history preserves each transition with unique record projection',
      r,
    );
    r = await api(
      '/catering/history' + period + '&recordType=REQUEST&recordId=' + foreignRequest.id,
      'GET',
      undefined,
      operator,
    );
    ok(r.status === 404, 'History rejects foreign record identifiers', r);
    r = await api('/catering/history' + period + '&recordId=' + req.id, 'GET', undefined, operator);
    ok(r.status === 400, 'History requires record type with identifier', r);
    const auditCount = await p.acceptedCateringTransition.count(),
      failed = await request();
    await p.$executeRawUnsafe(
      "ALTER TABLE audit_events ADD CONSTRAINT fail_catering_audit CHECK (action <> 'CATERING_TRANSITION') NOT VALID",
    );
    try {
      r = await transition(failed, 'REQUEST', 'CANCEL');
      ok(
        r.status >= 400 &&
          (await p.cateringRequest.findUnique({ where: { id: failed.id } })).status ===
            'RECEIVED' &&
          (await p.acceptedCateringTransition.count()) === auditCount,
        'Audit failure rolls back catering status and history',
        r,
      );
    } finally {
      await p.$executeRawUnsafe('ALTER TABLE audit_events DROP CONSTRAINT fail_catering_audit');
    }
    const costExpense = await expense({ amount: '10', concept: 'Shared cost' });
    const event2 = await p.cateringEvent.create({
      data: { cateringRequestId: req.id, referenceDate: new Date() },
    });
    const link1 = await p.cateringExpenseLink.create({
        data: { expenseId: costExpense.id, cateringEventId: event.id, allocatedAmount: '6' },
      }),
      link2 = await p.cateringExpenseLink.create({
        data: { expenseId: costExpense.id, cateringEventId: event2.id, allocatedAmount: '4' },
      });
    r = await api('/reports/catering/costs' + period, 'GET', undefined, operator);
    ok(
      r.status === 200 &&
        r.data.total === '10.00' &&
        r.data.rows.length === 2 &&
        r.data.rows.some((row) => row.sourceId === link1.id) &&
        r.data.groups.reduce((sum, x) => sum + Number(x.amount), 0) === 10,
      'Catering costs reconcile explicit shared allocations without duplicating original expense',
      r,
    );
    await p.cateringExpenseLink.update({ where: { id: link2.id }, data: { allocatedAmount: '5' } });
    r = await api('/reports/catering/costs' + period);
    ok(r.status === 409, 'Overallocated catering expense rejected', r);
    await p.cateringExpenseLink.update({
      where: { id: link2.id },
      data: { allocatedAmount: null },
    });
    r = await api('/reports/catering/costs' + period);
    ok(r.status === 409, 'Shared expense cannot silently allocate full amount', r);
    await p.cateringExpenseLink.update({ where: { id: link2.id }, data: { allocatedAmount: '4' } });
    r = await api('/reports/catering/costs?from=2020-01-01&to=2020-01-01');
    ok(
      r.status === 200 && r.data.total === null && r.data.informationState === 'NO_INFORMATION',
      'Unrecorded catering costs remain no information rather than measured zero',
      r,
    );
    const pdf = {
        fileName: 'proof.pdf',
        mimeType: 'application/pdf',
        base64: Buffer.from('%PDF-1.4\nFixture document\n%%EOF').toString('base64'),
      },
      body = { file: pdf, idempotencyKey: randomUUID() },
      originalExpense = JSON.stringify(await p.expense.findUnique({ where: { id: e.id } }));
    r = await api(
      '/expenses/' + e.id + '/receipts',
      'POST',
      { idempotencyKey: randomUUID() },
      manager,
    );
    ok(
      r.status === 200 && r.data.state === 'LISTED' && r.data.file === null,
      'Attachment action lists existing metadata without a file',
      r,
    );
    both = await Promise.all([
      api('/expenses/' + e.id + '/receipts', 'POST', body, manager),
      api('/expenses/' + e.id + '/receipts', 'POST', body, manager),
    ]);
    ok(
      both.every((x) => x.status === 200) &&
        JSON.stringify(both[0].data) === JSON.stringify(both[1].data) &&
        (await p.receipt.count({ where: { expenseId: e.id } })) === 1,
      'Concurrent attachment persists one private file and recovers one response',
      both,
    );
    const receiptId = both[0].data.receiptId;
    ok(
      JSON.stringify(await p.expense.findUnique({ where: { id: e.id } })) === originalExpense &&
        both[0].data.ocrAvailable === false,
      'Attaching proof never confirms or modifies the expense and does not pretend OCR',
    );
    r = await api(
      '/expenses/' + e.id + '/receipts',
      'POST',
      { receiptId, idempotencyKey: randomUUID() },
      manager,
    );
    ok(
      r.status === 200 &&
        r.data.file.base64 === pdf.base64 &&
        createHash('sha256').update(Buffer.from(r.data.file.base64, 'base64')).digest('hex') ===
          createHash('sha256').update(Buffer.from(pdf.base64, 'base64')).digest('hex'),
      'Authorized receipt retrieval returns exact original bytes',
      r,
    );
    r = await api(
      '/expenses/' + e.id + '/receipts',
      'POST',
      { ...body, file: { ...pdf, fileName: 'different.pdf' } },
      manager,
    );
    ok(r.status === 409, 'Attachment key rejects a changed filename or payload', r);
    for (const [file, label] of [
      [{ ...pdf, fileName: 'proof.png' }, 'MIME-extension mismatch rejected'],
      [
        { ...pdf, base64: Buffer.from('<script>bad</script>').toString('base64') },
        'Forged PDF signature rejected',
      ],
      [{ ...pdf, fileName: '../proof.pdf' }, 'Filename traversal rejected'],
      [{ ...pdf, fileName: 'bad\nname.pdf' }, 'Control characters in filename rejected'],
      [{ ...pdf, mimeType: 'text/html' }, 'Unsupported MIME rejected'],
      [{ ...pdf, base64: 'AB==' }, 'Noncanonical or invalid base64 rejected'],
      [{ ...pdf, base64: '' }, 'Empty file rejected'],
      [
        { ...pdf, base64: Buffer.alloc(1048577, 65).toString('base64') },
        'Oversized decoded file rejected',
      ],
    ]) {
      r = await api(
        '/expenses/' + e.id + '/receipts',
        'POST',
        { file, idempotencyKey: randomUUID() },
        manager,
      );
      ok(r.status === 400, label, r);
    }
    const large = {
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      base64: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(150000, 65)]).toString(
        'base64',
      ),
    };
    r = await api(
      '/expenses/' + e.id + '/receipts',
      'POST',
      { file: large, idempotencyKey: randomUUID() },
      manager,
    );
    ok(
      r.status === 200 && r.data.file.base64 === large.base64,
      'Valid attachment larger than default Express limit is supported',
      r,
    );
    r = await api(
      '/expenses/' + e.id + '/receipts',
      'POST',
      { file: pdf, idempotencyKey: randomUUID() },
      cashier,
    );
    ok(r.status === 403, 'Cashier attachment upload denied', r);
    r = await api(
      '/expenses/' + e.id + '/receipts',
      'POST',
      { receiptId, idempotencyKey: randomUUID() },
      foreign,
      branchB.id,
    );
    ok([403, 404].includes(r.status), 'Receipt download cannot cross branch boundaries', r);
    const otherExpense = await expense();
    r = await api(
      '/expenses/' + otherExpense.id + '/receipts',
      'POST',
      { receiptId, idempotencyKey: randomUUID() },
      manager,
    );
    ok(r.status === 404, 'Receipt must belong to the requested expense', r);
    r = await api(
      '/receipts',
      'POST',
      {
        expenseId: e.id,
        fileName: 'fake',
        mimeType: 'application/pdf',
        extension: 'pdf',
        size: 1,
        privateStorageReference: 'https://invalid',
      },
      manager,
    );
    ok(
      [404, 405].includes(r.status),
      'Generic receipt create cannot forge private storage references',
      r,
    );
    r = await api('/accepted-catering-transitions', 'POST', { operation: 'CONFIRM' }, operator);
    ok([404, 405].includes(r.status), 'Generic transition-history create bypass is closed', r);
    const beforeReceipts = await p.receipt.count(),
      beforeContents = await p.receiptFile.count();
    await p.$executeRawUnsafe(
      "ALTER TABLE audit_events ADD CONSTRAINT fail_receipt_audit CHECK (action <> 'RECEIPT_ATTACHED') NOT VALID",
    );
    try {
      r = await api(
        '/expenses/' + e.id + '/receipts',
        'POST',
        { file: pdf, idempotencyKey: randomUUID() },
        manager,
      );
      ok(
        r.status >= 400 &&
          (await p.receipt.count()) === beforeReceipts &&
          (await p.receiptFile.count()) === beforeContents,
        'Storage association and content roll back if audit fails',
        r,
      );
    } finally {
      await p.$executeRawUnsafe('ALTER TABLE audit_events DROP CONSTRAINT fail_receipt_audit');
    }
    ok(
      (await stockState()) === inventoryBefore,
      'All twelve new actions leave stock and inventory movements unchanged',
    );
    const createBody = {
      cateringClientId: client.id,
      branchId: branchA.id,
      contact: 'Browser contact',
      scheduledAt: new Date(today + 'T18:00:00Z').toISOString(),
      location: 'Venue',
      expectedAttendees: 10,
      serviceScope: 'Browser test',
    };
    r = await api('/catering-requests', 'POST', { ...createBody, status: 'CONFIRMED' }, operator);
    ok(r.status === 400, 'Generic creation rejects forged initial lifecycle state', r);
    r = await api('/catering-requests', 'POST', createBody, operator);
    ok(
      r.status === 201 && r.data.status === 'RECEIVED' && r.data.revision === 1,
      'Generic creation applies server initial lifecycle values',
      r,
    );
    const browserRequest = r.data;
    console.log(
      'REMAINING_PROOF ' +
        JSON.stringify({
          checks,
          scopeA: branchA.id,
          scopeB: branchB.id,
          expenseId: e.id,
          receiptId,
          requestId: browserRequest.id,
          requestRevision: browserRequest.revision,
          reportId: originalReport.reportId,
          productId: product.id,
        }),
    );
  } finally {
    await p.$disconnect();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
