import { describe, expect, it } from 'vitest';
import { formatClassMembers, parseClassMembers } from './construction-manual-forms';

describe('class diagram member lines', () => {
  it('parses UML-style attributes and methods', () => {
    expect(
      parseClassMembers(
        '-correo: string\n+notas?: List<Nota>\n#pagar(monto: number, fecha): boolean\ncerrar()',
      ),
    ).toEqual({
      attributes: [
        { name: 'correo', type: 'string', visibility: 'PRIVATE', required: true },
        { name: 'notas', type: 'List<Nota>', visibility: 'PUBLIC', required: false },
      ],
      methods: [
        {
          name: 'pagar',
          visibility: 'PROTECTED',
          returnType: 'boolean',
          parameters: [
            { name: 'monto', type: 'number' },
            { name: 'fecha', type: 'string' },
          ],
        },
        { name: 'cerrar', visibility: 'PUBLIC', returnType: undefined, parameters: [] },
      ],
    });
  });

  it('round-trips through the editor text', () => {
    const text = '-correo: string\n+notas?: List<Nota>\n#pagar(monto: number): boolean';
    expect(formatClassMembers(parseClassMembers(text))).toBe(text);
  });
});
