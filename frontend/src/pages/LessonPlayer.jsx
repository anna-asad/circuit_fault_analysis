import { useState, useCallback, useEffect } from 'react';
import CircuitCanvas from '../components/CircuitCanvas';
import ComponentSidebar from '../components/ComponentSidebar';
import SimulateButton from '../components/SimulateButton';
import ResultsPage from './ResultsPage';
import PredictPanel from '../components/PredictPanel';
import DiagnoseChallenge from '../components/DiagnoseChallenge';
import { getLessonById } from '../data/lessons';
import { loadPresetCircuit, getDatasetCircuit } from '../utils/presetCircuitLoader';
import { markLessonStarted, markLessonCompleted } from '../utils/progressStorage';
import './LessonPlayer.css';

const STEP_TYPE_LABELS = {
  observe: 'Observe',
  predict: 'Predict',
  action: 'Try it',
  verify: 'Verify',
  explore: 'Explore',
};

function LessonPlayer({ lessonId, onBack, onGoToLibrary }) {
  const lesson = getLessonById(lessonId);
  const [stepIndex, setStepIndex] = useState(0);
  const [circuit, setCircuit] = useState({ nodes: [], edges: [] });
  const [presetLoad, setPresetLoad] = useState(null);
  const [componentCounters, setComponentCounters] = useState({});
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showResultsPage, setShowResultsPage] = useState(false);
  const [predictResult, setPredictResult] = useState(null);
  const [diagnoseResult, setDiagnoseResult] = useState(null);
  const [inChallengeMode, setInChallengeMode] = useState(false);

  useEffect(() => {
    if (!lesson) return;
    markLessonStarted(lesson.id);

    // Always start with normal values
    const preset = loadPresetCircuit(lesson.circuitKey, {});
    setPresetLoad(preset);
    setComponentCounters(preset.counters ?? {});
    setStepIndex(0);
    setPredictResult(null);
    setDiagnoseResult(null);
    setSimulationResults(null);
    setShowResultsPage(false);
    setInChallengeMode(false);
  }, [lesson]);

  const handleSimulateResults = useCallback((results) => {
    setSimulationResults(results);
    setShowResultsPage(true);
  }, []);

  const handleBackFromResults = useCallback(() => {
    setShowResultsPage(false);
  }, []);

  const currentStep = lesson?.steps?.[stepIndex] ?? null;
  const totalSteps = lesson?.steps?.length ?? 0;

  const goNext = () => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
      setPredictResult(null);
    } else {
      markLessonCompleted(lesson.id);
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
      setPredictResult(null);
    }
  };

  const handleEnterDetectiveMode = () => {
    if (!lesson.challenge) return;
    
    // Load fault circuit
    const ds = getDatasetCircuit(lesson.datasetCircuitId);
    const faultKey = `fault_${lesson.challenge.datasetFault}`;
    const faultRow = ds?.[faultKey];
    
    if (faultRow) {
      const presetOptions = {
        faultValues: faultRow.component_values,
        nominalValues: { ...ds.design_values, ...ds.sources },
      };
      const preset = loadPresetCircuit(lesson.circuitKey, presetOptions);
      setPresetLoad(preset);
      setComponentCounters(preset.counters ?? {});
    }
    
    setInChallengeMode(true);
    setDiagnoseResult(null);
  };

  const handleExitDetectiveMode = () => {
    // Reload normal circuit
    const preset = loadPresetCircuit(lesson.circuitKey, {});
    setPresetLoad(preset);
    setComponentCounters(preset.counters ?? {});
    setInChallengeMode(false);
    setDiagnoseResult(null);
  };

  const handlePredictSubmit = (result) => {
    setPredictResult(result);
  };

  const handleDiagnoseSubmit = (result) => {
    setDiagnoseResult(result);
    if (result.correct) {
      markLessonCompleted(lesson.id);
    }
  };

  const handleFinishLesson = () => {
    markLessonCompleted(lesson.id);
    onGoToLibrary?.();
  };

  if (!lesson) {
    return (
      <div className="lesson-player">
        <p>Lesson not found.</p>
        <button type="button" onClick={onGoToLibrary}>Back to library</button>
      </div>
    );
  }

  const isLastStep = stepIndex >= totalSteps - 1;
  const lessonComplete = isLastStep && (currentStep?.type !== 'predict' || predictResult);

  return (
    <>
      <div className="lesson-player" style={{ display: showResultsPage ? 'none' : 'flex' }}>
        <header className="lesson-header">
          <div className="lesson-header-left">
            <button type="button" className="lesson-back-btn" onClick={onBack}>
              ← Library
            </button>
            <div>
              <h1>{lesson.title}</h1>
              <p className="lesson-subtitle">{lesson.subtitle}</p>
            </div>
          </div>
          <div className="lesson-header-right">
            <span className="lesson-step-badge">
              Step {stepIndex + 1} of {totalSteps}
            </span>
            {lesson.challenge && !inChallengeMode && (
              <button 
                type="button" 
                className="detective-mode-btn"
                onClick={handleEnterDetectiveMode}
                title="Try detective mode challenge"
              >
                🔍 Detective Mode
              </button>
            )}
            {inChallengeMode && (
              <button 
                type="button" 
                className="exit-detective-btn"
                onClick={handleExitDetectiveMode}
                title="Exit detective mode"
              >
                ← Exit Detective
              </button>
            )}
            <SimulateButton
              circuit={circuit}
              onSimulate={handleSimulateResults}
              isSimulating={isSimulating}
              setIsSimulating={setIsSimulating}
              simulateLabel="Run simulation"
            />
          </div>
        </header>

        <div className="lesson-body">
          <aside className="lesson-sidebar">
            <section className="lesson-panel">
              <h3>Learning objectives</h3>
              <ul>
                {lesson.objectives.map((obj) => (
                  <li key={obj}>{obj}</li>
                ))}
              </ul>
            </section>

            <section className="lesson-panel lesson-steps-panel">
              <h3>Lab steps</h3>
              <ol className="lesson-step-list">
                {lesson.steps.map((step, i) => (
                  <li
                    key={i}
                    className={
                      i === stepIndex ? 'active' : i < stepIndex ? 'done' : ''
                    }
                  >
                    <span className="step-type">{STEP_TYPE_LABELS[step.type] ?? step.type}</span>
                    <span className="step-text">{step.text || step.question}</span>
                  </li>
                ))}
              </ol>
            </section>

            {currentStep && !inChallengeMode && (
              <section className="lesson-panel lesson-current-step">
                <h3>{STEP_TYPE_LABELS[currentStep.type] ?? 'Step'}</h3>
                <p>{currentStep.text || currentStep.question}</p>

                {currentStep.type === 'predict' && (
                  <PredictPanel
                    step={currentStep}
                    onSubmit={handlePredictSubmit}
                    result={predictResult}
                  />
                )}

                <div className="lesson-step-nav">
                  <button type="button" onClick={goPrev} disabled={stepIndex === 0}>
                    ← Previous
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={
                      currentStep.type === 'predict' && !predictResult
                    }
                  >
                    {isLastStep ? 'Finish' : 'Next →'}
                  </button>
                </div>
              </section>
            )}

            {inChallengeMode && lesson.challenge && (
              <section className="lesson-panel">
                <DiagnoseChallenge
                  challenge={lesson.challenge}
                  onSubmit={handleDiagnoseSubmit}
                  result={diagnoseResult}
                />
              </section>
            )}

            {lessonComplete && !inChallengeMode && (
              <button type="button" className="lesson-complete-btn" onClick={handleFinishLesson}>
                ✓ Lab complete — back to library
              </button>
            )}

            {inChallengeMode && diagnoseResult?.correct && (
              <button type="button" className="lesson-complete-btn" onClick={handleExitDetectiveMode}>
                ✓ Detective challenge solved!
              </button>
            )}
          </aside>

          <main className="lesson-canvas-area">
            <ComponentSidebar />
            <div className="lesson-canvas-wrap">
              <CircuitCanvas
                setCircuit={setCircuit}
                presetLoad={presetLoad}
                componentCounters={componentCounters}
                setComponentCounters={setComponentCounters}
              />
            </div>
          </main>
        </div>
      </div>

      {showResultsPage && (
        <ResultsPage
          results={simulationResults}
          circuit={circuit}
          onBack={handleBackFromResults}
          educationMode
        />
      )}
    </>
  );
}

export default LessonPlayer;
