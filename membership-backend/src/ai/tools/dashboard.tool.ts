import { getStaffDashboard } from '../../services/dashboard.service.js';

export const dashboardToolDefinition = {
  type: 'function' as const,

  name: 'get_staff_dashboard',

  description:
    'Get the current staff dashboard summary including today completed orders, today points earned, today redemptions, today points redeemed, and total active customers.',

  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  strict: true,
};

export async function executeDashboardTool() {
  return getStaffDashboard();
}