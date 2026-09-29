import { useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { clearStaffSession } from '../utils/staffAuth';

type AdjustmentType =
  | 'QUICK_EARN'
  | 'PHYSICAL_CARD_IMPORT';


function PointAdjustmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams();


  const adjustmentType: AdjustmentType =
  location.pathname.endsWith('/import-card')
    ? 'PHYSICAL_CARD_IMPORT'
    : 'QUICK_EARN';

  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const quantityNumber = Number(quantity);

  const isValidQuantity =
    Number.isInteger(quantityNumber) &&
    quantityNumber >= 1 &&
    quantityNumber <= 100;

  const config = useMemo(() => {
    if (
      adjustmentType ===
      'PHYSICAL_CARD_IMPORT'
    ) {
      return {
        title: 'Import Physical Card',
        description:
          'Transfer stamps from the customer’s physical loyalty card.',
        label: 'Number of existing stamps',
        helper:
          'Each stamp will be converted to 1 point.',
        buttonText: 'Import Points',
      };
    }

    return {
      title: 'Quick Add Points',
      description:
        'Use this when the store is busy and product details are not being recorded.',
      label: 'Number of items purchased',
      helper:
        'Points will be calculated from the number of items.',
      buttonText: 'Add Points',
    };
  }, [adjustmentType]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError('');

    if (!userId) {
      setError('Invalid customer ID');
      return;
    }

    if (!isValidQuantity) {
      setError(
        'Please enter a whole number between 1 and 100.'
      );
      return;
    }

    setLoading(true);

    try {
      const token =
        localStorage.getItem('staff_token');

      const response = await fetch(
        `${API_BASE_URL}/api/staff/point-adjustments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            userId: Number(userId),
            adjustmentType,
            quantity: quantityNumber,
          }),
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
          result.message ||
            'Failed to update points'
        );
      }

      navigate(`/customers/${userId}`, {
        state: {
          transactionSuccess: true,
          pointsEarned:
            result.data.pointsEarned,
        },
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update points');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
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

      <section className="customer-actions-card">
        <form onSubmit={handleSubmit}>
          <div className="field adjustment-field">
            <label htmlFor="adjustment-quantity">
                {config.label}
            </label>

            <input
                id="adjustment-quantity"
                type="number"
                min="1"
                max="100"
                step="1"
                value={quantity}
                onChange={(event) =>
                setQuantity(event.target.value)
                }
                required
            />

            <small className="adjustment-helper">
                {config.helper}
            </small>
            </div>

          {quantity &&
            isValidQuantity && (
              <div className="adjustment-preview">
                <span>Customer will receive</span>
                <strong>+{quantityNumber}</strong>
                <small>points</small>
                </div>
            )}

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-action"
            disabled={
              loading || !isValidQuantity
            }
          >
            {loading
              ? 'Processing...'
              : config.buttonText}
          </button>
        </form>
      </section>
    </div>
  );
}

export default PointAdjustmentPage;