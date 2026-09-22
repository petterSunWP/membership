import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession}  from '../utils/staffAuth'

type Redemption = {
  id: number;
  redemptionCode: string;
  userId: number;
  customerName: string;
  email: string;
  phone: string;
  rewardId: number;
  rewardName: string;
  pointsUsed: number;
  status: string;
  createdAt: string;
  redeemedAt: string | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 20;

function RedemptionsPage() {
  const navigate = useNavigate();

  const [redemptions, setRedemptions] =
    useState<Redemption[]>([]);

  const [page, setPage] = useState(1);

  const [pageSize] =
    useState(DEFAULT_PAGE_SIZE);

  const [pagination, setPagination] =
    useState<Pagination>({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadRedemptions() {
      setLoading(true);
      setError('');

      try {
        const token =
            localStorage.getItem('staff_token');
        const response = await fetch(
          `${API_BASE_URL}/api/staff/redemptions?page=${page}&pageSize=${pageSize}`,
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
              'Failed to load redemptions'
          );
        }

        setRedemptions(
          result.data.redemptions || []
        );

        setPagination(
          result.data.pagination
        );
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(
            'Failed to load redemptions'
          );
        }
      } finally {
        setLoading(false);
      }
    }

    loadRedemptions();
  }, [page, pageSize]);

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>Redemptions</h1>

          <p>
            Recent customer reward redemptions.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      <section className="orders-card">
        {loading ? (
          <p className="table-loading">
            Loading redemptions...
          </p>
        ) : redemptions.length === 0 ? (
          <div className="empty-product-state">
            No redemptions yet.
          </div>
        ) : (
          <>
            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Redemption</th>
                    <th>Customer</th>
                    <th>Reward</th>
                    <th>Points Used</th>
                    <th>Status</th>
                    <th>Redeemed</th>
                  </tr>
                </thead>

                <tbody>
                  {redemptions.map(
                    (redemption) => (
                      <tr
                        key={redemption.id}
                        onClick={() =>
                          navigate(
                            `/customers/${redemption.userId}`
                          )
                        }
                      >
                        <td>
                          <strong>
                            {
                              redemption.redemptionCode
                            }
                          </strong>
                        </td>

                        <td>
                          <div className="order-customer">
                            <strong>
                              {
                                redemption.customerName
                              }
                            </strong>

                            <span>
                              {redemption.email}
                            </span>
                          </div>
                        </td>

                        <td>
                          {redemption.rewardName}
                        </td>

                        <td>
                          -
                          {redemption.pointsUsed}
                        </td>

                        <td>
                          <span className="redemption-status">
                            {redemption.status}
                          </span>
                        </td>

                        <td>
                          {redemption.redeemedAt
                            ? new Intl.DateTimeFormat(
                                'en-NZ',
                                {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              ).format(
                                new Date(
                                  redemption.redeemedAt
                                )
                              )
                            : '-'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  type="button"
                  className="pagination-button"
                  disabled={
                    page <= 1 || loading
                  }
                  onClick={() =>
                    setPage(
                      (current) =>
                        current - 1
                    )
                  }
                >
                  Previous
                </button>

                <div className="pagination-info">
                  <span>
                    Page {pagination.page} of{' '}
                    {
                      pagination.totalPages
                    }
                  </span>

                  <small>
                    {pagination.total}{' '}
                    redemptions
                  </small>
                </div>

                <button
                  type="button"
                  className="pagination-button"
                  disabled={
                    page >=
                      pagination.totalPages ||
                    loading
                  }
                  onClick={() =>
                    setPage(
                      (current) =>
                        current + 1
                    )
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default RedemptionsPage;