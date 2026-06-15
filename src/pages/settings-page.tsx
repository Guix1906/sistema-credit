import { FormEvent, useCallback, useState } from 'react'

import { FilePicker } from '../components/file-picker'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { getAccessSettings, saveAccessSettings } from '../services/access-settings-service'
import { getActiveLoanSettings, insertAuditLog } from '../services/finance-service'
import { getAppSettings, saveAppSettings, saveLoanSettings, type AppSettings } from '../services/settings-service'
import { uploadBrandLogo } from '../services/storage-service'

const weekDays = [
  { value: '0', label: 'Dom' },
  { value: '1', label: 'Seg' },
  { value: '2', label: 'Ter' },
  { value: '3', label: 'Qua' },
  { value: '4', label: 'Qui' },
  { value: '5', label: 'Sex' },
  { value: '6', label: 'Sab' },
]

const modalityOptions = [
  { value: '20', label: '20 dias' },
  { value: '24', label: '24 dias' },
  { value: '30', label: '30 dias' },
]

const paymentMethodOptions = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'other', label: 'Outra' },
]

export function SettingsPage() {
  const { profile } = useAuth()
  const [message, setMessage] = useState('')
  const [financeMessage, setFinanceMessage] = useState('')
  const [accessMessage, setAccessMessage] = useState('')
  const [systemMessage, setSystemMessage] = useState('')
  const [savingFinance, setSavingFinance] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)
  const [savingSystem, setSavingSystem] = useState(false)
  const accessSettingsLoader = useCallback(async () => {
    if (!profile) return null
    return getAccessSettings(profile.id)
  }, [profile])
  const appSettingsLoader = useCallback(async () => {
    if (!profile) return null
    return getAppSettings(profile.id)
  }, [profile])
  const loanSettingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(accessSettingsLoader, null)
  const appSettings = useAsyncData(appSettingsLoader, null)
  const loanSettings = useAsyncData(loanSettingsLoader, null)

  async function handleLoanSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSavingFinance(true)
    setMessage('')
    setFinanceMessage('Salvando configuracoes financeiras...')
    const formData = new FormData(event.currentTarget)
    const payload = {
      interestRate: Number(formData.get('interestRate') || 20),
      lateFeeRate: Number(formData.get('lateFeeRate') || 20),
      defaultInstallments: Number(formData.get('defaultInstallments') || 20),
      defaultFrequency: String(formData.get('defaultFrequency') || 'daily'),
    }

    try {
      const saved = await saveLoanSettings(payload)
      await insertAuditLog(profile, 'loan_settings', saved?.id ?? null, saved?.id ? 'update' : 'insert', null, {
        owner_id: saved?.owner_id ?? profile.id,
        name: 'Padrao',
        interest_rate: payload.interestRate,
        late_fee_rate: payload.lateFeeRate,
        default_installments: payload.defaultInstallments,
        default_frequency: payload.defaultFrequency,
        is_active: true,
      })
      const successMessage = `Financeiro salvo: juros ${payload.interestRate}%, multa ${payload.lateFeeRate}%, ${payload.defaultInstallments} parcelas.`
      setMessage(successMessage)
      setFinanceMessage(successMessage)
      loanSettings.reload()
    } catch (error) {
      const errorMessage = `Financeiro nao salvo: ${error instanceof Error ? error.message : 'Erro desconhecido'}.`
      setMessage(errorMessage)
      setFinanceMessage(errorMessage)
    } finally {
      setSavingFinance(false)
    }
  }

  async function handleAccessSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSavingAccess(true)
    setMessage('')
    setAccessMessage('Salvando configuracao de horario...')
    const formData = new FormData(event.currentTarget)
    const openingTime = normalizeTimeInput(formData.get('openingTime'), '08:00')
    const closingTime = normalizeTimeInput(formData.get('closingTime'), '18:00')
    const allowedDays = formData.getAll('allowedDays')
      .map((day) => Number(day))
      .filter((day) => !Number.isNaN(day))

    if (!allowedDays.length) {
      const validationMessage = 'Selecione ao menos um dia permitido para salvar o horario.'
      setMessage(validationMessage)
      setAccessMessage(validationMessage)
      setSavingAccess(false)
      return
    }

    const payload = {
      ownerId: profile.id,
      openingTime,
      closingTime,
      allowedDays,
      timezone: String(formData.get('timezone') || 'America/Sao_Paulo'),
      allowAdminOutsideHours: formData.get('allowAdminOutsideHours') === 'on',
    }

    try {
      const saved = await saveAccessSettings(payload)
      await insertAuditLog(profile, 'access_settings', saved?.id ?? profile.id, saved?.id ? 'update' : 'insert', null, {
        owner_id: saved?.owner_id ?? profile.id,
        opening_time: openingTime,
        closing_time: closingTime,
        allowed_days: allowedDays,
        timezone: payload.timezone,
        allow_admin_outside_hours: payload.allowAdminOutsideHours,
      })
      const successMessage = `Horario salvo: abertura ${openingTime}, fechamento ${closingTime}.`
      setMessage(successMessage)
      setAccessMessage(successMessage)
      settings.reload()
    } catch (error) {
      const errorMessage = `Horario nao salvo: ${error instanceof Error ? error.message : 'Erro desconhecido'}.`
      setMessage(errorMessage)
      setAccessMessage(errorMessage)
    } finally {
      setSavingAccess(false)
    }
  }

  async function handleAppSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSavingSystem(true)
    setMessage('')
    setSystemMessage('Salvando configuracoes do sistema...')

    try {
      const formData = new FormData(event.currentTarget)
      const logo = formData.get('logo')
      const logoPath = logo instanceof File && logo.size > 0 ? await uploadBrandLogo(profile, logo) : String(formData.get('logoPath') || '') || null
      const modalities = formData.getAll('modalities').map((value) => Number(value)).filter(Boolean)
      const paymentMethods = formData.getAll('paymentMethods').map(String).filter(Boolean)

      if (!modalities.length) throw new Error('Selecione ao menos uma modalidade.')
      if (!paymentMethods.length) throw new Error('Selecione ao menos uma forma de pagamento.')

      const payload = {
        ownerId: profile.id,
        systemName: String(formData.get('systemName') || 'Sistema de Credito'),
        logoPath,
        modalities,
        paymentMethods,
      }
      const saved = await saveAppSettings(payload)
      await insertAuditLog(profile, 'app_settings', saved?.id ?? profile.id, saved?.id ? 'update' : 'insert', null, {
        owner_id: saved?.owner_id ?? profile.id,
        system_name: payload.systemName,
        logo_path: logoPath,
        modalities,
        payment_methods: paymentMethods,
      })
      const successMessage = `Sistema salvo: ${payload.systemName}.`
      setMessage(successMessage)
      setSystemMessage(successMessage)
      appSettings.reload()
    } catch (error) {
      const errorMessage = `Sistema nao salvo: ${error instanceof Error ? error.message : 'Erro desconhecido'}.`
      setMessage(errorMessage)
      setSystemMessage(errorMessage)
    } finally {
      setSavingSystem(false)
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
        {financeMessage ? <p className="form-message full-span" aria-live="polite" role="status">{financeMessage}</p> : null}
        <div className="button-row full-span"><button disabled={savingFinance} type="submit">{savingFinance ? 'Salvando...' : 'Salvar financeiro'}</button></div>
      </form>
      <form className="content-panel form-grid" key={`access-${JSON.stringify(settings.data)}`} onSubmit={handleAccessSettings}>
        <h2 className="full-span">Horario</h2>
        <label>Abertura<input name="openingTime" type="time" required defaultValue={formatTimeInput(settings.data?.opening_time, '08:00')} /></label>
        <label>Fechamento<input name="closingTime" type="time" required defaultValue={formatTimeInput(settings.data?.closing_time, '18:00')} /></label>
        <div className="option-card-group full-span">
          <span>Dias permitidos</span>
          <div className="option-card-grid">
            {weekDays.map((day) => (
              <label className="option-card" key={day.value}>
                <input name="allowedDays" type="checkbox" value={day.value} defaultChecked={(settings.data?.allowed_days ?? [1, 2, 3, 4, 5]).includes(Number(day.value))} />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label>Timezone<input name="timezone" defaultValue={settings.data?.timezone ?? 'America/Sao_Paulo'} /></label>
        <label className="checkbox-row"><input name="allowAdminOutsideHours" type="checkbox" defaultChecked={settings.data?.allow_admin_outside_hours ?? true} />Permitir admin fora do horario</label>
        {accessMessage ? <p className="form-message full-span" aria-live="polite" role="status">{accessMessage}</p> : null}
        <div className="button-row full-span"><button disabled={savingAccess} type="submit">{savingAccess ? 'Salvando...' : 'Salvar horario'}</button></div>
      </form>
      <form className="content-panel form-grid" key={`app-${JSON.stringify(appSettings.data)}`} onSubmit={handleAppSettings}>
        <h2 className="full-span">Sistema</h2>
        <label>Nome do sistema<input name="systemName" defaultValue={appSettings.data?.system_name ?? 'Sistema de Credito'} /></label>
        <label>Caminho do logo<input name="logoPath" defaultValue={appSettings.data?.logo_path ?? ''} placeholder="storage/path/logo.png" /></label>
        <FilePicker className="full-span" name="logo" accept="image/*" label="Upload do logo" hint="PNG, JPG ou WebP para substituir a marca atual" />
        <div className="option-card-group full-span">
          <span>Modalidades</span>
          <div className="option-card-grid compact">
            {modalityOptions.map((option) => (
              <label className="option-card" key={option.value}>
                <input name="modalities" type="checkbox" value={option.value} defaultChecked={(appSettings.data?.modalities ?? [20, 24, 30]).includes(Number(option.value))} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="option-card-group full-span">
          <span>Formas de pagamento</span>
          <div className="option-card-grid">
            {paymentMethodOptions.map((option) => (
              <label className="option-card" key={option.value}>
                <input name="paymentMethods" type="checkbox" value={option.value} defaultChecked={(appSettings.data?.payment_methods ?? ['cash', 'pix', 'bank_transfer', 'other']).includes(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        {systemMessage ? <p className="form-message full-span" aria-live="polite" role="status">{systemMessage}</p> : null}
        <div className="button-row full-span"><button disabled={savingSystem} type="submit">{savingSystem ? 'Salvando...' : 'Salvar sistema'}</button></div>
      </form>
    </section>
  )
}

function formatTimeInput(value: string | undefined, fallback: string): string {
  return normalizeTimeInput(value, fallback)
}

function normalizeTimeInput(value: FormDataEntryValue | string | null | undefined, fallback: string): string {
  const text = String(value || '').trim()
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : fallback
}
