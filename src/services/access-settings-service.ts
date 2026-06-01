import { supabase } from '../lib/supabase'
import type { AccessSettings } from '../types/access-settings'

export async function getAccessSettings(ownerId: string): Promise<AccessSettings | null> {
  const ownSettings = await supabase.from('access_settings').select('*').eq('owner_id', ownerId).maybeSingle()

  if (ownSettings.error) {
    if (ownSettings.error.code === 'PGRST205' || ownSettings.error.code === '42P01') {
      return null
    }

    throw ownSettings.error
  }

  if (ownSettings.data) return ownSettings.data

  const { data, error } = await supabase.from('access_settings').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}
