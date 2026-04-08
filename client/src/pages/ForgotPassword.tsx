import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useNotification } from '../context/NotificationContext';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { showNotification } = useNotification();

  const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/forgot-password`, { email });
      showNotification(res.data.message, 'success');
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Failed to send reset link', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Reset Password</h2>
        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Enter your email address and we'll send you a link to reset your password.
        </p>
        <div className="form-group">
          <label>Email</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
            placeholder="Enter your email"
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
        <p>Remember your password? <Link to="/login">Login</Link></p>
      </form>
    </div>
  );
};

export default ForgotPassword;
