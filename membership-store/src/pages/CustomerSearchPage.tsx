import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {clearStaffSession} from '../utils/staffAuth'

type SearchResult = {
  id: number;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  availablePoints: number;
  status: string;
};

function CustomerSearchPage() {
  const navigate = useNavigate();

  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  async function handleSearch(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const value = keyword.trim();

    if (!value) {
      setError('Please enter an email or mobile number.');
      return;
    }

    setLoading(true);
    setError('');
    setNotFound(false);

    try {
      const token =
        localStorage.getItem('staff_token');

        const response = await fetch(
        `${API_BASE_URL}/api/staff/members/search?keyword=${encodeURIComponent(
            value
        )}`,
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

      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.message || 'Failed to search customer'
        );
      }

      const customer: SearchResult = result.data;

      navigate(`/customers/${customer.id}`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to search customer');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
            <h1>Customer Search</h1>

            <p>
            Find a customer by mobile number or email.
            </p>
        </div>

        <button
            type="button"
            className="secondary-action"
            onClick={() => navigate('/customers/new')}
        >
            + New Customer
        </button>
        </div>

      <section className="search-card">
        <form
          className="customer-search-form"
          onSubmit={handleSearch}
        >
          <label htmlFor="customer-search">
            Email or Mobile Number
          </label>

          <div className="search-row">
            <input
              id="customer-search"
              value={keyword}
              onChange={(event) =>
                setKeyword(event.target.value)
              }
              placeholder="e.g. customer@email.com or 021..."
              autoFocus
            />

            <button
              type="submit"
              className="primary-action"
              disabled={loading}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        {notFound && (
            <div className="customer-not-found">
                <div>
                <h2>Customer Not Found</h2>

                <p>
                    No customer matched that email or mobile number.
                    You can create a new customer using the button above.
                </p>
                </div>
            </div>
        )}
      </section>
    </div>
  );
}

export default CustomerSearchPage;