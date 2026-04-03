import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      login(res.data.token, res.data.user);
      showNotification('Successfully logged in!', 'success');
      navigate('/');
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Login failed', 'error');
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Login to ResumeAI</h2>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit">Login</button>
        <p>Don't have an account? <Link to="/signup">Signup</Link></p>
      </form>
    </div>
  );
};

export default Login;
