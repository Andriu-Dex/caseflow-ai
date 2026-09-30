export interface TranscriptionProvider {
  readonly id: string;
  readonly available: boolean;
  transcribe(input: { data: Buffer; mimeType: string; filename: string }): Promise<string>;
}

export class DisabledTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'disabled';
  readonly available = false;

  async transcribe(): Promise<never> {
    throw new Error('Transcription provider is not configured.');
  }
}

export class OpenAICompatibleTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'openai-compatible';
  readonly available = true;

  constructor(
    private readonly config: { baseUrl: string; apiKey: string; model: string; timeoutMs: number },
  ) {}

  async transcribe(input: { data: Buffer; mimeType: string; filename: string }): Promise<string> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.data)], { type: input.mimeType }),
      input.filename,
    );
    form.append('model', this.config.model);
    form.append('response_format', 'json');
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`Transcription service returned ${response.status}.`);
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('text' in payload) ||
      typeof payload.text !== 'string' ||
      !payload.text.trim()
    ) {
      throw new Error('Transcription service returned no text.');
    }
    return payload.text.trim();
  }
}
