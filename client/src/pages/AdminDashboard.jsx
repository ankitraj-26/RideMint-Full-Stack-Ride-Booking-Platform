import { useEffect, useMemo, useState } from 'react';
import ErrorMessage from '../components/ErrorMessage';
import LoadingSpinner from '../components/LoadingSpinner';
import api from '../services/api';

const AdminDashboard = () => {
  const [stats, setStats] = useState({});
  const [rides, setRides] = useState([]);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [providerStatus, setProviderStatus] = useState({ email: { configured: false, safeStatus: 'not_configured' }, sms: { configured: false, safeStatus: 'not_configured' }, whatsapp: { configured: false, safeStatus: 'not_configured' } });
  const [notificationSummary, setNotificationSummary] = useState({ pending: 0, failed: 0, sent: 0, queued: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRideId, setSelectedRideId] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [rideActionLoadingId, setRideActionLoadingId] = useState('');
  const [userActionLoadingId, setUserActionLoadingId] = useState('');

  const loadData = async () => {
    try {
      const [statsResponse, ridesResponse, usersResponse, verificationResponse, eventsResponse, notificationStatusResponse] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/rides', { params: { status: statusFilter || undefined, search: search || undefined } }),
        api.get('/admin/users'),
        api.get('/admin/verification/pending'),
        api.get('/admin/events'),
        api.get('/admin/notifications/status'),
      ]);

      setStats(statsResponse.data.stats || {});
      setRides(ridesResponse.data.rides || []);
      setUsers(usersResponse.data.users || []);
      setPendingVerifications(verificationResponse.data.users || []);
      setEvents(eventsResponse.data.events || []);
      setNotificationSummary(notificationStatusResponse.data.summary || { pending: 0, failed: 0, sent: 0, queued: 0 });
      setProviderStatus(notificationStatusResponse.data.summary?.providerStatus || { email: { configured: false, safeStatus: 'not_configured' }, sms: { configured: false, safeStatus: 'not_configured' }, whatsapp: { configured: false, safeStatus: 'not_configured' } });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, search]);

  const leaderboard = useMemo(() => {
    const byDriver = {};

    rides.forEach((ride) => {
      const driverId = ride.driver?._id || ride.driver;
      if (!driverId) return;

      if (!byDriver[driverId]) {
        byDriver[driverId] = {
          driverName: ride.driver?.name || 'Unassigned',
          rides: 0,
          completedRides: 0,
          revenue: 0,
        };
      }

      byDriver[driverId].rides += 1;
      if (ride.status === 'completed') {
        byDriver[driverId].completedRides += 1;
        byDriver[driverId].revenue += Number(ride.fare || 0);
      }
    });

    return Object.values(byDriver)
      .sort((a, b) => b.revenue - a.revenue || b.completedRides - a.completedRides)
      .slice(0, 5);
  }, [rides]);

  const handleExportSummary = () => {
    const rows = [
      ['Ride ID', 'Customer', 'Driver', 'Cab', 'Pickup', 'Destination', 'Fare', 'Status', 'Payment'],
      ...rides.map((ride) => [
        ride._id,
        ride.customer?.name || 'N/A',
        ride.driver?.name || 'Unassigned',
        ride.cabType,
        ride.pickup?.address || 'N/A',
        ride.dropoff?.address || 'N/A',
        Number(ride.fare || 0).toFixed(2),
        ride.status,
        ride.payment?.status || 'pending',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ridego-admin-summary.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleViewRideDetails = async (rideId) => {
    if (!rideId) return;

    setSelectedRideId(rideId);
    setDetailsLoading(true);
    setSelectedRide(null);

    try {
      const response = await api.get(`/admin/rides/${rideId}`);
      setSelectedRide(response.data.ride || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load ride details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleRideStatusUpdate = async (rideId, nextStatus) => {
    setRideActionLoadingId(rideId);
    setError('');

    try {
      const response = await api.patch(`/admin/rides/${rideId}/status`, { status: nextStatus });
      setSelectedRide(response.data.ride || selectedRide);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update ride status.');
    } finally {
      setRideActionLoadingId('');
    }
  };

  const handleUserStatusUpdate = async (userId, nextStatus) => {
    setUserActionLoadingId(userId);
    setError('');

    try {
      await api.patch(`/admin/users/${userId}/status`, { isActive: nextStatus });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update user status.');
    } finally {
      setUserActionLoadingId('');
    }
  };

  const handleVerificationAction = async (userId, action, notes = '') => {
    setError('');

    try {
      await api.patch(`/admin/verification/${userId}/${action}`, { notes });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update driver verification.');
    }
  };

  if (loading) return <LoadingSpinner text="Loading admin dashboard..." />;

  return (
    <div className="page-shell container">
      <h2>Admin dashboard</h2>
      <ErrorMessage message={error} />

      <div className="stats-grid">
        <div className="stat-card"><span>Total users</span><strong>{stats.totalUsers || 0}</strong></div>
        <div className="stat-card"><span>Customers</span><strong>{stats.totalCustomers || 0}</strong></div>
        <div className="stat-card"><span>Drivers</span><strong>{stats.totalDrivers || 0}</strong></div>
        <div className="stat-card"><span>Active rides</span><strong>{stats.activeRides || 0}</strong></div>
        <div className="stat-card"><span>Total revenue</span><strong>₹{Number(stats.totalRevenue || 0).toFixed(2)}</strong></div>
        <div className="stat-card"><span>Pending</span><strong>{stats.pendingRides || 0}</strong></div>
        <div className="stat-card"><span>Completed</span><strong>{stats.completedRides || 0}</strong></div>
        <div className="stat-card"><span>Cancelled</span><strong>{stats.cancelledRides || 0}</strong></div>
      </div>

      <div className="panel admin-controls">
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rides or customer name" />
        <button className="btn btn-primary" onClick={handleExportSummary}>
          Export summary
        </button>
      </div>

      <div className="panel" style={{ marginTop: '24px' }}>
        <h3>Notification delivery status</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <span>Email</span>
            <strong>{providerStatus.email?.configured ? 'Configured' : 'Not configured'}</strong>
          </div>
          <div className="stat-card">
            <span>SMS</span>
            <strong>{providerStatus.sms?.configured ? 'Configured' : 'Not configured'}</strong>
          </div>
          <div className="stat-card">
            <span>WhatsApp</span>
            <strong>{providerStatus.whatsapp?.configured ? 'Configured' : 'Not configured'}</strong>
          </div>
          <div className="stat-card">
            <span>Live email</span>
            <strong>{providerStatus.email?.liveDeliveryEnabled ? 'Enabled' : 'Disabled'}</strong>
          </div>
          <div className="stat-card">
            <span>Queued</span>
            <strong>{notificationSummary.queued || 0}</strong>
          </div>
          <div className="stat-card">
            <span>Failed</span>
            <strong>{notificationSummary.failed || 0}</strong>
          </div>
          <div className="stat-card">
            <span>Sent</span>
            <strong>{notificationSummary.sent || 0}</strong>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '24px' }}>
        <h3>Operational event feed</h3>
        {events.length === 0 ? (
          <div className="empty-state">No admin events yet.</div>
        ) : (
          <div className="ride-list">
            {events.map((event) => (
              <div key={event.id} className="ride-card">
                <div className="ride-card-top">
                  <div>
                    <p className="muted-label">{event.category}</p>
                    <strong>{event.title}</strong>
                  </div>
                  <span className="status-badge status-info">{event.type}</span>
                </div>
                <p>{event.message}</p>
                <small>{new Date(event.timestamp).toLocaleString('en-IN')}</small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: '24px' }}>
        <h3>Driver verification queue</h3>
        {pendingVerifications.length === 0 ? (
          <div className="empty-state">No users currently need review.</div>
        ) : (
          <div className="ride-list">
            {pendingVerifications.map((driver) => (
              <div key={driver._id} className="ride-card">
                <div className="ride-card-top">
                  <div>
                    <p className="muted-label">Driver</p>
                    <strong>{driver.name}</strong>
                  </div>
                  <span className={`status-badge ${driver.verification?.status === 'rejected' ? 'status-default' : 'status-pending'}`}>
                    {driver.verification?.status || 'pending_review'}
                  </span>
                </div>
                <p><strong>Email:</strong> {driver.email}</p>
                <p><strong>Personal ID:</strong> {driver.verification?.personalId || 'N/A'}</p>
                <p><strong>Vehicle:</strong> {driver.verification?.vehicle?.registrationNumber || 'N/A'}</p>
                <p><strong>Docs:</strong> {driver.verification?.documents?.length || 0}</p>
                <div className="inline-buttons" style={{ marginTop: '12px' }}>
                  <button className="btn btn-primary" onClick={() => handleVerificationAction(driver._id, 'approve', 'Verified by admin review.')}>Approve</button>
                  <button className="btn btn-light" onClick={() => handleVerificationAction(driver._id, 'reject', 'Documents need correction and resubmission.')}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: '24px' }}>
        <h3>Top drivers</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Driver</th>
                <th>Completed rides</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((driver, index) => (
                <tr key={driver.driverName + index}>
                  <td>#{index + 1}</td>
                  <td>{driver.driverName}</td>
                  <td>{driver.completedRides}</td>
                  <td>₹{Number(driver.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Ride management</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ride ID</th>
                <th>Customer</th>
                <th>Driver</th>
                <th>Pickup</th>
                <th>Destination</th>
                <th>Cab</th>
                <th>Fare</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((ride) => (
                <tr key={ride._id}>
                  <td>{ride._id.slice(-6)}</td>
                  <td>{ride.customer?.name || 'N/A'}</td>
                  <td>{ride.driver?.name || 'Unassigned'}</td>
                  <td>{ride.pickup?.address || 'N/A'}</td>
                  <td>{ride.dropoff?.address || 'N/A'}</td>
                  <td>{ride.cabType}</td>
                  <td>₹{ride.fare}</td>
                  <td>{ride.status}</td>
                  <td>
                    <button className="btn btn-light" onClick={() => handleViewRideDetails(ride._id)}>
                      {selectedRideId === ride._id && detailsLoading ? 'Loading...' : 'View detail'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRide && (
        <div className="panel" style={{ marginTop: '24px' }}>
          <h3>Trip detail</h3>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: '18px' }}>
            <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Customer</strong>
              <span>{selectedRide.customer?.name || 'N/A'}</span>
            </div>
            <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Driver</strong>
              <span>{selectedRide.driver?.name || 'Unassigned'}</span>
            </div>
            <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Cab</strong>
              <span>{selectedRide.cabType}</span>
            </div>
            <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Fare</strong>
              <span>₹{Number(selectedRide.fare || 0).toFixed(2)}</span>
            </div>
            <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Status</strong>
              <span>{selectedRide.status}</span>
            </div>
            <div className="panel" style={{ padding: '16px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Payment</strong>
              <span>{selectedRide.payment?.status === 'paid' ? 'Paid' : 'Pending'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
            <button className="btn btn-primary" onClick={() => handleRideStatusUpdate(selectedRide._id, 'completed')} disabled={rideActionLoadingId === selectedRide._id}>
              {rideActionLoadingId === selectedRide._id ? 'Updating...' : 'Resolve ride'}
            </button>
            <button className="btn btn-light" onClick={() => handleRideStatusUpdate(selectedRide._id, 'cancelled')} disabled={rideActionLoadingId === selectedRide._id}>
              Cancel ride
            </button>
          </div>

          <div className="panel" style={{ marginTop: '18px', padding: '18px', background: '#f7faf3' }}>
            <strong style={{ display: 'block', marginBottom: '8px' }}>Pickup</strong>
            <p style={{ margin: 0 }}>{selectedRide.pickup?.address || 'N/A'}</p>
          </div>

          <div className="panel" style={{ marginTop: '12px', padding: '18px', background: '#f7faf3' }}>
            <strong style={{ display: 'block', marginBottom: '8px' }}>Destination</strong>
            <p style={{ margin: 0 }}>{selectedRide.dropoff?.address || 'N/A'}</p>
          </div>

          <div className="panel" style={{ marginTop: '12px', padding: '18px', background: '#f7faf3' }}>
            <strong style={{ display: 'block', marginBottom: '8px' }}>Weather snapshot</strong>
            <p style={{ margin: '0 0 6px' }}>Condition: {selectedRide.weatherSnapshot?.condition || 'N/A'}</p>
            <p style={{ margin: '0 0 6px' }}>Multiplier: {selectedRide.weatherSnapshot?.multiplier || 1}</p>
            <p style={{ margin: 0 }}>Temperature: {selectedRide.weatherSnapshot?.temperatureC ?? 'N/A'}°C</p>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>User list</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-light"
                      onClick={() => handleUserStatusUpdate(user._id, !user.isActive)}
                      disabled={userActionLoadingId === user._id}
                    >
                      {userActionLoadingId === user._id ? 'Updating...' : user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
