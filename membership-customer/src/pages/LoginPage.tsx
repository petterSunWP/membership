import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

function LoginPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mode, setMode] =
  useState<'login' | 'activation'>('login');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleRequestCode(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/request-login-code`,
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
  if (result.code === 'EMAIL_NOT_VERIFIED') {
    const resendResponse = await fetch(
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

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(
        resendResult.message ||
          'Failed to send verification code'
      );
    }

    setMode('activation');
    setStep('code');
    setMessage(
      'Your membership was not verified. A new verification code has been sent.'
    );

    return;
  }

  throw new Error(
    result.message || 'Failed to send login code'
  );
}

  setMode('login');
  setStep('code');
  setMessage('Verification code sent.');

      setStep('code');
      setMessage('Verification code sent.');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send login code');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(
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
      const endpoint =
      mode === 'activation'
    ? '/api/auth/verify-email'
    : '/api/auth/verify-login-code';

      const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
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
          result.message || 'Login failed'
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
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const endpoint =
      mode === 'activation'
        ? '/api/auth/resend-verification-code'
        : '/api/auth/request-login-code';
      const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
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

      setMessage('A new verification code has been sent.');
      setCode('');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to resend code');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="auth-card">
        <div className="auth-header">
          <p className="eyebrow">Membership</p>

          <h1>
            {step === 'email'
              ? 'Welcome back'
              : 'Check your email'}
          </h1>

          <p>
            {step === 'email'
              ? 'Enter your email to view your membership.'
              : 'Enter the 6-digit code sent to'}
          </p>

          {step === 'code' && (
            <p className="email-highlight">
              {email}
            </p>
          )}
        </div>

        {step === 'email' ? (
          <form onSubmit={handleRequestCode}>
            <div className="field">
              <label htmlFor="login-email">
                Email
              </label>

              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
                required
              />
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading
                ? 'Sending...'
                : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <div className="field">
              <label htmlFor="login-code">
                Verification code
              </label>

              <input
                id="login-code"
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
                ? 'Signing in...'
                : 'View My Membership'}
            </button>

            <div className="verify-footer">
              <button
                type="button"
                className="text-button"
                onClick={handleResend}
                disabled={loading}
              >
                Resend code
              </button>

              <span>·</span>

              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setStep('email');
                  setMode('login');
                  setCode('');
                  setError('');
                  setMessage('');
                }}
              >
                Change email
              </button>
            </div>
          </form>
        )}

        <p className="auth-footer">
          New here?{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => navigate('/register')}
          >
            Create membership
          </button>
        </p>
      </section>
    </main>
  );
}

export default LoginPage;