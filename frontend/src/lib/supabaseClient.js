import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

// Determine the redirect URL based on environment
const getRedirectUrl = () => {
  // In production, use the actual deployment URL
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  // In development, use localhost
  return 'http://localhost:5173';
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    redirectTo: getRedirectUrl(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
