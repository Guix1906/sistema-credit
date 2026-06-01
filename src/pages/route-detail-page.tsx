import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAsyncData } from '../hooks/use-async-data'
import { formatCurrency } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import type { ClientRecord, LoanRecord, RouteRecord } from '../types/finance'

type RouteMember = {
  id: string
  full_name: string
  role: string
  commission_rate?: number
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
    const routeMembers = (members.data ?? []) as RouteMember[]
    const principal = principalAffiliate.data as RouteMember | null
    return {
      route: route.data as RouteRecord,
      clients: (clients.data ?? []) as ClientRecord[],
      loans: (loans.data ?? []) as LoanRecord[],
      members: principal && !routeMembers.some((member) => member.id === principal.id) ? [principal, ...routeMembers] : routeMembers,
    }
  }, [id])
  const { data, loading, error } = useAsyncData(loader, { route: null as RouteRecord | null, clients: [] as ClientRecord[], loans: [] as LoanRecord[], members: [] as RouteMember[] })
  const invested = data.loans.reduce((sum, loan) => sum + loan.principal_amount, 0)
  const receivable = data.loans.reduce((sum, loan) => sum + loan.total_amount, 0)
  const received = data.loans.reduce((sum, loan) => sum + (loan.paid_amount ?? 0), 0)
  const overdue = data.loans.filter((loan) => loan.status === 'overdue' || loan.status === 'defaulted').reduce((sum, loan) => sum + (loan.remaining_amount ?? 0), 0)
  const goal = data.route?.goal_amount ?? 0

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>{data.route?.name ?? 'Rota'}</h1>
          <p>{data.route?.city ?? '-'} - {data.route?.neighborhood ?? '-'} · Dias: {formatCollectionDays(data.route?.collection_days)}</p>
        </div>
        <Link className="button-link" to="/rotas">Voltar</Link>
      </div>
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <div className="summary-grid">
        <Metric label="Total investido" value={formatCurrency(invested)} />
        <Metric label="Total a receber" value={formatCurrency(receivable)} />
        <Metric label="Total recebido" value={formatCurrency(received)} />
        <Metric label="Total atrasado" value={formatCurrency(overdue)} />
        <Metric label="Meta" value={formatCurrency(goal)} />
        <Metric label="Diferenca" value={formatCurrency(received - goal)} />
      </div>

      <section className="content-panel desktop-table-wrap">
        <h2>Clientes</h2>
        <table><thead><tr><th>Nome</th><th>Telefone</th><th>Status</th></tr></thead><tbody>{data.clients.map((client) => <tr key={client.id}><td><Link to={`/clientes/${client.id}`}>{client.name}</Link></td><td>{client.phone ?? client.whatsapp ?? '-'}</td><td>{client.status ?? '-'}</td></tr>)}</tbody></table>
      </section>
      <section className="content-panel desktop-table-wrap">
        <h2>Vendas</h2>
        <table><thead><tr><th>Venda</th><th>Investido</th><th>A receber</th><th>Recebido</th><th>Status</th></tr></thead><tbody>{data.loans.map((loan) => <tr key={loan.id}><td><Link to={`/vendas/${loan.id}`}>{loan.id.slice(0, 8)}</Link></td><td>{formatCurrency(loan.principal_amount)}</td><td>{formatCurrency(loan.total_amount)}</td><td>{formatCurrency(loan.paid_amount)}</td><td>{loan.status}</td></tr>)}</tbody></table>
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
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
  return days?.length ? days.map((day) => labels[day - 1]).filter(Boolean).join(', ') : '-'
}
