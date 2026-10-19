import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { endpointKey } from './backend.templates';
import type { GeneratedProjectFile } from './types';

export type TraceLinkType = 'IMPLEMENTS' | 'TESTS' | 'CONFIGURES';

export interface PlannedTraceLink {
  path: string;
  sourceArtifactVersionId: string;
  planElement: string;
  linkType: TraceLinkType;
}

const linkTypeFor = (file: GeneratedProjectFile): TraceLinkType =>
  file.kind === 'TEST' ? 'TESTS' : file.kind === 'SOURCE' ? 'IMPLEMENTS' : 'CONFIGURES';

// Construction traceability (DEC-106) as explicit records, not comments:
// every file links to the exact Implementation Plan version (one link per plan
// element it implements) and to the frozen Design Baseline versions those
// elements cite. `frozenVersionsByCode` maps an artifact code (e.g. "UI-002")
// to the exact version the Design Baseline froze.
export function planTraceLinks(
  files: GeneratedProjectFile[],
  plan: ImplementationPlanContent,
  implementationPlanVersionId: string,
  frozenVersionsByCode: ReadonlyMap<string, string>,
): PlannedTraceLink[] {
  const citations = new Map<string, string[]>([
    ...plan.modules.map((m): [string, string[]] => [
      `module:${m.localId}`,
      m.relatedSourceCodes ?? [],
    ]),
    ...plan.entities.map((e): [string, string[]] => [
      `entity:${e.localId}`,
      e.relatedSourceCodes ?? [],
    ]),
    ...plan.routes.map((r): [string, string[]] => [`route:${r.path}`, r.relatedSourceCodes ?? []]),
    ...plan.customEndpoints.map((e): [string, string[]] => [
      `endpoint:${endpointKey(e)}`,
      e.relatedSourceCodes ?? [],
    ]),
  ]);
  const links = new Map<string, PlannedTraceLink>();
  const add = (link: PlannedTraceLink) =>
    links.set(`${link.path}|${link.sourceArtifactVersionId}|${link.planElement}`, link);

  for (const file of files) {
    const linkType = linkTypeFor(file);
    const elements = file.planElements.length ? file.planElements : ['project'];
    for (const planElement of elements) {
      add({
        path: file.path,
        sourceArtifactVersionId: implementationPlanVersionId,
        planElement,
        linkType,
      });
      // "design-theme:TEM-001" cites the frozen theme itself.
      const cited =
        citations.get(planElement) ??
        (planElement.startsWith('design-theme:')
          ? [planElement.slice('design-theme:'.length)]
          : []);
      for (const code of cited) {
        const versionId = frozenVersionsByCode.get(code);
        if (versionId)
          add({ path: file.path, sourceArtifactVersionId: versionId, planElement, linkType });
      }
    }
  }
  return [...links.values()];
}
