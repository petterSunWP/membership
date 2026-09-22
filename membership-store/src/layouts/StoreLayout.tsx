import { Outlet } from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

function StoreLayout() {
  return (
    <div className="store-layout">
      <Sidebar />

      <div className="store-main">
        <Topbar />

        <main className="store-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default StoreLayout;