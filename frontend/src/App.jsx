import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import LabLibrary from './pages/LabLibrary';
import LessonPlayer from './pages/LessonPlayer';
import CircuitCanvas from './components/CircuitCanvas';
import ComponentSidebar from './components/ComponentSidebar';
import SimulateButton from './components/SimulateButton';
import ResultsPage from './pages/ResultsPage';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import SubscriptionCancel from './pages/SubscriptionCancel';
import './App.css';

// App views: login, signup, library (home), lesson, freeplay, success, cancel
function App() {
  const { user, loading: authLoading } = useAuth();
  const [view, setView] = useState('library');
  const [authView, setAuthView] = useState('login'); // 'login' or 'signup'
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [circuit, setCircuit] = useState({ nodes: [], edges: [] });
  const [componentCounters, setComponentCounters] = useState({});
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showResultsPage, setShowResultsPage] = useState(false);

  // Check URL for Stripe redirect routes
  useEffect(() => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path === '/success' || searchParams.has('session_id')) {
      setView('success');
    } else if (path === '/cancel') {
      setView('cancel');
    }
  }, []);

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
    window.history.pushState({}, '', '/');
  }, []);

  const handleSimulateResults = useCallback((results) => {
    setSimulationResults(results);
    setShowResultsPage(true);
  }, []);

  const handleBackFromResults = useCallback(() => {
    setShowResultsPage(false);
  }, []);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Show auth pages if not logged in
  if (!user) {
    if (authView === 'signup') {
      return <Signup onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <Login onSwitchToSignup={() => setAuthView('signup')} />;
  }

  // Handle Stripe success/cancel pages
  if (view === 'success') {
    return <SubscriptionSuccess />;
  }

  if (view === 'cancel') {
    return <SubscriptionCancel />;
  }

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
