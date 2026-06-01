import { Archive, Pencil } from 'lucide-react'
import { FormEvent, useState } from 'react'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate, nullableText, toNumber } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { listCashboxes, listRoutes } from '../services/finance-service'
import { uploadReceipt } from '../services/storage-service'

type ExpenseRecord = {
  id: string
  route_id: string | null
  cashbox_id: string | null
  category: string
  amount: number
  expense_date: string
  description: string | null
  payment_method: string
  notes: string | null
  status: 'active' | 'archived'
}

export function ExpensesPage() {
  const { profile } = useAuth()
  const routes = useAsyncData(listRoutes, [])
  const cashboxes = useAsyncData(listCashboxes, [])
  const expenses = useAsyncData(listExpenses, [])
  const [editing, setEditing] = useState<ExpenseRecord | null>(null)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [routeId, setRouteId] = useState('')
  const [status, setStatus] = useState('active')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const visibleExpenses = expenses.data.filter((expense) => {
    const safeTerm = term.trim().toLowerCase()
    return (!safeTerm || [expense.category, expense.description, expense.notes].some((value) => value?.toLowerCase().includes(safeTerm)))
      && (!routeId || expense.route_id === routeId)
      && (status === 'all' || expense.status === status)
      && (!startDate || expense.expense_date >= startDate)
      && (!endDate || expense.expense_date <= endDate)
  })
  const total = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      p_route_id: nullableText(formData.get('routeId')),
      p_category: String(formData.get('category') ?? ''),
      p_description: nullableText(formData.get('description')),
      p_payment_method: String(formData.get('paymentMethod') ?? 'cash'),
      p_notes: nullableText(formData.get('notes')),
    }
    try {
      if (editing) {
        const { error } = await supabase.rpc('update_expense_details', { p_expense_id: editing.id, ...payload })
        if (error) throw error
        setMessage('Gasto atualizado. O valor contabilizado foi preservado.')
      } else {
        const { data, error } = await supabase.rpc('create_expense_with_cash_movement', {
          p_cashbox_id: nullableText(formData.get('cashboxId')),
          p_route_id: payload.p_route_id,
          p_category: payload.p_category,
          p_amount: toNumber(formData.get('amount')),
          p_expense_date: String(formData.get('expenseDate') ?? localIsoDate()),
          p_description: payload.p_description,
        })
        if (error) throw error
        const expenseId = String(data)
        const { error: detailsError } = await supabase.rpc('update_expense_details', { p_expense_id: expenseId, ...payload })
        if (detailsError) throw detailsError
        const receipt = formData.get('receipt')
        if (receipt instanceof File && receipt.size > 0) {
          const receiptPath = await uploadReceipt(profile, { file: receipt, folder: 'expenses', recordId: expenseId })
          const { error: receiptError } = await supabase.from('expenses').update({ receipt_path: receiptPath }).eq('id', expenseId)
          if (receiptError) throw receiptError
        }
        setMessage('Gasto registrado e caixa atualizado.')
      }
      setEditing(null)
      form.reset()
      await Promise.all([expenses.reload(), cashboxes.reload()])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao salvar gasto.')
    }
  }

  async function archiveExpense(expense: ExpenseRecord) {
    if (!window.confirm(`Arquivar o gasto "${expense.category}" e estornar o caixa vinculado?`)) return
    const { error } = await supabase.rpc('archive_expense', { p_expense_id: expense.id })
    if (error) setMessage(error.message)
    else {
      setMessage('Gasto arquivado. O caixa vinculado foi estornado.')
      await Promise.all([expenses.reload(), cashboxes.reload()])
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Gastos</h1><p>Registre despesas e preserve o historico financeiro com estornos auditados.</p></div></div>
      <form className="content-panel form-grid" key={editing?.id ?? 'new'} onSubmit={handleSubmit}>
        <label>Data<input disabled={Boolean(editing)} name="expenseDate" type="date" defaultValue={editing?.expense_date ?? localIsoDate()} /></label>
        <label>Categoria<input name="category" required defaultValue={editing?.category ?? ''} /></label>
        <label>Valor<input disabled={Boolean(editing)} name="amount" required type="number" step="0.01" defaultValue={editing?.amount ?? ''} /></label>
        <label>Rota<select name="routeId" defaultValue={editing?.route_id ?? ''}><option value="">Sem rota</option>{routes.data.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
        <label>Caixa<select disabled={Boolean(editing)} name="cashboxId" defaultValue={editing?.cashbox_id ?? ''}><option value="">Sem caixa</option>{cashboxes.data.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>)}</select></label>
        <label>Forma<select name="paymentMethod" defaultValue={editing?.payment_method ?? 'cash'}><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="bank_transfer">Transferencia</option><option value="other">Outra</option></select></label>
        {!editing ? <label>Comprovante<input name="receipt" type="file" /></label> : null}
        <label className="full-span">Descricao<textarea name="description" defaultValue={editing?.description ?? ''} /></label>
        <label className="full-span">Observacoes<textarea name="notes" defaultValue={editing?.notes ?? ''} /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <div className="button-row full-span"><button type="submit">{editing ? 'Salvar alteracoes' : 'Salvar gasto'}</button>{editing ? <button className="secondary-button" onClick={() => setEditing(null)} type="button">Cancelar</button> : null}</div>
      </form>
      <section className="content-panel filter-grid-desktop">
        <input onChange={(event) => setTerm(event.target.value)} placeholder="Buscar categoria ou descricao" value={term} />
        <select onChange={(event) => setRouteId(event.target.value)} value={routeId}><option value="">Todas as rotas</option>{routes.data.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
        <select onChange={(event) => setStatus(event.target.value)} value={status}><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option></select>
        <label>De<input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
        <label>Ate<input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
      </section>
      <div className="summary-grid"><article className="metric-card"><span>Total filtrado</span><strong>{formatCurrency(total)}</strong></article><article className="metric-card"><span>Registros</span><strong>{visibleExpenses.length}</strong></article></div>
      <div className="mobile-card-list">{visibleExpenses.map((expense) => <article className="mobile-data-card" key={expense.id}><strong>{expense.category}</strong><span>{formatCurrency(expense.amount)} - {formatDate(expense.expense_date)}</span><small>{expense.description ?? 'Sem descricao'} - {expense.status === 'active' ? 'Ativo' : 'Arquivado'}</small>{expense.status === 'active' ? <div className="button-row"><button className="secondary-button" onClick={() => setEditing(expense)} type="button"><Pencil size={16} />Editar</button><button className="destructive-button" onClick={() => archiveExpense(expense)} type="button"><Archive size={16} />Arquivar</button></div> : null}</article>)}</div>
      <section className="content-panel desktop-table-wrap"><table><thead><tr><th>Data</th><th>Categoria</th><th>Valor</th><th>Descricao</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{visibleExpenses.map((expense) => <tr key={expense.id}><td>{formatDate(expense.expense_date)}</td><td>{expense.category}</td><td>{formatCurrency(expense.amount)}</td><td>{expense.description ?? '-'}</td><td>{expense.status === 'active' ? 'Ativo' : 'Arquivado'}</td><td>{expense.status === 'active' ? <div className="button-row compact-actions"><button className="secondary-button" onClick={() => setEditing(expense)} type="button"><Pencil size={15} />Editar</button><button className="destructive-button" onClick={() => archiveExpense(expense)} type="button"><Archive size={15} />Arquivar</button></div> : '-'}</td></tr>)}</tbody></table></section>
    </section>
  )
}

async function listExpenses(): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []) as ExpenseRecord[]
}
