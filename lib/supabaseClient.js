import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return { supabaseUrl, supabaseAnonKey };
}

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase config. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the app.');
  }

  if (!/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i.test(supabaseUrl)) {
    throw new Error('Invalid Supabase URL. Use your project URL from Supabase Dashboard > Settings > API, not the dashboard URL or /rest/v1 endpoint.');
  }

  if (supabaseAnonKey.startsWith('sb_publishable_')) {
    throw new Error('You used the publishable key in the browser. Copy the anon public key from Supabase Dashboard > Settings > API.');
  }

  if (!supabaseAnonKey.startsWith('eyJ')) {
    throw new Error('Invalid Supabase API key. Use the anon public key from the API settings, not the service role key.');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
