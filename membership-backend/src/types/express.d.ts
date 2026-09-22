import 'express';

declare global {
  namespace Express {
    interface Request {
      staff?: {
        staffUserId: number;
        email: string;
        role: string;
      };
    }
  }
}

export {};