import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Auth.css';

function Login({ onSwitchToSignup }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSuccess, setConfirmationSuccess] = useState(false);

  useEffect(() => {
    // Check if user just confirmed their email
    const urlParams = new URLSearchParams(window.location.search);
    const emailConfirmed = urlParams.get('type') === 'signup' || urlParams.get('confirmed') === 'true';
    
    // Get the pending confirmation email from session storage
    const pendingEmail = sessionStorage.getItem('pendingConfirmEmail');
    
    if (emailConfirmed && pendingEmail) {
      setEmail(pendingEmail);
      setConfirmationSuccess(true);
      // Clear the stored email
      sessionStorage.removeItem('pendingConfirmEmail');
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (pendingEmail) {
      // Pre-fill email even if not coming from confirmation
      setEmail(pendingEmail);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
    // Success - auth state will update via onAuthStateChange
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">⚡ Welcome Back</h1>
        <p className="auth-subtitle">Sign in to Circuit Lab Simulator</p>

        {confirmationSuccess && (
          <div className="auth-success" style={{ 
            background: '#d4edda', 
            color: '#155724', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '16px',
            border: '1px solid #c3e6cb'
          }}>
            ✓ Email confirmed! Please enter your password to sign in.
          </div>
        )}

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
              autoFocus={confirmationSuccess}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <button onClick={onSwitchToSignup} className="auth-switch-btn">
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

export default Login;
