import { useEffect, useState } from 'react';
import {useLocation, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession} from '../utils/staffAuth'

type MemberDetail = {
  member: {
    id: number;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    referralCode: string;
    referredByUserId: number | null;
    availablePoints: number;
    status: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  };

  referralSummary: {
    total: number;
    registered: number;
    active: number;
  };

  recentOrders: Array<{
    id: number;
    orderNo: string;
    totalAmount: number;
    totalPointsEarned: number;
    status: string;
    purchasedAt: string;
  }>;

  recentPointTransactions: Array<{
    id: number;
    points: number;
    pointType: string;
    sourceType: string;
    sourceId: number | null;
    description: string;
    createdAt: string;
  }>;
};
type LocationState = {
  transactionSuccess?: boolean;
  pointsEarned?: number;

  redemptionSuccess?: boolean;
  rewardName?: string;
  pointsUsed?: number;
};

function CustomerProfilePage() {
    const location = useLocation();
    const pageState =
  location.state as LocationState | null;
  const navigate = useNavigate();
  const { userId } = useParams();

  const [data, setData] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadMember() {
      if (!userId) {
        setError('Invalid customer ID');
        setLoading(false);
        return;
      }

      try {
        const token =
  localStorage.getItem('staff_token');
        const response = await fetch(
          `${API_BASE_URL}/api/staff/members/${userId}`,
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
            result.message || 'Failed to load customer'
          );
        }

        setData(result.data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to load customer');
        }
      } finally {
        setLoading(false);
      }
    }

    loadMember();
  }, [userId]);

  useEffect(() => {
  if (location.state) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }
}, [location.state]);

  if (loading) {
    return (
      <div className="workspace-page">
        <p>Loading customer...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="workspace-page">
        <div className="form-error">
          {error || 'Customer not found'}
        </div>

        <button
          type="button"
          className="secondary-action"
          onClick={() => navigate('/customers')}
        >
          Back to Customers
        </button>
      </div>
    );
  }

  const { member } = data;

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>
            {member.firstName} {member.lastName}
          </h1>

          <p>Customer Profile</p>
        </div>

        <button
          type="button"
          className="secondary-action"
          onClick={() => navigate('/customers')}
        >
          Back to Search
        </button>
      </div>
      {pageState?.transactionSuccess && (
  <div className="profile-success-message">
    <div>
      <strong>Points added successfully</strong>

      <span>
        +{pageState.pointsEarned ?? 0} points
        have been added to this customer.
      </span>
    </div>
  </div>
)}

{pageState?.redemptionSuccess && (
  <div className="profile-success-message">
    <div>
      <strong>Reward redeemed successfully</strong>

      <span>
        {pageState.rewardName}
        {pageState.pointsUsed
          ? ` · ${pageState.pointsUsed} points used`
          : ''}
      </span>
    </div>
  </div>
)}

      <section className="customer-profile-grid">
        <div className="customer-info-card">
          <h2>Customer Details</h2>

          <div className="customer-detail-row">
            <span>Mobile Number</span>
            <strong>{member.phone}</strong>
          </div>

          <div className="customer-detail-row">
            <span>Email</span>
            <strong>{member.email}</strong>
          </div>

          <div className="customer-detail-row">
            <span>Status</span>
            <strong>{member.status}</strong>
          </div>
        </div>

        <div className="customer-points-card">
          <span>Current Points</span>

          <strong>
            {member.availablePoints.toLocaleString()}
          </strong>

          <small>points available</small>
        </div>
      </section>

      <section className="customer-actions-card">
        <div>
          <h2>Customer Actions</h2>

          <p>
            Select an action for this customer.
          </p>
        </div>

        <div className="customer-actions">
            <button
                type="button"
                className="primary-action"
                onClick={() =>
                navigate(`/customers/${member.id}/products`)
                }
            >
                Earn Points
            </button>

            <button
                type="button"
                className="secondary-action"
                onClick={() =>
                navigate(`/customers/${member.id}/quick-earn`)
                }
            >
                Quick Add Points
            </button>

            <button
                type="button"
                className="secondary-action"
                onClick={() =>
                navigate(`/customers/${member.id}/import-card`)
                }
            >
                Import Physical Card
            </button>

            <button
                type="button"
                className="secondary-action"
                onClick={() =>
                navigate(`/customers/${member.id}/redeem`)
                }
            >
                Redeem Points
            </button>
            </div>
      </section>
    </div>
  );
}

export default CustomerProfilePage;