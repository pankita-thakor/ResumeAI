import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signup } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return showNotification('Passwords do not match', 'error');
    }
    try {
      const res = await axios.post(`${API_URL}/auth/signup`, { email, password });
      signup(res.data.token, res.data.user);
      showNotification('Account created successfully!', 'success');
      navigate('/');
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Signup failed', 'error');
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Signup for ResumeAI</h2>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>
        <button type="submit">Signup</button>
        <p>Already have an account? <Link to="/login">Login</Link></p>
      </form>
    </div>
  );
};

export default Signup;
