import { describe, expect, it, vi } from 'vitest';
import { MockupsController } from './mockups.controller';
import { InternalMockupJobsController } from './internal-mockup-jobs.controller';
import type { MockupsService } from './mockups.service';
import type { Response } from 'express';

describe('MockupsController', () => {
  it('delegates every route', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({}),
      getJob: vi.fn().mockResolvedValue({}),
      getPreview: vi.fn().mockResolvedValue({}),
      version: vi.fn().mockResolvedValue({}),
      transition: vi.fn().mockResolvedValue({}),
      downloadScreenImage: vi.fn().mockResolvedValue({
        body: Buffer.from('png'),
        contentType: 'image/png',
        fileName: 'inicio.png',
      }),
      downloadScreenHtml: vi.fn().mockResolvedValue({ body: Buffer.from('<html>') }),
    };
    const controller = new MockupsController(service as unknown as MockupsService);

    await controller.create('p', { uiBlueprintVersionId: 'b', deviceType: 'DESKTOP' });
    await controller.list('p');
    await controller.get('p', 'm');
    await controller.getJob('p', 'j');
    await controller.preview('p', 'm');
    await controller.version('p', 'm', { uiBlueprintVersionId: 'b2', deviceType: 'MOBILE' });
    await controller.transition('p', 'm', 'v', { status: 'IN_REVIEW' });
    const response = { setHeader: vi.fn(), send: vi.fn() } as unknown as Response;
    await controller.screenImage('p', 'm', 's', response);
    await controller.screenHtml('p', 'm', 's', response);

    expect(service.create).toHaveBeenCalledWith('p', 'b', 'DESKTOP');
    expect(service.list).toHaveBeenCalledWith('p');
    expect(service.get).toHaveBeenCalledWith('p', 'm');
    expect(service.getJob).toHaveBeenCalledWith('p', 'j');
    expect(service.getPreview).toHaveBeenCalledWith('p', 'm');
    expect(service.version).toHaveBeenCalledWith('p', 'm', 'b2', 'MOBILE');
    expect(service.transition).toHaveBeenCalledWith('p', 'm', 'v', 'IN_REVIEW');
    expect(service.downloadScreenImage).toHaveBeenCalledWith('p', 'm', 's');
    expect(service.downloadScreenHtml).toHaveBeenCalledWith('p', 'm', 's');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="pantalla.html"',
    );
  });

  it('runs an internal job only when the shared secret header matches', async () => {
    const service = { runJob: vi.fn().mockResolvedValue(undefined) };
    const controller = new InternalMockupJobsController(service as unknown as MockupsService);
    const originalSecret = process.env.INTERNAL_JOBS_SECRET;
    process.env.INTERNAL_JOBS_SECRET = 'shh';

    await expect(controller.runJob('j', 'wrong')).rejects.toThrow();
    await expect(controller.runJob('j', undefined)).rejects.toThrow();
    expect(service.runJob).not.toHaveBeenCalled();

    await controller.runJob('j', 'shh');
    expect(service.runJob).toHaveBeenCalledWith('j');

    delete process.env.INTERNAL_JOBS_SECRET;
    await expect(controller.runJob('j', 'shh')).rejects.toThrow();

    process.env.INTERNAL_JOBS_SECRET = originalSecret;
  });
});
