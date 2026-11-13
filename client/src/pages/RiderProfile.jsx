import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'ridego_saved_places';

const getProfilePhotoKey = (user) => {
  if (!user) return 'ridego_profile_photo';
  const identity = user.email || user._id || user.name || 'guest';
  return `ridego_profile_photo_${user.role || 'user'}_${String(identity).replace(/[^a-zA-Z0-9]/g, '_')}`;
};

const defaultPlaces = {
  home: '',
  work: '',
};

const RiderProfile = () => {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({ name: user?.name || '' });
  const [savedPlaces, setSavedPlaces] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...defaultPlaces, ...JSON.parse(stored) } : defaultPlaces;
    } catch (error) {
      return defaultPlaces;
    }
  });
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem(getProfilePhotoKey(user)) || '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFormData({ name: user?.name || '' });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setProfilePhoto(user.photo || localStorage.getItem(getProfilePhotoKey(user)) || '');
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlaces));
  }, [savedPlaces]);

  useEffect(() => {
    if (!user) return;
    const photoKey = getProfilePhotoKey(user);
    if (profilePhoto) {
      localStorage.setItem(photoKey, profilePhoto);
    } else {
      localStorage.removeItem(photoKey);
    }
  }, [profilePhoto, user]);

  const handleSave = async (event) => {
    if (event) event.preventDefault();
    setError('');
    setStatus('');

    if (!formData.name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlaces));

      if (user) {
        const photoKey = getProfilePhotoKey(user);
        if (profilePhoto) {
          localStorage.setItem(photoKey, profilePhoto);
        } else {
          localStorage.removeItem(photoKey);
        }
      }

      await api.put('/auth/profile', { name: formData.name, photo: profilePhoto || '' });
      await refreshUser();
      setStatus('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update profile right now.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlaceChange = (key, value) => {
    setSavedPlaces((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setProfilePhoto(result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setProfilePhoto('');
    if (user) {
      localStorage.removeItem(getProfilePhotoKey(user));
    }
  };

  if (!user) {
    return (
      <div className="page-shell">
        <div className="container">
          <div className="empty-state">Loading profile...</div>
        </div>
      </div>
    );
  }

  const joinedAt = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Recently';

  return (
    <div className="page-shell">
      <div className="container" style={{ maxWidth: '780px' }}>
        <div className="panel" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#dfeecb',
                display: 'grid',
                placeItems: 'center',
                border: '2px solid rgba(21, 59, 46, 0.12)',
              }}
            >
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt="Rider profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{user.name?.[0]?.toUpperCase() || 'R'}</span>
              )}
            </div>
            <div>
              <p className="eyebrow">Rider profile</p>
              <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Welcome, {user.name}</h2>
            </div>
          </div>

          <p className="tiny-text" style={{ marginTop: 0 }}>
            Your account details and rider status are below.
          </p>

          <form className="form-grid" style={{ marginTop: '26px' }} onSubmit={handleSave}>
            <label>
              Full name
              <input
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Enter your full name"
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </form>

          {status && <div className="success-box" style={{ marginTop: '18px' }}>{status}</div>}
          {error && <div className="error-box" style={{ marginTop: '18px' }}>{error}</div>}

          <div className="form-grid" style={{ marginTop: '22px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="panel" style={{ padding: '20px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Full name</strong>
              <span>{user.name}</span>
            </div>

            <div className="panel" style={{ padding: '20px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Email</strong>
              <span>{user.email}</span>
            </div>

            <div className="panel" style={{ padding: '20px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Account type</strong>
              <span>{user.role === 'customer' ? 'Rider' : user.role}</span>
            </div>

            <div className="panel" style={{ padding: '20px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Member since</strong>
              <span>{joinedAt}</span>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '24px', padding: '24px', background: '#f7faf3' }}>
            <p className="eyebrow" style={{ marginBottom: '16px' }}>Quick actions</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" to="/book-ride">
                Book a ride
              </Link>
              <Link className="btn btn-light" to="/my-rides">
                View my rides
              </Link>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '24px', padding: '24px', background: '#f7faf3' }}>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>Profile photo</p>
            <label>
              Select photo
              <input type="file" accept="image/*" onChange={handlePhotoUpload} />
            </label>
            {profilePhoto && (
              <div style={{ marginTop: '16px' }}>
                <img
                  src={profilePhoto}
                  alt="Profile preview"
                  style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                />
                <button type="button" className="btn btn-light" onClick={handleRemovePhoto} style={{ marginTop: '12px' }}>
                  Remove photo
                </button>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '24px', padding: '24px', background: '#f7faf3' }}>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>Saved places</p>
            <div className="form-grid">
              {Object.entries({ home: 'Home', work: 'Work' }).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={savedPlaces[key] || ''}
                    onChange={(event) => handlePlaceChange(key, event.target.value)}
                    placeholder={`Enter ${label.toLowerCase()} address`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </div>

          <div className="success-box" style={{ marginTop: '24px' }}>
            Rider status: Active and ready to book rides.
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiderProfile;
