import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

function Signup({ onSwitchToLogin }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signUpError } = await signUp(email, password);

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      // Store email temporarily for post-confirmation login
      sessionStorage.setItem('pendingConfirmEmail', email);
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="success-icon">✓</div>
          <h1 className="auth-title">Check Your Email</h1>
          <p className="auth-subtitle">
            We've sent a confirmation link to <strong>{email}</strong>
          </p>
          <p className="auth-text">Click the link to verify your account and start learning!</p>
          <button onClick={onSwitchToLogin} className="auth-submit-btn">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">⚡ Get Started</h1>
        <p className="auth-subtitle">Create your Circuit Lab account</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={6}
            />
            <small>Minimum 6 characters</small>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <button onClick={onSwitchToLogin} className="auth-switch-btn">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

export default Signup;
