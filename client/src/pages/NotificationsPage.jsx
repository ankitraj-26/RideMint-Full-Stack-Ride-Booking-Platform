import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const formatDate = (value) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const NotificationPage = () => {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    if (!user || !token) return;
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (error) {
      console.error('Failed to load notifications', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [user, token]);

  useEffect(() => {
    if (!user?._id) return undefined;

    const socketUrl = (api.defaults.baseURL || 'http://localhost:5000/api').replace(/\/api$/, '');
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.emit('register', { userId: user._id });
    socket.on('notification', (notification) => {
      setNotifications((previous) => [notification, ...previous]);
      setUnreadCount((count) => count + 1);
    });

    return () => socket.disconnect();
  }, [user?._id]);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((previous) =>
        previous.map((notification) => (notification._id === id ? { ...notification, isRead: true } : notification))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((previous) => previous.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark notifications as read', error);
    }
  };

  return (
    <div className="container" style={{ padding: '24px 0 48px' }}>
      <div className="panel-card" style={{ maxWidth: '920px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div>
            <p className="eyebrow">Notification center</p>
            <h2 style={{ margin: 0 }}>{user?.role === 'admin' ? 'Admin alerts' : user?.role === 'driver' ? 'Driver notifications' : 'My notifications'}</h2>
          </div>
          <button className="btn btn-primary" onClick={markAllRead} disabled={notifications.length === 0 || unreadCount === 0}>
            Mark all read
          </button>
        </div>

        <div style={{ marginBottom: '18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span className="badge badge-primary">{unreadCount} unread</span>
          <span className="badge badge-soft">{notifications.length} total</span>
        </div>

        {loading ? (
          <p>Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <div className="empty-state">No notifications available yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {notifications.map((notification) => (
              <article key={notification._id} className={`notification-item ${notification.isRead ? 'read' : 'unread'}`} style={{ padding: '18px 20px', border: '1px solid rgba(17,43,29,0.08)', borderRadius: '14px', background: notification.isRead ? '#f8fafc' : '#eefcf4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <strong>{notification.title}</strong>
                      {!notification.isRead && <span className="badge badge-primary">New</span>}
                    </div>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>{notification.message}</p>
                  </div>
                  {!notification.isRead && (
                    <button className="btn btn-light" onClick={() => markRead(notification._id)}>Read</button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', color: '#475569', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                  <span>{notification.notificationType}</span>
                  <span>•</span>
                  <span>{notification.channel}</span>
                  <span>•</span>
                  <span>{formatDate(notification.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPage;
