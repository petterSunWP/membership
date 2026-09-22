import { useNavigate } from 'react-router-dom';

type StaffUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

function Topbar() {
  const navigate = useNavigate();

  const storedStaff =
    localStorage.getItem('staff_user');

  const staff: StaffUser | null =
    storedStaff
      ? JSON.parse(storedStaff)
      : null;

  function handleSignOut() {
    localStorage.removeItem(
      'staff_token'
    );

    localStorage.removeItem(
      'staff_user'
    );

    navigate('/login', {
      replace: true,
    });
  }

  return (
    <header className="topbar">
      <div>
        <span className="topbar-title">
          Store Management
        </span>
      </div>

      <div className="topbar-user">
        <div className="topbar-user-info">
          <strong>
            {staff
              ? `${staff.firstName} ${staff.lastName}`
              : 'Store Staff'}
          </strong>

          <span>
            {staff?.email || ''}
            {staff?.role
              ? ` · ${staff.role}`
              : ''}
          </span>
        </div>

        <button
          type="button"
          className="topbar-signout"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export default Topbar;