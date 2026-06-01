import { useCallback, useState } from 'react'

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
      <section className="content-panel filter-grid-desktop"><input placeholder="Acao" value={action} onChange={(event) => { setAction(event.target.value); setPage(0) }} /><button onClick={reload} type="button">Filtrar</button></section>
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <section className="content-panel desktop-table-wrap"><table><thead><tr><th>Usuario</th><th>Acao</th><th>Tabela</th><th>Registro</th><th>Antes</th><th>Depois</th><th>Data/hora</th></tr></thead><tbody>{data.map((row) => <tr key={String(row.id)}><td>{String(row.actor_id ?? '-')}</td><td>{String(row.action)}</td><td>{String(row.table_name)}</td><td>{String(row.record_id ?? '-')}</td><td>{JSON.stringify(row.old_data ?? '')}</td><td>{JSON.stringify(row.new_data ?? '')}</td><td>{String(row.created_at)}</td></tr>)}</tbody></table></section>
      <div className="button-row"><button className="secondary-button" disabled={page === 0} onClick={() => setPage((value) => Math.max(value - 1, 0))} type="button">Anterior</button><span className="muted-copy">Pagina {page + 1}</span><button className="secondary-button" disabled={data.length < pageSize} onClick={() => setPage((value) => value + 1)} type="button">Proxima</button></div>
    </section>
  )
}
