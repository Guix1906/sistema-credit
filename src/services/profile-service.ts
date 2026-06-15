import { supabase } from '../lib/supabase'
import { normalizeUserRole } from '../lib/roles'
import type { Profile, UserRole } from '../types/auth'

type ProfileInput = {
  id: string
  email: string
  fullName?: string
}

const INITIAL_ACCOUNT_ROLE: UserRole = 'admin'

export async function getCurrentProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }

    throw error
  }

  const normalizedRole = normalizeUserRole(data.role)
  return normalizedRole ? { ...data, role: normalizedRole } : data
}

export async function ensureCurrentProfile(input: ProfileInput): Promise<Profile> {
  const currentProfile = await getCurrentProfile(input.id)

  if (currentProfile) {
    return currentProfile
  }

  const primaryAttempt = await insertProfile(input, INITIAL_ACCOUNT_ROLE)

  if (!primaryAttempt.error) {
    return primaryAttempt.data
  }

  throw primaryAttempt.error
}

async function insertProfile(input: ProfileInput, role: UserRole) {
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
