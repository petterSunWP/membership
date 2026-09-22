import {
  searchMember,
  getMemberDetail,
  getAvailableRewards
} from '../../services/member.service.js';

export const searchMemberToolDefinition = {
  type: 'function' as const,

  name: 'search_member',

  description:
    'Search for a member by exact email address or exact phone number and return the member profile if found.',

  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description:
          'The exact member email address or phone number to search for.',
      },
    },
    required: ['keyword'],
    additionalProperties: false,
  },

  strict: true,
};

export async function executeSearchMemberTool(
  args: { keyword: string }
) {
  return searchMember(args.keyword);
}

export const getMemberDetailToolDefinition = {
  type: 'function' as const,

  name: 'get_member_detail',

  description:
    'Get detailed information for a member by user ID, including member profile, referral summary, recent orders, and recent point transactions.',

  parameters: {
    type: 'object',
    properties: {
      userId: {
        type: 'number',
        description:
          'The member user ID returned by another tool such as search_member.',
      },
    },
    required: ['userId'],
    additionalProperties: false,
  },

  strict: true,
};

export async function executeGetMemberDetailTool(
  args: { userId: number }
) {
  return getMemberDetail(args.userId);
}

export const getAvailableRewardsToolDefinition = {
  type: 'function' as const,

  name: 'get_available_rewards',

  description:
    'Get the active rewards that a member can currently redeem based on their available points. Requires the member user ID.',

  parameters: {
    type: 'object',
    properties: {
      userId: {
        type: 'number',
        description:
          'The member user ID returned by search_member.',
      },
    },
    required: ['userId'],
    additionalProperties: false,
  },

  strict: true,
};

export async function executeGetAvailableRewardsTool(
  args: { userId: number }
) {
  return getAvailableRewards(args.userId);
}