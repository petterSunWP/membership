import 'dotenv/config';
import OpenAI from 'openai';
import { getStaffDashboard } from './services/dashboard.service.js';

const provider = process.env.AI_PROVIDER ?? 'deepseek';

function createAIClient() {
  if (provider === 'deepseek') {
    return {
      client: new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL,
      }),
      model: process.env.DEEPSEEK_MODEL!,
    };
  }

  return {
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    model: process.env.OPENAI_MODEL!,
  };
}

const tools = [
  {
    type: 'function' as const,
    name: 'get_staff_dashboard',
    description:
      'Get the current staff dashboard summary, including today orders, points earned, redemptions, points redeemed, and total active customers.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },
];

async function main() {
  const { client, model } = createAIClient();

  const userQuestion = '今天库存还剩多少？';

  const firstResponse = await client.responses.create({
    model,
    instructions: `
You are an AI assistant for a retail membership management system.

Rules:
- Only answer business-data questions using the provided tools.
- Never invent business data.
- If the requested capability is not available through the provided tools, clearly say that the system does not currently support it.
- Answer in the same language as the user.
`,
    input: userQuestion,
    tools,
    tool_choice: 'auto',
  });

  const toolCall = firstResponse.output.find(
    (item: any) =>
      item.type === 'function_call' &&
      item.name === 'get_staff_dashboard'
  ) as any;

  if (!toolCall) {
    console.log(firstResponse.output_text);
    return;
  }

  console.log('AI selected tool:', toolCall.name);

  const dashboard = await getStaffDashboard();

  const secondResponse = await client.responses.create({
    model,
    instructions: `
You are an AI assistant for a retail membership management system.

Use only the tool result provided to answer the user's question.
Never invent numbers.
Answer concisely in the same language as the user.
`,
    input: [
      {
        role: 'user',
        content: userQuestion,
      },

      {
      type: 'function_call',
      call_id: toolCall.call_id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      },

      {
        type: 'function_call_output',
        call_id: toolCall.call_id,
        output: JSON.stringify(dashboard),
      },
    ],
    tools,
  });

  console.log('Final answer:');
  console.log(secondResponse.output_text);
}

main().catch((error) => {
  console.error('AI tool test failed:');
  console.error(error);
  process.exit(1);
});