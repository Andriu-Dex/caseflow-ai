import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { hasOnlyThrowingPaths } from './business-flow';
const rejectsAll = (body: string) =>
  hasOnlyThrowingPaths(
    ts.createSourceFile('body.ts', body, ts.ScriptTarget.Latest, true).statements,
  );
describe('unavailable business flow detection', () => {
  it('rejects permanent rejections, guarded permanent rejections and unreachable success', () => {
    expect(rejectsAll('throw new Error("pending");')).toBe(true);
    expect(
      rejectsAll('if (!actor) throw new Error("session"); throw new Error("contract missing");'),
    ).toBe(true);
    expect(
      rejectsAll('if (input) { throw new Error("A"); } else { throw new Error("B"); } return {};'),
    ).toBe(true);
    expect(rejectsAll('const helper=()=>{return {ok:true}}; throw new Error("pending");')).toBe(
      true,
    );
  });
  it('preserves successful branches, normal completion and complex flows requiring execution tests', () => {
    expect(rejectsAll('if (!input) throw new Error("invalid"); return input;')).toBe(false);
    expect(rejectsAll('if (input) return input; throw new Error("missing");')).toBe(false);
    expect(rejectsAll('await this.prisma.order.update({});')).toBe(false);
    expect(
      rejectsAll(
        'for(const item of items) { if(item.valid) return item; } throw new Error("missing");',
      ),
    ).toBe(false);
  });
});
