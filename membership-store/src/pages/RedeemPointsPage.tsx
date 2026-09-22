import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession} from '../utils/staffAuth'

type Member = {
  id: number;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  availablePoints: number;
};

type Reward = {
  id: number;
  name: string;
  description: string;
  pointsRequired: number;
};

function RedeemPointsPage() {
  const navigate = useNavigate();
  const { userId } = useParams();

  const [member, setMember] = useState<Member | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [selectedReward, setSelectedReward] =
    useState<Reward | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const requestIdRef = useRef(
    crypto.randomUUID()
  );

  useEffect(() => {
    async function loadData() {
      if (!userId) {
        setError('Invalid customer ID');
        setLoading(false);
        return;
      }

      try {
        const token =
  localStorage.getItem('staff_token');
        const [memberResponse, rewardsResponse] =
          await Promise.all([
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
        setRewards(
          rewardsResult.data.rewards || []
        );
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to load redemption');
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userId]);

  async function handleRedeem() {
    if (
      !userId ||
      !selectedReward ||
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
        `${API_BASE_URL}/api/redemptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
             Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            requestId: requestIdRef.current,
            userId: Number(userId),
            rewardId: selectedReward.id,
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
            'Failed to redeem reward'
        );
      }

      navigate(`/customers/${userId}`, {
        replace: true,
        state: {
          redemptionSuccess: true,
          rewardName: selectedReward.name,
          pointsUsed:
            selectedReward.pointsRequired,
        },
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to redeem reward');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page">
        <p>Loading rewards...</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="workspace-page">
        <div className="form-error">
          {error || 'Customer not found'}
        </div>
      </div>
    );
  }

  const balanceAfterRedemption =
    selectedReward
      ? member.availablePoints -
        selectedReward.pointsRequired
      : member.availablePoints;

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>Redeem Points</h1>
          <p>
            Select a reward for this customer.
          </p>
        </div>

        <button
          type="button"
          className="secondary-action"
          onClick={() =>
            navigate(`/customers/${userId}`)
          }
        >
          Back to Customer
        </button>
      </div>

      <section className="redeem-customer-card">
        <div>
          <span>Customer</span>

          <h2>
            {member.firstName} {member.lastName}
          </h2>

          <p>
            {member.phone} · {member.email}
          </p>
        </div>

        <div className="redeem-balance">
          <span>Available Points</span>

          <strong>
            {member.availablePoints.toLocaleString()}
          </strong>
        </div>
      </section>

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      {rewards.length === 0 ? (
        <section className="redeem-empty">
          <h2>No rewards available</h2>

          <p>
            This customer does not currently
            have enough points to redeem a reward.
          </p>
        </section>
      ) : (
        <div className="redeem-layout">
          <section>
            <h2 className="section-title">
              Available Rewards
            </h2>

            <div className="redeem-reward-list">
              {rewards.map((reward) => {
                const selected =
                  selectedReward?.id === reward.id;

                return (
                  <button
                    type="button"
                    key={reward.id}
                    className={
                      selected
                        ? 'redeem-reward-card selected'
                        : 'redeem-reward-card'
                    }
                    onClick={() =>
                      setSelectedReward(reward)
                    }
                  >
                    <div>
                      <strong>
                        {reward.name}
                      </strong>

                      <span>
                        {reward.description}
                      </span>
                    </div>

                    <strong>
                      {reward.pointsRequired} pts
                    </strong>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="redeem-summary-card">
            <h2>Redemption Summary</h2>

            {!selectedReward ? (
              <p className="selection-empty">
                Select a reward to continue.
              </p>
            ) : (
              <>
                <div className="summary-line">
                  <span>Reward</span>

                  <strong>
                    {selectedReward.name}
                  </strong>
                </div>

                <div className="summary-line">
                  <span>Current Balance</span>

                  <strong>
                    {member.availablePoints}
                  </strong>
                </div>

                <div className="summary-line">
                  <span>Points Used</span>

                  <strong className="points-negative">
                    -
                    {
                      selectedReward.pointsRequired
                    }
                  </strong>
                </div>

                <div className="summary-new-balance">
                  <span>New Balance</span>

                  <strong>
                    {balanceAfterRedemption}
                  </strong>
                </div>

                <button
                  type="button"
                  className="primary-action redeem-confirm-button"
                  disabled={submitting}
                  onClick={handleRedeem}
                >
                  {submitting
                    ? 'Processing...'
                    : 'Confirm Redemption'}
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default RedeemPointsPage;