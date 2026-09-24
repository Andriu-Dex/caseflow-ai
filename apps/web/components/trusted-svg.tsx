// Trusted diagram/mockup rendering boundary (spec Phase I "Diagram display
// component"). This component renders raw SVG markup via dangerouslySetInnerHTML
// and MUST ONLY ever receive `svg` that came directly from a CASEFlow backend
// response for a deterministic generated artifact (Use Case/ER/Navigation/
// Software/System Architecture diagram, or a Mockup preview) — every such
// value already passed the backend's XML-based sanitizeDiagramSvg() boundary
// (apps/api/src/data-models/svg-sanitizer.ts) before being persisted.
//
// This is NOT a generic arbitrary-SVG renderer. Never pass user-typed text,
// a Source's raw content, or any other untrusted string here.
export function TrustedDiagram({ svg, caption }: { svg: string; caption?: string }) {
  return (
    <figure className="overflow-auto rounded-lg border border-gray-200 bg-white p-4">
      {/* Trusted backend-sanitized SVG only — see module doc above. */}
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {caption ? <figcaption className="mt-2 text-xs text-gray-500">{caption}</figcaption> : null}
    </figure>
  );
}
