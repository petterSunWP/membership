import { randomUUID } from 'crypto';
import { redeemReward } from '../../services/redemption.service.js';

export const redeemRewardToolDefinition = {
  type: 'function' as const,

  name: 'redeem_reward',

  description:
  'Request redemption of a specific active reward for a member when the user explicitly asks to redeem it. Call this tool after identifying the member and reward. The backend handles any required user confirmation before execution.',

  parameters: {
    type: 'object',
    properties: {
      userId: {
        type: 'number',
        description:
          'The member user ID returned by search_member.',
      },

      rewardId: {
        type: 'number',
        description:
          'The reward ID returned by get_available_rewards.',
      },
    },

    required: ['userId', 'rewardId'],
    additionalProperties: false,
  },

  strict: true,
};

export async function executeRedeemRewardTool(
  args: {
    userId: number;
    rewardId: number;
  }
) {
  return redeemReward({
    requestId: randomUUID(),
    userId: args.userId,
    rewardId: args.rewardId,
  });
}