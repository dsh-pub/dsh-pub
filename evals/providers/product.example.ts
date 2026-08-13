type ProviderOptions = {
  config?: {
    baseUrl?: string;
    model?: string;
    providerVersion?: string;
  };
};

type ProductResponse = {
  output?: unknown;
  model?: unknown;
  tokenUsage?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  costUsd?: number;
};

const REQUEST_TIMEOUT_MS = 60_000;

export default class ProductApiProvider {
  private readonly options: ProviderOptions;

  constructor(options: ProviderOptions = {}) {
    this.options = options;
  }

  id(): string {
    return this.options.config?.providerVersion ?? 'product-api-v1';
  }

  async callApi(prompt: string): Promise<{
    output?: string;
    error?: string;
    tokenUsage?: ProductResponse['tokenUsage'];
    cost?: number;
    metadata?: Record<string, string>;
  }> {
    const configuredBaseUrl = this.options.config?.baseUrl ?? process.env.PRODUCT_EVAL_BASE_URL;

    if (!configuredBaseUrl) {
      return { error: 'PRODUCT_EVAL_BASE_URL is required' };
    }

    const url = new URL('/api/ai/respond', configuredBaseUrl);
    const token = process.env.PRODUCT_EVAL_TOKEN;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          input: prompt,
          evaluation: true,
          model: this.options.config?.model,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        return { error: `Product API returned HTTP ${response.status}` };
      }

      const result = (await response.json()) as ProductResponse;
      if (typeof result.output !== 'string') {
        return { error: 'Product API response is missing a string output' };
      }

      return {
        output: result.output,
        ...(result.tokenUsage ? { tokenUsage: result.tokenUsage } : {}),
        ...(typeof result.costUsd === 'number' ? { cost: result.costUsd } : {}),
        metadata: {
          model:
            typeof result.model === 'string'
              ? result.model
              : (this.options.config?.model ?? 'unknown'),
          providerVersion: this.id(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: `Product API request failed: ${message}` };
    }
  }
}
