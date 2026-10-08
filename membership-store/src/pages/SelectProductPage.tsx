import { useEffect, useMemo, useState } from 'react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

type Product = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  price: number | string;
  pointsEarned: number;
};

type SelectedItem = Product & {
  quantity: number;
};

function SelectProductPage() {
  const navigate = useNavigate();
  const { userId } = useParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedItems, setSelectedItems] =
    useState<SelectedItem[]>([]);

  const [selectedCategory, setSelectedCategory] =
  useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProducts() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/products`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message || 'Failed to load products'
          );
        }

        setProducts(result.data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to load products');
        }
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  const categories = useMemo(() => {
  return Array.from(
    new Set(
      products
        .map((product) => product.category)
        .filter(Boolean)
    )
  );
}, [products]);


const categoryProducts = useMemo(() => {
  if (!selectedCategory) {
    return [];
  }

  return products.filter(
    (product) =>
      product.category === selectedCategory
  );
}, [products, selectedCategory]);

  function addProduct(product: Product) {
    setSelectedItems((current) => {
      const existing = current.find(
        (item) => item.id === product.id
      );

      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  }

  function decreaseProduct(productId: number) {
    setSelectedItems((current) =>
      current
        .map((item) =>
          item.id === productId
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function getQuantity(productId: number) {
    return (
      selectedItems.find(
        (item) => item.id === productId
      )?.quantity || 0
    );
  }

  const totalQuantity = selectedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const estimatedPoints = selectedItems.reduce(
    (sum, item) =>
      sum + item.pointsEarned * item.quantity,
    0
  );

  function handleContinue() {
    if (!userId || selectedItems.length === 0) {
      return;
    }

    navigate(
      `/customers/${userId}/confirmation`,
      {
        state: {
          items: selectedItems,
        },
      }
    );
  }

  if (loading) {
    return (
      <div className="workspace-page">
        <p>Loading products...</p>
        {selectedCategory && (
  <div
    className="product-modal-overlay"
    onClick={() => setSelectedCategory(null)}
  >
    <div
      className="product-modal"
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <div className="product-modal-header">
        <div>
          <h2>{selectedCategory}</h2>

          <span>
            {categoryProducts.length} products
          </span>
        </div>

        <button
          type="button"
          className="product-modal-close"
          onClick={() =>
            setSelectedCategory(null)
          }
        >
          ×
        </button>
      </div>

      <div className="product-modal-body">
        <div className="product-grid">
          {categoryProducts.map((product) => {
            const quantity =
              getQuantity(product.id);

            return (
              <div
                key={product.id}
                className={
                  quantity > 0
                    ? 'product-card selected'
                    : 'product-card'
                }
              >
                <div className="product-card-info">
                  <strong>
                    {product.name}
                  </strong>

                  <span>
                    {product.pointsEarned} points
                  </span>
                </div>

                {quantity === 0 ? (
                  <button
                    type="button"
                    className="product-add-button"
                    onClick={() =>
                      addProduct(product)
                    }
                  >
                    Add
                  </button>
                ) : (
                  <div className="quantity-control">
                    <button
                      type="button"
                      onClick={() =>
                        decreaseProduct(product.id)
                      }
                    >
                      −
                    </button>

                    <strong>{quantity}</strong>

                    <button
                      type="button"
                      onClick={() =>
                        addProduct(product)
                      }
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
)}
      </div>
    );
  }

  return (
    <div className="workspace-page">
      <div className="page-heading page-heading-with-action">
        <div>
          <h1>Select Product</h1>

          <p>
            Select the drinks purchased by this customer.
          </p>
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

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      <div className="product-page-layout">
        <section className="product-list-section">
  <div className="product-section-heading">
    <h2>Categories</h2>

    <span>{categories.length} categories</span>
  </div>

  <div className="category-grid">
    {categories.map((category) => {
      const productCount = products.filter(
        (product) =>
          product.category === category
      ).length;

      return (
        <button
          key={category}
          type="button"
          className="category-card"
          onClick={() =>
            setSelectedCategory(category)
          }
        >
          <strong>{category}</strong>

          <span>
            {productCount}{' '}
            {productCount === 1
              ? 'product'
              : 'products'}
          </span>
        </button>
      );
    })}
  </div>
</section>

        <aside className="order-summary-card">
          <h2>Current Selection</h2>

          {selectedItems.length === 0 ? (
            <p className="selection-empty">
              No products selected.
            </p>
          ) : (
            <div className="selection-list">
              {selectedItems.map((item) => (
                <div
                  className="selection-row"
                  key={item.id}
                >
                  <div>
                    <strong>{item.name}</strong>

                    <span>
                      Qty {item.quantity}
                    </span>
                  </div>

                  <strong>
                    {item.pointsEarned *
                      item.quantity}{' '}
                    pts
                  </strong>
                </div>
              ))}
            </div>
          )}

          <div className="selection-total">
            <div>
              <span>Items</span>
              <strong>{totalQuantity}</strong>
            </div>

            <div>
              <span>Points to Earn</span>
              <strong>
                +{estimatedPoints}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="primary-action continue-button"
            disabled={selectedItems.length === 0}
            onClick={handleContinue}
          >
            Continue
          </button>
              </aside>
    </div>

    {selectedCategory && (
      <div
        className="product-modal-overlay"
        onClick={() => setSelectedCategory(null)}
      >
        <div
          className="product-modal"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <div className="product-modal-header">
            <div>
              <h2>{selectedCategory}</h2>

              <span>
                {categoryProducts.length} products
              </span>
            </div>

            <button
              type="button"
              className="product-modal-close"
              onClick={() =>
                setSelectedCategory(null)
              }
            >
              ×
            </button>
          </div>

          <div className="product-modal-body">
            <div className="product-grid">
              {categoryProducts.map((product) => {
                const quantity =
                  getQuantity(product.id);

                return (
                  <div
                    key={product.id}
                    className={
                      quantity > 0
                        ? 'product-card selected'
                        : 'product-card'
                    }
                  >
                    <div className="product-card-info">
                      <strong>
                        {product.name}
                      </strong>

                      <span>
                        {product.pointsEarned} points
                      </span>
                    </div>

                    {quantity === 0 ? (
                      <button
                        type="button"
                        className="product-add-button"
                        onClick={() =>
                          addProduct(product)
                        }
                      >
                        Add
                      </button>
                    ) : (
                      <div className="quantity-control">
                        <button
                          type="button"
                          onClick={() =>
                            decreaseProduct(
                              product.id
                            )
                          }
                        >
                          −
                        </button>

                        <strong>
                          {quantity}
                        </strong>

                        <button
                          type="button"
                          onClick={() =>
                            addProduct(product)
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
}

export default SelectProductPage;