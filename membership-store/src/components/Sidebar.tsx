import { NavLink } from 'react-router-dom';

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">M</span>

        <div>
          <strong>Store Portal</strong>
          <span>Membership System</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink
            to="/dashboard"
            className={({ isActive }) =>
                isActive
                ? 'sidebar-link active'
                : 'sidebar-link'
            }
            >
            Dashboard
            </NavLink>
        <NavLink
          to="/customers"
          className={({ isActive }) =>
            isActive
              ? 'sidebar-link active'
              : 'sidebar-link'
          }
        >
          Customers
        </NavLink>

        <NavLink
          to="/orders"
          className={({ isActive }) =>
            isActive
              ? 'sidebar-link active'
              : 'sidebar-link'
          }
        >
          Orders
        </NavLink>
        <NavLink
            to="/redemptions"
            className={({ isActive }) =>
                isActive
                ? 'sidebar-link active'
                : 'sidebar-link'
            }
            >
            Redemptions
            </NavLink>
      </nav>
    </aside>
  );
}

export default Sidebar;