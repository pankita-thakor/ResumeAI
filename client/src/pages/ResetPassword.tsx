import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useNotification } from '../context/NotificationContext';

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showNotification('Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password/${token}`, { password });
      showNotification('Password reset successfully!', 'success');
      navigate('/login');
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Failed to reset password', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Set New Password</h2>
        <div className="form-group">
          <label>New Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            placeholder="Min 6 characters"
          />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input 
            type="password" 
            value={confirmPassword} 
            onChange={(e) => setConfirmPassword(e.target.value)} 
            required 
            placeholder="Confirm new password"
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
        <p><Link to="/login">Back to Login</Link></p>
      </form>
    </div>
  );
};

export default ResetPassword;
