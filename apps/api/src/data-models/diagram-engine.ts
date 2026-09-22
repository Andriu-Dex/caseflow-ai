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
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

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
    const actors = [...new Set(model.useCases.flatMap((useCase) => useCase.actors))].sort((a, b) =>
      a.localeCompare(b),
    );
    const useCases = [...model.useCases].sort((a, b) => a.code.localeCompare(b.code));
    const lines = ['@startuml', 'left to right direction'];
    actors.forEach((actor, index) => lines.push(`actor "${quote(actor)}" as A${index + 1}`));
    lines.push(`rectangle "${quote(model.systemName)}" {`);
    useCases.forEach((useCase, index) =>
      lines.push(`  usecase "${quote(`${useCase.code} ${useCase.name}`)}" as U${index + 1}`),
    );
    lines.push('}');
    useCases.forEach((useCase, useCaseIndex) =>
      useCase.actors.forEach((actor) =>
        lines.push(`A${actors.indexOf(actor) + 1} -- U${useCaseIndex + 1}`),
      ),
    );
    lines.push('@enduml');
    return lines.join('\n');
  }

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

  renderSvg(format: 'MERMAID_ER' | 'PLANTUML', source: string): string {
    this.validate(format, source);
    const lines = source.split('\n');
    const height = Math.min(10_000, 32 + lines.length * 18);
    const text = lines
      .map(
        (line, index) =>
          `<text x="16" y="${24 + index * 18}" font-family="monospace" font-size="13">${xml(line)}</text>`,
      )
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><rect width="100%" height="100%" fill="white"/>${text}</svg>`;
  }
}
