import {
  implementationPlanContentSchema,
  type ActionValueDefinition,
} from '@caseflow-ai/contracts';
import type { EndpointImplementations } from '../engine/backend.templates';
const field = (name: string, type: string, extra = {}) => ({ name, type, ...extra });
const object = (properties: Record<string, ActionValueDefinition>): ActionValueDefinition => ({
  type: 'OBJECT',
  properties: Object.entries(properties).map(([name, value]) => ({ name, value })),
});
const line = object({
  productId: { type: 'UUID', description: 'Producto', referenceEntityLocalId: 'product' },
  quantity: { type: 'INT', minimum: 1, maximum: 100, description: 'Cantidad' },
});
const lines: ActionValueDefinition = {
  type: 'ARRAY',
  minItems: 1,
  maxItems: 25,
  items: line,
  description: 'Productos de la operación',
};
const result = object({
  canConfirm: { type: 'BOOLEAN' },
  id: { type: 'UUID' },
  status: { type: 'ENUM', enumValues: ['DRAFT', 'CONFIRMED'] },
  revision: { type: 'INT' },
  total: { type: 'DECIMAL' },
  lines: {
    type: 'ARRAY',
    items: object({
      productId: { type: 'UUID' },
      quantity: { type: 'INT' },
      unitPrice: { type: 'DECIMAL' },
      subtotal: { type: 'DECIMAL' },
    }),
  },
});
const responseBody = `const lines = await tx.orderLine.findMany({where:{orderId:order.id},orderBy:{id:'asc'}}); return {id:order.id,status:order.status,canConfirm:order.status==='DRAFT',revision:order.revision,total:order.total.toFixed(2),lines:lines.map(line=>({productId:line.productId,quantity:line.quantity,unitPrice:line.unitPrice.toFixed(2),subtotal:line.subtotal.toFixed(2)}))};`;
const writeLines = `let total = 0n; for(const line of body.lines){const product=await tx.product.findUnique({where:{id:line.productId}});if(!product?.active)throw new BadRequestException('Producto no disponible.');const [whole,fraction='']=product.unitPrice.toFixed(2).split('.');const price=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));const subtotal=price*BigInt(line.quantity);total+=subtotal;if(total>999999999999n)throw new BadRequestException('Importe fuera de rango.');await tx.orderLine.create({data:{orderId:order.id,productId:product.id,quantity:line.quantity,unitPrice:product.unitPrice,subtotal:(subtotal/100n).toString()+'.'+(subtotal%100n).toString().padStart(2,'0')}});}order=await tx.order.update({where:{id:order.id},data:{total:(total/100n).toString()+'.'+(total%100n).toString().padStart(2,'0')}});`;
export const actionContractPlan = () =>
  implementationPlanContentSchema.parse({
    designBaselineId: '11111111-1111-4111-8111-111111111111',
    authentication: { required: false },
    modules: [{ localId: 'orders', name: 'Orders', description: 'Operaciones de prueba' }],
    entities: [
      {
        localId: 'product',
        name: 'Product',
        moduleLocalId: 'orders',
        fields: [
          field('name', 'STRING'),
          field('unitPrice', 'DECIMAL'),
          field('active', 'BOOLEAN'),
        ],
        operations: ['LIST', 'GET'],
      },
      {
        localId: 'order',
        name: 'Order',
        moduleLocalId: 'orders',
        fields: [
          field('status', 'ENUM', { enumValues: ['DRAFT', 'CONFIRMED'] }),
          field('total', 'DECIMAL'),
          field('revision', 'INT'),
        ],
        operations: ['LIST', 'GET'],
      },
      {
        localId: 'line',
        name: 'OrderLine',
        moduleLocalId: 'orders',
        fields: [
          field('quantity', 'INT'),
          field('unitPrice', 'DECIMAL'),
          field('subtotal', 'DECIMAL'),
        ],
        relations: [
          { name: 'order', kind: 'MANY_TO_ONE', targetEntityLocalId: 'order', required: true },
          { name: 'product', kind: 'MANY_TO_ONE', targetEntityLocalId: 'product', required: true },
        ],
        operations: [],
      },
      {
        localId: 'receipt',
        name: 'ConfirmationReceipt',
        moduleLocalId: 'orders',
        fields: [field('key', 'STRING', { unique: true }), field('expectedRevision', 'INT')],
        relations: [
          { name: 'order', kind: 'ONE_TO_ONE', targetEntityLocalId: 'order', required: true },
        ],
        operations: [],
      },
    ],
    customEndpoints: [
      {
        moduleLocalId: 'orders',
        method: 'POST',
        path: '/orders/drafts',
        summary: 'Crear borrador',
        contract: {
          body: object({ lines }),
          response: result,
          successNavigation: { routePath: '/orders/[orderId]', idField: 'id' },
        },
      },
      {
        moduleLocalId: 'orders',
        method: 'PATCH',
        path: '/orders/:orderId/draft',
        summary: 'Guardar borrador',
        contract: {
          bindings: [
            {
              kind: 'ACTION',
              field: 'expectedRevision',
              sourceEndpoint: 'GET /orders/:orderId/review',
              sourceField: 'revision',
              requireTrue: 'canConfirm',
            },
          ],
          body: object({ expectedRevision: { type: 'INT', minimum: 0 }, lines }),
          response: result,
        },
      },
      {
        moduleLocalId: 'orders',
        method: 'GET',
        path: '/orders/:orderId/review',
        summary: 'Revisar operación',
        contract: {
          query: object({
            includeLines: { type: 'BOOLEAN' },
            limit: { type: 'INT', minimum: 1, maximum: 100 },
          }),
          response: result,
        },
      },
      {
        moduleLocalId: 'orders',
        method: 'POST',
        path: '/orders/:orderId/confirm',
        summary: 'Confirmar operación',
        contract: {
          bindings: [
            {
              kind: 'ACTION',
              field: 'expectedRevision',
              sourceEndpoint: 'GET /orders/:orderId/review',
              sourceField: 'revision',
              requireTrue: 'canConfirm',
            },
            { kind: 'UUID', field: 'idempotencyKey' },
          ],
          body: object({
            idempotencyKey: { type: 'UUID', description: 'Clave de confirmación' },
            expectedRevision: { type: 'INT', minimum: 0, description: 'Versión revisada' },
          }),
          response: result,
        },
      },
      {
        moduleLocalId: 'orders',
        method: 'GET',
        path: '/orders/invalid-response',
        summary: 'Probar rechazo de respuesta',
        contract: { response: object({ id: { type: 'UUID' } }) },
      },
    ],
    routes: [
      {
        path: '/orders/new',
        screenName: 'Crear operación',
        moduleLocalId: 'orders',
        kind: 'CUSTOM',
        actions: [{ label: 'Crear borrador', endpoint: 'POST /orders/drafts' }],
      },
      {
        path: '/orders/[orderId]',
        screenName: 'Revisar y confirmar',
        moduleLocalId: 'orders',
        kind: 'CUSTOM',
        actions: [
          { label: 'Guardar borrador', endpoint: 'PATCH /orders/:orderId/draft' },
          { label: 'Revisar operación', endpoint: 'GET /orders/:orderId/review' },
          { label: 'Confirmar operación', endpoint: 'POST /orders/:orderId/confirm' },
        ],
      },
    ],
  });
