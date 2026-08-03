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

  const buttonStyle = inline ? {
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
    opacity: loading ? 0.7 : 1
  } : undefined;

  return (
    <div className="ai-explain-section">
      <button
        type="button"
        className="ai-explain-button"
        onClick={handleExplain}
        disabled={loading}
        style={inline ? buttonStyle : undefined}
      >
        {loading ? '🤔 Thinking...' : '🤖 Explain with AI'}
      </button>
      
      {aiExplanation && (
        <div className={inline ? "ai-explanation-box-inline" : "ai-explanation-box"}>
          <div className="ai-explanation-header">
            <span className="ai-icon">✨</span>
            <strong>AI Explanation</strong>
          </div>
          <p className="ai-explanation-text">{aiExplanation}</p>
        </div>
      )}
      
      {error && (
        <div className="ai-explanation-error">{error}</div>
      )}
    </div>
  );
}

export default AIExplanation;
