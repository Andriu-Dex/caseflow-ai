import { describe, expect, it, vi } from 'vitest';
import { MockupsController } from './mockups.controller';
import type { MockupsService } from './mockups.service';
import type { Response } from 'express';

describe('MockupsController', () => {
  it('delegates every route', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({}),
      getPreview: vi.fn().mockResolvedValue({}),
      version: vi.fn().mockResolvedValue({}),
      transition: vi.fn().mockResolvedValue({}),
      downloadScreenImage: vi
        .fn()
        .mockResolvedValue({ body: Buffer.from('png'), contentType: 'image/png' }),
      downloadScreenHtml: vi.fn().mockResolvedValue({ body: Buffer.from('<html>') }),
    };
    const controller = new MockupsController(service as unknown as MockupsService);

    await controller.create('p', { uiBlueprintVersionId: 'b' });
    await controller.list('p');
    await controller.get('p', 'm');
    await controller.preview('p', 'm');
    await controller.version('p', 'm', { uiBlueprintVersionId: 'b2' });
    await controller.transition('p', 'm', 'v', { status: 'IN_REVIEW' });
    const response = { setHeader: vi.fn(), send: vi.fn() } as unknown as Response;
    await controller.screenImage('p', 'm', 's', response);
    await controller.screenHtml('p', 'm', 's', response);

    expect(service.create).toHaveBeenCalledWith('p', 'b');
    expect(service.list).toHaveBeenCalledWith('p');
    expect(service.get).toHaveBeenCalledWith('p', 'm');
    expect(service.getPreview).toHaveBeenCalledWith('p', 'm');
    expect(service.version).toHaveBeenCalledWith('p', 'm', 'b2');
    expect(service.transition).toHaveBeenCalledWith('p', 'm', 'v', 'IN_REVIEW');
    expect(service.downloadScreenImage).toHaveBeenCalledWith('p', 'm', 's');
    expect(service.downloadScreenHtml).toHaveBeenCalledWith('p', 'm', 's');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="pantalla.html"',
    );
  });
});