export const actionContractImplementations: EndpointImplementations = {
  'POST /orders/drafts': `return this.prisma.$transaction(async tx=>{let order=await tx.order.create({data:{status:'DRAFT',revision:0,total:'0'}});${writeLines}${responseBody}});`,
  'PATCH /orders/:orderId/draft': `return this.prisma.$transaction(async tx=>{const updated=await tx.order.updateMany({where:{id:orderId,status:'DRAFT',revision:body.expectedRevision},data:{revision:{increment:1}}});if(!updated.count)throw new ConflictException('La operación cambió o ya está confirmada.');let order=(await tx.order.findUnique({where:{id:orderId}}))!;await tx.orderLine.deleteMany({where:{orderId}});${writeLines}${responseBody}});`,
  'GET /orders/:orderId/review': `const order=await this.prisma.order.findUnique({where:{id:orderId}});if(!order)throw new NotFoundException('No existe.');const tx=this.prisma;const lines=query.includeLines?await tx.orderLine.findMany({where:{orderId},take:query.limit,orderBy:{id:'asc'}}):[];return {id:order.id,status:order.status,canConfirm:order.status==='DRAFT',revision:order.revision,total:order.total.toFixed(2),lines:lines.map(line=>({productId:line.productId,quantity:line.quantity,unitPrice:line.unitPrice.toFixed(2),subtotal:line.subtotal.toFixed(2)}))};`,
  'POST /orders/:orderId/confirm': `return this.prisma.$transaction(async tx=>{const changed=await tx.order.updateMany({where:{id:orderId,status:'DRAFT',revision:body.expectedRevision},data:{status:'CONFIRMED',revision:{increment:1}}});const order=await tx.order.findUnique({where:{id:orderId}});if(!order)throw new NotFoundException('No existe.');if(!changed.count){const receipt=await tx.confirmationReceipt.findUnique({where:{orderId}});if(!receipt||receipt.key!==body.idempotencyKey||receipt.expectedRevision!==body.expectedRevision)throw new ConflictException('La confirmación no coincide con la operación original.');}else{if(!await tx.orderLine.count({where:{orderId}}))throw new BadRequestException('La operación no tiene líneas.');await tx.confirmationReceipt.create({data:{orderId,key:body.idempotencyKey,expectedRevision:body.expectedRevision}});}${responseBody}});`,
  'GET /orders/invalid-response': `return JSON.parse('{"id":"invalid","secret":"must-not-leak"}');`,
};
