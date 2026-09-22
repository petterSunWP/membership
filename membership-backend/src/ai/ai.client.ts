import OpenAI from 'openai';

export type AIProvider = 'openai' | 'deepseek';

export function createAIClient() {
  const provider =
    (process.env.AI_PROVIDER as AIProvider) ?? 'deepseek';

  if (provider === 'deepseek') {
    return {
      provider,
      client: new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL,
      }),
      model: process.env.DEEPSEEK_MODEL!,
    };
  }

  return {
    provider,
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    model: process.env.OPENAI_MODEL!,
  };
}