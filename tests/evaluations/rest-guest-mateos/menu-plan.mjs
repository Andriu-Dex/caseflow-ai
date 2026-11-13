// Project-owned evaluation decisions; no restaurant rules belong in the generator.
export function prepareMenuPlan(input) {
  const plan = structuredClone(input);
  const entity = (name) => plan.entities.find((item) => item.name === name);
  const menu = entity('MenuVersion');
  const daily = entity('DailyMenu');
  const component = entity('MenuVersionComponent');
  const receipts = entity('IdempotentOperation');
  const writers = ['Administrador', 'Encargado de sucursal'];
  const field = (name, type, extra = {}) => ({
    name,
    type,
    required: false,
    unique: false,
    enumValues: [],
    ...extra,
  });
  menu.lifecycle = {
    stateField: 'status',
    initialState: 'BORRADOR',
    immutableStates: ['PUBLICADA'],
    managedFields: ['publicationDate'],
  };
  menu.operations = ['LIST', 'GET'];
  delete menu.operationScope.actorRelation;
  menu.fields.find((item) => item.name === 'creationDate').readOnly = true;
  menu.fields.find((item) => item.name === 'publicationDate').readOnly = true;
  menu.fields.push(
    field('revision', 'INT', { required: true, readOnly: true, serverDefault: 0 }),
    field('publicationPolicyCode', 'STRING', { readOnly: true }),
    field('publicationTimeZone', 'STRING', { readOnly: true }),
  );
  menu.relations.push({
    name: 'publicationApprover',
    kind: 'MANY_TO_ONE',
    targetEntityLocalId: 'ent-usuario',
    required: false,
  });
  menu.uniqueConstraints = [['dailyMenuId', 'versionLabel']];
  daily.operations = ['LIST', 'GET'];
  daily.uniqueConstraints = [['branchId', 'operationalDate']];
  component.operations = ['LIST', 'GET'];
  component.compositionOwnerRelation = 'menuVersion';
  component.uniqueConstraints = [['menuVersionId', 'productId', 'componentType']];
  receipts.relations.push({
    name: 'menuVersion',
    kind: 'MANY_TO_ONE',
    targetEntityLocalId: menu.localId,
    required: false,
  });
  receipts.operationScope.paths.push(['menuVersion', 'dailyMenu', 'branch']);

  const value = (type, description, extra = {}) => ({ type, description, ...extra });
  const property = (name, definition, required = true) => ({ name, value: definition, required });
  const object = (properties) => ({ type: 'OBJECT', properties });
  const uuid = (description) => value('UUID', description);
  const int = (description) => value('INT', description, { minimum: 0 });
  const components = value('ARRAY', 'Composición del menú', {
    minItems: 1,
    maxItems: 100,
    items: object([
      property('productId', value('UUID', 'Producto', { referenceEntityLocalId: 'ent-product' })),
      property(
        'componentType',
        value('STRING', 'Tipo de componente', { minLength: 1, maxLength: 60 }),
      ),
      property('price', value('DECIMAL', 'Precio', { nullable: true })),
      property('available', value('BOOLEAN', 'Disponible')),
    ]),
  });
  const view = object([
    property('versionId', uuid('Versión')),
    property('versionLabel', value('STRING', 'Identificación de versión')),
    property('dailyMenuId', uuid('Menú diario')),
    property('branchId', uuid('Sucursal')),
    property('branchName', value('STRING', 'Sucursal')),
    property('operationalDate', value('DATE', 'Fecha operativa')),
    property('timeZone', value('STRING', 'Zona horaria')),
    property('status', value('ENUM', 'Estado', { enumValues: ['BORRADOR', 'PUBLICADA'] })),
    property('revision', value('INT', 'Revisión', { technical: true, minimum: 0 })),
    property('createdByUserId', uuid('Responsable de creación')),
    property('creationDate', value('DATETIME', 'Creación', {})),
    property('publicationDate', value('DATETIME', 'Publicación', { nullable: true })),
    property(
      'publicationApproverId',
      value('UUID', 'Responsable de publicación', { nullable: true }),
    ),
    property('policyCode', value('STRING', 'Política de vigencia')),
    property('policyDescription', value('STRING', 'Reglas de publicación')),
    property('canSave', value('BOOLEAN', 'Admite edición')),
    property('canClone', value('BOOLEAN', 'Admite nueva versión')),
    property('canPublish', value('BOOLEAN', 'Admite publicación')),
    property('draftComponents', { ...components, minItems: 0, technical: true }),
    property(
      'components',
      value('ARRAY', 'Componentes conservados', {
        maxItems: 100,
        items: object([
          property('componentId', uuid('Componente')),
          property('productId', uuid('Producto')),
          property('productName', value('STRING', 'Producto')),
          property('componentType', value('STRING', 'Tipo')),
          property('price', value('DECIMAL', 'Precio', { nullable: true })),
          property('available', value('BOOLEAN', 'Disponible')),
        ]),
      }),
    ),
    property(
      'siblingVersions',
      value('ARRAY', 'Versiones del mismo menú diario', {
        maxItems: 500,
        items: object([
          property('versionId', uuid('Versión')),
          property('versionLabel', value('STRING', 'Identificación')),
          property('status', value('STRING', 'Estado')),
          property('detailPath', value('STRING', 'Abrir versión', { technical: true })),
        ]),
      }),
    ),
  ]);
  const grant = (name, operations) => ({ entityLocalId: entity(name).localId, operations });
  const reads = ['Branch', 'DailyMenu', 'MenuVersion', 'MenuVersionComponent', 'Product'];
  const dataAccess = (write) => [
    ...reads.map((name) => grant(name, ['READ'])),
    ...(write
      ? [
          grant('DailyMenu', ['CREATE']),
          grant('MenuVersion', ['CREATE', 'UPDATE']),
          grant('MenuVersionComponent', ['CREATE', 'UPDATE', 'DELETE']),
          grant('IdempotentOperation', ['READ', 'CREATE']),
          grant('AuditEvent', ['READ', 'CREATE']),
          grant('FieldValueChange', ['CREATE']),
        ]
      : []),
  ];
  const rules = [
    {
      localId: 'menu-scope-and-history',
      description:
        'Respetar actor verificado, rol y selectedScopeId. No aceptar userId del cliente. Toda consulta usa where explícito de sucursal; rechazar sucursal distinta de selectedScopeId o no autorizada. Las versiones PUBLICADA, su composición, creador, dailyMenuId y versionLabel son inmutables. No tocar ventas ni inventario. No SQL, imports, llamadas de red ni acceso a credenciales. GET no escribe. Toda escritura y auditoría en una única transacción Serializable. updatedAt/createdAt están disponibles en Prisma aunque no figuren en la lista de campos del contexto.',
    },
    {
      localId: 'menu-publication-policy',
      description:
        'Decisión de ingeniería delegada y ratificada en este plan: política MENU_OPERATIONAL_DAY_V1. Los borradores aceptan cualquier fecha ISO real. Publicar solo en fecha operativa local actual o futura, nunca pasada; calcular la fecha local actual con Intl.DateTimeFormat y Branch.timeZone IANA válida, sin suponer UTC ni America/Guayaquil. Publicar requiere 1..100 componentes; producto existente y ACTIVO para cada componente available=true; precio obligatorio para disponibles, opcional para no disponibles, siempre decimal exacto no negativo con máximo dos decimales si existe. No imponer categorías cerradas: componentType es texto libre no vacío, hasta 60 caracteres. Rechazar duplicados de productId+componentType exacto tras trim. No usar Number para validar precisión monetaria ni hacer cálculos monetarios en coma flotante. No inferir aprobación de applicationRules ni de existencia de OperationalParameter. La política aprobada de esta versión del plan y la confirmación explícita acknowledgePolicy=true constituyen la regla de vigencia y la aprobación humana de publicación. Guardar publicationPolicyCode=MENU_OPERATIONAL_DAY_V1, publicationTimeZone, publicationApproverId=actor.userId y publicationDate UTC del servidor. No imponer una única versión publicada por fecha: conservar todas las versiones previas.',
    },
    {
      localId: 'menu-command-atomicity',
      description:
        'CREATE/CLONE/SAVE/PUBLISH exigen idempotencyKey UUID. IdempotentOperation tupla userId+scope(sucursal)+operation(MENU_CREATE/MENU_CLONE/MENU_SAVE/MENU_PUBLISH)+key; payloadFingerprint JSON canónico del comando normalizado, recoverableResult respuesta completa. Verificar replay antes de mutar: misma clave+mismo fingerprint devuelve el resultado, distinta carga => ConflictException. Persistir receipt con menuVersionId y userId del actor en la MISMA transacción. Un conflicto de serialización P2034 se deja al filtro HTTP409; el cliente puede reintentar con la misma clave. No forzar éxito. Creación dailyMenu por branchId+operationalDate y versionLabel V-N único diario; obtener siguiente secuencia de todas las versiones dentro de Serializable, rechazar >500 versiones sin truncar; restricciones únicas evitan duplicados concurrentes. Creación y clonación siempre BORRADOR revision=0, creationDate del servidor, userId del actor. CLONE conserva composición, sucursal y fecha del original, sin modificar el original. SAVE y PUBLISH requieren expectedRevision: consultar versión, validar estado, reclamarla ATÓMICAMENTE con updateMany donde id+status BORRADOR+revision esperada, incrementando revision antes de leer/mutar componentes dentro de la transacción. Esa escritura obtiene el bloqueo de fila usado por la protección genérica. Si count no es 1 => ConflictException. SAVE reemplaza composición íntegra y mantiene identidad/creador; PUBLISH hace claim con status PUBLICADA y luego comprueba composición y política dentro de la misma transacción: si falla cualquier comprobación, rollback a BORRADOR/revisión original. Ningún descuento parcial, aprobación parcial ni componente huérfano. Crear AuditEvent con branchId,userId,affectedEntityType MenuVersion,reference versión,action,occurredAt,requestCorrelation clave, sin secretos; FieldValueChange de status/revision/composición si cambia, vinculados al auditEvent. Responder con la misma proyección completa que GET de detalle, con los campos exactos del contrato.',
    },
    {
      localId: 'menu-view-contract',
      description:
        'Proyección común: versionId, versionLabel, dailyMenuId, branchId, branchName, operationalDate YYYY-MM-DD, timeZone de sucursal, status, revision, createdByUserId, creationDate ISO UTC, publicationDate ISO UTC o null, publicationApproverId o null, policyCode MENU_OPERATIONAL_DAY_V1, policyDescription legible, canSave solo BORRADOR y rol escritor, canClone solo rol escritor, canPublish solo si política completa y rol escritor. draftComponents solo productId/componentType/price/available (sin IDs ni metadatos), components con componentId/productId/productName/componentType/price/available. Decimales como strings de dos decimales o null. siblingVersions del mismo dailyMenu incluyendo ruta /menus/versions/{id}, máximo500 sin truncado. Productos faltantes => error; no inventar nombres. Lecturas dentro de transacción RepeatableRead y escrituras Serializable. No usar nombres de relaciones inversas inferidos: consultar delegados por claves foráneas declaradas.',
    },
  ];
  const boundedRules = rules.flatMap((rule) => {
    const result = [];
    let text = rule.description;
    let part = 1;
    while (text.length > 1800) {
      const stop = text.lastIndexOf('. ', 1700);
      const end = stop > 0 ? stop + 1 : 1700;
      result.push({
        ...rule,
        localId: rule.localId + '-' + part++,
        description: text.slice(0, end),
        relatedSourceCodes: ['CU-254', 'CU-255', 'CU-256', 'CU-257', 'CU-258'],
      });
      text = text.slice(end).trim();
    }
    result.push({
      ...rule,
      localId: rule.localId + '-' + part,
      description: text,
      relatedSourceCodes: ['CU-254', 'CU-255', 'CU-256', 'CU-257', 'CU-258'],
    });
    return result;
  });
  const make = (method, path, summary, contract, write = false) => ({
    method,
    path,
    summary,
    moduleLocalId: menu.moduleLocalId,
    entityLocalId: menu.localId,
    roles: write ? writers : menu.readRoles,
    dataAccess: dataAccess(write),
    contract,
    rules: structuredClone(boundedRules),
  });
  const queryView = make(
    'GET',
    '/menus/versions/:versionid/view',
    'Consultar versión, composición, historial y política de publicación',
    { response: view },
  );
  const commandBody = (properties) =>
    object([
      ...properties,
      property('idempotencyKey', value('UUID', 'Clave de reintento', { technical: true })),
    ]);
  const uuidBinding = { kind: 'UUID', field: 'idempotencyKey' };
  const viewKey = 'GET /menus/versions/:versionid/view';
  const revisionBinding = {
    kind: 'ACTION',
    field: 'expectedRevision',
    sourceEndpoint: viewKey,
    sourceField: 'revision',
  };
  const create = make(
    'POST',
    '/branches/:branchid/menus/drafts',
    'Guardar borrador de menú y su composición de forma atómica',
    {
      body: commandBody([
        property('operationalDate', value('DATE', 'Fecha operativa local')),
        property('components', components),
      ]),
      response: view,
      bindings: [uuidBinding],
      successNavigation: { routePath: '/menus/versions/[versionid]/edit', idField: 'versionId' },
    },
    true,
  );
  const clone = make(
    'POST',
    '/menus/versions/:versionid/clone',
    'Preparar nueva versión en borrador conservando el original',
    {
      body: commandBody([
        property(
          'sourceRevision',
          value('INT', 'Revisión de origen', { technical: true, minimum: 0 }),
        ),
      ]),
      response: view,
      bindings: [
        uuidBinding,
        {
          kind: 'ACTION',
          field: 'sourceRevision',
          sourceEndpoint: viewKey,
          sourceField: 'revision',
          requireTrue: 'canClone',
        },
      ],
      successNavigation: { routePath: '/menus/versions/[versionid]/edit', idField: 'versionId' },
    },
    true,
  );
  const save = make(
    'POST',
    '/menus/versions/:versionid/draft',
    'Guardar cambios del borrador y todos sus componentes',
    {
      body: commandBody([
        property(
          'expectedRevision',
          value('INT', 'Revisión esperada', { technical: true, minimum: 0 }),
        ),
        property('components', components),
      ]),
      response: view,
      bindings: [
        uuidBinding,
        { ...revisionBinding, requireTrue: 'canSave' },
        {
          kind: 'PREFILL',
          field: 'components',
          sourceEndpoint: viewKey,
          sourceField: 'draftComponents',
        },
      ],
      successNavigation: { routePath: '/menus/versions/[versionid]', idField: 'versionId' },
    },
    true,
  );
  const publish = make(
    'POST',
    '/menus/versions/:versionid/publish',
    'Validar y publicar la versión de menú',
    {
      body: commandBody([
        property(
          'expectedRevision',
          value('INT', 'Revisión esperada', { technical: true, minimum: 0 }),
        ),
        property(
          'acknowledgePolicy',
          value('BOOLEAN', 'Confirmo la publicación conforme a la política de vigencia mostrada'),
        ),
      ]),
      response: view,
      bindings: [uuidBinding, { ...revisionBinding, requireTrue: 'canPublish' }],
      successNavigation: { routePath: '/menus/versions/[versionid]', idField: 'versionId' },
    },
    true,
  );
  const list = make(
    'GET',
    '/branches/:branchid/menus',
    'Consultar versiones de menú por fecha operativa y sucursal',
    {
      query: object([
        property('from', value('DATE', 'Desde'), false),
        property('to', value('DATE', 'Hasta'), false),
        property('page', value('INT', 'Página', { minimum: 1, maximum: 100000 }), false),
        property(
          'limit',
          value('INT', 'Registros por página', { minimum: 1, maximum: 100 }),
          false,
        ),
      ]),
      response: object([
        property('branchId', uuid('Sucursal')),
        property('branchName', value('STRING', 'Sucursal')),
        property('timeZone', value('STRING', 'Zona horaria')),
        property('page', int('Página')),
        property('limit', int('Tamaño de página')),
        property('hasNextPage', value('BOOLEAN', 'Hay otra página')),
        property(
          'versions',
          value('ARRAY', 'Versiones conservadas', {
            maxItems: 100,
            items: object([
              property('versionId', uuid('Versión')),
              property('versionLabel', value('STRING', 'Versión')),
              property('operationalDate', value('DATE', 'Fecha operativa')),
              property('status', value('STRING', 'Estado')),
              property('creationDate', value('DATETIME', 'Creación', {})),
              property('publicationDate', value('DATETIME', 'Publicación', { nullable: true })),
              property('detailPath', value('STRING', 'Abrir versión', { technical: true })),
            ]),
          }),
        ),
      ]),
    },
  );
  list.rules.push({
    localId: 'menu-list-order',
    relatedSourceCodes: ['CU-258'],
    description:
      'LIST solo lee: filtrar branchid y rango inclusivo de DailyMenu.operationalDate. Validar from<=to. page por defecto1, limit20; orden operationalDate desc, creationDate desc,id asc. Pedir limit+1 para hasNextPage y devolver solo limit. No truncar versiones dentro de una página ni confundir fecha de creación con fecha operativa.',
  });
  clone.rules.push({
    localId: 'clone-source-review',
    relatedSourceCodes: ['CU-256'],
    description:
      'CLONE requiere body.sourceRevision igual a la revisión leída del origen dentro de la transacción; si cambió, conflicto. Rechazar rol no escritor. La respuesta canClone es true para roles escritores tanto en BORRADOR como PUBLICADA.',
  });
  plan.customEndpoints.push(queryView, create, clone, save, publish, list);
  const action = (label, endpoint) => ({ label, endpoint: `${endpoint.method} ${endpoint.path}` });
  const navigation = (label, routePath, sourceEndpoint, idField, collectionField) => ({
    label,
    navigation: {
      routePath,
      ...(sourceEndpoint
        ? { sourceEndpoint, idField, ...(collectionField ? { collectionField } : {}) }
        : {}),
    },
  });
  for (const route of plan.routes.filter((item) => item.entityLocalId === menu.localId)) {
    route.kind = 'CUSTOM';
    if (route.screenLocalId === 'pantalla-menus')
      route.actions = [
        action('Consultar menús', list),
        navigation(
          'Examinar versión',
          '/menus/versions/[versionid]',
          'GET /branches/:branchid/menus',
          'versionId',
          'versions',
        ),
      ];
    else if (route.screenLocalId === 'pantalla-menu-nuevo')
      route.actions = [
        action('Guardar borrador', create),
        navigation('Cancelar y volver a menús', '/branches/[branchid]/menus'),
      ];
    else {
      route.contextQueries = [viewKey];
      if (route.screenLocalId === 'pantalla-menu-version')
        route.actions = [
          action('Preparar nueva versión en borrador, solo para encargado autorizado', clone),
          navigation(
            'Examinar otra versión conservada',
            '/menus/versions/[versionid]',
            viewKey,
            'versionId',
            'siblingVersions',
          ),
          navigation(
            'Volver a la consulta de menús',
            '/branches/[branchid]/menus',
            viewKey,
            'branchId',
          ),
        ];
      else if (route.screenLocalId === 'pantalla-menu-editar')
        route.actions = [
          action('Guardar cambios del borrador', save),
          navigation('Cancelar y volver al detalle de versión', '/menus/versions/[versionid]'),
        ];
      else if (route.screenLocalId === 'pantalla-menu-publicar')
        route.actions = [
          action('Solicitar validación y publicación', publish),
          navigation('Volver al detalle de la versión', '/menus/versions/[versionid]'),
        ];
    }
  }
  plan.tests.push({
    moduleLocalId: menu.moduleLocalId,
    kind: 'INTEGRATION',
    description:
      'Menús: creación/clonado/edición/publicación atómicos, precios exactos, concurrencia, idempotencia, historial y aislamiento por sucursal.',
  });
  return plan;
}
