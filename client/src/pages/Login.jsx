import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ErrorMessage from '../components/ErrorMessage';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', role: 'rider' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await login(form);
      navigate(response.user.role === 'driver' ? '/driver-dashboard' : response.user.role === 'admin' ? '/admin-dashboard' : '/rider-dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell auth-shell">
      <div className="auth-card">
        <h2>Welcome back</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Login as
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="rider">Rider</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <ErrorMessage message={error} />
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <p className="tiny-text">
            New to RideGo? <Link to="/register">Create an account</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
