import { describe, expect, it } from 'vitest';
import { sanitizeDiagramSvg, SvgSanitizationError } from './svg-sanitizer';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${body}</svg>`;

describe('sanitizeDiagramSvg', () => {
  it('preserves a legitimate graphical diagram (shapes, markers, style, text)', () => {
    const input = svg(
      '<defs><marker id="m" refX="0" refY="9" markerWidth="18" markerHeight="18" orient="auto"><path d="M9,0 L9,18"></path></marker></defs>' +
        '<style>#container{font-family:trebuchet ms;}</style>' +
        '<g class="node"><rect x="0" y="0" width="5" height="5" fill="#fff" stroke="#333"></rect>' +
        '<circle cx="1" cy="1" r="1"></circle>' +
        '<text x="1" y="2" font-size="13">Customer</text>' +
        '<path d="M0,0 L1,1" marker-end="url(#m)"></path></g>',
    );
    const output = sanitizeDiagramSvg(input);
    expect(output).toContain('<svg');
    expect(output).toContain('<marker');
    expect(output).toContain('<style>#container{font-family:trebuchet ms;}</style>');
    expect(output).toContain('<rect');
    expect(output).toContain('<circle');
    expect(output).toContain('Customer');
    expect(output).toContain('marker-end="url(#m)"');
  });

  it('preserves foreignObject text-flow content required by Mermaid ER labels', () => {
    const input = svg(
      '<foreignObject width="20" height="20"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="text-align:center"><span class="nodeLabel"><p>Order</p></span></div></foreignObject>',
    );
    const output = sanitizeDiagramSvg(input);
    expect(output).toContain('<foreignObject');
    expect(output).toContain('<div');
    expect(output).toContain('<p>Order</p>');
  });

  it('strips <script> elements and their content entirely', () => {
    const output = sanitizeDiagramSvg(svg('<script>alert(document.cookie)</script><g></g>'));
    expect(output).not.toContain('<script');
    expect(output).not.toContain('alert');
  });

  it('strips inline event handlers (onload/onerror) while keeping the element', () => {
    const output = sanitizeDiagramSvg(
      svg('<rect x="0" y="0" width="1" height="1" onload="alert(1)" onerror="alert(2)"></rect>'),
    );
    expect(output).toContain('<rect');
    expect(output).not.toMatch(/onload|onerror/i);
    expect(output).not.toContain('alert');
  });

  it('strips javascript: URLs regardless of the attribute carrying them', () => {
    const output = sanitizeDiagramSvg(
      svg('<a href="javascript:alert(1)"><text x="0" y="0">click</text></a>'),
    );
    expect(output).not.toContain('<a');
    expect(output).not.toContain('javascript:');
  });

  it('strips external href/src references (no network egress from a rendered diagram)', () => {
    const output = sanitizeDiagramSvg(
      svg(
        '<image href="https://evil.test/pixel.png" width="1" height="1"></image>' +
          '<foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://evil.test/x.png"/></div></foreignObject>',
      ),
    );
    expect(output).not.toContain('evil.test');
    expect(output).not.toContain('<image');
    expect(output).not.toContain('<img');
  });

  it('strips embedded HTML attempts (iframe/object/embed/base/meta/link)', () => {
    const output = sanitizeDiagramSvg(
      svg(
        '<foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml">' +
          '<iframe src="https://evil.test"></iframe><object data="https://evil.test"></object>' +
          '<embed src="https://evil.test"></embed></div></foreignObject>' +
          '<base href="https://evil.test"/><link rel="stylesheet" href="https://evil.test/x.css"/>',
      ),
    );
    for (const tag of ['iframe', 'object', 'embed', 'base', 'link'])
      expect(output.toLowerCase()).not.toContain(`<${tag}`);
    expect(output).not.toContain('evil.test');
  });

  it('strips style attribute values that reference external resources or expressions', () => {
    const output = sanitizeDiagramSvg(
      svg(
        '<rect x="0" y="0" width="1" height="1" style="fill:url(https://evil.test/x.svg#a)"></rect>' +
          '<rect x="0" y="0" width="1" height="1" style="behavior:expression(alert(1))"></rect>',
      ),
    );
    expect(output).not.toContain('evil.test');
    expect(output).not.toContain('expression(');
  });

  it('escapes attacker-controlled entity/actor/relationship label text instead of executing it', () => {
    const output = sanitizeDiagramSvg(
      svg(
        '<text x="0" y="0">&lt;script&gt;alert(1)&lt;/script&gt;</text>' +
          '<foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml"><p>"; DROP TABLE x; --</p></div></foreignObject>',
      ),
    );
    expect(output).not.toMatch(/<script>/);
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain('DROP TABLE');
  });

  it('rejects output whose root is not an SVG document', () => {
    expect(() => sanitizeDiagramSvg('<html><body>not a diagram</body></html>')).toThrow(
      SvgSanitizationError,
    );
  });

  it('rejects unparseable XML', () => {
    expect(() => sanitizeDiagramSvg('<svg><g></svg>')).toThrow(SvgSanitizationError);
  });
});
