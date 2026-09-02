import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiUrl } from '../services/apiBase';
import PasswordInput from '../components/PasswordInput';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(apiUrl('/api/auth/login'), { email, password });
      login(res.data.token, res.data.user);
      showNotification('Successfully logged in!', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      showNotification(
        err.response?.data?.error || err.message || 'Login failed',
        'error'
      );
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
        <button type="submit">Login</button>
        <p>Don't have an account? <Link to="/signup">Signup</Link></p>
      </form>
      <Link to="/" className="back-to-home">← Back to Home</Link>
    </div>
  );
};

export default Login;
