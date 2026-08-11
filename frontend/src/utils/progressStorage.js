import { supabase } from '../lib/supabaseClient';
import config from '../config';

const STORAGE_KEY = 'circuit_lab_progress';
const API_URL = config.apiUrl;

// Cache for progress data
let progressCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Fetch progress from backend (authenticated users) or localStorage (fallback)
 */
export async function getProgress() {
  const { data: { session } } = await supabase.auth.getSession();
  
  // If not authenticated, use localStorage
  if (!session) {
    return getLocalProgress();
  }
  
  // Check cache
  if (progressCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return progressCache;
  }
  
  try {
    const token = session.access_token;
    const response = await fetch(`${API_URL}/api/user/progress`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch progress, using localStorage');
      return getLocalProgress();
    }
    
    const data = await response.json();
    
    // Convert backend format to frontend format
    const lessonStatus = {};
    const completedLessons = [];
    
    data.progress.forEach(item => {
      lessonStatus[item.lesson_id] = item.status;
      if (item.status === 'completed') {
        completedLessons.push(item.lesson_id);
      }
    });
    
    progressCache = { lessonStatus, completedLessons };
    cacheTimestamp = Date.now();
    
    return progressCache;
  } catch (error) {
    console.error('Error fetching progress:', error);
    return getLocalProgress();
  }
}

function getLocalProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { completedLessons: [], lessonStatus: {} };
  } catch {
    return { completedLessons: [], lessonStatus: {} };
  }
}

/**
 * Save progress to backend (authenticated) or localStorage (fallback)
 */
async function saveProgress(lessonId, status) {
  const { data: { session } } = await supabase.auth.getSession();
  
  // Save to localStorage as fallback
  const localProgress = getLocalProgress();
  localProgress.lessonStatus[lessonId] = status;
  if (status === 'completed' && !localProgress.completedLessons.includes(lessonId)) {
    localProgress.completedLessons.push(lessonId);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localProgress));
  
  // If authenticated, also save to backend
  if (session) {
    try {
      const token = session.access_token;
      await fetch(`${API_URL}/api/user/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          lesson_id: lessonId,
          status: status
        })
      });
      
      // Invalidate cache
      progressCache = null;
      cacheTimestamp = null;
    } catch (error) {
      console.error('Failed to save progress to backend:', error);
      // Continue - at least we saved to localStorage
    }
  }
}

export function getLessonStatus(lessonId) {
  // This is synchronous, so we use cached or local data
  if (progressCache) {
    return progressCache.lessonStatus[lessonId] ?? 'not_started';
  }
  const progress = getLocalProgress();
  return progress.lessonStatus[lessonId] ?? 'not_started';
}

export function markLessonStarted(lessonId) {
  const currentStatus = getLessonStatus(lessonId);
  if (!currentStatus || currentStatus === 'not_started') {
    saveProgress(lessonId, 'in_progress');
  }
}

export function markLessonCompleted(lessonId) {
  saveProgress(lessonId, 'completed');
}

// Initialize progress cache on load
if (typeof window !== 'undefined') {
  getProgress().then(() => {
    console.log('Progress cache initialized');
  });
}
