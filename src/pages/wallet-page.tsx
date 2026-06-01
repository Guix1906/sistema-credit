import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAsyncData } from '../hooks/use-async-data'
import { formatCurrency } from '../lib/formatters'
import { getSelectOptions, listWalletRows } from '../services/finance-service'

export function WalletPage() {
  const [filters, setFilters] = useState({ status: 'all', routeId: '', collectorId: '', term: '', page: 0, pageSize: 25 })
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const loader = useCallback(() => listWalletRows(filters), [filters])
  const { data: rows, loading, error } = useAsyncData(loader, [])
  const total = rows.reduce((sum, row) => sum + row.loan.total_amount, 0)
  const open = rows.reduce((sum, row) => sum + (row.loan.remaining_amount ?? 0), 0)
  const paid = rows.reduce((sum, row) => sum + (row.loan.paid_amount ?? 0), 0)
  const overdue = rows.filter((row) => row.loan.status === 'overdue' || row.loan.status === 'defaulted').reduce((sum, row) => sum + (row.loan.remaining_amount ?? 0), 0)

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Carteira</h1><p>Total em aberto, vencido, atrasado, pago e clientes da carteira.</p></div></div>
      <div className="summary-grid">
        <Metric label="Total carteira" value={formatCurrency(total)} />
        <Metric label="Total em aberto" value={formatCurrency(open)} />
        <Metric label="Total atrasado" value={formatCurrency(overdue)} />
        <Metric label="Total pago" value={formatCurrency(paid)} />
        <Metric label="Quantidade de clientes" value={String(new Set(rows.map((row) => row.loan.client_id)).size)} />
      </div>
      <section className="content-panel filter-grid-desktop">
        <select value={filters.routeId} onChange={(event) => setFilters((current) => ({ ...current, routeId: event.target.value }))}><option value="">Todas as rotas</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
        <select value={filters.collectorId} onChange={(event) => setFilters((current) => ({ ...current, collectorId: event.target.value }))}><option value="">Todos os cobradores</option>{options.data.collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.full_name}</option>)}</select>
        <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">Todos os status</option><option value="active">Em dia</option><option value="overdue">Atrasadas</option><option value="defaulted">Vencidas</option><option value="paid">Quitadas</option></select>
        <input placeholder="Nome do cliente" value={filters.term} onChange={(event) => setFilters((current) => ({ ...current, term: event.target.value }))} />
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
