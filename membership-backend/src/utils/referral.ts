import crypto from 'crypto';

export function generateReferralCode(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}