import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'

type ProfileInput = {
  id: string
  email: string
  fullName?: string
}

export async function getCurrentProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }

    throw error
  }

  return data
}

export async function ensureCurrentProfile(input: ProfileInput): Promise<Profile> {
  const currentProfile = await getCurrentProfile(input.id)

  if (currentProfile) {
    return currentProfile
  }

  const primaryAttempt = await insertProfile(input, 'atendente')

  if (!primaryAttempt.error) {
    return primaryAttempt.data
  }

  if (primaryAttempt.error.code !== '23514') {
    throw primaryAttempt.error
  }

  const legacyAttempt = await insertProfile(input, 'operator')

  if (legacyAttempt.error) {
    throw legacyAttempt.error
  }

  return legacyAttempt.data
}

async function insertProfile(input: ProfileInput, role: 'atendente' | 'operator') {
  return supabase
    .from('profiles')
    .insert({
      id: input.id,
      full_name: input.fullName || input.email,
      email: input.email,
      role,
      is_active: true,
    })
    .select('*')
    .single()
}
