import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigError = !supabaseUrl || !supabaseAnonKey
  ? 'Variaveis Supabase ausentes. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente do deploy.'
  : ''

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-url.supabase.co',
  supabaseAnonKey || 'missing-supabase-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
)
