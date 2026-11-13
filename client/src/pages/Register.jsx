import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ErrorMessage from '../components/ErrorMessage';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'rider' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await register(form);
      navigate(response.user.role === 'driver' ? '/driver-dashboard' : response.user.role === 'admin' ? '/admin-dashboard' : '/book-ride');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell auth-shell">
      <div className="auth-card">
        <h2>Create your account</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            I want to join as
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="rider">Rider</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Full name
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Password
            <input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <ErrorMessage message={error} />
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Creating account...' : 'Register'}
          </button>
          <p className="tiny-text">
            Already have an account? <Link to="/login">Login here</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
