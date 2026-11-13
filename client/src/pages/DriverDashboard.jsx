import { useEffect, useRef, useState } from 'react';
import ErrorMessage from '../components/ErrorMessage';
import LoadingSpinner from '../components/LoadingSpinner';
import RideMap from '../components/RideMap';
import TripProgress from '../components/TripProgress';
import api from '../services/api';

const formatRideStatus = (status) => {
  const labels = {
    pending: 'Pending',
    accepted: 'Accepted',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return labels[status] || status || 'Unknown';
};

const DriverDashboard = () => {
  const [availableRides, setAvailableRides] = useState([]);
  const [assignedRides, setAssignedRides] = useState([]);
  const [verification, setVerification] = useState({ status: 'not_started' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharingLocation, setSharingLocation] = useState(false);
  const assignedRidesRef = useRef(assignedRides);
  const watchIdRef = useRef(null);
  const lastLocationSentAtRef = useRef(0);
  assignedRidesRef.current = assignedRides;

  const loadData = async () => {
    try {
      const [availableResponse, assignedResponse, verificationResponse] = await Promise.all([
        api.get('/driver/rides/available'),
        api.get('/driver/rides/assigned'),
        api.get('/driver/verification'),
      ]);

      setAvailableRides(availableResponse.data.rides || []);
      const nextAssignedRides = assignedResponse.data.rides || [];
      setAssignedRides(nextAssignedRides);
      setVerification(verificationResponse.data.verification || { status: 'not_started' });
      if (!nextAssignedRides.some((ride) => ['accepted', 'in_progress'].includes(ride.status)) && watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setSharingLocation(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const refreshTimer = window.setInterval(loadData, 5000);
    return () => {
      window.clearInterval(refreshTimer);
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
    };
  }, []);

  const handleAcceptRide = async (rideId) => {
    try {
      await api.patch(`/driver/rides/${rideId}/accept`);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Ride could not be accepted.');
    }
  };

  const handleStatusUpdate = async (rideId, status) => {
    try {
      await api.patch(`/driver/rides/${rideId}/status`, { status });
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Status could not be updated.');
    }
  };

  const handleShareDriverLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharingLocation(false);
      return;
    }

    if (!navigator.geolocation) {
      setError('Browser geolocation is not supported in this device.');
      return;
    }

    const activeRides = assignedRidesRef.current.filter((ride) => ['accepted', 'in_progress'].includes(ride.status));
    if (!activeRides.length) {
      setError('Location sharing becomes available after you accept a ride.');
      return;
    }

    setError('');
    setSharingLocation(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        if (Date.now() - lastLocationSentAtRef.current < 4000) return;
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        lastLocationSentAtRef.current = Date.now();
        const active = assignedRidesRef.current.filter((ride) => ['accepted', 'in_progress'].includes(ride.status));
        try {
          await Promise.all(active.map((ride) => api.patch(`/rides/${ride._id}/location`, nextLocation)));
          loadData();
        } catch (err) {
          setError(err.response?.data?.message || 'Driver location could not be shared.');
        }
      },
      () => {
        setError('Enable location permission so riders can track the driver.');
        setSharingLocation(false);
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  };

  const activeRide = assignedRides.find((ride) => ['accepted', 'in_progress'].includes(ride.status));
  const riderLocation = activeRide?.riderLocation;
  const driverLocation = activeRide?.driverLocation;
  const verificationStatus = verification?.status || 'not_started';
  const verificationText = {
    not_started: 'Verification not started',
    pending_review: 'Submitted for review',
    approved: 'Approved and active',
    rejected: 'Rejected - resubmit required',
  }[verificationStatus] || 'Verification pending';

  const stats = {
    available: availableRides.length,
    assigned: assignedRides.length,
    active: assignedRides.filter((ride) => ride.status === 'accepted' || ride.status === 'in_progress').length,
    earnings: assignedRides.reduce((sum, ride) => sum + Number(ride.fare || 0), 0),
  };

  if (loading) return <LoadingSpinner text="Loading driver dashboard..." />;

  return (
    <div className="page-shell container">
      <div className="driver-header panel">
        <div>
          <p className="eyebrow">Driver panel</p>
          <h2>Welcome back, driver</h2>
        </div>
        <button className="btn btn-primary" onClick={handleShareDriverLocation}>
          {sharingLocation ? 'Stop sharing location' : 'Share my location'}
        </button>
      </div>

      <ErrorMessage message={error} />

      <div className="panel" style={{ marginBottom: '20px', background: verificationStatus === 'approved' ? '#edf9ee' : '#fff4e6' }}>
        <p className="eyebrow">Driver verification</p>
        <h3>{verificationText}</h3>
        <p style={{ margin: 0 }}>
          {verificationStatus === 'approved'
            ? 'Your driver profile is approved and you can accept rides.'
            : 'Complete the verification steps before accepting rides. Admin approval is required.'}
        </p>
      </div>

      <div className="stats-grid dashboard-stats">
        <div className="stat-card">
          <span>Available rides</span>
          <strong>{stats.available}</strong>
        </div>
        <div className="stat-card">
          <span>Assigned</span>
          <strong>{stats.assigned}</strong>
        </div>
        <div className="stat-card">
          <span>Active trip</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="stat-card">
          <span>Today</span>
          <strong>₹{stats.earnings}</strong>
        </div>
      </div>

      <div className="location-share-grid">
        <div className="panel location-share-box">
          <h3>Rider live location</h3>
          {riderLocation ? (
            <>
              <p><strong>Lat:</strong> {riderLocation.latitude.toFixed(4)}</p>
              <p><strong>Lng:</strong> {riderLocation.longitude.toFixed(4)}</p>
              <p className="tiny-text">Last update: {new Date(riderLocation.updatedAt).toLocaleTimeString()}</p>
            </>
          ) : (
            <div className="empty-state">No rider location shared yet.</div>
          )}
        </div>

        <div className="panel location-share-box">
          <h3>Driver live location</h3>
          {driverLocation ? (
            <>
              <p><strong>Lat:</strong> {driverLocation.latitude.toFixed(4)}</p>
              <p><strong>Lng:</strong> {driverLocation.longitude.toFixed(4)}</p>
              <p className="tiny-text">Last update: {new Date(driverLocation.updatedAt).toLocaleTimeString()}</p>
            </>
          ) : (
            <div className="empty-state">Driver location not shared yet.</div>
          )}
        </div>
      </div>

      <div className="panel map-panel-wrapper" style={{ marginTop: '20px' }}>
        <RideMap riderLocation={riderLocation} driverLocation={driverLocation} />
      </div>

      <div className="stacked-sections" style={{ marginTop: '20px' }}>
        <section className="panel">
          <div className="section-header">
            <h3>Available rides</h3>
            <span className="pill">{availableRides.length} open</span>
          </div>
          {availableRides.length === 0 ? (
            <div className="empty-state">No pending rides available.</div>
          ) : (
            <div className="ride-list">
              {availableRides.map((ride) => (
                <div key={ride._id} className="ride-card">
                  <div className="ride-card-top">
                    <div>
                      <p className="muted-label">Customer</p>
                      <strong>{ride.customer?.name}</strong>
                    </div>
                    <span className="status-badge status-pending">{formatRideStatus(ride.status)}</span>
                  </div>
                  <p><strong>Pickup:</strong> {ride.pickup.address}</p>
                  <p><strong>Destination:</strong> {ride.dropoff.address}</p>
                  <p><strong>Cab:</strong> {ride.cabType}</p>
                  <p><strong>Fare:</strong> ₹{ride.fare}</p>
                  <button className="btn btn-primary" onClick={() => handleAcceptRide(ride._id)}>Accept ride</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-header">
            <h3>Assigned rides</h3>
            <span className="pill pill-success">{assignedRides.length} active</span>
          </div>
          {assignedRides.length === 0 ? (
            <div className="empty-state">No assigned rides.</div>
          ) : (
            <div className="ride-list">
              {assignedRides.map((ride) => (
                <div key={ride._id} className="ride-card">
                  <div className="ride-card-top">
                    <div>
                      <p className="muted-label">Customer</p>
                      <strong>{ride.customer?.name}</strong>
                    </div>
                    <span className={`status-badge ${ride.status === 'accepted' ? 'status-accepted' : ride.status === 'in_progress' ? 'status-progress' : 'status-default'}`}>
                      {formatRideStatus(ride.status)}
                    </span>
                  </div>
                  <p><strong>Pickup:</strong> {ride.pickup.address}</p>
                  <p><strong>Destination:</strong> {ride.dropoff.address}</p>
                  <TripProgress status={ride.status} />
                  <div className="inline-buttons">
                    {ride.status === 'accepted' && (
                      <button className="btn btn-light" onClick={() => handleStatusUpdate(ride._id, 'in_progress')}>Start trip</button>
                    )}
                    {ride.status === 'in_progress' && (
                      <button className="btn btn-primary" onClick={() => handleStatusUpdate(ride._id, 'completed')}>Complete trip</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DriverDashboard;
