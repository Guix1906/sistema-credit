import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import type { ClientRecord, InstallmentRecord, LoanRecord, RouteRecord } from '../types/finance'

type RouteMember = {
  id: string
  full_name: string
  role: string
  commission_rate?: number
}

type CollectionLog = {
  id: string
  client_id: string
  result: string
  contacted_at: string
}

const emptyData = {
  route: null as RouteRecord | null,
  clients: [] as ClientRecord[],
  loans: [] as LoanRecord[],
  installments: [] as InstallmentRecord[],
  collections: [] as CollectionLog[],
  members: [] as RouteMember[],
}

export function RouteDetailPage() {
  const { id } = useParams()
  const loader = useCallback(async () => {
    if (!id) throw new Error('Rota nao informada.')
    const route = await supabase.from('routes').select('*').eq('id', id).single()
    if (route.error) throw route.error
    const [clients, loans, members, principalAffiliate] = await Promise.all([
      supabase.from('clients').select('*').eq('route_id', id).order('name'),
      supabase.from('loans').select('*').eq('route_id', id).order('issued_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role, commission_rate').eq('route_id', id).order('full_name'),
      route.data.collector_id
        ? supabase.from('profiles').select('id, full_name, role, commission_rate').eq('id', route.data.collector_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (clients.error) throw clients.error
    if (loans.error) throw loans.error
    if (members.error) throw members.error
    if (principalAffiliate.error) throw principalAffiliate.error
    const loanRows = (loans.data ?? []) as LoanRecord[]
    const clientRows = (clients.data ?? []) as ClientRecord[]
    const [installments, collections] = await Promise.all([
      loanRows.length ? supabase.from('installments').select('*').in('loan_id', loanRows.map((loan) => loan.id)).order('due_date') : Promise.resolve({ data: [], error: null }),
      clientRows.length ? supabase.from('collection_logs').select('id, client_id, result, contacted_at').in('client_id', clientRows.map((client) => client.id)).order('contacted_at', { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
    ])
    if (installments.error) throw installments.error
    if (collections.error) throw collections.error
    const routeMembers = (members.data ?? []) as RouteMember[]
    const principal = principalAffiliate.data as RouteMember | null
    return {
      route: route.data as RouteRecord,
      clients: clientRows,
      loans: loanRows,
      installments: (installments.data ?? []) as InstallmentRecord[],
      collections: (collections.data ?? []) as CollectionLog[],
      members: principal && !routeMembers.some((member) => member.id === principal.id) ? [principal, ...routeMembers] : routeMembers,
    }
  }, [id])
  const { data, loading, error } = useAsyncData(loader, emptyData)
  const today = localIsoDate()
  const clientById = new Map(data.clients.map((client) => [client.id, client]))
  const loanById = new Map(data.loans.map((loan) => [loan.id, loan]))
  const openInstallments = data.installments.filter((installment) => installment.status !== 'paid' && installment.status !== 'cancelled')
  const overdueInstallments = openInstallments.filter((installment) => installment.status === 'overdue' || installment.due_date < today)
  const overdueClientIds = new Set(overdueInstallments.map((installment) => loanById.get(installment.loan_id)?.client_id).filter(Boolean))
  const invested = sum(data.loans.map((loan) => loan.principal_amount))
  const receivable = sum(data.loans.map((loan) => loan.total_amount))
  const received = sum(data.installments.map((installment) => installment.paid_amount))
  const overdue = sum(overdueInstallments.map((installment) => Math.max(installment.amount - installment.paid_amount, 0)))
  const routeUrl = encodeURIComponent(id ?? '')

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>{data.route?.name ?? 'Rota'}</h1>
          <p>{data.route?.city ?? '-'} - {data.route?.neighborhood ?? '-'} | Dia principal: {formatCollectionDay(data.route?.main_collection_day)} | Dias: {formatCollectionDays(data.route?.collection_days)}</p>
        </div>
        <div className="button-row">
          <Link className="button-link secondary-button" to={`/clientes?routeId=${routeUrl}`}>Ver clientes</Link>
          <Link className="button-link secondary-button" to={`/cobrancas?routeId=${routeUrl}`}>Ver cobrancas</Link>
          <Link className="button-link secondary-button" to={`/carteira?routeId=${routeUrl}`}>Ver financeiro</Link>
          <Link className="button-link" to="/rotas">Voltar</Link>
        </div>
      </div>
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <div className="summary-grid">
        <Metric label="Total de clientes" value={String(data.clients.length)} />
        <Metric label="Clientes ativos" value={String(data.clients.filter((client) => client.is_active && client.status !== 'inactive').length)} />
        <Metric label="Clientes atrasados" value={String(overdueClientIds.size)} />
        <Metric label="Total emprestado" value={formatCurrency(invested)} />
        <Metric label="Total a receber" value={formatCurrency(receivable)} />
        <Metric label="Total recebido" value={formatCurrency(received)} />
        <Metric label="Total em atraso" value={formatCurrency(overdue)} />
        <Metric label="Parcelas pendentes" value={String(openInstallments.length)} />
        <Metric label="Parcelas pagas" value={String(data.installments.filter((installment) => installment.status === 'paid').length)} />
        <Metric label="Parcelas atrasadas" value={String(overdueInstallments.length)} />
      </div>

      <section className="content-panel">
        <h2>Dados da rota</h2>
        <p>{data.route?.description || 'Sem descricao.'}</p>
        {data.route?.observations ? <p><strong>Observacoes:</strong> {data.route.observations}</p> : null}
      </section>
      <section className="content-panel desktop-table-wrap">
        <h2>Clientes</h2>
        <table><thead><tr><th>Nome</th><th>Telefone</th><th>Status</th></tr></thead><tbody>{data.clients.map((client) => <tr key={client.id}><td><Link to={`/clientes/${client.id}`}>{client.name}</Link></td><td>{client.phone ?? client.whatsapp ?? '-'}</td><td>{overdueClientIds.has(client.id) ? 'overdue' : client.status ?? '-'}</td></tr>)}</tbody></table>
      </section>
      <section className="content-panel desktop-table-wrap">
        <h2>Parcelas e cobrancas</h2>
        <table><thead><tr><th>Cliente</th><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Recebido</th><th>Status</th></tr></thead><tbody>{data.installments.map((installment) => {
          const client = clientById.get(loanById.get(installment.loan_id)?.client_id ?? '')
          return <tr key={installment.id}><td>{client ? <Link to={`/clientes/${client.id}`}>{client.name}</Link> : '-'}</td><td>{installment.installment_number}</td><td>{formatDate(installment.due_date)}</td><td>{formatCurrency(installment.amount)}</td><td>{formatCurrency(installment.paid_amount)}</td><td>{overdueInstallments.includes(installment) ? 'overdue' : installment.status}</td></tr>
        })}</tbody></table>
      </section>
      <section className="content-panel desktop-table-wrap">
        <h2>Historico de cobrancas</h2>
        <table><thead><tr><th>Cliente</th><th>Data</th><th>Resultado</th></tr></thead><tbody>{data.collections.map((collection) => <tr key={collection.id}><td>{clientById.get(collection.client_id)?.name ?? '-'}</td><td>{formatDate(collection.contacted_at)}</td><td>{collection.result}</td></tr>)}</tbody></table>
      </section>
      <section className="content-panel desktop-table-wrap">
        <h2>Emprestimos</h2>
        <table><thead><tr><th>Venda</th><th>Emprestado</th><th>A receber</th><th>Status</th></tr></thead><tbody>{data.loans.map((loan) => <tr key={loan.id}><td><Link to={`/vendas/${loan.id}`}>{loan.id.slice(0, 8)}</Link></td><td>{formatCurrency(loan.principal_amount)}</td><td>{formatCurrency(loan.total_amount)}</td><td>{loan.status}</td></tr>)}</tbody></table>
      </section>
      <section className="content-panel desktop-table-wrap">
        <h2>Afiliados vinculados</h2>
        <table><thead><tr><th>Nome</th><th>Papel</th><th>Comissao</th></tr></thead><tbody>{data.members.map((member) => <tr key={member.id}><td>{member.full_name}</td><td>{member.role}</td><td>{member.commission_rate ?? 0}%</td></tr>)}</tbody></table>
      </section>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>
}

function formatCollectionDays(days?: number[]) {
  return days?.length ? days.map(formatCollectionDay).filter((day) => day !== '-').join(', ') : '-'
}

function formatCollectionDay(day?: number | null) {
  return day ? WEEK_DAYS[day - 1] ?? '-' : '-'
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0)
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
