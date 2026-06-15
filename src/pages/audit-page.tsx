import { useCallback, useState } from 'react'

import { StatusBadge } from '../components/status-badge'
import { useAsyncData } from '../hooks/use-async-data'
import { downloadCsv } from '../lib/exporters'
import { supabase } from '../lib/supabase'

export function AuditPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 25
  const loader = useCallback(async () => {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1)
    if (action) query = query.eq('action', action)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Record<string, unknown>[]
  }, [action, page])
  const { data, loading, error, reload } = useAsyncData(loader, [])

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Auditoria</h1><p>Eventos sensiveis registrados no banco.</p></div><button className="secondary-button" onClick={() => downloadCsv('auditoria.csv', data)} type="button">Exportar CSV</button></div>
      <section className="content-panel filter-grid-desktop"><input placeholder="Acao: insert, update, delete..." value={action} onChange={(event) => { setAction(event.target.value); setPage(0) }} /><button onClick={reload} type="button">Filtrar</button></section>
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <section className="content-panel desktop-table-wrap"><table><thead><tr><th>Usuario</th><th>Acao</th><th>Tabela</th><th>Registro</th><th>Antes</th><th>Depois</th><th>Data/hora</th></tr></thead><tbody>{data.map((row) => <tr key={String(row.id)}><td className="mono-cell">{shortId(row.actor_id)}</td><td><StatusBadge value={String(row.action)} /></td><td>{formatTableName(row.table_name)}</td><td className="mono-cell">{shortId(row.record_id)}</td><td>{renderPayload(row.old_data)}</td><td>{renderPayload(row.new_data)}</td><td>{formatDateTime(row.created_at)}</td></tr>)}</tbody></table></section>
      <div className="button-row"><button className="secondary-button" disabled={page === 0} onClick={() => setPage((value) => Math.max(value - 1, 0))} type="button">Anterior</button><span className="muted-copy">Pagina {page + 1}</span><button className="secondary-button" disabled={data.length < pageSize} onClick={() => setPage((value) => value + 1)} type="button">Proxima</button></div>
    </section>
  )
}

function shortId(value: unknown) {
  const text = String(value ?? '-')
  if (text === '-' || text.length <= 14) return text
  return `${text.slice(0, 8)}...${text.slice(-4)}`
}

function formatTableName(value: unknown) {
  const labels: Record<string, string> = {
    access_settings: 'Horarios',
    app_settings: 'Sistema',
    clients: 'Clientes',
    collection_logs: 'Cobrancas',
    loan_settings: 'Financeiro',
    payments: 'Pagamentos',
    profiles: 'Usuarios',
  }
  const key = String(value ?? '')
  return labels[key] ?? (key || '-')
}

function formatDateTime(value: unknown) {
  const text = String(value ?? '')
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text || '-' : date.toLocaleString('pt-BR')
}

function renderPayload(value: unknown) {
  if (value === null || value === undefined || value === '') return <span className="muted-copy">-</span>
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const summary = summarizePayload(value)
  return (
    <details className="audit-json-details">
      <summary>{summary}</summary>
      <pre>{content}</pre>
    </details>
  )
}

function summarizePayload(value: unknown) {
  if (typeof value === 'object' && value && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>).slice(0, 3)
    return keys.length ? keys.join(', ') : 'Detalhes'
  }
  const text = String(value)
  return text.length > 36 ? `${text.slice(0, 36)}...` : text
}
