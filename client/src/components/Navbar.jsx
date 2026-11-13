import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const getProfilePhotoKey = (user) => {
  if (!user) return 'ridego_profile_photo';
  const identity = user.email || user._id || user.name || 'guest';
  return `ridego_profile_photo_${user.role || 'user'}_${String(identity).replace(/[^a-zA-Z0-9]/g, '_')}`;
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const profilePhoto = user ? user.photo || localStorage.getItem(getProfilePhotoKey(user)) || '' : '';

  const navLinkClass = ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`;

  return (
    <header className="navbar-shell">
      <nav className="navbar container">
        <Link className="brand" to="/">
          RideGo
        </Link>

        <div className="nav-actions">
          <NavLink className={navLinkClass} to="/">
            Home
          </NavLink>

          {user ? (
            <>
              {user.role === 'customer' && (
                <>
                  <NavLink className={navLinkClass} to="/rider-dashboard">
                    Dashboard
                  </NavLink>
                  <NavLink className={navLinkClass} to="/book-ride">
                    Book Ride
                  </NavLink>
                  <NavLink className={navLinkClass} to="/my-rides">
                    My Rides
                  </NavLink>
                  <NavLink className={navLinkClass} to="/notifications">
                    Notifications
                  </NavLink>
                  <NavLink className={navLinkClass} to="/profile">
                    My Profile
                  </NavLink>
                </>
              )}

              {(user.role === 'customer' || user.role === 'driver') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: '#dfeecb', display: 'grid', placeItems: 'center', border: '1px solid rgba(17,43,29,0.12)' }}>
                    {profilePhoto ? (
                      <img src={profilePhoto} alt={`${user.name || 'Profile'} avatar`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{(user.name || 'U')?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                </div>
              )}

              {user.role === 'driver' && (
                <>
                  <NavLink className={navLinkClass} to="/driver-dashboard">
                    Driver Dashboard
                  </NavLink>
                  <NavLink className={navLinkClass} to="/driver-profile">
                    My Profile
                  </NavLink>
                  <NavLink className={navLinkClass} to="/driver/notifications">
                    Notifications
                  </NavLink>
                </>
              )}

              {user.role === 'admin' && (
                <>
                  <NavLink className={navLinkClass} to="/admin-dashboard">
                    Admin Dashboard
                  </NavLink>
                  <NavLink className={navLinkClass} to="/admin/notifications">
                    Notifications
                  </NavLink>
                </>
              )}

              <button className="btn btn-light" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink className={navLinkClass} to="/login">
                Login
              </NavLink>
              <NavLink className="btn btn-primary" to="/register">
                Sign up
              </NavLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
