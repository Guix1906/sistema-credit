import { FormEvent, useState } from 'react'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, nullableText, toNumber } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { listCashboxes, listRoutes } from '../services/finance-service'
import { uploadReceipt } from '../services/storage-service'

export function ExpensesPage() {
  const { profile } = useAuth()
  const routes = useAsyncData(listRoutes, [])
  const cashboxes = useAsyncData(listCashboxes, [])
  const expenses = useAsyncData(listExpenses, [] as Record<string, unknown>[])
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const formData = new FormData(event.currentTarget)
    const cashboxId = nullableText(formData.get('cashboxId'))
    const amount = toNumber(formData.get('amount'))
    const payload = {
      p_cashbox_id: cashboxId,
      p_route_id: nullableText(formData.get('routeId')),
      p_category: String(formData.get('category') ?? ''),
      p_amount: amount,
      p_expense_date: String(formData.get('expenseDate') ?? localIsoDate()),
      p_description: nullableText(formData.get('description')),
    }
    const { data, error } = await supabase.rpc('create_expense_with_cash_movement', payload)
    if (error) {
      setMessage(error.message)
      return
    }
    const receipt = formData.get('receipt')
    if (receipt instanceof File && receipt.size > 0) {
      const receiptPath = await uploadReceipt(profile, { file: receipt, folder: 'expenses', recordId: String(data) })
      const { error: receiptError } = await supabase.from('expenses').update({ receipt_path: receiptPath }).eq('id', String(data))
      if (receiptError) {
        setMessage(receiptError.message)
        return
      }
    }
    event.currentTarget.reset()
    await Promise.all([expenses.reload(), cashboxes.reload()])
    setMessage('Gasto registrado.')
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Gastos</h1><p>Registre despesas e vincule ao caixa e rota quando necessário.</p></div></div>
      <form className="content-panel form-grid" onSubmit={handleSubmit}>
        <label>Data<input name="expenseDate" type="date" defaultValue={localIsoDate()} /></label>
        <label>Categoria<input name="category" required /></label>
        <label>Valor<input name="amount" required type="number" step="0.01" /></label>
        <label>Rota<select name="routeId"><option value="">Sem rota</option>{routes.data.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
        <label>Caixa<select name="cashboxId"><option value="">Sem caixa</option>{cashboxes.data.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>)}</select></label>
        <label>Comprovante<input name="receipt" type="file" /></label>
        <label className="full-span">Descrição<textarea name="description" /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <button className="full-span" type="submit">Salvar gasto</button>
      </form>
      <section className="content-panel desktop-table-wrap"><table><thead><tr><th>Data</th><th>Categoria</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>{expenses.data.map((expense) => <tr key={String(expense.id)}><td>{String(expense.expense_date)}</td><td>{String(expense.category)}</td><td>{formatCurrency(Number(expense.amount))}</td><td>{String(expense.description ?? '-')}</td></tr>)}</tbody></table></section>
    </section>
  )
}

async function listExpenses() {
  const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(100)
  if (error) throw error
  return data ?? []
}
