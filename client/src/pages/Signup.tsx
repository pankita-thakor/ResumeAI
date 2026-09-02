import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiUrl } from '../services/apiBase';
import { http, describeRequestError } from '../services/http';
import PasswordInput from '../components/PasswordInput';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (password !== confirmPassword) {
      return showNotification('Passwords do not match', 'error');
    }
    setLoading(true);
    try {
      const res = await http.post(apiUrl('/api/auth/signup'), {
        email: email.trim().toLowerCase(),
        password,
      });
      if (!res.data?.token) {
        throw new Error('The server responded without a token — check the API logs.');
      }
      signup(res.data.token, res.data.user);
      showNotification('Account created successfully!', 'success');
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
        <h2>Signup for ResumeAI</h2>
        <div className="form-group">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="signup-password">Password</label>
          <PasswordInput
            id="signup-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Min 6 characters"
            minLength={6}
          />
        </div>
        <div className="form-group">
          <label htmlFor="signup-confirm-password">Confirm Password</label>
          <PasswordInput
            id="signup-confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter password"
            minLength={6}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Signup'}
        </button>
        <p>Already have an account? <Link to="/login">Login</Link></p>
      </form>
      <Link to="/" className="back-to-home">← Back to Home</Link>
    </div>
  );
};

export default Signup;
