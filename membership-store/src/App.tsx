import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import StoreLayout from './layouts/StoreLayout';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomerSearchPage from './pages/CustomerSearchPage';
import NewCustomerPage from './pages/NewCustomerPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import SelectProductPage from './pages/SelectProductPage';
import PointsConfirmationPage from './pages/PointsConfirmationPage';
import RedeemPointsPage from './pages/RedeemPointsPage';
import OrdersPage from './pages/OrdersPage';
import RedemptionsPage from './pages/RedemptionsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route element={<ProtectedRoute />}>
          <Route element={<StoreLayout />}>
            <Route
              path="/"
              element={
                <Navigate
                  to="/customers"
                  replace
                />
              }
            />

            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />

            <Route
              path="/customers"
              element={<CustomerSearchPage />}
            />

            <Route
              path="/customers/new"
              element={<NewCustomerPage />}
            />

            <Route
              path="/customers/:userId"
              element={<CustomerProfilePage />}
            />

            <Route
              path="/customers/:userId/products"
              element={<SelectProductPage />}
            />

            <Route
              path="/customers/:userId/confirmation"
              element={<PointsConfirmationPage />}
            />

            <Route
              path="/customers/:userId/redeem"
              element={<RedeemPointsPage />}
            />

            <Route
              path="/orders"
              element={<OrdersPage />}
            />

            <Route
              path="/redemptions"
              element={<RedemptionsPage />}
            />
          </Route>
        </Route>

        <Route
          path="*"
          element={
            <Navigate
              to="/customers"
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;