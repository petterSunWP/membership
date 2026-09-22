import { createAIClient } from './ai.client.js';
import {
  aiTools,
  executeAITool,
  getAITool
} from './tools/tool.registry.js';
import { createPendingAction } from './pending-action.service.js';

const SYSTEM_INSTRUCTIONS = `
You are an AI assistant for a retail membership management system.

Rules:
- Only answer business-data questions using the provided tools.
- Never invent business data.
- If the requested capability is not available through the provided tools,
  clearly say that the system does not currently support it.
- Answer in the same language as the user.
- Keep answers concise and practical.
- Answer only what the user asked.
- You may call multiple tools when needed.
- Use results from earlier tools to decide whether another tool is required.

Action rules:
- If the user explicitly asks to perform an action and an appropriate action tool is available, call that action tool.
- Do not ask the user for confirmation yourself before calling the action tool.
- The backend is responsible for determining whether confirmation is required.
- Never claim an action has been completed unless the tool result explicitly says it was completed.
`;

const MAX_TOOL_STEPS = 5;

export async function askAI(
  message: string,
  staffUserId: number
) {
  const { client, model, provider } = createAIClient();

  let input: any[] = [
    {
      role: 'user',
      content: message,
    },
  ];

  const toolsUsed: string[] = [];

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_INSTRUCTIONS,
      input,
      tools: aiTools,
      tool_choice: 'auto',
    });

    const toolCalls = response.output.filter(
      (item: any) => item.type === 'function_call'
    ) as any[];

    if (toolCalls.length === 0) {
      return {
        provider,
        answer: response.output_text,
        toolsUsed,
        confirmationRequired: false,
      };
    }

    input.push(...toolCalls);

    for (const toolCall of toolCalls) {
      const args = toolCall.arguments
        ? JSON.parse(toolCall.arguments)
        : {};

      const tool = getAITool(toolCall.name);

      // -----------------------------
      // ACTION TOOL
      // -----------------------------
      if (
        tool.accessType === 'ACTION' &&
        tool.requiresConfirmation
      ) {
        const pendingAction = await createPendingAction({
          staffUserId,
          toolName: toolCall.name,
          args,
        });

        toolsUsed.push(toolCall.name);

        // 告诉 AI：这个动作没有执行，只是进入待确认状态
        input.push({
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: JSON.stringify({
            executed: false,
            confirmationRequired: true,
            pendingActionId: pendingAction.id,
            status: pendingAction.status,
            message:
              'The action has NOT been executed. User confirmation is required.',
          }),
        });

        const confirmationResponse =
          await client.responses.create({
            model,

            instructions: `
You are an AI assistant for a retail membership management system.

The requested action has NOT been executed.

Explain briefly what the user requested and clearly ask for confirmation.

Do not claim the action is completed.
Do not invent business data.
Answer in the same language as the user.
`,

            input,
            tools: aiTools,
            tool_choice: 'none',
          });

        return {
          provider,
          answer: confirmationResponse.output_text,
          toolsUsed,
          confirmationRequired: true,
          pendingActionId: pendingAction.id,
        };
      }

      // -----------------------------
      // READ TOOL
      // -----------------------------
      const toolResult = await executeAITool(
        toolCall.name,
        args
      );

      toolsUsed.push(toolCall.name);

      input.push({
        type: 'function_call_output',
        call_id: toolCall.call_id,
        output: JSON.stringify(toolResult),
      });
    }
  }

  throw new Error(
    `AI exceeded maximum tool steps: ${MAX_TOOL_STEPS}`
  );
}