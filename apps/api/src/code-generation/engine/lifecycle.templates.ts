import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { lowerFirst, tableName } from '../naming';

type Entity = ImplementationPlanContent['entities'][number];

export function lifecycleParents(entity: Entity, plan: ImplementationPlanContent) {
  return entity.relations.flatMap((relation) => {
    const parent = plan.entities.find((item) => item.localId === relation.targetEntityLocalId);
    return relation.name === entity.compositionOwnerRelation &&
      relation.kind === 'MANY_TO_ONE' &&
      parent?.lifecycle
      ? [
          {
            field: relation.name + 'Id',
            model: lowerFirst(parent.name),
            table: tableName(parent.name),
            policy: {
              stateField: parent.lifecycle.stateField,
              initialState: parent.lifecycle.initialState,
              immutableStates: parent.lifecycle.immutableStates,
            },
          },
        ]
      : [];
  });
}

export function lifecycleGuard(entity: Entity, plan: ImplementationPlanContent): string {
  if (!entity.operations.some((operation) => ['CREATE', 'UPDATE', 'DELETE'].includes(operation)))
    return '';
  const parents = lifecycleParents(entity, plan);
  if (!entity.lifecycle && !parents.length) return '';
  const model = lowerFirst(entity.name);
  const lockStatement = plan.authentication.local?.scope
    ? 'await lockLifecycleRecord(tx, lock.model, lock.id);'
    : 'await tx.$queryRaw`SELECT "id" FROM ${Prisma.raw(\'"\' + lock.table + \'"\')} WHERE "id" = ${lock.id}::uuid FOR UPDATE`;';
  return `
  private async mutate<T>(operation: 'CREATE' | 'UPDATE' | 'DELETE', id: string | undefined,
    input: Record<string, unknown>, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const current = id ? await tx.${model}.findUnique({ where: { id } }) : null;
      if (id && !current) throw new NotFoundException('No se encontró el registro.');
      const locks: { model: string; table: string; id: string; stateField: string; immutableStates: string[] }[] = [];
      ${entity.lifecycle ? `if (id) locks.push({ model: '${model}', table: '${tableName(entity.name)}', id, stateField: '${entity.lifecycle.stateField}', immutableStates: ${JSON.stringify(entity.lifecycle.immutableStates)} });` : ''}
      const parents: { field: string; model: string; table: string; policy: { stateField: string; initialState: string; immutableStates: string[] } }[] = ${JSON.stringify(parents)};
      for (const parent of parents) {
        const before = current ? (current as unknown as Record<string, unknown>)[parent.field] : undefined;
        for (const parentId of new Set([before, input[parent.field]])) {
          if (typeof parentId === 'string') locks.push({ model: parent.model, table: parent.table, id: parentId,
            stateField: parent.policy.stateField, immutableStates: parent.policy.immutableStates });
        }
      }
      locks.sort((a, b) => (a.model + ':' + a.id).localeCompare(b.model + ':' + b.id));
      for (const lock of locks) {
        ${lockStatement}
        const delegate = (tx as unknown as Record<string, {
          findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>;
        }>)[lock.model]!;
        const record = await delegate.findUnique({ where: { id: lock.id } });
        if (!record) throw new NotFoundException('No se encontró el registro relacionado.');
        if (lock.immutableStates.includes(String(record[lock.stateField]))) {
          throw new BadRequestException('El registro finalizado y su composición son inmutables.');
        }
      }
      ${
        entity.lifecycle
          ? `const policy = ${JSON.stringify(entity.lifecycle)};
      if (policy.managedFields.some((field) => Object.prototype.hasOwnProperty.call(input, field))) {
        throw new BadRequestException('Los campos gestionados requieren una operación de dominio.');
      }
      if (operation === 'CREATE') {
        if (input[policy.stateField] !== undefined && input[policy.stateField] !== policy.initialState) {
          throw new BadRequestException('El registro debe crearse en su estado inicial.');
        }
        input[policy.stateField] = policy.initialState;
      } else if (input[policy.stateField] !== undefined &&
        input[policy.stateField] !== (current as unknown as Record<string, unknown>)[policy.stateField]) {
        throw new BadRequestException('La transición de estado requiere una operación de dominio.');
      }`
          : 'void operation;'
      }
      return run(tx);
    }, { isolationLevel: 'Serializable' });
  }
`;
}
