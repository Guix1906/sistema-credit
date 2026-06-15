import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasValidSupabaseUrl = isValidHttpUrl(supabaseUrl)

export const supabaseConfigError = getSupabaseConfigError()

export const supabase = createClient(
  hasValidSupabaseUrl ? supabaseUrl : 'https://missing-supabase-url.supabase.co',
  supabaseAnonKey || 'missing-supabase-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
)

function getSupabaseConfigError() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Variaveis Supabase ausentes. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente do deploy.'
  }

  if (!hasValidSupabaseUrl) {
    return 'VITE_SUPABASE_URL invalida. Use somente a URL do projeto Supabase, no formato https://seu-projeto.supabase.co.'
  }

  return ''
}

function isValidHttpUrl(value: string | undefined) {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
