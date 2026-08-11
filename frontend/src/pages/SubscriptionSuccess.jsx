import { useEffect, useState } from 'react';
import './SubscriptionSuccess.css';

function SubscriptionSuccess() {
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const id = searchParams.get('session_id');
    if (id) {
      setSessionId(id);
      console.log('Payment successful! Session ID:', id);
    }
  }, []);

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="subscription-success-page">
      <div className="success-card">
        <div className="success-icon">✓</div>
        <h1>Payment Successful!</h1>
        <p>Thank you for subscribing to Circuit Lab Pro.</p>
        <p className="session-info">
          Your subscription is now active and you have full access to all features.
        </p>
        {sessionId && (
          <p className="session-id">Session ID: {sessionId}</p>
        )}
        <button 
          className="back-button"
          onClick={handleGoHome}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

export default SubscriptionSuccess;
