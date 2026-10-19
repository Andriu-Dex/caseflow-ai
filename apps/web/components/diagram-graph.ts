// What the viewer can highlight: the elements of a rendered diagram and the
// lines between them, read from the markup the renderer leaves in the SVG.
// PlantUML marks each line with data-entity-1/2 and gives each element an id;
// Mermaid's ER renderer names each line after the two entities it joins. A
// diagram drawn by anything else has no graph, so it has no highlighting.
export interface DiagramGraph {
  nodes: { key: string; el: SVGElement }[];
  // A line, and the label that goes with it, if the renderer drew one apart.
  links: { els: SVGElement[]; keys: string[] }[];
}

// Mermaid prefixes every id with the id of the <svg> itself.
const unprefixed = (svg: Element | null, id: string) => {
  const prefix = svg?.id ? `${svg.id}-` : '';
  return prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
};

export function readGraph(root: Element): DiagramGraph | null {
  const svg = root.querySelector('svg');
  if (root.querySelector('g.link[data-entity-1]')) {
    return {
      nodes: [...root.querySelectorAll<SVGElement>('g.entity')].map((el) => ({ key: el.id, el })),
      links: [...root.querySelectorAll<SVGElement>('g.link')].map((el) => ({
        els: [el],
        keys: [el.getAttribute('data-entity-1'), el.getAttribute('data-entity-2')].filter(
          (key): key is string => !!key,
        ),
      })),
    };
  }
  if (root.querySelector('path[data-edge="true"][data-id^="id_entity-"]')) {
    const nodes = [...root.querySelectorAll<SVGElement>('g.node')].map((el) => ({
      key: unprefixed(svg, el.id),
      el,
    }));
    const labels = [...root.querySelectorAll<SVGElement>('g.label[data-id]')];
    return {
      nodes,
      links: [...root.querySelectorAll<SVGElement>('path[data-edge="true"][data-id]')].map(
        (path) => {
          const id = path.getAttribute('data-id')!;
          return {
            els: [
              path,
              ...labels
                .filter((label) => label.getAttribute('data-id') === id)
                .map((label) => (label.closest('g.edgeLabel') as SVGElement | null) ?? label),
            ],
            // The line's id is "id_<entity>_<entity>_<n>".
            keys: nodes.filter((node) => id.includes(`_${node.key}_`)).map((node) => node.key),
          };
        },
      ),
    };
  }
  return null;
}

// The key of the diagram element under the pointer, if any.
export function nodeKeyAt(target: EventTarget | null): string | null {
  const el = (target as Element | null)?.closest?.('g.entity, g.node');
  if (!el) return null;
  return el.classList.contains('entity') ? el.id : unprefixed(el.closest('svg'), el.id);
}
