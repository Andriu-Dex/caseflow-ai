import { Injectable, UnprocessableEntityException } from '@nestjs/common';

export type ERDiagramModel = {
  entities: {
    localId: string;
    name: string;
    attributes: { name: string; type: string; primaryKey: boolean; unique: boolean }[];
  }[];
  relationships: {
    sourceEntityId: string;
    targetEntityId: string;
    sourceCardinality: string;
    targetCardinality: string;
    name?: string;
  }[];
};
export type UseCaseDiagramModel = {
  systemName: string;
  useCases: { code: string; name: string; actors: string[] }[];
};
const cardinality: Record<string, string> = {
  ONE: '||',
  ZERO_OR_ONE: 'o|',
  ONE_OR_MORE: '|{',
  ZERO_OR_MORE: 'o{',
};
const safeId = (value: string) => value.replace(/[^A-Za-z0-9_]/g, '_');
const quote = (value: string) => value.replace(/["\n\r]/g, ' ').trim();

// Ordinal (code-unit) comparison, never localeCompare: the same input must
// produce byte-identical source regardless of the machine's OS/ICU locale.
function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
// Trim-only normalization, consistent with the actor text rules already
// enforced by the use-case contract (no case-folding there either).
function normalizeIdentity(value: string): string {
  return value.trim();
}
function dedupePreserveOrder(values: string[]): string[] {
  return [...new Set(values)];
}

@Injectable()
export class DiagramEngine {
  generateER(model: ERDiagramModel): string {
    const lines = ['erDiagram'];
    for (const entity of model.entities) {
      lines.push(`  ${safeId(entity.localId)}["${quote(entity.name)}"] {`);
      for (const attribute of entity.attributes) {
        const flags = [attribute.primaryKey ? 'PK' : '', attribute.unique ? 'UK' : '']
          .filter(Boolean)
          .join(',');
        lines.push(
          `    ${attribute.type.toLowerCase()} ${safeId(attribute.name)}${flags ? ` ${flags}` : ''}`,
        );
      }
      lines.push('  }');
    }
    for (const relationship of model.relationships) {
      const left = cardinality[relationship.sourceCardinality];
      const right = cardinality[relationship.targetCardinality];
      if (!left || !right) throw new UnprocessableEntityException('Cardinalidad no válida.');
      lines.push(
        `  ${safeId(relationship.sourceEntityId)} ${left}--${right} ${safeId(relationship.targetEntityId)} : "${quote(relationship.name ?? 'relates')}"`,
      );
    }
    return lines.join('\n');
  }

  generateUseCase(model: UseCaseDiagramModel): string {
    // Normalize actor identity per use case first so malformed/historical
    // duplicate entries (e.g. the primary actor repeated in secondaryActors)
    // never produce duplicate visual associations.
    const useCases = model.useCases.map((useCase) => ({
      ...useCase,
      actors: dedupePreserveOrder(useCase.actors.map(normalizeIdentity)),
    }));
    const actors = dedupePreserveOrder(useCases.flatMap((useCase) => useCase.actors)).sort(
      compareOrdinal,
    );
    const sortedUseCases = [...useCases].sort((a, b) => compareOrdinal(a.code, b.code));
    const lines = ['@startuml', 'left to right direction'];
    actors.forEach((actor, index) => lines.push(`actor "${quote(actor)}" as A${index + 1}`));
    lines.push(`rectangle "${quote(model.systemName)}" {`);
    sortedUseCases.forEach((useCase, index) =>
      lines.push(`  usecase "${quote(`${useCase.code} ${useCase.name}`)}" as U${index + 1}`),
    );
    lines.push('}');
    sortedUseCases.forEach((useCase, useCaseIndex) =>
      useCase.actors.forEach((actor) =>
        lines.push(`A${actors.indexOf(actor) + 1} -- U${useCaseIndex + 1}`),
      ),
    );
    lines.push('@enduml');
    return lines.join('\n');
  }

  // Lightweight local pre-validation only: a cheap, fast-fail structural
  // check before the source ever reaches the real renderer. It is NOT a
  // Mermaid/PlantUML grammar and never establishes compatibility on its own —
  // the renderer (Kroki) is the compatibility authority (see DiagramProvider).
  validate(format: 'MERMAID_ER' | 'PLANTUML', source: string): void {
    const valid =
      format === 'MERMAID_ER'
        ? source.startsWith('erDiagram\n') && !/[<>;]/.test(source)
        : source.startsWith('@startuml\n') &&
          source.endsWith('\n@enduml') &&
          !source.includes('!include') &&
          !source.includes('!pragma');
    if (!valid || source.length > 250_000)
      throw new UnprocessableEntityException('Fuente de diagrama no válida.');
  }
}
