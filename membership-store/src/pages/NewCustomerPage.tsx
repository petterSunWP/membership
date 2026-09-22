import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

type Step = 'details' | 'verify' | 'success';

function NewCustomerPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('details');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const [code, setCode] = useState('');

  const [createdUserId, setCreatedUserId] =
    useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleCreateCustomer(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Failed to create customer'
        );
      }

      setCreatedUserId(
        result.data?.userId ?? result.data?.id ?? null
      );

      setStep('verify');

      setMessage(
        `Verification code sent to ${form.email.trim()}`
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create customer');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/verify-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: form.email.trim(),
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

      const userId =
        result.data?.user?.id ??
        result.data?.userId ??
        createdUserId;

      if (!userId) {
        throw new Error(
          'Customer activated, but user ID was not returned'
        );
      }

      setCreatedUserId(userId);
      setStep('success');
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
    setResending(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/resend-verification-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: form.email.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Failed to resend code'
        );
      }

      setCode('');

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
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>New Customer</h1>

          <p>
            Register and verify a new customer account.
          </p>
        </div>

        <button
          type="button"
          className="secondary-action"
          onClick={() => navigate('/customers')}
        >
          Back to Search
        </button>
      </div>

      <div className="new-customer-container">
        <div className="registration-steps">
          <div
            className={
              step === 'details'
                ? 'registration-step active'
                : 'registration-step completed'
            }
          >
            <span>1</span>
            <div>
              <strong>Customer Details</strong>
              <small>Create account</small>
            </div>
          </div>

          <div className="step-line" />

          <div
            className={
              step === 'verify'
                ? 'registration-step active'
                : step === 'success'
                  ? 'registration-step completed'
                  : 'registration-step'
            }
          >
            <span>2</span>
            <div>
              <strong>Email Verification</strong>
              <small>Activate account</small>
            </div>
          </div>
        </div>

        {step === 'details' && (
          <section className="new-customer-card">
            <h2>Customer Details</h2>

            <form onSubmit={handleCreateCustomer}>
              <div className="new-customer-name-grid">
                <div className="store-field">
                  <label htmlFor="firstName">
                    First Name
                  </label>

                  <input
                    id="firstName"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="store-field">
                  <label htmlFor="lastName">
                    Last Name
                  </label>

                  <input
                    id="lastName"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="store-field">
                <label htmlFor="email">
                  Email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />

                <small>
                  This email must be accessible to the
                  customer for verification.
                </small>
              </div>

              <div className="store-field">
                <label htmlFor="phone">
                  Mobile Number
                </label>

                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
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
                className="primary-action new-customer-submit"
                disabled={loading}
              >
                {loading
                  ? 'Creating...'
                  : 'Send Verification Code'}
              </button>
            </form>
          </section>
        )}

        {step === 'verify' && (
          <section className="new-customer-card">
            <div className="verification-heading">
              <span className="verification-icon">
                @
              </span>

              <div>
                <h2>Verify Customer Email</h2>

                <p>
                  Ask the customer for the 6-digit code sent to:
                </p>

                <strong>{form.email}</strong>
              </div>
            </div>

            <form onSubmit={handleVerify}>
              <div className="store-field">
                <label htmlFor="verification-code">
                  Verification Code
                </label>

                <input
                  id="verification-code"
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/\D/g, '')
                        .slice(0, 6)
                    )
                  }
                  className="store-verification-input"
                  inputMode="numeric"
                  placeholder="000000"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="form-error">
                  {error}
                </div>
              )}

              {message && (
                <div className="form-success">
                  {message}
                </div>
              )}

              <button
                type="submit"
                className="primary-action new-customer-submit"
                disabled={loading}
              >
                {loading
                  ? 'Verifying...'
                  : 'Verify & Activate'}
              </button>

              <div className="verification-actions">
                <button
                  type="button"
                  className="text-action"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending
                    ? 'Sending...'
                    : 'Resend Code'}
                </button>

                <span>·</span>

                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    setStep('details');
                    setCode('');
                    setError('');
                    setMessage('');
                  }}
                >
                  Edit Details
                </button>
              </div>
            </form>
          </section>
        )}

        {step === 'success' && (
          <section className="new-customer-card registration-success">
            <div className="success-check">
              ✓
            </div>

            <h2>Customer Activated</h2>

            <p>
              {form.firstName} {form.lastName}'s
              membership is now active.
            </p>

            <button
              type="button"
              className="primary-action"
              onClick={() =>
                navigate(
                  `/customers/${createdUserId}`
                )
              }
            >
              Go to Customer Profile
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

export default NewCustomerPage;