import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAsyncData } from '../hooks/use-async-data'
import { formatCurrency } from '../lib/formatters'
import { getWalletFilterOptions, getWalletMetrics, listWalletRows } from '../services/finance-service'

export function WalletPage() {
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState({ status: 'all', routeId: searchParams.get('routeId') ?? '', collectorId: '', clientId: '', term: '', page: 0, pageSize: 25 })
  const options = useAsyncData(getWalletFilterOptions, { routes: [], collectors: [], clients: [], statuses: [] })
  const loader = useCallback(() => listWalletRows(filters), [filters])
  const { data: rows, loading, error } = useAsyncData(loader, [])
  const metricsLoader = useCallback(() => getWalletMetrics(filters), [filters])
  const metrics = useAsyncData(metricsLoader, { total: 0, open: 0, paid: 0, overdue: 0, clients: 0 })

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Carteira</h1><p>Total em aberto, vencido, atrasado, pago e clientes da carteira.</p></div></div>
      <div className="summary-grid">
        <Metric label="Total carteira" value={formatCurrency(metrics.data.total)} />
        <Metric label="Total em aberto" value={formatCurrency(metrics.data.open)} />
        <Metric label="Total atrasado" value={formatCurrency(metrics.data.overdue)} />
        <Metric label="Total pago" value={formatCurrency(metrics.data.paid)} />
        <Metric label="Quantidade de clientes" value={String(metrics.data.clients)} />
      </div>
      <section className="content-panel filter-grid-desktop">
        <select value={filters.routeId} onChange={(event) => setFilters((current) => ({ ...current, routeId: event.target.value, page: 0 }))}><option value="">Todas as rotas</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}{route.is_active ? '' : ' (inativa)'}</option>)}</select>
        <select value={filters.collectorId} onChange={(event) => setFilters((current) => ({ ...current, collectorId: event.target.value, page: 0 }))}><option value="">Todos os afiliados</option>{options.data.collectors.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}{affiliate.is_active ? '' : ' (inativo)'}</option>)}</select>
        <select value={filters.clientId} onChange={(event) => setFilters((current) => ({ ...current, clientId: event.target.value, page: 0 }))}><option value="">Todos os clientes</option>{options.data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.document_number || client.phone ? ` - ${client.document_number ?? client.phone}` : ''}</option>)}</select>
        <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 0 }))}><option value="all">Todos os status</option>{options.data.statuses.map((status) => <option key={status} value={status}>{formatLoanStatus(status)}</option>)}</select>
        <input placeholder="Buscar cliente por nome, CPF ou telefone" value={filters.term} onChange={(event) => setFilters((current) => ({ ...current, term: event.target.value, page: 0 }))} />
      </section>
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Venda</th><th>Valor total</th><th>Valor pago</th><th>Devido</th><th>Parcelas pagas</th><th>Pendentes</th><th>Status</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.loan.id}><td>{row.client ? <Link to={`/clientes/${row.client.id}`}>{row.client.name}</Link> : '-'}</td><td><Link to={`/vendas/${row.loan.id}`}>{row.loan.id.slice(0, 8)}</Link></td><td>{formatCurrency(row.loan.total_amount)}</td><td>{formatCurrency(row.loan.paid_amount)}</td><td>{formatCurrency(row.loan.remaining_amount)}</td><td>{row.paidInstallments}</td><td>{row.pendingInstallments}</td><td>{row.loan.status}</td></tr>)}</tbody>
        </table>
      </section>
      <div className="button-row">
        <button className="secondary-button" disabled={filters.page === 0} onClick={() => setFilters((current) => ({ ...current, page: Math.max(current.page - 1, 0) }))} type="button">Anterior</button>
        <span className="muted-copy">Pagina {filters.page + 1}</span>
        <button className="secondary-button" disabled={rows.length < filters.pageSize} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} type="button">Proxima</button>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>
}

function formatLoanStatus(status: string) {
  return {
    active: 'Em dia',
    overdue: 'Atrasada',
    defaulted: 'Vencida',
    paid: 'Quitada',
    draft: 'Rascunho',
    cancelled: 'Cancelada',
  }[status] ?? status
}
