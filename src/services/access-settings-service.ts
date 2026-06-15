import { supabase } from '../lib/supabase'
import type { AccessSettings } from '../types/access-settings'

export type AccessSettingsInput = {
  ownerId: string
  openingTime: string
  closingTime: string
  allowedDays: number[]
  timezone: string
  allowAdminOutsideHours: boolean
}

export async function getAccessSettings(ownerId: string): Promise<AccessSettings | null> {
  const currentSettings = await supabase.rpc('get_current_access_settings')
  if (!currentSettings.error) {
    return normalizeSettingsRow(currentSettings.data)
  }

  if (!isMissingRpc(currentSettings.error)) {
    throw currentSettings.error
  }

  const ownSettings = await supabase.from('access_settings').select('*').eq('owner_id', ownerId).maybeSingle()

  if (ownSettings.error) {
    if (ownSettings.error.code === 'PGRST205' || ownSettings.error.code === '42P01') {
      return null
    }

    throw ownSettings.error
  }

  return ownSettings.data
}

export async function saveAccessSettings(input: AccessSettingsInput): Promise<AccessSettings | null> {
  const rpcResult = await supabase.rpc('save_access_settings', {
    p_opening_time: input.openingTime,
    p_closing_time: input.closingTime,
    p_allowed_days: input.allowedDays,
    p_timezone: input.timezone,
    p_allow_admin_outside_hours: input.allowAdminOutsideHours,
  })

  if (!rpcResult.error) {
    return rpcResult.data as AccessSettings | null
  }

  if (!isMissingRpc(rpcResult.error)) {
    throw rpcResult.error
  }

  const payload = {
    owner_id: input.ownerId,
    opening_time: input.openingTime,
    closing_time: input.closingTime,
    allowed_days: input.allowedDays,
    timezone: input.timezone,
    allow_admin_outside_hours: input.allowAdminOutsideHours,
  }
  const { data, error } = await supabase.from('access_settings').upsert(payload, { onConflict: 'owner_id' }).select('*').single()
  if (error) throw error
  return data
}

function normalizeSettingsRow(data: unknown): AccessSettings | null {
  if (Array.isArray(data)) return (data[0] as AccessSettings | undefined) ?? null
  return (data as AccessSettings | null) ?? null
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || Boolean(error.message?.includes('Could not find the function'))
}
