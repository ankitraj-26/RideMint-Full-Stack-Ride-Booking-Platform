import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    title: 'Fast booking',
    text: 'Book a ride in a few taps, from pickup to drop-off in minutes.',
  },
  {
    title: 'Trusted drivers',
    text: 'Choose from a secure driver network and track the ride status clearly.',
  },
  {
    title: 'Smart pricing',
    text: 'Transparent demo fare estimates based on distance and cab type.',
  },
];

const getProfilePhotoKey = (user) => {
  if (!user) return 'ridego_profile_photo';
  const identity = user.email || user._id || user.name || 'guest';
  return `ridego_profile_photo_${user.role || 'user'}_${String(identity).replace(/[^a-zA-Z0-9]/g, '_')}`;
};

const Home = () => {
  const { user } = useAuth();
  const profilePhoto = user ? user.photo || localStorage.getItem(getProfilePhotoKey(user)) || '' : '';

  return (
    <div>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <p className="eyebrow">Ride smarter</p>
            <h1>Book a convenient ride with RideGo.</h1>
            <p className="subtext">
              Comfortable cabs, transparent pricing, and a streamlined booking flow designed for everyday mobility.
            </p>
            <div className="cta-row">
              {user ? (
                <>
                  {user.role === 'driver' ? (
                    <>
                      <Link className="btn btn-primary" to="/driver-dashboard">
                        Driver Dashboard
                      </Link>
                      <Link className="btn btn-light" to="/driver-profile">
                        My Profile
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link className="btn btn-primary" to="/rider-dashboard">
                        Rider Dashboard
                      </Link>
                      <Link className="btn btn-light" to="/profile">
                        My Profile
                      </Link>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Link className="btn btn-primary" to="/login">
                    Login
                  </Link>
                  <Link className="btn btn-light" to="/register">
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>

          {user && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '18px', background: 'rgba(255,255,255,0.8)', borderRadius: '24px', padding: '18px 20px', border: '1px solid rgba(17, 43, 29, 0.08)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', background: '#dfeecb', display: 'grid', placeItems: 'center' }}>
                {profilePhoto ? (
                  <img src={profilePhoto} alt="Rider profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontWeight: 800, fontSize: '1.5rem' }}>{user.name?.[0]?.toUpperCase() || 'R'}</span>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#5e6f63' }}>
                  {user.role === 'driver' ? 'Driver' : 'Rider'}
                </div>
                <strong style={{ display: 'block', marginTop: '4px', fontSize: '1.1rem' }}>{user.name}</strong>
                <Link to={user.role === 'driver' ? '/driver-profile' : '/profile'} style={{ display: 'inline-block', marginTop: '6px', color: '#153b2e', fontWeight: 700 }}>
                  View profile
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="container section">
        <h2>How it works</h2>
        <div className="card-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-num">0{index + 1}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container section service-section">
        <h2>Popular services</h2>
        <div className="card-grid service-grid">
          <div className="service-card">
            <span>Mini</span>
            <strong>Affordable city rides</strong>
          </div>
          <div className="service-card">
            <span>Sedan</span>
            <strong>Comfort for work trips</strong>
          </div>
          <div className="service-card">
            <span>SUV</span>
            <strong>Roomy family travel</strong>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
