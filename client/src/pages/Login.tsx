import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiUrl } from '../services/apiBase';
import { http, describeRequestError } from '../services/http';
import PasswordInput from '../components/PasswordInput';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await http.post(apiUrl('/api/auth/login'), { email, password });
      if (!res.data?.token) {
        throw new Error('The server responded without a token — check the API logs.');
      }
      login(res.data.token, res.data.user);
      showNotification('Successfully logged in!', 'success');
      navigate('/dashboard');
    } catch (err) {
      showNotification(describeRequestError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <Link to="/" className="auth-logo">
        <Sparkles className="logo-icon" size={32} />
        <span className="logo-text">ResumeAI</span>
      </Link>
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Login to ResumeAI</h2>
        <div className="form-group">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>
        <div style={{ textAlign: 'right', marginTop: '-10px', marginBottom: '10px' }}>
          <Link to="/forgot-password" style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>Forgot Password?</Link>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
        <p>Don't have an account? <Link to="/signup">Signup</Link></p>
      </form>
      <Link to="/" className="back-to-home">← Back to Home</Link>
    </div>
  );
};

export default Login;
