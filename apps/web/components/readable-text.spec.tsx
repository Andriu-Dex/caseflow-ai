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
