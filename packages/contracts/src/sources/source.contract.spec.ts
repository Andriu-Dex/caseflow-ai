import { describe, expect, it } from 'vitest';
import {
  SELECTABLE_SOURCE_KINDS,
  sourceKindAcceptsMimeType,
  sourceKindForMimeType,
} from './source.contract';

describe('source kinds and file formats', () => {
  it('no longer offers the retired form and invoice kinds', () => {
    expect(SELECTABLE_SOURCE_KINDS).toEqual(['PDF', 'AUDIO', 'IMAGE', 'TEXT', 'NOTES', 'OTHER']);
  });

  it('detects the kind a file belongs to', () => {
    expect(sourceKindForMimeType('application/pdf')).toBe('PDF');
    expect(
      sourceKindForMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('TEXT');
    expect(sourceKindForMimeType('image/webp')).toBe('IMAGE');
    expect(sourceKindForMimeType('audio/x-m4a')).toBe('AUDIO');
    expect(sourceKindForMimeType('application/zip')).toBeNull();
  });

  it('accepts only the formats of each kind', () => {
    expect(sourceKindAcceptsMimeType('AUDIO', 'audio/mpeg')).toBe(true);
    expect(sourceKindAcceptsMimeType('AUDIO', 'application/pdf')).toBe(false);
    expect(sourceKindAcceptsMimeType('NOTES', 'text/plain')).toBe(false);
    expect(sourceKindAcceptsMimeType('OTHER', 'image/png')).toBe(true);
    expect(sourceKindAcceptsMimeType('OTHER', 'application/zip')).toBe(false);
    // Existing sources of the retired kinds keep any allowed file.
    expect(sourceKindAcceptsMimeType('INVOICE', 'application/pdf')).toBe(true);
  });
});
