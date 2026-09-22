import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/staff/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Login failed'
        );
      }

      localStorage.setItem(
        'staff_token',
        result.data.token
      );

      localStorage.setItem(
        'staff_user',
        JSON.stringify(result.data.staff)
      );

      navigate('/customers', {
        replace: true,
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="staff-login-shell">
      <section className="staff-login-card">
        <div className="staff-login-brand">
          <div className="staff-login-mark">
            M
          </div>

          <div>
            <strong>Store Portal</strong>
            <span>Membership System</span>
          </div>
        </div>

        <div className="staff-login-heading">
          <h1>Sign in</h1>

          <p>
            Sign in to manage customers and points.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="store-field">
            <label htmlFor="staff-email">
              Email
            </label>

            <input
              id="staff-email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              required
              autoFocus
            />
          </div>

          <div className="store-field">
            <label htmlFor="staff-password">
              Password
            </label>

            <input
              id="staff-password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-action staff-login-button"
            disabled={loading}
          >
            {loading
              ? 'Signing in...'
              : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;