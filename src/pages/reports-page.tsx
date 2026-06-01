import { FormEvent, useCallback, useState } from 'react'

import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { downloadCsv } from '../lib/exporters'
import { formatCurrency } from '../lib/formatters'
import { supabase } from '../lib/supabase'

type ReportType = 'geral' | 'rota' | 'cobrador' | 'cliente' | 'vendas' | 'pagas' | 'atrasadas' | 'inadimplencia' | 'lucro' | 'caixa' | 'gastos' | 'diario' | 'semanal' | 'mensal' | 'anual'

const reportLabels: Record<ReportType, string> = {
  geral: 'Geral',
  rota: 'Por rota',
  cobrador: 'Por afiliado',
  cliente: 'Por cliente',
  vendas: 'Vendas',
  pagas: 'Parcelas pagas',
  atrasadas: 'Parcelas atrasadas',
  inadimplencia: 'Inadimplencia',
  lucro: 'Lucro',
  caixa: 'Caixa',
  gastos: 'Gastos',
  diario: 'Diario',
  semanal: 'Semanal',
  mensal: 'Mensal',
  anual: 'Anual',
}

export function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('geral')
  const [filters, setFilters] = useState({ startDate: '', endDate: '', term: '' })
  const loader = useCallback(() => loadReport(reportType, filters), [reportType, filters])
  const { data, loading, error } = useAsyncData(loader, [] as Record<string, unknown>[])
  const totals = calculateTotals(data)

  function handleFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setFilters({
      startDate: String(formData.get('startDate') ?? ''),
      endDate: String(formData.get('endDate') ?? ''),
      term: String(formData.get('term') ?? ''),
    })
  }

  const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].slice(0, 10)

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Relatorios</h1>
          <p>Relatorios financeiros e operacionais com filtros, resumo, tabela, CSV e impressao PDF.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => downloadCsv(`relatorio-${reportType}.csv`, data)} type="button">Exportar CSV</button>
          <button className="action-button" onClick={() => window.print()} type="button">Exportar PDF</button>
        </div>
      </div>

      <form className="content-panel filter-grid-desktop" onSubmit={handleFilters}>
        <select value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
          {Object.entries(reportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input name="startDate" type="date" defaultValue={filters.startDate} />
        <input name="endDate" type="date" defaultValue={filters.endDate} />
        <input name="term" placeholder="Nome, rota, status ou texto" defaultValue={filters.term} />
        <button type="submit">Filtrar</button>
      </form>

      <div className="summary-grid">
        <Metric label="Total investido" value={formatCurrency(totals.invested)} />
        <Metric label="Total a receber" value={formatCurrency(totals.receivable)} />
        <Metric label="Total recebido" value={formatCurrency(totals.received)} />
        <Metric label="Lucro" value={formatCurrency(totals.profit)} />
        <Metric label="Em aberto" value={formatCurrency(totals.open)} />
        <Metric label="Registros" value={String(data.length)} />
      </div>

      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{data.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}</tr>)}</tbody>
        </table>
        {!data.length && !loading ? <p className="muted-copy">Nenhum registro encontrado.</p> : null}
      </section>
    </section>
  )
}

async function loadReport(reportType: ReportType, filters: { startDate: string; endDate: string; term: string }): Promise<Record<string, unknown>[]> {
  if (reportType === 'caixa') return selectTable('cash_movements', 'occurred_at', filters)
  if (reportType === 'gastos') return selectTable('expenses', 'expense_date', filters)
  if (reportType === 'pagas') return selectInstallments('paid', filters)
  if (reportType === 'atrasadas' || reportType === 'inadimplencia') return selectOverdueInstallments(filters)
  if (reportType === 'rota') return aggregateBy('routes', 'route_id', filters)
  if (reportType === 'cobrador') return aggregateBy('profiles', 'collector_id', filters)
  if (reportType === 'cliente') return aggregateBy('clients', 'client_id', filters)
  return selectLoans(filters, reportType)
}

async function selectLoans(filters: { startDate: string; endDate: string; term: string }, reportType: ReportType): Promise<Record<string, unknown>[]> {
  let query = supabase.from('loans').select('*').order('issued_at', { ascending: false }).limit(500)
  if (filters.startDate) query = query.gte('issued_at', filters.startDate)
  if (filters.endDate) query = query.lte('issued_at', filters.endDate)
  if (reportType === 'lucro') query = query.gt('interest_amount', 0)
  if (['diario', 'semanal', 'mensal', 'anual'].includes(reportType)) {
    const start = periodStart(reportType)
    if (start) query = query.gte('issued_at', start)
  }
  const { data, error } = await query
  if (error) throw error
  return filterTerm(await enrichLoanRows((data ?? []) as Record<string, unknown>[]), filters.term)
}

async function selectInstallments(status: string, filters: { startDate: string; endDate: string; term: string }): Promise<Record<string, unknown>[]> {
  let query = supabase.from('installments').select('*').eq('status', status).order('due_date', { ascending: false }).limit(500)
  if (filters.startDate) query = query.gte('due_date', filters.startDate)
  if (filters.endDate) query = query.lte('due_date', filters.endDate)
  const { data, error } = await query
  if (error) throw error
  return filterTerm(await enrichInstallmentRows((data ?? []) as Record<string, unknown>[]), filters.term)
}

async function selectOverdueInstallments(filters: { startDate: string; endDate: string; term: string }): Promise<Record<string, unknown>[]> {
  let query = supabase.from('installments').select('*').neq('status', 'paid').lt('due_date', localIsoDate()).order('due_date').limit(500)
  if (filters.startDate) query = query.gte('due_date', filters.startDate)
  if (filters.endDate) query = query.lte('due_date', filters.endDate)
  const { data, error } = await query
  if (error) throw error
  return filterTerm(await enrichInstallmentRows((data ?? []) as Record<string, unknown>[]), filters.term)
}

