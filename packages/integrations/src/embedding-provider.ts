export interface EmbeddingProvider {
  /**
   * Generates embeddings for an array of texts.
   * @param texts Array of strings to embed.
   * @returns Promise resolving to an array of number arrays representing embeddings.
   */
  embed(texts: string[]): Promise<number[][]>;
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  private dimension: number;

  constructor(dimension = 1536) {
    this.dimension = dimension;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => Array(this.dimension).fill(0.1) as number[]);
  }
}

export class DisabledEmbeddingProvider implements EmbeddingProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error('EmbeddingProvider is disabled');
  }
}
