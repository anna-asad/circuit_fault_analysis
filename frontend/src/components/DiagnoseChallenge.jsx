import { useState } from 'react';
import './DiagnoseChallenge.css';

function DiagnoseChallenge({ challenge, onSubmit, result, datasetCircuitId }) {
  const [component, setComponent] = useState('');
  const [faultType, setFaultType] = useState('');

  if (!challenge) return null;

  // Get the correct value from challenge answer
  const correctValue = challenge.answer.correctValue;
  const faultyValue = challenge.answer.faultyValue;

  const handleSubmit = (e) => {
    e.preventDefault();
    const correct =
      component === challenge.answer.component &&
      faultType === challenge.answer.faultType;
    onSubmit?.({
      component,
      faultType,
      correct,
      message: correct
        ? `Correct! ${challenge.answer.component} has a ${challenge.answer.faultType.replace('_', ' ')}.`
        : `Not quite. The fault was in ${challenge.answer.component} (${challenge.answer.faultType.replace('_', ' ')}).`,
    });
  };

  return (
    <div className="diagnose-challenge">
      <h4 className="diagnose-title">🔍 Detective Mode</h4>
      <p className="diagnose-symptom">{challenge.symptom}</p>

      {!result ? (
        <form onSubmit={handleSubmit}>
          <label className="diagnose-label">
            Faulty component
            <select value={component} onChange={(e) => setComponent(e.target.value)} required>
              <option value="">Select…</option>
              {challenge.choices.components.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="diagnose-label">
            Fault type
            <select value={faultType} onChange={(e) => setFaultType(e.target.value)} required>
              <option value="">Select…</option>
              {challenge.choices.faultTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>{ft.label}</option>
              ))}
            </select>
          </label>

          <button type="submit" className="diagnose-submit" disabled={!component || !faultType}>
            Submit diagnosis
          </button>
        </form>
      ) : (
        <div className={`diagnose-result diagnose-result--${result.correct ? 'ok' : 'miss'}`}>
          <strong>{result.correct ? '✓' : '✗'} {result.message}</strong>
          {!result.correct && correctValue && (
            <div className="diagnose-hint">
              <p><strong>Hint:</strong> The correct value for {challenge.answer.component} should be {correctValue}.</p>
              <p>Change {challenge.answer.component} from its current faulty value ({faultyValue}) to the correct value and simulate again to verify the fix.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DiagnoseChallenge;
