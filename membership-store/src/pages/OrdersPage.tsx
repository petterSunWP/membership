import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession} from '../utils/staffAuth'

const DEFAULT_PAGE_SIZE = 20;
type Order = {
  id: number;
  orderNo: string;
  userId: number;
  customerName: string;
  email: string;
  phone: string;
  totalAmount: number | string;
  totalPointsEarned: number;
  status: string;
  purchasedAt: string;
};
type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function OrdersPage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

    const [pageSize] = useState(
    DEFAULT_PAGE_SIZE
    );

    const [pagination, setPagination] =
    useState<Pagination>({
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
    });

  useEffect(() => {
  async function loadOrders() {
    setLoading(true);
    setError('');

    try {
        const token =
  localStorage.getItem('staff_token');
      const response = await fetch(
        `${API_BASE_URL}/api/staff/orders?page=${page}&pageSize=${pageSize}`,
        {
            headers: {
            Authorization: `Bearer ${token}`,
            },
        }
      );
      if (response.status === 401) {
            clearStaffSession();

            navigate('/login', {
                replace: true,
            });

            return;
            }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Failed to load orders'
        );
      }

      setOrders(result.data.orders || []);

      setPagination(result.data.pagination);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load orders');
      }
    } finally {
      setLoading(false);
    }
  }

  loadOrders();
}, [page, pageSize]);

  return (
    <div className="workspace-page">
      <div className="page-heading">
        <h1>Orders</h1>
        <p>Recent customer purchase transactions.</p>
      </div>

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      <section className="orders-card">
        {loading ? (
          <p>Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="empty-product-state">
            No orders yet.
          </div>
        ) : (
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Points</th>
                  <th>Status</th>
                  <th>Purchased</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() =>
                      navigate(
                        `/customers/${order.userId}`
                      )
                    }
                  >
                    <td>
                      <strong>{order.orderNo}</strong>
                    </td>

                    <td>
                      <div className="order-customer">
                        <strong>
                          {order.customerName}
                        </strong>
                        <span>{order.email}</span>
                      </div>
                    </td>

                    <td>
                      +{order.totalPointsEarned}
                    </td>

                    <td>
                      <span className="order-status">
                        {order.status}
                      </span>
                    </td>

                    <td>
                      {new Intl.DateTimeFormat(
                        'en-NZ',
                        {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      ).format(
                        new Date(order.purchasedAt)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination.totalPages > 1 && (
  <div className="pagination">
    <button
      type="button"
      className="pagination-button"
      disabled={page <= 1 || loading}
      onClick={() =>
        setPage((current) => current - 1)
      }
    >
      Previous
    </button>

    <div className="pagination-info">
      <span>
        Page {pagination.page} of{' '}
        {pagination.totalPages}
      </span>

      <small>
        {pagination.total} orders
      </small>
    </div>

    <button
      type="button"
      className="pagination-button"
      disabled={
        page >= pagination.totalPages ||
        loading
      }
      onClick={() =>
        setPage((current) => current + 1)
      }
    >
      Next
    </button>
  </div>
)}
      </section>
    </div>
  );
}

export default OrdersPage;