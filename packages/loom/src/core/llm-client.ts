export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface LlmProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

function detectProvider(): LlmProviderConfig | null {
  if (process.env.KIMI_API_KEY) {
    return {
      apiKey: process.env.KIMI_API_KEY,
      baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
      defaultModel: 'kimi-latest',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
    };
  }
  return null;
}

export async function callLlm(messages: LlmMessage[], options?: LlmCallOptions): Promise<string> {
  const provider = detectProvider();
  if (!provider) {
    throw new Error(
      'No LLM API key found. Please set one of the following environment variables: KIMI_API_KEY, OPENAI_API_KEY.'
    );
  }

  const model = options?.model || provider.defaultModel;
  const url = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.5,
      max_tokens: options?.maxTokens ?? 1024,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(`LLM API error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('LLM API returned empty content.');
  }
  return content;
}
