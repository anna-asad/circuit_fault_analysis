import { useState } from 'react';
import './PredictPanel.css';

function gradePrediction(predicted, expected, tolerancePct = 5, inputType = 'number') {
  if (inputType === 'choice') {
    const ok = String(predicted).trim().toLowerCase() === String(expected).trim().toLowerCase();
    return { correct: ok, message: ok ? 'Correct!' : `Expected: ${expected}` };
  }

  const num = Number(predicted);
  const exp = Number(expected);
  if (!Number.isFinite(num)) {
    return { correct: false, message: 'Enter a valid number.' };
  }

  const tolerance = Math.abs(exp * (tolerancePct / 100));
  const ok = Math.abs(num - exp) <= Math.max(tolerance, 0.01);
  return {
    correct: ok,
    message: ok
      ? `Correct! (${num} ≈ ${exp})`
      : `Expected about ${exp} (you entered ${num}).`,
  };
}

function PredictPanel({ step, onSubmit, result, disabled }) {
  const [value, setValue] = useState('');

  if (!step || step.type !== 'predict') return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const grade = gradePrediction(
      value,
      step.expected,
      step.tolerancePct ?? 5,
      step.inputType ?? 'number'
    );
    onSubmit?.({ value, grade });
  };

  return (
    <div className="predict-panel">
      <h4 className="predict-panel-title">Your Prediction</h4>
      <p className="predict-panel-question">{step.question}</p>

      <form onSubmit={handleSubmit}>
        {step.inputType === 'choice' ? (
          <div className="predict-choices">
            {step.choices.map((choice) => (
              <label key={choice} className="predict-choice">
                <input
                  type="radio"
                  name="predict"
                  value={choice}
                  checked={value === choice}
                  onChange={() => setValue(choice)}
                  disabled={disabled}
                />
                {choice}
              </label>
            ))}
          </div>
        ) : (
          <input
            className="predict-input"
            type="text"
            inputMode="decimal"
            placeholder="Enter your answer"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
          />
        )}

        {step.hint && !result && (
          <p className="predict-hint">Hint: {step.hint}</p>
        )}

        {!result && (
          <button type="submit" className="predict-submit" disabled={!value || disabled}>
            Lock prediction
          </button>
        )}
      </form>

      {result && (
        <div className={`predict-result predict-result--${result.grade.correct ? 'ok' : 'miss'}`}>
          <strong>{result.grade.correct ? '✓' : '✗'} {result.grade.message}</strong>
          {step.hint && !result.grade.correct && (
            <p className="predict-hint">Hint: {step.hint}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default PredictPanel;
