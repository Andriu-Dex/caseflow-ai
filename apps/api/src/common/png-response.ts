import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

// Shared by every diagram-serving controller: PNG is always re-derived on
// demand (spec §4.8), so every route that exposes it streams it the same way.
export function pngResponse(response: Response, filename: string, png: Buffer): StreamableFile {
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.setHeader('Content-Type', 'image/png');
  return new StreamableFile(png);
}
