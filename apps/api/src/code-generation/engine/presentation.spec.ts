import { describe, expect, it } from 'vitest';
import {
  applyPresentation,
  presentationSchema,
  presentationSources,
  validatePresentation,
  type ScreenPresentation,
} from './presentation';
import { applyPresentationShell } from './presentation-shell';
import type { GeneratedProjectFile } from './types';

const page = `'use client';
import { useForm } from 'react-hook-form';
export default function Page() {
  const { register, handleSubmit } = useForm();
  async function save(values: unknown) { await api.createRecord(values); }
  return <div className="max-w-xl"><h1>Crear registro</h1><form onSubmit={handleSubmit(save)}>
    <div><label htmlFor="name">Nombre</label><input id="name" {...register('name')} /><FieldError /></div>
    <Button type="submit" data-caseflow-action="Guardar">Guardar</Button>
  </form><PageState query={query}>{rows => <table>{rows.map(row => <tr key={row.id}><td>{row.name}</td></tr>)}</table>}</PageState></div>;
}`;

function layout(content = page): ScreenPresentation {
  const sources = presentationSources(content);
  return {
    navigation: 'TOP',
    limitations: [],
    nodes: [
      {
        id: 'root',
        parentId: null,
        kind: 'CONTAINER',
        tag: 'section',
        sourceId: null,
        className: 'mx-auto max-w-5xl space-y-6',
      },
      ...sources.map((source) => ({
        id: source.id,
        parentId: source.frames.at(-1) ?? 'root',
        kind: source.kind,
        tag: null,
        sourceId: source.id,
        className: source.kind === 'FRAME' ? 'grid gap-4 md:grid-cols-2' : 'rounded-lg border p-4',
      })),
    ],
  };
}

describe('approved presentation compiler', () => {
  it('restores nullable references after the orchestrator removes null properties', () => {
    const value = layout();
    const normalized = JSON.parse(
      JSON.stringify(value, (_key, item) => (item === null ? undefined : item)),
    );
    const parsed = presentationSchema.parse(normalized);
    expect(parsed).toEqual(value);
    expect(() => validatePresentation(parsed, presentationSources(page))).not.toThrow();
  });
  it('changes layout while retaining every query, validator, action and form scope', () => {
    const sources = presentationSources(page);
    expect(sources.map((source) => source.kind)).toEqual(['SLOT', 'FRAME', 'SLOT', 'SLOT', 'SLOT']);
    const rendered = applyPresentation(page, layout());
    expect(rendered).toContain('mx-auto max-w-5xl');
    expect(rendered).toContain('await api.createRecord(values)');
    expect(rendered).toContain('onSubmit={handleSubmit(save)}');
    expect(rendered).toContain("register('name')");
    expect(rendered).toContain('data-caseflow-action="Guardar"');
    expect(rendered).toContain('rows.map(row =>');
    expect(rendered).not.toContain('<PageState className');
  });
  it('accepts semantic border colors without mistaking border for an order utility', () => {
    const value = layout();
    value.nodes[0]!.className = 'rounded-xl border border-border border-t-primary bg-card';
    expect(() => validatePresentation(value, presentationSources(page))).not.toThrow();
  });
  it('keeps dynamic form classes and their controls in a valid form', () => {
    const dynamic = page.replace(
      '<form onSubmit=',
      '<form className={compact ? "grid" : "flex"} onSubmit=',
    );
    const rendered = applyPresentation(dynamic, layout(dynamic));
    expect(rendered).toContain('compact ? "grid" : "flex"');
    expect(rendered).toContain('.join(" ")');
    expect(rendered).toContain("register('name')");
    expect(rendered).toContain('onSubmit={handleSubmit(save)}');
  });
  it('styles conditional feedback only when the original feedback exists', () => {
    const conditional = page.replace(
      '</form><PageState',
      '</form>{error ? <p role="alert">{error}</p> : null}<PageState',
    );
    const rendered = applyPresentation(conditional, layout(conditional));
    expect(rendered).toContain('error ? <div');
    expect(rendered).toContain(': null');
    expect(rendered).toContain('role="alert"');
  });
  it('rejects omitted, duplicated, detached, cyclic and unknown controls', () => {
    for (const mutate of [
      (value: ScreenPresentation) => {
        value.nodes.pop();
      },
      (value: ScreenPresentation) => {
        value.nodes.push({ ...value.nodes[1]!, id: 'duplicate' });
      },
      (value: ScreenPresentation) => {
        value.nodes[3]!.parentId = 'root';
      },
      (value: ScreenPresentation) => {
        value.nodes[0]!.parentId = 'source-1';
      },
      (value: ScreenPresentation) => {
        value.nodes[1]!.sourceId = 'unknown';
      },
      (value: ScreenPresentation) => {
        value.nodes[1]!.parentId = 'absent';
      },
    ]) {
      const value = layout();
      mutate(value);
      expect(() => validatePresentation(value, presentationSources(page))).toThrow();
    }
  });
  it.each([
    'hidden',
    'opacity-0',
    'md:order-1',
    'overflow-clip',
    'w-[0px]',
    'bg-[url(https://host/x)]',
    'before:content-[secret]',
    'fixed',
    'pointer-events-none',
    'h-0',
    'text-transparent',
    'bg-red;display:none',
  ])('rejects hiding, injected content and external styles: %s', (className) => {
    const value = layout();
    value.nodes[0]!.className = className;
    expect(() => applyPresentation(page, value)).toThrow();
  });
  it('does not splice markup from text or alter code outside the return statement', () => {
    const value = layout();
    value.nodes[0]!.className = 'p-4 bg-[#fafafa]';
    const rendered = applyPresentation(page, value);
    expect(rendered.slice(0, rendered.indexOf('return '))).toBe(
      page.slice(0, page.indexOf('return ')),
    );
    expect(() =>
      applyPresentation(page, {
        ...value,
        nodes: [{ ...value.nodes[0]!, className: '" onClick={evil()}' }],
      }),
    ).toThrow();
  });
  it('applies per-route navigation using AST without duplicating global navigation or dropping providers', () => {
    const files: GeneratedProjectFile[] = [
      {
        path: 'apps/web/app/layout.tsx',
        origin: 'TEMPLATE',
        kind: 'SOURCE',
        planElements: [],
        content: `import { AppNav } from '../components/app-nav'; import { Providers } from './providers'; export default function Root({children}: {children: React.ReactNode}) { return <html><body><Providers><div><aside><AppNav /></aside><main>{children}</main></div></Providers></body></html>; }`,
      },
    ];
    applyPresentationShell(
      files,
      [
        { routePath: '/login', navigation: 'NONE' },
        { routePath: '/orders', navigation: 'TOP' },
      ],
      'Tienda',
      false,
    );
    expect(files[0]!.content).toContain('<PresentationShell>{children}</PresentationShell>');
    expect(files[0]!.content).toContain('<Providers>');
    expect(files[0]!.content).not.toContain('<AppNav');
    expect(files[1]!.content).toContain('TOP');
    expect(files[1]!.content).toContain("placement === 'NONE'");
  });
});
