import { useEffect, useState } from 'react';
import { useNavigate} from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

type Referral = {
  userId: number;
  firstName: string;
  lastName: string;
  status: 'REGISTERED' | 'ACTIVE';
  registeredAt: string;
  convertedAt: string | null;
};

type Reward = {
  id: number;
  name: string;
  description: string;
  pointsRequired: number;
  canRedeem: boolean;
};

type ProfileData = {
  member: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    availablePoints: number;
    referralCode: string;
  };

  referralSummary: {
    total: number;
    registered: number;
    active: number;
  };

  referrals: Referral[];
  rewards: Reward[];
  pointHistory: PointHistoryItem[];
};

type PointHistoryItem = {
  id: number;
  points: number;
  pointType:
    | 'PURCHASE'
    | 'REFERRAL'
    | 'REDEMPTION'
    | 'MANUAL_ADJUSTMENT';
  sourceType: string;
  sourceId: number | null;
  description: string;
  createdAt: string;
};
function DashboardPage() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPointsDetails, setShowPointsDetails] =
  useState(false);

  useEffect(() => {
  async function loadProfile() {
    const token = localStorage.getItem(
      'membership_token'
    );

    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/member/me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        localStorage.removeItem(
          'membership_token'
        );

        navigate('/login');
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.message ||
            'Failed to load membership'
        );
      }

      setProfile(result.data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          'Failed to load membership'
        );
      }
    } finally {
      setLoading(false);
    }
  }

  loadProfile();
}, [navigate]);

const referralLink = profile
  ? `${window.location.origin}/register?ref=${encodeURIComponent(
      profile.member.referralCode
    )}`
  : '';

  const isWeChat =
  /MicroMessenger/i.test(navigator.userAgent);

  const canShare =
  !isWeChat &&
  typeof navigator.share === 'function' &&
  window.isSecureContext; 

  async function handleCopyReferralLink() {
  if (!referralLink) return;

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(
        referralLink
      );
    } else {
      const textarea =
        document.createElement('textarea');

      textarea.value = referralLink;

      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';

      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();

      document.execCommand('copy');

      document.body.removeChild(textarea);
    }

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  } catch (error) {
    console.error('Copy failed:', error);
  }
}

  async function handleShareReferralLink() {
  if (!referralLink || !navigator.share) return;

  try {
    await navigator.share({
      title: 'Join my membership',
      text: 'Join using my referral link:',
      url: referralLink,
    });
  } catch (error) {
    console.log('Share cancelled:', error);
  }
}

  if (loading) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-container">
          <p>Loading membership...</p>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-container">
          <div className="error-message">
            {error || 'Membership not found'}
          </div>

          <button
            className="primary-button"
            onClick={() => navigate('/login')}
          >
            Back to Login
          </button>
        </div>
      </main>
    );
  }

const {
  member,
  referralSummary,
  referrals,
  rewards,
  pointHistory
} = profile;

const purchasePoints = pointHistory
  .filter(
    (item) =>
      item.points > 0 &&
      (
        item.pointType === 'PURCHASE' ||
        item.pointType === 'MANUAL_ADJUSTMENT'
      )
  )
  .reduce(
    (total, item) => total + Number(item.points),
    0
  );

const referralPoints = pointHistory
  .filter(
    (item) =>
      item.points > 0 &&
      item.pointType === 'REFERRAL'
  )
  .reduce(
    (total, item) => total + Number(item.points),
    0
  );

  const redeemedPoints = pointHistory
  .filter(
    (item) =>
      item.pointType === 'REDEMPTION' &&
      item.points < 0
  )
  .reduce(
    (total, item) =>
      total + Math.abs(Number(item.points)),
    0
  );

const sortedPointHistory = [...pointHistory].sort(
  (a, b) =>
    new Date(b.createdAt).getTime() -
    new Date(a.createdAt).getTime()
);


