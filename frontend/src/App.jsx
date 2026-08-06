import { useState, useCallback } from 'react';
import LabLibrary from './pages/LabLibrary';
import LessonPlayer from './pages/LessonPlayer';
import CircuitCanvas from './components/CircuitCanvas';
import ComponentSidebar from './components/ComponentSidebar';
import SimulateButton from './components/SimulateButton';
import ResultsPage from './pages/ResultsPage';
import './App.css';

// App views: library (home), lesson, freeplay
function App() {
  const [view, setView] = useState('library');
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [circuit, setCircuit] = useState({ nodes: [], edges: [] });
  const [componentCounters, setComponentCounters] = useState({});
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showResultsPage, setShowResultsPage] = useState(false);

  const handleStartLesson = useCallback((lessonId) => {
    setActiveLessonId(lessonId);
    setView('lesson');
  }, []);

  const handleFreePlay = useCallback(() => {
    setView('freeplay');
    setActiveLessonId(null);
    setSimulationResults(null);
    setShowResultsPage(false);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    setView('library');
    setActiveLessonId(null);
    setShowResultsPage(false);
  }, []);

  const handleSimulateResults = useCallback((results) => {
    setSimulationResults(results);
    setShowResultsPage(true);
  }, []);

  const handleBackFromResults = useCallback(() => {
    setShowResultsPage(false);
  }, []);

  if (view === 'library') {
    return (
      <LabLibrary
        onStartLesson={handleStartLesson}
        onFreePlay={handleFreePlay}
      />
    );
  }

  if (view === 'lesson' && activeLessonId) {
    return (
      <LessonPlayer
        lessonId={activeLessonId}
        onBack={handleBackToLibrary}
        onGoToLibrary={handleBackToLibrary}
      />
    );
  }

  // Free play mode (original editor)
  return (
    <>
      <div className="app" style={{ display: showResultsPage ? 'none' : 'flex' }}>
        <header className="app-header">
          <div className="app-header-left">
            <button type="button" className="app-library-btn" onClick={handleBackToLibrary}>
              ← Lab Library
            </button>
            <h1>⚡ Circuit Lab Simulator</h1>
          </div>
          <SimulateButton
            circuit={circuit}
            onSimulate={handleSimulateResults}
            isSimulating={isSimulating}
            setIsSimulating={setIsSimulating}
            simulateLabel="Run simulation"
          />
        </header>

        <div className="app-body">
          <ComponentSidebar />
          <main className="canvas-container">
            <CircuitCanvas
              setCircuit={setCircuit}
              mode="edit"
              componentCounters={componentCounters}
              setComponentCounters={setComponentCounters}
            />
          </main>
        </div>
      </div>

      {showResultsPage && (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ResultsPage
            results={simulationResults}
            circuit={circuit}
            onBack={handleBackFromResults}
            educationMode
          />
        </div>
      )}
    </>
  );
}

export default App;
