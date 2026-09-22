import { useEffect, useRef, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession} from '../utils/staffAuth'

type SelectedItem = {
  id: number;
  productCode: string;
  name: string;
  price: number | string;
  pointsEarned: number;
  quantity: number;
};

type Member = {
  id: number;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  availablePoints: number;
  status: string;
};

type Reward = {
  id: number;
  name: string;
  description: string;
  pointsRequired: number;
};

type LocationState = {
  items?: SelectedItem[];
};

function PointsConfirmationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams();

  const state = location.state as LocationState | null;
  const items = state?.items || [];

  const requestIdRef = useRef(
    crypto.randomUUID()
  );

  const [member, setMember] =
    useState<Member | null>(null);

  const [availableRewards, setAvailableRewards] =
    useState<Reward[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    async function loadConfirmationData() {
      if (!userId) {
        setError('Invalid customer ID');
        setLoading(false);
        return;
      }

      if (items.length === 0) {
        navigate(
          `/customers/${userId}/products`,
          { replace: true }
        );
        return;
      }

      try {
        const token =
  localStorage.getItem('staff_token');
        const [
          memberResponse,
          rewardsResponse,
        ] = await Promise.all([
          fetch(
            `${API_BASE_URL}/api/staff/members/${userId}`,
            {
                headers: {
                Authorization: `Bearer ${token}`,
                },
            }
          ),

          fetch(
            `${API_BASE_URL}/api/staff/members/${userId}/available-rewards`,
            {
                headers: {
                Authorization: `Bearer ${token}`,
                },
            }
          ),
        ]);
        if (memberResponse.status === 401) {
            clearStaffSession();
            navigate('/login', { replace: true });
            return;
            }
            if (rewardsResponse.status === 401) {
            clearStaffSession();
            navigate('/login', { replace: true });
            return;
            }
        const memberResult =
          await memberResponse.json();

        const rewardsResult =
          await rewardsResponse.json();

        if (!memberResponse.ok) {
          throw new Error(
            memberResult.message ||
              'Failed to load customer'
          );
        }

        if (!rewardsResponse.ok) {
          throw new Error(
            rewardsResult.message ||
              'Failed to load rewards'
          );
        }

        setMember(memberResult.data.member);

        setAvailableRewards(
          rewardsResult.data.rewards || []
        );
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(
            'Failed to load confirmation'
          );
        }
      } finally {
        setLoading(false);
      }
    }

    loadConfirmationData();
  }, [userId, items.length, navigate]);

  const totalQuantity = items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const pointsToEarn = items.reduce(
    (sum, item) =>
      sum +
      Number(item.pointsEarned) *
        item.quantity,
    0
  );

  const projectedBalance = member
    ? member.availablePoints + pointsToEarn
    : pointsToEarn;

  async function handleConfirmEarnPoints() {
    if (
      !member ||
      !userId ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
        const token =
  localStorage.getItem('staff_token');
      const response = await fetch(
        `${API_BASE_URL}/api/orders`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
              Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            requestId:
              requestIdRef.current,

            userId: Number(userId),

            items: items.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
          }),
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
            'Failed to complete transaction'
        );
      }

      navigate(
        `/customers/${userId}`,
        {
          replace: true,
          state: {
            transactionSuccess: true,
            pointsEarned:
              result.data?.totalPointsEarned ??
              pointsToEarn,
          },
        }
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          'Failed to complete transaction'
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page">
        <p>Loading confirmation...</p>
      </div>
    );
  }

  if (error && !member) {
    return (
      <div className="workspace-page">
        <div className="form-error">
          {error}
        </div>
      </div>
    );
  }

  if (!member) {
    return null;
  }

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>Points Confirmation</h1>

          <p>
            Review the purchase before
            updating the customer's points.
          </p>
        </div>

        <button
          type="button"
          className="secondary-action"
          onClick={() =>
            navigate(
              `/customers/${userId}/products`
            )
          }
        >
          Back to Products
        </button>
      </div>

      <div className="confirmation-layout">
        <section className="confirmation-main">
          <div className="confirmation-card">
            <div className="confirmation-customer">
              <div>
                <span>Customer</span>

                <h2>
                  {member.firstName}{' '}
                  {member.lastName}
                </h2>

                <p>
                  {member.phone} ·{' '}
                  {member.email}
                </p>
              </div>

              <div className="current-points">
                <span>Current Points</span>

                <strong>
                  {member.availablePoints.toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          <div className="confirmation-card">
            <h2>Purchase</h2>

            <div className="confirmation-items">
              {items.map((item) => (
                <div
                  className="confirmation-item"
                  key={item.id}
                >
                  <div>
                    <strong>
                      {item.name}
                    </strong>

                    <span>
                      Quantity{' '}
                      {item.quantity}
                    </span>
                  </div>

                  <strong>
                    +
                    {item.pointsEarned *
                      item.quantity}{' '}
                    pts
                  </strong>
                </div>
              ))}
            </div>

            <div className="confirmation-total">
              <div>
                <span>Total Items</span>
                <strong>
                  {totalQuantity}
                </strong>
              </div>

              <div>
                <span>Points to Earn</span>

                <strong className="points-positive">
                  +{pointsToEarn}
                </strong>
              </div>
            </div>
          </div>

          {availableRewards.length > 0 && (
            <div className="redeem-notice">
              <div>
                <strong>
                  Customer has rewards available
                </strong>

                <p>
                  This customer currently has{' '}
                  {member.availablePoints.toLocaleString()}{' '}
                  points and can redeem a reward.
                </p>
              </div>

              <button
                type="button"
                className="secondary-action"
                onClick={() =>
                    navigate(`/customers/${userId}/redeem`)
                    }
              >
                Redeem Points
              </button>
            </div>
          )}

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}
        </section>

        <aside className="confirmation-summary">
          <h2>Points Summary</h2>

          <div className="summary-line">
            <span>Current Balance</span>

            <strong>
              {member.availablePoints.toLocaleString()}
            </strong>
          </div>

          <div className="summary-line">
            <span>This Purchase</span>

            <strong className="points-positive">
              +{pointsToEarn}
            </strong>
          </div>

          <div className="summary-new-balance">
            <span>New Balance</span>

            <strong>
              {projectedBalance.toLocaleString()}
            </strong>
          </div>

          <button
            type="button"
            className="primary-action confirm-order-button"
            disabled={submitting}
            onClick={
              handleConfirmEarnPoints
            }
          >
            {submitting
              ? 'Processing...'
              : 'Confirm & Earn Points'}
          </button>
        </aside>
      </div>
    </div>
  );
}

export default PointsConfirmationPage;