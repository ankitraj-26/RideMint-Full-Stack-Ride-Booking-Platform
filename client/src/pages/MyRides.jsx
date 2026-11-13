import { useEffect, useRef, useState } from 'react';
import ErrorMessage from '../components/ErrorMessage';
import LoadingSpinner from '../components/LoadingSpinner';
import RideMap from '../components/RideMap';
import TripProgress from '../components/TripProgress';
import api from '../services/api';

const formatRideStatus = (status) => {
  const labels = {
    pending: 'Waiting for driver',
    accepted: 'Accepted by driver',
    in_progress: 'Ride in progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return labels[status] || status || 'Unknown';
};

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MyRides = () => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentMethods, setPaymentMethods] = useState({});
  const [paymentLoadingRideId, setPaymentLoadingRideId] = useState('');
  const [sharingLocation, setSharingLocation] = useState(false);
  const ridesRef = useRef(rides);
  const watchIdRef = useRef(null);
  const lastLocationSentAtRef = useRef(0);
  ridesRef.current = rides;

  const loadRides = async () => {
    try {
      const response = await api.get('/rides/my-rides');
      const nextRides = response.data.rides || [];
      setRides(nextRides);
      if (!nextRides.some((ride) => ['accepted', 'in_progress'].includes(ride.status)) && watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setSharingLocation(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load rides.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRides();
    const refreshTimer = window.setInterval(loadRides, 5000);
    return () => {
      window.clearInterval(refreshTimer);
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
    };
  }, []);

  const handleShareLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharingLocation(false);
      return;
    }

    if (!navigator.geolocation) {
      setError('Browser location access is not available.');
      return;
    }

    const activeRides = ridesRef.current.filter((ride) => ['accepted', 'in_progress'].includes(ride.status));
    if (!activeRides.length) {
      setError('You can share live location after a driver accepts your ride.');
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
        const active = ridesRef.current.filter((ride) => ['accepted', 'in_progress'].includes(ride.status));
        try {
          await Promise.all(active.map((ride) => api.patch(`/rides/${ride._id}/location`, nextLocation)));
          loadRides();
        } catch (err) {
          setError(err.response?.data?.message || 'Your live location could not be shared.');
        }
      },
      () => {
        setError('Please allow location access so your driver can see your position.');
        setSharingLocation(false);
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  };

  const handleCancelRide = async (rideId) => {
    try {
      await api.patch(`/rides/${rideId}/cancel`);
      loadRides();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to cancel ride.');
    }
  };

  const handlePayment = async (rideId, method) => {
    setPaymentLoadingRideId(rideId);
    setPaymentMessage('');
    setError('');
    try {
      const response = await api.post(`/rides/${rideId}/payment`, { method });
      setPaymentMessage(response.data.message);
      await loadRides();
    } catch (err) {
      setError(err.response?.data?.message || 'Payment could not be recorded.');
    } finally {
      setPaymentLoadingRideId('');
    }
  };

  const activeRide = rides.find((ride) => ['accepted', 'in_progress'].includes(ride.status));

  if (loading) return <LoadingSpinner text="Loading your rides..." />;

  return (
    <div className="page-shell container">
      <h2>My rides</h2>
      <ErrorMessage message={error} />
      {paymentMessage && <div className="success-box payment-feedback">{paymentMessage}</div>}
      {rides.some((ride) => ['accepted', 'in_progress'].includes(ride.status)) && (
        <div className="panel location-share-box">
          <strong>Live trip location</strong>
          <p className="tiny-text">Location updates are shared with your assigned driver while enabled.</p>
          <button className="btn btn-primary" onClick={handleShareLocation}>
            {sharingLocation ? 'Stop sharing location' : 'Share my live location'}
          </button>
          <div className="map-panel-wrapper" style={{ marginTop: '16px' }}>
            <RideMap
              pickup={activeRide.pickup}
              dropoff={activeRide.dropoff}
              riderLocation={activeRide.riderLocation}
              driverLocation={activeRide.driverLocation}
            />
          </div>
        </div>
      )}

      {rides.length === 0 ? (
        <div className="empty-state">No rides yet.</div>
      ) : (
        <>
          {rides.filter((ride) => ride.status === 'completed').map((ride) => {
            const baseFare = Number(ride.fare || 0) * 0.9;
            const serviceFee = Number(ride.fare || 0) * 0.1;
            const total = Number(ride.fare || 0);

            return (
              <section className="panel payment-panel" key={`payment-${ride._id}`}>
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Trip completed</p>
                    <h3>Ride receipt</h3>
                    <p className="tiny-text">{ride.pickup.address} to {ride.dropoff.address}</p>
                  </div>
                  <strong className="payment-amount">₹{total.toFixed(2)}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '18px' }}>
                  <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>Trip date</strong>
                    <span>{formatDateTime(ride.updatedAt || ride.createdAt)}</span>
                  </div>
                  <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>Cab type</strong>
                    <span>{ride.cabType}</span>
                  </div>
                  <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>Driver</strong>
                    <span>{ride.driver?.name || 'N/A'}</span>
                  </div>
                </div>

                <div style={{ marginTop: '18px', padding: '18px', background: '#f7faf3', borderRadius: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                    <span>Base fare</span>
                    <strong>₹{baseFare.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                    <span>Service fee</span>
                    <strong>₹{serviceFee.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid rgba(17,43,29,0.12)', paddingTop: '10px', marginTop: '8px' }}>
                    <span>Total</span>
                    <strong>₹{total.toFixed(2)}</strong>
                  </div>
                </div>

                {ride.payment?.status === 'paid' ? (
                  <div className="success-box" style={{ marginTop: '18px' }}>
                    Paid by {ride.payment.method?.toUpperCase()} · {ride.payment.paidAt ? new Date(ride.payment.paidAt).toLocaleString() : 'Recorded'}
                  </div>
                ) : (
                  <div className="payment-controls" style={{ marginTop: '18px' }}>
                    <label htmlFor={`payment-method-${ride._id}`}>
                      Payment method
                      <select
                        id={`payment-method-${ride._id}`}
                        value={paymentMethods[ride._id] || 'upi'}
                        onChange={(event) => setPaymentMethods({ ...paymentMethods, [ride._id]: event.target.value })}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI (demo)</option>
                        <option value="card">Card (demo)</option>
                      </select>
                    </label>
                    <button
                      className="btn btn-primary"
                      onClick={() => handlePayment(ride._id, paymentMethods[ride._id] || 'upi')}
                      disabled={paymentLoadingRideId === ride._id}
                    >
                      {paymentLoadingRideId === ride._id ? 'Processing...' : 'Confirm payment'}
                    </button>
                    <p className="tiny-text payment-note">Demo checkout only. No real payment is charged or transferred.</p>
                  </div>
                )}
              </section>
            );
          })}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pickup</th>
                <th>Destination</th>
                <th>Cab</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Driver</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((ride) => (
                <tr key={ride._id}>
                  <td>{ride.pickup.address}</td>
                  <td>{ride.dropoff.address}</td>
                  <td>{ride.cabType}</td>
                  <td>₹{ride.fare}</td>
                  <td>{formatRideStatus(ride.status)}</td>
                  <td><TripProgress status={ride.status} /></td>
                  <td>{ride.driver ? ride.driver.name : 'Not assigned'}</td>
                  <td>
                    {ride.status === 'pending' && (
                      <button className="btn btn-danger" onClick={() => handleCancelRide(ride._id)}>
                        Cancel
                      </button>
                    )}
                    {ride.status === 'accepted' || ride.status === 'in_progress' ? (
                      <div className="tiny-text">
                        <div>Driver: {ride.driverLocation ? `${ride.driverLocation.latitude.toFixed(4)}, ${ride.driverLocation.longitude.toFixed(4)}` : 'Waiting for location'}</div>
                        <div>You: {ride.riderLocation ? `${ride.riderLocation.latitude.toFixed(4)}, ${ride.riderLocation.longitude.toFixed(4)}` : 'Not shared yet'}</div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
};

export default MyRides;
