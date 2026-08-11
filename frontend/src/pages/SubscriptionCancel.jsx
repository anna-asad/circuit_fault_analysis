import './SubscriptionCancel.css';

function SubscriptionCancel() {
  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="subscription-cancel-page">
      <div className="cancel-card">
        <div className="cancel-icon">✕</div>
        <h1>Payment Cancelled</h1>
        <p>Your subscription payment was cancelled.</p>
        <p className="cancel-info">
          No charges were made. You can try again whenever you're ready.
        </p>
        <div className="cancel-actions">
          <button 
            className="retry-button"
            onClick={handleGoHome}
          >
            Try Again
          </button>
          <button 
            className="home-button"
            onClick={handleGoHome}
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionCancel;
