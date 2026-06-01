import { FormEvent, useState } from 'react'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { downloadCsv } from '../lib/exporters'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import { createManualCashMovement, getSelectOptions, listCashMovements, reverseCashMovement } from '../services/finance-service'

export function MovementsPage() {
  const { profile } = useAuth()
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const movements = useAsyncData(listCashMovements, [])
  const [message, setMessage] = useState('')

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
          <button className="secondary-button" onClick={() => downloadCsv('movimentos.csv', movements.data)} type="button">Exportar CSV</button>
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

      <div className="mobile-card-list">
        {movements.data.map((movement) => (
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
            {movements.data.map((movement) => (
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
