export type AIToolType =
  | 'READ'
  | 'ACTION';

export type PendingActionStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';