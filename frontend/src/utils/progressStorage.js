const STORAGE_KEY = 'circuit_lab_progress';

export function getProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { completedLessons: [], lessonStatus: {} };
  } catch {
    return { completedLessons: [], lessonStatus: {} };
  }
}

export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function getLessonStatus(lessonId) {
  const progress = getProgress();
  return progress.lessonStatus[lessonId] ?? 'not_started';
}

export function markLessonStarted(lessonId) {
  const progress = getProgress();
  if (!progress.lessonStatus[lessonId]) {
    progress.lessonStatus[lessonId] = 'in_progress';
    saveProgress(progress);
  }
}

export function markLessonCompleted(lessonId) {
  const progress = getProgress();
  progress.lessonStatus[lessonId] = 'completed';
  if (!progress.completedLessons.includes(lessonId)) {
    progress.completedLessons.push(lessonId);
  }
  saveProgress(progress);
}
