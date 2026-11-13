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

const DriverProfile = () => {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({ name: user?.name || '' });
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem(getProfilePhotoKey(user)) || '');
  const [verification, setVerification] = useState({
    status: 'not_started',
    personalId: '',
    documents: [],
    vehicle: {},
    videoKyc: { provider: 'zego', status: 'not_started', token: '' },
  });
  const [verificationForm, setVerificationForm] = useState({
    personalId: '',
    licenseUrl: '',
    idUrl: '',
    vehicleMake: '',
    vehicleModel: '',
    registrationNumber: '',
    vehicleColor: '',
    videoSessionId: '',
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);

  useEffect(() => {
    setFormData({ name: user?.name || '' });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setProfilePhoto(user.photo || localStorage.getItem(getProfilePhotoKey(user)) || '');
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const photoKey = getProfilePhotoKey(user);
    if (profilePhoto) {
      localStorage.setItem(photoKey, profilePhoto);
    } else {
      localStorage.removeItem(photoKey);
    }
  }, [profilePhoto, user]);

  useEffect(() => {
    if (!user || user.role !== 'driver') return;

    const loadVerification = async () => {
      try {
        const response = await api.get('/driver/verification');
        const nextVerification = response.data.verification || { status: 'not_started', documents: [], vehicle: {}, videoKyc: { provider: 'zego', status: 'not_started', token: '' } };
        setVerification(nextVerification);
        setVerificationForm({
          personalId: nextVerification.personalId || '',
          licenseUrl: nextVerification.documents?.find((doc) => doc.type === 'license')?.url || '',
          idUrl: nextVerification.documents?.find((doc) => doc.type === 'id')?.url || '',
          vehicleMake: nextVerification.vehicle?.make || '',
          vehicleModel: nextVerification.vehicle?.model || '',
          registrationNumber: nextVerification.vehicle?.registrationNumber || '',
          vehicleColor: nextVerification.vehicle?.color || '',
          videoSessionId: nextVerification.videoKyc?.sessionId || '',
        });
      } catch (err) {
        console.error('Unable to load driver verification:', err);
      }
    };

    loadVerification();
  }, [user]);

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

  const handleVerificationSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    if (!verificationForm.personalId.trim()) {
      setError('Personal ID is required.');
      return;
    }

    const documents = [
      verificationForm.licenseUrl && { type: 'license', url: verificationForm.licenseUrl, status: 'uploaded' },
      verificationForm.idUrl && { type: 'id', url: verificationForm.idUrl, status: 'uploaded' },
    ].filter(Boolean);

    if (!documents.length) {
      setError('Please upload at least one driving document URL.');
      return;
    }

    if (!verificationForm.registrationNumber.trim()) {
      setError('Vehicle registration number is required.');
      return;
    }

    setVerificationSaving(true);

    try {
      const response = await api.post('/driver/verification/submit', {
        personalId: verificationForm.personalId,
        documents,
        vehicle: {
          make: verificationForm.vehicleMake,
          model: verificationForm.vehicleModel,
          registrationNumber: verificationForm.registrationNumber,
          color: verificationForm.vehicleColor,
        },
        videoKyc: {
          provider: 'zego',
          sessionId: verificationForm.videoSessionId || `video-${Date.now()}`,
          status: 'pending',
        },
      });

      setVerification(response.data.verification || { status: 'pending_review' });
      setStatus('Driver verification submitted successfully. Admin approval is pending.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to submit verification right now.');
    } finally {
      setVerificationSaving(false);
    }
  };

  const handleVideoKycRequest = async () => {
    setTokenLoading(true);
    setError('');
    try {
      const response = await api.get('/driver/verification/video-token');
      setVerification((current) => ({
        ...current,
        videoKyc: { ...(current.videoKyc || {}), provider: 'zego', status: 'pending', token: response.data.token || '' },
      }));
      setStatus('Video KYC token generated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to generate the video KYC token.');
    } finally {
      setTokenLoading(false);
    }
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
                  alt="Driver profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{user.name?.[0]?.toUpperCase() || 'D'}</span>
              )}
            </div>
            <div>
              <p className="eyebrow">Driver profile</p>
              <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Welcome, {user.name}</h2>
            </div>
          </div>

          <p className="tiny-text" style={{ marginTop: 0 }}>
            Manage your driver account, profile details, and availability.
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
              <span>{user.role === 'driver' ? 'Driver' : user.role}</span>
            </div>

            <div className="panel" style={{ padding: '20px', background: '#f7faf3' }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Member since</strong>
              <span>{joinedAt}</span>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '24px', padding: '24px', background: '#f7faf3' }}>
            <p className="eyebrow" style={{ marginBottom: '16px' }}>Quick actions</p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" to="/driver-dashboard">
                Go to dashboard
              </Link>
              <Link className="btn btn-light" to="/">
                Home
              </Link>
            </div>
          </div>

          {user.role === 'driver' && (
            <div className="panel" style={{ marginTop: '24px', padding: '24px', background: '#f7faf3' }}>
              <p className="eyebrow" style={{ marginBottom: '14px' }}>Driver verification</p>

              <div style={{ marginBottom: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span className="pill" style={{ background: verification.status === 'approved' ? '#dff5e1' : '#f5e7d1' }}>
                  {verification.status || 'not_started'}
                </span>
                <button type="button" className="btn btn-light" onClick={handleVideoKycRequest} disabled={tokenLoading}>
                  {tokenLoading ? 'Generating...' : 'Generate video KYC token'}
                </button>
              </div>

              <form className="form-grid" onSubmit={handleVerificationSubmit}>
                <label>
                  Personal ID / license number
                  <input
                    value={verificationForm.personalId}
                    onChange={(event) => setVerificationForm({ ...verificationForm, personalId: event.target.value })}
                    placeholder="DL-12345"
                  />
                </label>

                <label>
                  Driver license URL
                  <input
                    value={verificationForm.licenseUrl}
                    onChange={(event) => setVerificationForm({ ...verificationForm, licenseUrl: event.target.value })}
                    placeholder="https://.../license.jpg"
                  />
                </label>

                <label>
                  Government ID URL
                  <input
                    value={verificationForm.idUrl}
                    onChange={(event) => setVerificationForm({ ...verificationForm, idUrl: event.target.value })}
                    placeholder="https://.../id.jpg"
                  />
                </label>

                <label>
                  Vehicle make
                  <input
                    value={verificationForm.vehicleMake}
                    onChange={(event) => setVerificationForm({ ...verificationForm, vehicleMake: event.target.value })}
                    placeholder="Maruti"
                  />
                </label>

                <label>
                  Vehicle model
                  <input
                    value={verificationForm.vehicleModel}
                    onChange={(event) => setVerificationForm({ ...verificationForm, vehicleModel: event.target.value })}
                    placeholder="Swift"
                  />
                </label>

                <label>
                  Registration number
                  <input
                    value={verificationForm.registrationNumber}
                    onChange={(event) => setVerificationForm({ ...verificationForm, registrationNumber: event.target.value })}
                    placeholder="DL01AB1234"
                  />
                </label>

                <label>
                  Vehicle color
                  <input
                    value={verificationForm.vehicleColor}
                    onChange={(event) => setVerificationForm({ ...verificationForm, vehicleColor: event.target.value })}
                    placeholder="White"
                  />
                </label>

                <label>
                  Video KYC session ID
                  <input
                    value={verificationForm.videoSessionId}
                    onChange={(event) => setVerificationForm({ ...verificationForm, videoSessionId: event.target.value })}
                    placeholder="zego-session-id"
                  />
                </label>

                <button type="submit" className="btn btn-primary" disabled={verificationSaving} style={{ alignSelf: 'end' }}>
                  {verificationSaving ? 'Submitting...' : 'Submit verification'}
                </button>
              </form>

              {verification.videoKyc?.token && (
                <div className="panel" style={{ marginTop: '16px', padding: '14px', background: '#edf9ee' }}>
                  <strong>Video KYC token:</strong>
                  <p style={{ margin: '8px 0 0', wordBreak: 'break-all' }}>{verification.videoKyc.token}</p>
                </div>
              )}
            </div>
          )}

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

          <div className="success-box" style={{ marginTop: '24px' }}>
            Driver status: {verification.status === 'approved' ? 'Approved and ready for rides.' : 'Verification pending approval.'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverProfile;
