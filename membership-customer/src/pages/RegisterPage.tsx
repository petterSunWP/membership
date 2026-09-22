import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

type RegisterForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  marketingEmailOptIn: boolean;
};

function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const referralCode = searchParams.get('ref');

  const [form, setForm] = useState<RegisterForm>({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  marketingEmailOptIn: false,
});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(
  event: React.ChangeEvent<HTMLInputElement>
) {
  const { name, value, type, checked } = event.target;

  setForm((prev) => ({
    ...prev,
    [name]: type === 'checkbox' ? checked : value,
  }));
}

function isValidNZPhone(phone: string) {
  const cleaned = phone.replace(/[\s()-]/g, '');

  return (
    /^0\d{8,10}$/.test(cleaned) ||
    /^\+64\d{8,10}$/.test(cleaned)
  );
}
  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');
    if (!isValidNZPhone(form.phone)) {
    setError(
      'Please enter a valid New Zealand phone number.'
    );
    return;
  }
    setLoading(true);

    try {
      console.log('REGISTER PAYLOAD:', {
  ...form,
  referralCode: referralCode || undefined,
});
      const response = await fetch(
        `${API_BASE_URL}/api/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...form,
            referralCode: referralCode || undefined,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || 'Registration failed'
        );
      }

      navigate(
        `/verify-email?email=${encodeURIComponent(
          form.email
        )}`
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Registration failed');
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
          <h1>Create your account</h1>
          <p>
            Join, earn points and invite friends.
          </p>
        </div>

        {referralCode && (
          <div className="referral-banner">
            You were invited by a friend
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="name-grid">
            <div className="field">
              <label htmlFor="firstName">
                First name
              </label>

              <input
                id="firstName"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
                autoComplete="given-name"
              />
            </div>

            <div className="field">
              <label htmlFor="lastName">
                Last name
              </label>

              <input
                id="lastName"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="phone">
              Phone
            </label>

            <input
              id="phone"
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              required
              autoComplete="tel"
              placeholder="021 123 4567"
            />
          </div>

          <div className="marketing-consent">
            <label>
              <input
                type="checkbox"
                name="marketingEmailOptIn"
                checked={form.marketingEmailOptIn}
                onChange={handleChange}
              />

              <span>
                I would like to receive rewards, offers and
                membership updates by email.
              </span>
            </label>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Creating account...'
              : 'Create Membership'}
          </button>
        </form>

        <p className="auth-footer">
          Already a member?{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => navigate('/login')}
          >
            View membership
          </button>
        </p>
      </section>
    </main>
  );
}

export default RegisterPage;