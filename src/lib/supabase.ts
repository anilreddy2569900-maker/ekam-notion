import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] CRITICAL: Missing environment variables! Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// Create client even if empty to avoid top-level crash (calls will fail gracefully)
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
