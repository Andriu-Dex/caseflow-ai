import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ReadableText, structureText } from './readable-text';

describe('structureText', () => {
  it('turns raw extracted lines into headings, lists and paragraphs', () => {
    expect(
      structureText(
        [
          'NORMAS Y ESTÁNDARES',
          'Las normas proporcionan un marco de referencia para',
          'garantizar la calidad y la seguridad de la informa-',
          'ción del proyecto.',
          '',
          '1. CALIDAD DEL SOFTWARE',
          '=> ISO/IEC 25010',
          '- ISO 9001',
          'Modelo de calidad del producto.',
        ].join('\n'),
      ),
    ).toEqual([
      { type: 'heading', text: 'NORMAS Y ESTÁNDARES' },
      {
        type: 'paragraph',
        text: 'Las normas proporcionan un marco de referencia para garantizar la calidad y la seguridad de la información del proyecto.',
      },
      { type: 'heading', text: '1. CALIDAD DEL SOFTWARE' },
      { type: 'list', items: ['ISO/IEC 25010', 'ISO 9001'] },
      { type: 'paragraph', text: 'Modelo de calidad del producto.' },
    ]);
  });
});

describe('ReadableText as a document', () => {
  it('renders Markdown headings, lists and tables, and never the HTML inside the text', () => {
    render(
      <ReadableText
        label="texto de la fuente"
        text={[
          '# Normas y estándares',
          'Texto con [enlace](https://example.com) y [otro](javascript:alert(1)).',
          '- ISO 9001',
          '| Norma | Área |\n| --- | --- |\n| ISO 27001 | Seguridad |',
          '<img src=x onerror="alert(1)"><script>alert(1)</script>',
        ].join('\n\n')}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Normas y estándares' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('ISO 9001');
    expect(screen.getByRole('cell', { name: 'ISO 27001' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'enlace' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.queryByRole('link', { name: 'otro' })?.getAttribute('href') ?? '').not.toMatch(
      /javascript/,
    );
    expect(document.querySelector('img, script')).toBeNull();
  });

  it('rebuilds the structure of text extracted before it was kept as Markdown', () => {
    render(<ReadableText label="texto" text={'NORMAS Y ESTÁNDARES\nLas normas guían.\n=> ISO'} />);
    expect(screen.getByRole('heading', { name: 'NORMAS Y ESTÁNDARES' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('ISO');
  });
});

describe('ReadableText', () => {
  it('finds words ignoring case and accents, and counts them', async () => {
    const user = userEvent.setup();
    render(
      <ReadableText
        label="texto de la fuente"
        text={'Gestión de la información.\nInformacion clave.'}
      />,
    );
    await user.type(screen.getByLabelText('Buscar en texto de la fuente'), 'informacion');
    expect(screen.getByText('2 coincidencias')).toBeInTheDocument();
    expect([...document.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
      'información',
      'Informacion',
    ]);
  });
});
