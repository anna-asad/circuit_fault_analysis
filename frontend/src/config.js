/**
 * Application Configuration
 * Centralized config for environment variables
 */

// Vite exposes environment variables via import.meta.env
// All client-side env vars must be prefixed with VITE_

export const config = {
  // Backend API base URL
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
};

// Validate required config
if (!config.apiUrl) {
  console.error('VITE_API_URL is not set. Using default: http://localhost:8000');
}

export default config;
