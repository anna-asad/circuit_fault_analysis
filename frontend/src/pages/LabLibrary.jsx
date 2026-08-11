import { MODULES, LESSONS } from '../data/lessons';
import { getLessonStatus } from '../utils/progressStorage';
import SubscribeButton from '../components/SubscribeButton';
import { useAuth } from '../contexts/AuthContext';
import './LabLibrary.css';

const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

function LabLibrary({ onStartLesson, onFreePlay }) {
  const { signOut, user } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="lab-library">
      <header className="lab-library-header">
        <div>
          <h1 className="lab-library-title">⚡ Circuit Lab Simulator</h1>
          <p className="lab-library-tagline">
            Learn DC circuits by building, predicting, simulating, and diagnosing.
          </p>
          {user && (
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Logged in as: {user.email}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SubscribeButton buttonText="🚀 Upgrade to Pro" />
          <button type="button" className="lab-free-play-btn" onClick={onFreePlay}>
            Free Play →
          </button>
          <button type="button" className="lab-free-play-btn" onClick={handleLogout} style={{ background: '#ef4444' }}>
            Logout
          </button>
        </div>
      </header>

      <main className="lab-library-body">
        {MODULES.map((module) => {
          const moduleLessons = LESSONS.filter((l) => l.moduleId === module.id);

          return (
            <section key={module.id} className="lab-module">
              <div className="lab-module-header">
                <h2 className="lab-module-title">{module.title}</h2>
                <p className="lab-module-desc">{module.description}</p>
              </div>

              {module.comingSoon ? (
                <div className="lab-coming-soon">
                  <p>🚧 Advanced labs are coming soon.</p>
                  <p className="lab-coming-soon-detail">
                    Wheatstone bridges, resistor cubes, and multi-stage ladder networks.
                  </p>
                </div>
              ) : (
                <div className="lab-cards">
                  {moduleLessons.map((lesson) => {
                    const status = getLessonStatus(lesson.id);
                    return (
                      <article key={lesson.id} className={`lab-card lab-card--${status}`}>
                        <div className="lab-card-top">
                          <span className={`lab-status lab-status--${status}`}>
                            {STATUS_LABELS[status]}
                          </span>
                          <span className="lab-duration">{lesson.durationMin} min</span>
                        </div>
                        <h3 className="lab-card-title">{lesson.title}</h3>
                        <p className="lab-card-subtitle">{lesson.subtitle}</p>
                        {lesson.datasetCircuitId && (
                          <p className="lab-card-ref">Dataset: {lesson.datasetCircuitId}</p>
                        )}
                        <div className="lab-card-meta">
                          <span className="lab-difficulty">{lesson.difficulty}</span>
                          {lesson.challenge && (
                            <span className="lab-challenge-badge">Detective mode</span>
                          )}
                        </div>
                        <ul className="lab-objectives">
                          {lesson.objectives.slice(0, 2).map((obj) => (
                            <li key={obj}>{obj}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="lab-start-btn"
                          onClick={() => onStartLesson(lesson.id)}
                        >
                          {status === 'completed' ? 'Replay lab' : 'Start lab'}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}

export default LabLibrary;
