import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { http, describeRequestError } from '../services/http';
import { useNotification } from '../context/NotificationContext';
import { apiUrl } from '../services/apiBase';
import PasswordInput from '../components/PasswordInput';

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showNotification('Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      await http.post(apiUrl(`/api/auth/reset-password/${token}`), { password });
      showNotification('Password reset successfully!', 'success');
      navigate('/login');
    } catch (err) {
      showNotification(describeRequestError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Set New Password</h2>
        <div className="form-group">
          <label htmlFor="reset-password">New Password</label>
          <PasswordInput
            id="reset-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="Min 6 characters"
            minLength={6}
          />
        </div>
        <div className="form-group">
          <label htmlFor="reset-confirm-password">Confirm Password</label>
          <PasswordInput
            id="reset-confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Confirm new password"
            minLength={6}
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
