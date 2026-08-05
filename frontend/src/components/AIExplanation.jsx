import { useState } from 'react';
import axios from 'axios';

function AIExplanation({ faultType, components, inline = false }) {
  const [aiExplanation, setAiExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExplain = async () => {
    setLoading(true);
    setError(null);
    try {
      const componentType = components?.find(c => c.type !== 'ground')?.type || 'circuit';
      const response = await axios.post('http://localhost:8000/api/explain-fault', {
        fault_type: faultType || 'unknown',
        component: componentType
      });
      setAiExplanation(response.data.explanation);
    } catch (err) {
      console.error('AI explanation failed:', err);
      setError('Failed to get explanation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const buttonStyle = {
    width: '100%',
    padding: '8px 12px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(102, 126, 234, 0.2)',
    opacity: loading ? 0.7 : 1,
  };

  const boxStyle = {
    marginTop: '10px',
    padding: '10px 12px',
    background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    border: '1px solid #c4b5fd',
    borderRadius: '8px',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginBottom: '6px',
  };

  const headerTextStyle = {
    fontSize: '10px',
    fontWeight: '700',
    color: '#5b21b6',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const textStyle = {
    fontSize: '11px',
    color: '#4c1d95',
    lineHeight: '1.5',
    margin: '0',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  return (
    <div className="ai-explain-section">
      <button
        type="button"
        onClick={handleExplain}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? '🤔 Thinking...' : '🤖 Explain with AI'}
      </button>

      {aiExplanation && (
        <div style={boxStyle}>
          <div style={headerStyle}>
            <span style={{ fontSize: '12px' }}>✨</span>
            <strong style={headerTextStyle}>AI Explanation</strong>
          </div>
          <p style={textStyle}>{aiExplanation}</p>
        </div>
      )}

      {error && (
        <div className="ai-explanation-error">{error}</div>
      )}
    </div>
  );
}

export default AIExplanation;
