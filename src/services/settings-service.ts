import { supabase } from '../lib/supabase'
import type { LoanSettingsRecord } from './finance-service'

export type AppSettings = {
  id?: string
  owner_id?: string
  system_name: string
  logo_path: string | null
  modalities: number[]
  payment_methods: string[]
}

export type LoanSettingsInput = {
  interestRate: number
  lateFeeRate: number
  defaultInstallments: number
  defaultFrequency: string
}

export type AppSettingsInput = {
  ownerId: string
  systemName: string
  logoPath: string | null
  modalities: number[]
  paymentMethods: string[]
}

export async function getAppSettings(ownerId: string): Promise<AppSettings | null> {
  const currentSettings = await supabase.rpc('get_current_app_settings')
  if (!currentSettings.error) {
    return normalizeSettingsRow<AppSettings>(currentSettings.data)
  }

  if (!isMissingRpc(currentSettings.error)) {
    throw currentSettings.error
  }

  const { data, error } = await supabase.from('app_settings').select('*').eq('owner_id', ownerId).maybeSingle()
  if (error) throw error
  return data as AppSettings | null
}

export async function saveLoanSettings(input: LoanSettingsInput): Promise<LoanSettingsRecord | null> {
  const { data, error } = await supabase.rpc('save_loan_settings', {
    p_interest_rate: input.interestRate,
    p_late_fee_rate: input.lateFeeRate,
    p_default_installments: input.defaultInstallments,
    p_default_frequency: input.defaultFrequency,
  })
  if (error) throw error
  return data as LoanSettingsRecord | null
}

export async function saveAppSettings(input: AppSettingsInput): Promise<AppSettings | null> {
  const { data, error } = await supabase.rpc('save_app_settings', {
    p_system_name: input.systemName,
    p_logo_path: input.logoPath,
    p_modalities: input.modalities,
    p_payment_methods: input.paymentMethods,
  })
  if (error) throw error
  return data as AppSettings | null
}

function normalizeSettingsRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return (data as T | null) ?? null
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || Boolean(error.message?.includes('Could not find the function'))
}
