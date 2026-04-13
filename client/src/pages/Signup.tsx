import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { apiUrl } from '../services/apiBase';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signup } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return showNotification('Passwords do not match', 'error');
    }
    try {
      const res = await axios.post(apiUrl('/api/auth/signup'), {
        email: email.trim().toLowerCase(),
        password,
      });
      signup(res.data.token, res.data.user);
      showNotification('Account created successfully!', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Signup failed', 'error');
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
      <Link to="/" className="back-to-home">← Back to Home</Link>
    </div>
  );
};

export default Signup;
