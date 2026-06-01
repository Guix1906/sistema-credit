import { supabase } from '../lib/supabase'
import type { AccessBlockDetails } from '../types/access-settings'
import type { Profile } from '../types/auth'

export async function registerAccessBlocked(profile: Profile, details: AccessBlockDetails): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    owner_id: profile.id,
    actor_id: profile.id,
    table_name: 'auth',
    action: 'access_blocked',
    new_data: {
      reason: 'outside_allowed_access_window',
      current_time: details.currentTime,
      opening_time: details.openingTime,
      closing_time: details.closingTime,
      next_allowed_at: details.nextAllowedAt,
      role: profile.role,
    },
  })

  if (error) {
    throw error
  }
}
