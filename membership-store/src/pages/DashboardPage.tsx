import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession} from '../utils/staffAuth'

type DashboardData = {
  summary: {
    todayOrders: number;
    todayPointsEarned: number;
    todayRedemptions: number;
    todayPointsRedeemed: number;
    activeCustomers: number;
  };

  recentOrders: Array<{
    id: number;
    orderNo: string;
    userId: number;
    customerName: string;
    totalPointsEarned: number;
    status: string;
    purchasedAt: string;
  }>;

  recentRedemptions: Array<{
    id: number;
    redemptionCode: string;
    userId: number;
    customerName: string;
    rewardName: string;
    pointsUsed: number;
    status: string;
    redeemedAt: string;
  }>;
};

function DashboardPage() {
  const navigate = useNavigate();

  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const token =
  localStorage.getItem('staff_token');
        const response = await fetch(
          `${API_BASE_URL}/api/staff/dashboard`,
          {
                headers: {
                Authorization: `Bearer ${token}`,
                },
            }
        );
        if (response.status === 401) {
            clearStaffSession();
            navigate('/login', { replace: true });
            return;
            }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              'Failed to load dashboard'
          );
        }

        setData(result.data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(
            'Failed to load dashboard'
          );
        }
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="workspace-page">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="workspace-page">
        <div className="form-error">
          {error || 'Dashboard unavailable'}
        </div>
      </div>
    );
  }

  const {
    summary,
    recentOrders,
    recentRedemptions,
  } = data;

  return (
    <div className="workspace-page">
      <div className="page-heading">
        <h1>Dashboard</h1>

        <p>
          Today's membership activity.
        </p>
      </div>

      <section className="dashboard-metrics">
        <div className="metric-card">
          <span>Today's Orders</span>
          <strong>{summary.todayOrders}</strong>
        </div>

        <div className="metric-card">
          <span>Points Earned</span>
          <strong>
            +{summary.todayPointsEarned}
          </strong>
        </div>

        <div className="metric-card">
          <span>Redemptions</span>
          <strong>
            {summary.todayRedemptions}
          </strong>
        </div>

        <div className="metric-card">
          <span>Active Customers</span>
          <strong>
            {summary.activeCustomers}
          </strong>
        </div>
      </section>

      <div className="dashboard-activity-grid">
        <section className="dashboard-activity-card">
          <div className="activity-heading">
            <div>
              <h2>Recent Orders</h2>
              <p>Latest purchase transactions.</p>
            </div>

            <button
              type="button"
              className="text-action"
              onClick={() => navigate('/orders')}
            >
              View all
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <p className="selection-empty">
              No recent orders.
            </p>
          ) : (
            <div className="activity-list">
              {recentOrders.map((order) => (
                <button
                  type="button"
                  className="activity-row"
                  key={order.id}
                  onClick={() =>
                    navigate(
                      `/customers/${order.userId}`
                    )
                  }
                >
                  <div>
                    <strong>
                      {order.customerName}
                    </strong>

                    <span>
                      {order.orderNo}
                    </span>
                  </div>

                  <strong className="points-positive">
                    +{order.totalPointsEarned}
                  </strong>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-activity-card">
          <div className="activity-heading">
            <div>
              <h2>Recent Redemptions</h2>
              <p>Latest reward redemptions.</p>
            </div>

            <button
              type="button"
              className="text-action"
              onClick={() =>
                navigate('/redemptions')
              }
            >
              View all
            </button>
          </div>

          {recentRedemptions.length === 0 ? (
            <p className="selection-empty">
              No recent redemptions.
            </p>
          ) : (
            <div className="activity-list">
              {recentRedemptions.map(
                (redemption) => (
                  <button
                    type="button"
                    className="activity-row"
                    key={redemption.id}
                    onClick={() =>
                      navigate(
                        `/customers/${redemption.userId}`
                      )
                    }
                  >
                    <div>
                      <strong>
                        {
                          redemption.customerName
                        }
                      </strong>

                      <span>
                        {redemption.rewardName}
                      </span>
                    </div>

                    <strong className="points-negative">
                      -{redemption.pointsUsed}
                    </strong>
                  </button>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;