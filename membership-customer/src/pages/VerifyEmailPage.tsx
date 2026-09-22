import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const email = searchParams.get('email') || '';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/verify-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            code,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Verification failed'
        );
      }

      localStorage.setItem(
          'membership_token',
          result.data.token
        );

        navigate('/dashboard');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification failed');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setMessage('');
    setResending(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/resend-verification-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Failed to resend code'
        );
      }

      setMessage(
        'A new verification code has been sent.'
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to resend code');
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="auth-header">
          <p className="eyebrow">Membership</p>

          <h1>Verify your email</h1>

          <p>
            Enter the 6-digit code sent to
          </p>

          <p className="email-highlight">
            {email}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="code">
              Verification code
            </label>

            <input
              id="code"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 6)
                )
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="verification-input"
              required
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {message && (
            <div className="success-message">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={loading}
          >
            {loading
              ? 'Verifying...'
              : 'Verify Email'}
          </button>
        </form>

        <div className="verify-footer">
          <span>Didn't receive the code?</span>

          <button
            type="button"
            className="text-button"
            onClick={handleResend}
            disabled={resending}
          >
            {resending
              ? 'Sending...'
              : 'Resend code'}
          </button>
        </div>

        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/register')}
        >
          Back
        </button>
      </section>
    </main>
  );
}

export default VerifyEmailPage;