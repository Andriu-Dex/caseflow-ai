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
// Distinguishable on a white background; the package tints are the same hues,
// light enough to sit behind the use case ellipses.
const ACTOR_COLORS = [
  '#1565C0',
  '#C62828',
  '#2E7D32',
  '#EF6C00',
  '#6A1B9A',
  '#00838F',
  '#AD1457',
  '#4E342E',
];
const GROUP_FILLS = [
  '#E3F2FD',
  '#FFEBEE',
  '#E8F5E9',
  '#FFF3E0',
  '#F3E5F5',
  '#E0F7FA',
  '#FCE4EC',
  '#EFEBE9',
];
export type UseCaseDiagramModel = {
  systemName: string;
  useCases: {
    code: string;
    name: string;
    actors: string[];
    // Codes of other use cases; one outside the diagram is left out.
    relations?: { kind: 'INCLUDE' | 'EXTEND'; targetCode: string }[];
  }[];
};
export type NavigationDiagramModel = {
  nodes: { localId: string; label: string; parentLocalId?: string }[];
};
export type SoftwareArchitectureDiagramModel = {
  // A component whose localId other components name as their layer is drawn
  // as a package that contains them.
  components: {
    localId: string;
    name: string;
    layerLocalId?: string;
    responsibilities?: string[];
    relatedSourceCodes?: string[];
  }[];
  dependencies: { fromLocalId: string; toLocalId: string; description?: string }[];
};
export type SystemArchitectureDiagramModel = {
  nodes: {
    localId: string;
    name: string;
    kind: string;
    responsibilities?: string[];
    relatedSourceCodes?: string[];
  }[];
  links: { fromLocalId: string; toLocalId: string; protocol?: string; description?: string }[];
};
export type TraceabilityDiagramModel = {
  nodes: { id: string; code: string; title: string }[];
  edges: { fromId: string; toId: string }[];
};
export type ClassDiagramModel = {
  classes: {
    localId: string;
    name: string;
    stereotype?: string;
    attributes: { name: string; type: string; visibility?: string }[];
    methods: {
      name: string;
      parameters: { name: string; type: string }[];
      returnType?: string;
      visibility?: string;
    }[];
  }[];
  relationships: {
    fromLocalId: string;
    toLocalId: string;
    kind: string;
    label?: string;
    fromMultiplicity?: string;
    toMultiplicity?: string;
  }[];
};
export type DiagramFormat =
  | 'MERMAID_ER'
  | 'PLANTUML'
  | 'MERMAID_FLOWCHART'
  | 'PLANTUML_COMPONENT'
  | 'PLANTUML_DEPLOYMENT'
  | 'MERMAID_CLASS';
const visibilitySymbol: Record<string, string> = { PUBLIC: '+', PRIVATE: '-', PROTECTED: '#' };
// Mermaid writes generics with '~' (List~Pedido~) and has no room for braces.
const classText = (value: string) =>
  quote(value)
    .replace(/[<>]/g, '~')
    .replace(/[{}:;]/g, ' ');
const relationshipArrow: Record<string, string> = {
  ASSOCIATION: '-->',
  AGGREGATION: 'o--',
  COMPOSITION: '*--',
  DEPENDENCY: '..>',
};
const cardinality: Record<string, string> = {
  ONE: '||',
  ZERO_OR_ONE: 'o|',
  ONE_OR_MORE: '|{',
  ZERO_OR_MORE: 'o{',
};
const safeId = (value: string) => value.replace(/[^A-Za-z0-9_]/g, '_');
// Mermaid attribute names are plain identifiers: "Denominación" has to become
// "Denominacion", not "Denominaci_n", which reads as a mistake in the diagram.
const attributeId = (value: string) =>
  safeId(value.normalize('NFD').replace(/\p{Diacritic}/gu, ''));
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

