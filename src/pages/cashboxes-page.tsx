import { FormEvent, useState } from 'react'

import { ConfirmDialog } from '../components/confirm-dialog'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { formatCurrency, toNumber } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { insertAuditLog, listCashboxes, listRoutes } from '../services/finance-service'

export function CashboxesPage() {
  const { profile } = useAuth()
  const cashboxes = useAsyncData(listCashboxes, [])
  const routes = useAsyncData(listRoutes, [])
  const [message, setMessage] = useState('')
  const [cashboxToClose, setCashboxToClose] = useState<{ id: string; name: string } | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const totalBalance = cashboxes.data.reduce((sum, cashbox) => sum + cashbox.current_balance, 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const openingBalance = toNumber(formData.get('openingBalance'))
    const kind = String(formData.get('kind') || 'major')
    const routeId = String(formData.get('routeId') || '') || null
    if (kind === 'route' && !routeId) {
      setMessage('Selecione uma rota para criar um caixa por rota.')
      return
    }
    const payload = {
      owner_id: profile.id,
      name: String(formData.get('name') ?? ''),
      kind,
      route_id: routeId,
      allow_negative: formData.get('allowNegative') === 'on',
      opening_balance: openingBalance,
      current_balance: openingBalance,
      status: 'open',
    }
    const { data, error } = await supabase.from('cashboxes').insert(payload).select('id').single()
    if (error) setMessage(error.message)
    else {
      await insertAuditLog(profile, 'cashboxes', data.id, 'insert', null, payload)
      setMessage('Caixa criado.')
      form.reset()
      cashboxes.reload()
    }
  }

  async function closeCashbox() {
    if (!profile || !cashboxToClose) return
    setClosingId(cashboxToClose.id)
    try {
      const { error } = await supabase.from('cashboxes').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', cashboxToClose.id)
      if (error) setMessage(error.message)
      else {
        await insertAuditLog(profile, 'cashboxes', cashboxToClose.id, 'update', null, { status: 'closed' })
        setMessage('Caixa fechado.')
        setCashboxToClose(null)
        cashboxes.reload()
      }
    } finally {
      setClosingId(null)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Caixas</h1><p>Crie caixa maior, menor ou por rota e acompanhe saldos.</p></div></div>
      <form className="content-panel form-grid" onSubmit={handleSubmit}>
        <label>Nome<input name="name" required placeholder="Caixa maior" /></label>
        <label>Tipo<select name="kind"><option value="major">Caixa maior</option><option value="minor">Caixa menor</option><option value="route">Caixa por rota</option></select></label>
        <label>Rota<select name="routeId"><option value="">Sem rota</option>{routes.data.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
        <label>Saldo inicial<input name="openingBalance" type="number" step="0.01" defaultValue="0" /></label>
        <label className="checkbox-row full-span"><input name="allowNegative" type="checkbox" />Permitir saldo negativo</label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <button className="full-span" type="submit">Criar caixa</button>
      </form>
      <div className="summary-grid">
        <article className="metric-card"><span>Saldo total</span><strong>{formatCurrency(totalBalance)}</strong></article>
        <article className="metric-card"><span>Caixas abertos</span><strong>{cashboxes.data.length}</strong></article>
        <article className="metric-card"><span>Caixas por rota</span><strong>{cashboxes.data.filter((cashbox) => cashbox.kind === 'route').length}</strong></article>
      </div>
      <div className="mobile-card-list">
        {cashboxes.data.map((cashbox) => <article className="mobile-data-card" key={cashbox.id}><strong>{cashbox.name}</strong><span>{cashbox.kind ?? 'Caixa'} - {formatCurrency(cashbox.current_balance)}</span><small>{cashbox.allow_negative ? 'Permite saldo negativo' : 'Bloqueia saldo negativo'}</small><button className="secondary-button" onClick={() => setCashboxToClose({ id: cashbox.id, name: cashbox.name })} type="button">Fechar</button></article>)}
      </div>
      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Tipo</th><th>Saldo</th><th>Status</th><th>Negativo</th><th>Acao</th></tr></thead>
          <tbody>{cashboxes.data.map((cashbox) => <tr key={cashbox.id}><td>{cashbox.name}</td><td>{cashbox.kind ?? '-'}</td><td>{formatCurrency(cashbox.current_balance)}</td><td>{cashbox.status}</td><td>{cashbox.allow_negative ? 'Sim' : 'Nao'}</td><td><button className="secondary-button" onClick={() => setCashboxToClose({ id: cashbox.id, name: cashbox.name })} type="button">Fechar</button></td></tr>)}</tbody>
        </table>
      </section>
      <ConfirmDialog
        open={Boolean(cashboxToClose)}
        title="Confirmar fechamento"
        description={`Fechar o caixa "${cashboxToClose?.name ?? ''}"? Confira o saldo antes de continuar.`}
        confirmLabel="Fechar caixa"
        loading={closingId === cashboxToClose?.id}
        tone="warning"
        onClose={() => setCashboxToClose(null)}
        onConfirm={closeCashbox}
      />
    </section>
  )
}