function getPointHistoryTitle(pointType: string) {
  switch (pointType) {
    case 'PURCHASE':
      return 'Purchase';

    case 'REFERRAL':
      return 'Referral Reward';

    case 'REDEMPTION':
      return 'Reward Redeemed';

    case 'MANUAL_ADJUSTMENT':
      return 'Points Adjustment';

    default:
      return 'Points Activity';
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
  return (
    <main className="dashboard-shell">
      <div className="dashboard-container">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Membership</p>

            <h1>
              Hi {member.firstName}
            </h1>

            <p>{member.email}</p>
          </div>

          <button
            className="secondary-button"
           onClick={() => {
  localStorage.removeItem('membership_token');
  navigate('/login');
}}
          >
            Sign out
          </button>
        </header>

        <section className="dashboard-grid">
          <div className="tea-points-card">
              <div className="tea-points-header">
                <span>Tea Points</span>

                <button
                  type="button"
                  className="points-details-button"
                  onClick={() => setShowPointsDetails(true)}
                >
                  Points Details
                </button>
              </div>

              <div className="tea-points-balance">
                <strong>
                  {member.availablePoints.toLocaleString()}
                </strong>

                <small>points available</small>
              </div>

              <div className="tea-points-breakdown">
  <div className="tea-points-breakdown-item">
    <span>Purchase</span>
    <strong>
      {purchasePoints.toLocaleString()}
    </strong>
  </div>

  <div className="tea-points-breakdown-divider" />

  <div className="tea-points-breakdown-item">
    <span>Referral</span>
    <strong>
      {referralPoints.toLocaleString()}
    </strong>
  </div>

  <div className="tea-points-breakdown-divider" />

  <div className="tea-points-breakdown-item">
    <span>Used</span>
    <strong>
      {redeemedPoints.toLocaleString()}
    </strong>
  </div>
</div>
            </div>

          <div className="invite-card">
            <span>Invite Friends</span>

            <h2>Earn more points</h2>

            <p>
              Share your membership link with friends.
            </p>
              <div className="referral-link-box">
                {referralLink}
              </div>
            <div className="referral-actions">
              <button
                className="primary-button"
                onClick={handleCopyReferralLink}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>

              {canShare && (
                <button
                  className="secondary-button referral-share-button"
                  onClick={handleShareReferralLink}
                >
                  Share
                </button>
              )}
            </div>
            {isWeChat && (
                <p className="share-hint">
                  Copy the link and send it to your friend in WeChat.
                </p>
              )}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="section-heading">
            <div>
              <h2>Your Referrals</h2>

              <p>
                {referralSummary.active} active ·{' '}
                {referralSummary.registered} registered
              </p>
            </div>

            <span className="count-badge">
              {referralSummary.total}
            </span>
          </div>

          {referrals.length === 0 ? (
            <div className="empty-state">
              No referrals yet.
            </div>
          ) : (
            <div className="referral-list">
              {referrals.map((referral) => (
                <div
                  className="referral-row"
                  key={referral.userId}
                >
                  <div className="referral-person">
                    <div
                      className={
                        referral.status === 'ACTIVE'
                          ? 'status-dot active'
                          : 'status-dot'
                      }
                    />

                    <div>
                      <strong>
                        {referral.firstName}{' '}
                        {referral.lastName}
                      </strong>

                      <span>
                        {referral.status === 'ACTIVE'
                          ? 'Purchased'
                          : 'Registered'}
                      </span>
                    </div>
                  </div>

                  <span
                    className={
                      referral.status === 'ACTIVE'
                        ? 'status-label active'
                        : 'status-label'
                    }
                  >
                    {referral.status === 'ACTIVE'
                      ? 'Active'
                      : 'Registered'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-section">
  <div className="section-heading">
    <div>
      <h2>Rewards</h2>

      <p>
        Redeem rewards with your points.
      </p>
    </div>
  </div>

  {rewards.length === 0 ? (
    <div className="empty-state">
      No rewards available yet.
    </div>
  ) : (
    <div className="reward-list">
      {rewards.map((reward) => (
        <div
          className="reward-row"
          key={reward.id}
        >
          <div>
            <strong>{reward.name}</strong>

            <span>
              {reward.description}
            </span>
          </div>

          <div className="reward-status">
            <strong>
              {reward.pointsRequired} pts
            </strong>

            <span
              className={
                reward.canRedeem
                  ? 'reward-badge available'
                  : 'reward-badge locked'
              }
            >
              {reward.canRedeem
                ? 'Redeem in store'
                : 'Locked'}
            </span>
          </div>
        </div>
      ))}
    </div>
  )}
</section>
      </div>

      {showPointsDetails && (
  <div
    className="points-modal-overlay"
    onClick={() => setShowPointsDetails(false)}
  >
    <div
      className="points-modal-card"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="points-modal-header">
        <div>
          <h2>Points Details</h2>
          <p>Your points activity.</p>
        </div>

        <button
          type="button"
          className="points-modal-close"
          onClick={() => setShowPointsDetails(false)}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="points-modal-body">
        {sortedPointHistory.length === 0 ? (
          <div className="empty-state">
            No points activity yet.
          </div>
        ) : (
          <div className="points-history-list">
            {sortedPointHistory.map((item) => (
              <div
                className="points-history-row"
                key={item.id}
              >
                <div className="points-history-info">
                  <strong>
                    {getPointHistoryTitle(item.pointType)}
                  </strong>

                  <span>{item.description}</span>

                  <small>
                    {formatDate(item.createdAt)}
                  </small>
                </div>

                <div
                  className={
                    item.points >= 0
                      ? 'points-change positive'
                      : 'points-change negative'
                  }
                >
                  {item.points > 0 ? '+' : ''}
                  {item.points}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)}
    </main>
  );
}

export default DashboardPage;