function wrapText(text: string, maxLineLength: number = 40): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length > maxLineLength) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += ' ' + word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\\n');
}
@Injectable()
export class DiagramEngine {
  generateER(model: ERDiagramModel): string {
    const lines = ['erDiagram'];
    for (const entity of model.entities) {
      lines.push(`  ${safeId(entity.localId)}["${quote(entity.name)}"] {`);
      for (const attribute of entity.attributes) {
        // A primary key is unique already: "PK,UK" only repeats it.
        const flags = attribute.primaryKey ? 'PK' : attribute.unique ? 'UK' : '';
        lines.push(
          `    ${attribute.type.toLowerCase()} ${attributeId(attribute.name)}${flags ? ` ${flags}` : ''}`,
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

  // A large system draws hundreds of lines, so the diagram helps the eye: the
  // use cases of each primary actor sit together in their own tinted package,
  // and every actor's lines have their own colour, so a line can be followed
  // from its actor to its use case. Use case numbers follow the code order,
  // whatever the grouping, so the same input always gives the same source.
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
    const numbered = sortedUseCases.map((useCase, index) => ({ ...useCase, number: index + 1 }));
    const lines = ['@startuml', 'left to right direction'];
    actors.forEach((actor, index) => lines.push(`actor "${quote(actor)}" as A${index + 1}`));
    lines.push(`rectangle "${quote(model.systemName)}" {`);
    const groups = [
      ...actors.map((actor, index) => ({
        title: `Casos de uso de ${quote(actor)}`,
        fill: ` ${GROUP_FILLS[index % GROUP_FILLS.length]}`,
        members: numbered.filter((useCase) => useCase.actors[0] === actor),
      })),
      {
        title: 'Sin actor primario',
        fill: '',
        members: numbered.filter((useCase) => useCase.actors.length === 0),
      },
    ];
    for (const group of groups) {
      if (!group.members.length) continue;
      lines.push(`  package "${group.title}"${group.fill} {`);
      for (const useCase of group.members)
        lines.push(`    usecase "${quote(useCase.name)}" as U${useCase.number}`);
      lines.push('  }');
    }
    lines.push('}');
    numbered.forEach((useCase) =>
      useCase.actors.forEach((actor) => {
        const index = actors.indexOf(actor);
        lines.push(
          `A${index + 1} -[${ACTOR_COLORS[index % ACTOR_COLORS.length]}]- U${useCase.number}`,
        );
      }),
    );
    const codes = sortedUseCases.map((useCase) => useCase.code);
    sortedUseCases.forEach((useCase, useCaseIndex) =>
      [...(useCase.relations ?? [])]
        .sort((a, b) => compareOrdinal(a.targetCode, b.targetCode))
        .forEach(({ kind, targetCode }) => {
          const target = codes.indexOf(targetCode);
          if (target >= 0)
            lines.push(
              `U${useCaseIndex + 1} ..> U${target + 1} : <<${kind === 'INCLUDE' ? 'include' : 'extend'}>>`,
            );
        }),
    );
    lines.push('@enduml');
    return lines.join('\n');
  }

  // Deterministic Mermaid flowchart from the structured Navigation Tree
  // (spec §13.4). AI never produces this source directly.
  generateNavigationFlowchart(model: NavigationDiagramModel): string {
    const nodes = [...model.nodes].sort((a, b) => compareOrdinal(a.localId, b.localId));
    const lines = ['flowchart TD'];
    for (const node of nodes) lines.push(`  ${safeId(node.localId)}["${quote(node.label)}"]`);
    for (const node of nodes)
      if (node.parentLocalId)
        lines.push(`  ${safeId(node.parentLocalId)} --> ${safeId(node.localId)}`);
    return lines.join('\n');
  }

  // Deterministic Mermaid flowchart from the Traceability graph (spec §4.8:
  // canonical source over render — this source is derived and re-rendered on
  // demand, never persisted, since the graph itself is already recomputed on
  // every request). Node ids are real UUIDs, so safeId() is what keeps them
  // valid Mermaid identifiers.
  generateTraceabilityFlowchart(model: TraceabilityDiagramModel): string {
    const nodes = [...model.nodes].sort((a, b) => compareOrdinal(a.code, b.code));
    const edges = [...model.edges].sort(
      (a, b) => compareOrdinal(a.fromId, b.fromId) || compareOrdinal(a.toId, b.toId),
    );
    const lines = ['flowchart TD'];
    for (const node of nodes) {
      const fullTitle = `${node.code}: ${node.title}`;
      const title = wrapText(fullTitle, 60);
      lines.push(`  ${safeId(node.id)}["${quote(title)}"]`);
    }
    for (const edge of edges) lines.push(`  ${safeId(edge.fromId)} --> ${safeId(edge.toId)}`);
    return lines.join('\n');
  }

  // Deterministic PlantUML component diagram from the structured Software
  // Architecture (spec §14.3).
  generateSoftwareComponentDiagram(model: SoftwareArchitectureDiagramModel): string {
    const components = [...model.components].sort((a, b) => compareOrdinal(a.localId, b.localId));
    const layers = [
      ...new Set(components.flatMap((c) => (c.layerLocalId ? [c.layerLocalId] : []))),
    ].sort(compareOrdinal);
    const lines = ['@startuml'];
    // ponytail: one level of layers; a layer inside another layer is drawn flat.
    for (const layer of layers) {
      const name = components.find((c) => c.localId === layer)?.name ?? layer;
      lines.push(`package "${quote(name)}" as ${safeId(layer)} {`);
      for (const component of components)
        if (component.layerLocalId === layer && !layers.includes(component.localId))
          lines.push(`  component "${quote(component.name)}" as ${safeId(component.localId)}`);
      lines.push('}');
    }
    for (const component of components)
      if (!component.layerLocalId && !layers.includes(component.localId))
        lines.push(`component "${quote(component.name)}" as ${safeId(component.localId)}`);
    for (const dependency of model.dependencies)
      lines.push(
        `${safeId(dependency.fromLocalId)} --> ${safeId(dependency.toLocalId)}${
          dependency.description ? ` : "${quote(dependency.description)}"` : ''
        }`,
      );
    for (const component of components) {
      const details = [
        ...(component.responsibilities ?? []),
        ...(component.relatedSourceCodes?.length
          ? [`Fuentes: ${component.relatedSourceCodes.join(', ')}`]
          : []),
      ];
      if (details.length)
        lines.push(
          `note right of ${safeId(component.localId)} : ${details.map((detail) => quote(detail).replace(/[<>]/g, '')).join('\\n')}`,
        );
    }
    lines.push('@enduml');
    return lines.join('\n');
  }

  // Deterministic PlantUML deployment representation from the structured
  // System Architecture (spec §15).
  generateSystemDeploymentDiagram(model: SystemArchitectureDiagramModel): string {
    const nodeKeyword: Record<string, string> = {
      RUNTIME: 'node',
      DATABASE: 'database',
      STORAGE: 'storage',
      EXTERNAL_SERVICE: 'cloud',
      CLIENT: 'actor',
      OTHER: 'node',
    };
    const nodes = [...model.nodes].sort((a, b) => compareOrdinal(a.localId, b.localId));
    const lines = ['@startuml'];
    for (const node of nodes)
      lines.push(
        `${nodeKeyword[node.kind] ?? 'node'} "${quote(node.name)}" as ${safeId(node.localId)}`,
      );
    for (const link of model.links) {
      const label = [link.protocol, link.description].filter(Boolean).map((x) => quote(x!));
      lines.push(
        `${safeId(link.fromLocalId)} --> ${safeId(link.toLocalId)}${
          label.length ? ` : "${label.join(' — ')}"` : ''
        }`,
      );
    }
    for (const node of nodes) {
      const details = [
        ...(node.responsibilities ?? []),
        ...(node.relatedSourceCodes?.length
          ? [`Fuentes: ${node.relatedSourceCodes.join(', ')}`]
          : []),
      ];
      if (details.length)
        lines.push(
          `note right of ${safeId(node.localId)} : ${details.map((detail) => quote(detail).replace(/[<>]/g, '')).join('\\n')}`,
        );
    }
    lines.push('@enduml');
    return lines.join('\n');
  }

  // Deterministic Mermaid classDiagram from the structured domain class
  // diagram (DEC-121): same input, byte-identical source.
  generateClassDiagram(model: ClassDiagramModel): string {
    const classes = [...model.classes].sort((a, b) => compareOrdinal(a.localId, b.localId));
    const lines = ['classDiagram'];
    for (const cls of classes) {
      lines.push(`  class ${safeId(cls.localId)}["${classText(cls.name)}"] {`);
      if (cls.stereotype && cls.stereotype !== 'ENTITY')
        lines.push(
          `    <<${cls.stereotype === 'VALUE_OBJECT' ? 'value object' : cls.stereotype.toLowerCase()}>>`,
        );
      for (const attribute of cls.attributes)
        lines.push(
          `    ${visibilitySymbol[attribute.visibility ?? 'PRIVATE'] ?? '-'}${classText(attribute.type)} ${classText(attribute.name)}`,
        );
      for (const method of cls.methods)
        lines.push(
          `    ${visibilitySymbol[method.visibility ?? 'PUBLIC'] ?? '+'}${classText(method.name)}(${method.parameters
            .map((parameter) => `${classText(parameter.type)} ${classText(parameter.name)}`)
            .join(', ')})${method.returnType ? ` ${classText(method.returnType)}` : ''}`,
        );
      lines.push('  }');
    }
    for (const relationship of model.relationships) {
      const from = safeId(relationship.fromLocalId);
      const to = safeId(relationship.toLocalId);
      const label = relationship.label ? ` : ${classText(relationship.label)}` : '';
      if (relationship.kind === 'INHERITANCE') {
        // "from" specializes "to": Parent <|-- Child.
        lines.push(`  ${to} <|-- ${from}${label}`);
        continue;
      }
      const fromMultiplicity = relationship.fromMultiplicity
        ? ` "${relationship.fromMultiplicity}"`
        : '';
      const toMultiplicity = relationship.toMultiplicity ? `"${relationship.toMultiplicity}" ` : '';
      lines.push(
        `  ${from}${fromMultiplicity} ${relationshipArrow[relationship.kind] ?? '-->'} ${toMultiplicity}${to}${label}`,
      );
    }
    return lines.join('\n');
  }

  // Lightweight local pre-validation only: a cheap, fast-fail structural
  // check before the source ever reaches the real renderer. It is NOT a
  // Mermaid/PlantUML grammar and never establishes compatibility on its own —
  // the renderer (Kroki) is the compatibility authority (see DiagramProvider).
  validate(format: DiagramFormat, source: string): void {
    const valid =
      format === 'MERMAID_ER'
        ? source.startsWith('erDiagram\n') && !/[<>;]/.test(source)
        : format === 'MERMAID_CLASS'
          ? source.startsWith('classDiagram\n') && !source.includes(';')
          : format === 'MERMAID_FLOWCHART'
            ? // No '<>;' block here: '>' is required by the flowchart's own
              // "-->" arrow syntax. As with PLANTUML below, this is a cheap
              // structural pre-check only — the real renderer + sanitizeDiagramSvg()
              // are the compatibility/security authority (see class doc comment).
              source.startsWith('flowchart TD\n')
            : source.startsWith('@startuml\n') &&
              source.endsWith('\n@enduml') &&
              !source.includes('!include') &&
              !source.includes('!pragma');
    if (!valid || source.length > 250_000)
      throw new UnprocessableEntityException('Fuente de diagrama no válida.');
  }
}
