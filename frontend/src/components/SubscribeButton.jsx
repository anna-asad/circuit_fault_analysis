import { useState } from 'react';
import config from '../config';

const API_URL = config.apiUrl;

function SubscribeButton({ className = '', buttonText = 'Subscribe Now' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/create-checkout-session`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      console.error('Subscription error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className={className || 'subscribe-button'}
        style={!className ? {
          padding: '12px 24px',
          fontSize: '16px',
          fontWeight: '600',
          color: 'white',
          background: loading ? '#94a3b8' : '#3b82f6',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        } : {}}
      >
        {loading ? 'Loading...' : buttonText}
      </button>
      {error && (
        <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default SubscribeButton;
