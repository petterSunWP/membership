import {
  dashboardToolDefinition,
  executeDashboardTool,
} from './dashboard.tool.js';

import {
  searchMemberToolDefinition,
  executeSearchMemberTool,
  getMemberDetailToolDefinition,
  executeGetMemberDetailTool,
  getAvailableRewardsToolDefinition,
  executeGetAvailableRewardsTool,
} from './member.tool.js';

import {
  redeemRewardToolDefinition,
  executeRedeemRewardTool,
} from './redemption.tool.js';

export type AIToolAccessType =
  | 'READ'
  | 'ACTION';

const toolRegistry = {
  get_staff_dashboard: {
    definition: dashboardToolDefinition,
    accessType: 'READ' as const,
    requiresConfirmation: false,
    execute: async (_args: any) =>
      executeDashboardTool(),
  },

  search_member: {
    definition: searchMemberToolDefinition,
    accessType: 'READ' as const,
    requiresConfirmation: false,
    execute: async (args: any) =>
      executeSearchMemberTool(args),
  },

  get_member_detail: {
    definition: getMemberDetailToolDefinition,
    accessType: 'READ' as const,
    requiresConfirmation: false,
    execute: async (args: any) =>
      executeGetMemberDetailTool(args),
  },

  get_available_rewards: {
    definition: getAvailableRewardsToolDefinition,
    accessType: 'READ' as const,
    requiresConfirmation: false,
    execute: async (args: any) =>
      executeGetAvailableRewardsTool(args),
  },

  redeem_reward: {
    definition: redeemRewardToolDefinition,
    accessType: 'ACTION' as const,
    requiresConfirmation: true,

    execute: async (args: any) =>
      executeRedeemRewardTool(args),
  },
};

export const aiTools = Object.values(
  toolRegistry
).map((tool) => tool.definition);

export function getAITool(
  toolName: string
) {
  const tool =
    toolRegistry[
      toolName as keyof typeof toolRegistry
    ];

  if (!tool) {
    throw new Error(
      `Unsupported AI tool: ${toolName}`
    );
  }

  return tool;
}

export async function executeAITool(
  toolName: string,
  args: any
) {
  const tool = getAITool(toolName);

  return tool.execute(args);
}