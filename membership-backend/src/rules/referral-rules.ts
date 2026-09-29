export type ReferralStatus =
  | 'REGISTERED'
  | 'ACTIVE';

export function calculateReferralReward(
  status: ReferralStatus,
  quantity: number
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }

  let reward = 0;

  if (status === 'REGISTERED') {
    reward =
      2 +
      Math.max(quantity - 1, 0) * 0.25;
  } else if (status === 'ACTIVE') {
    reward = quantity * 0.25;
  }

  return Number(reward.toFixed(2));
}