import { FormEvent, useCallback, useState } from 'react'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { supabase } from '../lib/supabase'
import { getAccessSettings } from '../services/access-settings-service'
import { getActiveLoanSettings, insertAuditLog } from '../services/finance-service'
import { uploadBrandLogo } from '../services/storage-service'

type AppSettings = {
  system_name: string
  logo_path: string | null
  modalities: number[]
  payment_methods: string[]
}

export function SettingsPage() {
  const { profile } = useAuth()
  const [message, setMessage] = useState('')
  const accessSettingsLoader = useCallback(async () => {
    if (!profile) return null
    return getAccessSettings(profile.id)
  }, [profile])
  const appSettingsLoader = useCallback(async () => {
    if (!profile) return null
    const { data, error } = await supabase.from('app_settings').select('*').eq('owner_id', profile.id).maybeSingle()
    if (error) return null
    return data as AppSettings | null
  }, [profile])
  const loanSettingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(accessSettingsLoader, null)
  const appSettings = useAsyncData(appSettingsLoader, null)
  const loanSettings = useAsyncData(loanSettingsLoader, null)

  async function handleLoanSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const formData = new FormData(event.currentTarget)
    const payload = {
      owner_id: profile.id,
      name: 'Padrao',
      interest_rate: Number(formData.get('interestRate') || 20),
      late_fee_rate: Number(formData.get('lateFeeRate') || 20),
      default_installments: Number(formData.get('defaultInstallments') || 20),
      default_frequency: String(formData.get('defaultFrequency') || 'daily'),
      is_active: true,
    }
    const { data: existing } = await supabase.from('loan_settings').select('id').eq('owner_id', profile.id).limit(1).maybeSingle()
    const request = existing?.id ? supabase.from('loan_settings').update(payload).eq('id', existing.id) : supabase.from('loan_settings').insert(payload)
    const { error } = await request
    if (error) setMessage(error.message)
    else {
      await insertAuditLog(profile, 'loan_settings', existing?.id ?? null, existing?.id ? 'update' : 'insert', null, payload)
      setMessage('Configuracoes financeiras salvas.')
    }
  }

  async function handleAccessSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const formData = new FormData(event.currentTarget)
    const payload = {
      owner_id: profile.id,
      opening_time: String(formData.get('openingTime') || '08:00'),
      closing_time: String(formData.get('closingTime') || '18:00'),
      allowed_days: String(formData.get('allowedDays') || '1,2,3,4,5').split(',').map((day) => Number(day.trim())).filter((day) => !Number.isNaN(day)),
      timezone: String(formData.get('timezone') || 'America/Sao_Paulo'),
      allow_admin_outside_hours: formData.get('allowAdminOutsideHours') === 'on',
    }
    const { error } = await supabase.from('access_settings').upsert(payload, { onConflict: 'owner_id' })
    if (error) setMessage(`Horario nao salvo: ${error.message}. Aplique a migration access_settings.`)
    else {
      await insertAuditLog(profile, 'access_settings', profile.id, 'update', null, payload)
      setMessage('Configuracao de horario salva.')
      settings.reload()
    }
  }

  async function handleAppSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const formData = new FormData(event.currentTarget)
    const logo = formData.get('logo')
    const logoPath = logo instanceof File && logo.size > 0 ? await uploadBrandLogo(profile, logo) : String(formData.get('logoPath') || '') || null
    const payload = {
      owner_id: profile.id,
      system_name: String(formData.get('systemName') || 'Sistema de Credito'),
      logo_path: logoPath,
      modalities: String(formData.get('modalities') || '20,24,30').split(',').map((value) => Number(value.trim())).filter(Boolean),
      payment_methods: String(formData.get('paymentMethods') || 'cash,pix,bank_transfer,other').split(',').map((value) => value.trim()).filter(Boolean),
    }
    const { error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'owner_id' })
    if (error) setMessage(`Sistema nao salvo: ${error.message}. Aplique a migration app_settings.`)
    else {
      await insertAuditLog(profile, 'app_settings', profile.id, 'update', null, payload)
      setMessage('Configuracao do sistema salva.')
      appSettings.reload()
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Configuracoes</h1><p>Taxas, multa, modalidades, formas de pagamento, horario, nome e logo.</p></div></div>
      {message ? <p className="form-message">{message}</p> : null}
      <form className="content-panel form-grid" onSubmit={handleLoanSettings}>
        <h2 className="full-span">Financeiro</h2>
        <label>Taxa padrao de juros<input key={`interest-${loanSettings.data?.interest_rate ?? 20}`} name="interestRate" type="number" step="0.01" defaultValue={loanSettings.data?.interest_rate ?? 20} /></label>
        <label>Multa diaria de atraso<input key={`fee-${loanSettings.data?.late_fee_rate ?? 20}`} name="lateFeeRate" type="number" step="0.01" defaultValue={loanSettings.data?.late_fee_rate ?? 20} /></label>
        <label>Parcelas padrao<input key={`installments-${loanSettings.data?.default_installments ?? 20}`} name="defaultInstallments" type="number" defaultValue={loanSettings.data?.default_installments ?? 20} /></label>
        <label>Forma padrao<select key={`frequency-${loanSettings.data?.default_frequency ?? 'daily'}`} name="defaultFrequency" defaultValue={loanSettings.data?.default_frequency ?? 'daily'}><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select></label>
        <button className="full-span" type="submit">Salvar financeiro</button>
      </form>
      <form className="content-panel form-grid" key={`access-${JSON.stringify(settings.data)}`} onSubmit={handleAccessSettings}>
        <h2 className="full-span">Horario</h2>
        <label>Abertura<input name="openingTime" type="time" defaultValue={settings.data?.opening_time ?? '08:00'} /></label>
        <label>Fechamento<input name="closingTime" type="time" defaultValue={settings.data?.closing_time ?? '18:00'} /></label>
        <label>Dias permitidos<input name="allowedDays" defaultValue={(settings.data?.allowed_days ?? [1, 2, 3, 4, 5]).join(',')} /></label>
        <label>Timezone<input name="timezone" defaultValue={settings.data?.timezone ?? 'America/Sao_Paulo'} /></label>
        <label className="checkbox-row"><input name="allowAdminOutsideHours" type="checkbox" defaultChecked={settings.data?.allow_admin_outside_hours ?? true} />Permitir admin fora do horario</label>
        <button className="full-span" type="submit">Salvar horario</button>
      </form>
      <form className="content-panel form-grid" key={`app-${JSON.stringify(appSettings.data)}`} onSubmit={handleAppSettings}>
        <h2 className="full-span">Sistema</h2>
        <label>Nome do sistema<input name="systemName" defaultValue={appSettings.data?.system_name ?? 'Sistema de Credito'} /></label>
        <label>Logo path<input name="logoPath" defaultValue={appSettings.data?.logo_path ?? ''} placeholder="storage/path/logo.png" /></label>
        <label>Upload do logo<input name="logo" type="file" accept="image/*" /></label>
        <label>Modalidades<input name="modalities" defaultValue={(appSettings.data?.modalities ?? [20, 24, 30]).join(',')} /></label>
        <label>Formas de pagamento<input name="paymentMethods" defaultValue={(appSettings.data?.payment_methods ?? ['cash', 'pix', 'bank_transfer', 'other']).join(',')} /></label>
        <button className="full-span" type="submit">Salvar sistema</button>
      </form>
    </section>
  )
}
