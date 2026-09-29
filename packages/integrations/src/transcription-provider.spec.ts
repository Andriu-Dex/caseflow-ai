import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleTranscriptionProvider } from './transcription-provider';

describe('OpenAICompatibleTranscriptionProvider', () => {
  it('sends audio to the configured endpoint and returns only transcription text', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'Entrevista registrada' }), { status: 200 }),
      );
    try {
      const provider = new OpenAICompatibleTranscriptionProvider({
        baseUrl: 'https://transcription.example/v1/',
        apiKey: 'test-secret',
        model: 'test-model',
        timeoutMs: 1000,
      });
      await expect(
        provider.transcribe({
          data: Buffer.from('audio'),
          mimeType: 'audio/mpeg',
          filename: 'a.mp3',
        }),
      ).resolves.toBe('Entrevista registrada');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://transcription.example/v1/audio/transcriptions',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects an empty transcript', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: ' ' }), { status: 200 }));
    try {
      const provider = new OpenAICompatibleTranscriptionProvider({
        baseUrl: 'https://transcription.example/v1',
        apiKey: 'test-secret',
        model: 'test-model',
        timeoutMs: 1000,
      });
      await expect(
        provider.transcribe({
          data: Buffer.from('audio'),
          mimeType: 'audio/mpeg',
          filename: 'a.mp3',
        }),
      ).rejects.toThrow('no text');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