async function enrichLoanRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const clientIds = uniqueIds(rows, 'client_id')
  const routeIds = uniqueIds(rows, 'route_id')
  const collectorIds = uniqueIds(rows, 'collector_id')
  const [clients, routes, collectors] = await Promise.all([
    fetchLabelMap('clients', clientIds, 'name'),
    fetchLabelMap('routes', routeIds, 'name'),
    fetchLabelMap('profiles', collectorIds, 'full_name'),
  ])
  return rows.map((row) => ({
    ...row,
    cliente: clients.get(String(row.client_id ?? '')) ?? '',
    rota: routes.get(String(row.route_id ?? '')) ?? '',
    afiliado: collectors.get(String(row.collector_id ?? '')) ?? '',
  }))
}

async function enrichInstallmentRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const loanIds = uniqueIds(rows, 'loan_id')
  if (!loanIds.length) return rows
  const { data, error } = await supabase.from('loans').select('id, client_id, route_id, collector_id').in('id', loanIds)
  if (error) throw error
  const loans = (data ?? []) as Record<string, unknown>[]
  const enrichedLoans = await enrichLoanRows(loans)
  const loanById = new Map(enrichedLoans.map((loan) => [String(loan.id), loan]))
  return rows.map((row) => {
    const loan = loanById.get(String(row.loan_id))
    return { ...row, cliente: loan?.cliente ?? '', rota: loan?.rota ?? '', afiliado: loan?.afiliado ?? '' }
  })
}

async function fetchLabelMap(table: 'clients' | 'routes' | 'profiles', ids: string[], label: 'name' | 'full_name'): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const { data, error } = await supabase.from(table).select(`id, ${label}`).in('id', ids)
  if (error) throw error
  return new Map((data ?? []).map((row: Record<string, unknown>) => [String(row.id), String(row[label] ?? '')]))
}

function uniqueIds(rows: Record<string, unknown>[], key: string): string[] {
  return [...new Set(rows.map((row) => String(row[key] ?? '')).filter(Boolean))]
}

async function selectTable(table: string, dateColumn: string, filters: { startDate: string; endDate: string; term: string }): Promise<Record<string, unknown>[]> {
  let query = supabase.from(table).select('*').order(dateColumn, { ascending: false }).limit(500)
  if (filters.startDate) query = query.gte(dateColumn, filters.startDate)
  if (filters.endDate) query = query.lte(dateColumn, filters.endDate)
  const { data, error } = await query
  if (error) throw error
  return filterTerm((data ?? []) as Record<string, unknown>[], filters.term)
}

async function aggregateBy(labelTable: 'routes' | 'profiles' | 'clients', key: 'route_id' | 'collector_id' | 'client_id', filters: { startDate: string; endDate: string; term: string }): Promise<Record<string, unknown>[]> {
  const loans = await selectLoans(filters, 'geral')
  const ids = [...new Set(loans.map((loan) => String(loan[key] ?? '')).filter(Boolean))]
  const labelColumns = labelTable === 'profiles' ? 'id, full_name' : 'id, name'
  const labels = ids.length ? await supabase.from(labelTable).select(labelColumns).in('id', ids) : { data: [], error: null }
  if (labels.error) throw labels.error
  const nameById = new Map((labels.data ?? []).map((row: Record<string, unknown>) => [String(row.id), String(row.name ?? row.full_name ?? row.id)]))
  return ids.map((id) => {
    const rows = loans.filter((loan) => loan[key] === id)
    return {
      id,
      nome: nameById.get(id) ?? id,
      quantidade: rows.length,
      principal_amount: rows.reduce((sum, loan) => sum + Number(loan.principal_amount ?? 0), 0),
      total_amount: rows.reduce((sum, loan) => sum + Number(loan.total_amount ?? 0), 0),
      paid_amount: rows.reduce((sum, loan) => sum + Number(loan.paid_amount ?? 0), 0),
      remaining_amount: rows.reduce((sum, loan) => sum + Number(loan.remaining_amount ?? 0), 0),
    }
  })
}

function calculateTotals(data: Record<string, unknown>[]) {
  const invested = data.reduce((sum, row) => sum + Number(row.principal_amount ?? row.amount ?? 0), 0)
  const receivable = data.reduce((sum, row) => sum + Number(row.total_amount ?? row.amount ?? 0), 0)
  const received = data.reduce((sum, row) => sum + Number(row.paid_amount ?? 0), 0)
  const open = data.reduce((sum, row) => sum + Number(row.remaining_amount ?? 0), 0)
  return { invested, receivable, received, open, profit: receivable - invested }
}

function periodStart(reportType: ReportType): string | null {
  const date = new Date()
  if (reportType === 'diario') return localIsoDate(date)
  if (reportType === 'semanal') date.setDate(date.getDate() - 7)
  if (reportType === 'mensal') date.setMonth(date.getMonth() - 1)
  if (reportType === 'anual') date.setFullYear(date.getFullYear() - 1)
  return ['semanal', 'mensal', 'anual'].includes(reportType) ? localIsoDate(date) : null
}

function filterTerm(rows: Record<string, unknown>[], term: string) {
  const safeTerm = term.trim().toLowerCase()
  if (!safeTerm) return rows
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(safeTerm))
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return Math.abs(value) >= 10 ? formatCurrency(value) : String(value)
  return String(value ?? '-')
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>
}
