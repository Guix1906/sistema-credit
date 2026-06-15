import { FormEvent, useState } from 'react'

import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { summarizeCashMovements } from '../lib/cash-movement-summary'
import { downloadCsv } from '../lib/exporters'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import { createManualCashMovement, getSelectOptions, listCashMovements, reverseCashMovement } from '../services/finance-service'

export function MovementsPage() {
  const { profile } = useAuth()
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const movements = useAsyncData(listCashMovements, [])
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [type, setType] = useState('')
  const [cashboxId, setCashboxId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const visibleMovements = movements.data.filter((movement) => {
    const safeTerm = term.trim().toLowerCase()
    const date = movement.occurred_at.slice(0, 10)
    return (!safeTerm || [movement.description, movement.cashbox?.name, movement.payment_id ? 'pagamento' : 'manual'].some((value) => value?.toLowerCase().includes(safeTerm)))
      && (!type || movement.type === type)
      && (!cashboxId || movement.cashbox_id === cashboxId)
      && (!startDate || date >= startDate)
      && (!endDate || date <= endDate)
  })
  const summary = summarizeCashMovements(visibleMovements)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      await createManualCashMovement(profile, {
        cashboxId: String(formData.get('cashboxId')),
        type: String(formData.get('type')) as 'inflow' | 'outflow' | 'adjustment',
        amount: toNumber(formData.get('amount')),
        description: String(formData.get('description')),
      })
      form.reset()
      await Promise.all([movements.reload(), options.reload()])
      setMessage('Movimento registrado e saldo atualizado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao registrar movimento.')
    }
  }

  async function handleReverse(id: string) {
    if (!profile) return
    try {
      await reverseCashMovement(profile, id)
      await Promise.all([movements.reload(), options.reload()])
      setMessage('Estorno criado com movimento contrario.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao estornar movimento.')
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Movimentos</h1>
          <p>Entradas, saidas, ajustes e estornos com saldo de caixa atualizado.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => downloadCsv('movimentos.csv', visibleMovements)} type="button">Exportar CSV</button>
          <button className="action-button" onClick={() => window.print()} type="button">Exportar PDF</button>
        </div>
      </div>

      <form className="content-panel form-grid" onSubmit={handleSubmit}>
        <label>Caixa<select name="cashboxId" required><option value="">Selecione</option>{options.data.cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name} - {formatCurrency(cashbox.current_balance)}</option>)}</select></label>
        <label>Tipo<select name="type" required><option value="inflow">Recebimento / investimento</option><option value="outflow">Retirada / despesa</option><option value="adjustment">Ajuste positivo</option></select></label>
        <label>Valor<input name="amount" required min="0.01" step="0.01" type="number" /></label>
        <label>Descricao<input name="description" required placeholder="Motivo do movimento" /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <button className="full-span" type="submit">Salvar movimento</button>
      </form>

      {movements.error ? <p className="form-message">{movements.error}</p> : null}
      {movements.loading ? <div className="skeleton-card" /> : null}
      <div className="summary-grid">
        <article className="metric-card"><span>Entradas filtradas</span><strong>{formatCurrency(summary.inflows)}</strong></article>
        <article className="metric-card"><span>Saidas filtradas</span><strong>{formatCurrency(summary.outflows)}</strong></article>
        <article className="metric-card"><span>Saldo do periodo</span><strong>{formatCurrency(summary.balance)}</strong></article>
      </div>
      <section className="content-panel filter-grid-desktop">
        <input onChange={(event) => setTerm(event.target.value)} placeholder="Buscar descricao, caixa ou origem" value={term} />
        <select onChange={(event) => setType(event.target.value)} value={type}><option value="">Todos os tipos</option><option value="inflow">Entradas</option><option value="outflow">Saidas</option><option value="adjustment">Ajustes</option></select>
        <select onChange={(event) => setCashboxId(event.target.value)} value={cashboxId}><option value="">Todos os caixas</option>{options.data.cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>)}</select>
        <label>De<input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
        <label>Ate<input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
      </section>

      <div className="mobile-card-list">
        {visibleMovements.map((movement) => (
          <article className="mobile-data-card" key={movement.id}>
            <strong>{movement.cashbox?.name ?? 'Caixa'}</strong>
            <span>{movement.type} - {formatCurrency(movement.amount)}</span>
            <small>{formatDate(movement.occurred_at)} - {movement.description}</small>
            {movement.reversed_movement_id ? <small>Estornado</small> : <button onClick={() => handleReverse(movement.id)} type="button">Estornar</button>}
          </article>
        ))}
      </div>

      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Caixa</th><th>Tipo</th><th>Valor</th><th>Descricao</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>
            {visibleMovements.map((movement) => (
              <tr key={movement.id}>
                <td>{formatDate(movement.occurred_at)}</td>
                <td>{movement.cashbox?.name ?? '-'}</td>
                <td>{movement.type}</td>
                <td>{formatCurrency(movement.amount)}</td>
                <td>{movement.description}</td>
                <td>{movement.reversed_movement_id ? 'Estornado' : 'Ativo'}</td>
                <td>{movement.reversed_movement_id ? '-' : <button onClick={() => handleReverse(movement.id)} type="button">Estornar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}
