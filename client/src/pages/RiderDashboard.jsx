import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RideMap from '../components/RideMap';
import api from '../services/api';

const formatStatus = (status) => {
  const labels = {
    pending: 'Waiting for driver',
    accepted: 'Driver accepted',
    in_progress: 'Trip in progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return labels[status] || status || 'Unknown';
};

const RiderDashboard = () => {
  const { user } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharingLocation, setSharingLocation] = useState(false);
  const watchIdRef = useRef(null);
  const lastLocationSentAtRef = useRef(0);

  const loadRides = async () => {
    try {
      const response = await api.get('/rides/my-rides');
      setRides(response.data.rides || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load your rider dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRides();
    const timer = window.setInterval(loadRides, 5000);

    return () => {
      window.clearInterval(timer);
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
    };
  }, []);

  const handleShareLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharingLocation(false);
      return;
    }

    if (!navigator.geolocation) {
      setError('Your browser does not support live location sharing.');
      return;
    }

    const activeRide = rides.find((ride) => ['accepted', 'in_progress'].includes(ride.status));
    if (!activeRide) {
      setError('A driver must accept your ride before live location sharing starts.');
      return;
    }

    setError('');
    setSharingLocation(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        if (Date.now() - lastLocationSentAtRef.current < 4000) return;
        lastLocationSentAtRef.current = Date.now();

        try {
          await api.patch(`/rides/${activeRide._id}/location`, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          await loadRides();
        } catch (err) {
          setError(err.response?.data?.message || 'Location could not be updated.');
        }
      },
      () => {
        setError('Please allow location access so your driver can track your ride.');
        setSharingLocation(false);
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  };

  const activeRide = rides.find((ride) => ['accepted', 'in_progress'].includes(ride.status));
  const recentRides = rides.slice(0, 3);
  const totalTrips = rides.length;
  const completedTrips = rides.filter((ride) => ride.status === 'completed').length;

  if (loading) {
    return (
      <div className="page-shell">
        <div className="container">
          <div className="empty-state">Loading rider dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="container" style={{ display: 'grid', gap: '22px' }}>
        <div className="panel" style={{
          padding: '28px',
          background: 'linear-gradient(135deg, #153b2e 0%, #1d4f3e 38%, #23886a 100%)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 18px 38px rgba(17, 43, 29, 0.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>Welcome back</p>
              <h1 style={{ margin: '8px 0 12px', fontSize: '2.1rem' }}>Hi, {user?.name || 'Rider'}</h1>
              <p style={{ margin: 0, maxWidth: '560px', color: 'rgba(255,255,255,0.82)' }}>
                Your ride workflow is ready. Book, track, and manage every trip from one place.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link className="btn btn-light" to="/book-ride">Book a ride</Link>
              <Link className="btn btn-primary" to="/my-rides">View rides</Link>
            </div>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Total trips</span>
            <strong>{totalTrips}</strong>
          </div>
          <div className="stat-card">
            <span>Completed</span>
            <strong>{completedTrips}</strong>
          </div>
          <div className="stat-card">
            <span>Active trip</span>
            <strong>{activeRide ? 'Live' : 'No ride'}</strong>
          </div>
          <div className="stat-card">
            <span>Saved places</span>
            <strong>2</strong>
          </div>
        </div>

        {error && <div className="error-box" style={{ marginTop: '8px' }}>{error}</div>}

        {activeRide ? (
          <div className="panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div>
                <p className="eyebrow">Active trip</p>
                <h3 style={{ margin: '6px 0' }}>{activeRide.pickup?.address} to {activeRide.dropoff?.address}</h3>
              </div>
              <div className="status-badge status-pending">{formatStatus(activeRide.status)}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
              <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Driver</strong>
                <span>{activeRide.driver?.name || 'Searching...'}</span>
              </div>
              <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Cab</strong>
                <span>{activeRide.cabType}</span>
              </div>
              <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
                <strong style={{ display: 'block', marginBottom: '8px' }}>Fare</strong>
                <span>₹{Number(activeRide.fare || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="map-panel-wrapper" style={{ marginBottom: '18px' }}>
              <RideMap
                pickup={activeRide.pickup}
                dropoff={activeRide.dropoff}
                riderLocation={activeRide.riderLocation}
                driverLocation={activeRide.driverLocation}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleShareLocation}>
                {sharingLocation ? 'Stop sharing location' : 'Share live location'}
              </button>
              <Link className="btn btn-light" to="/my-rides">Track trip</Link>
            </div>
          </div>
        ) : (
          <div className="panel" style={{ padding: '26px' }}>
            <p className="eyebrow">No active ride</p>
            <h3 style={{ margin: '8px 0 12px' }}>Your next trip is waiting</h3>
            <p className="tiny-text" style={{ marginBottom: '18px' }}>
              Book a ride and share your live location to let the driver locate you quickly.
            </p>
            <Link className="btn btn-primary" to="/book-ride">Book now</Link>
          </div>
        )}

        <div className="panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div>
              <p className="eyebrow">Recent rides</p>
              <h3 style={{ margin: '6px 0 0' }}>Your trip history</h3>
            </div>
            <Link className="btn btn-light" to="/my-rides">Open all</Link>
          </div>

          {recentRides.length === 0 ? (
            <div className="empty-state">No rides yet. Your most recent trips will appear here.</div>
          ) : (
            <div className="ride-list">
              {recentRides.map((ride) => (
                <div key={ride._id} className="ride-card">
                  <div className="ride-card-top">
                    <div>
                      <p className="muted-label">{ride.cabType}</p>
                      <strong>{ride.pickup?.address || 'Pickup'} → {ride.dropoff?.address || 'Destination'}</strong>
                    </div>
                    <span className="status-badge status-default">{formatStatus(ride.status)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <span>₹{Number(ride.fare || 0).toFixed(2)}</span>
                    <small>{new Date(ride.createdAt).toLocaleDateString('en-IN')}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiderDashboard;
