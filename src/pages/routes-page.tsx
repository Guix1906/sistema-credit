import { Archive, Eye, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { getOperationErrorMessage } from '../lib/errors'
import { formatCurrency, nullableText, toNumber } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { insertAuditLog, listCollectors, listRoutes } from '../services/finance-service'
import type { RouteRecord } from '../types/finance'

export function RoutesPage() {
  const { profile } = useAuth()
  const routes = useAsyncData(listRoutes, [])
  const collectors = useAsyncData(listCollectors, [])
  const affiliateNames = new Map(collectors.data.map((affiliate) => [affiliate.id, affiliate.full_name]))
  const [editing, setEditing] = useState<RouteRecord | null>(null)
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) {
      setMessage('Sua sessao expirou. Entre novamente para cadastrar a rota.')
      return
    }
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      owner_id: profile.id,
      name: String(formData.get('name') ?? '').trim(),
      city: nullableText(formData.get('city')),
      neighborhood: nullableText(formData.get('neighborhood')),
      description: nullableText(formData.get('description')),
      collector_id: nullableText(formData.get('collectorId')),
      collection_days: String(formData.get('collectionDays') ?? '').split(',').map((day) => Number(day.trim())).filter((day) => day >= 1 && day <= 7),
      goal_amount: toNumber(formData.get('goalAmount')),
      is_active: formData.get('status') === 'active',
    }

    try {
      if (editing) {
        const { error } = await supabase.from('routes').update(payload).eq('id', editing.id)
        if (error) throw error
        const audited = await registerRouteAudit(profile, 'routes', editing.id, 'update', editing, payload)
        setMessage(audited ? 'Rota atualizada.' : 'Rota atualizada. O registro de auditoria sera revisado.')
      } else {
        const { data, error } = await supabase.from('routes').insert(payload).select('id').single()
        if (error) throw error
        const audited = await registerRouteAudit(profile, 'routes', data.id, 'insert', null, payload)
        setMessage(audited ? 'Rota cadastrada.' : 'Rota cadastrada. O registro de auditoria sera revisado.')
      }

      setEditing(null)
      routes.reload()
      form.reset()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, editing ? 'atualizar a rota' : 'cadastrar a rota'))
    }
  }

  async function toggleRoute(route: RouteRecord) {
    if (!profile) {
      setMessage('Sua sessao expirou. Entre novamente para alterar a rota.')
      return
    }
    const next = { is_active: !route.is_active }
    try {
      const { error } = await supabase.from('routes').update(next).eq('id', route.id)
      if (error) throw error
      await registerRouteAudit(profile, 'routes', route.id, 'update', { is_active: route.is_active }, next)
      setMessage(route.is_active ? 'Rota arquivada. O historico financeiro foi preservado.' : 'Rota reativada.')
      routes.reload()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'alterar a rota'))
    }
  }

  async function deleteRoute(route: RouteRecord) {
    if (!profile) {
      setMessage('Sua sessao expirou. Entre novamente para excluir a rota.')
      return
    }
    if (!window.confirm(`Excluir definitivamente a rota "${route.name}"? Esta acao nao pode ser desfeita.`)) return
    try {
      const [clients, loans, cashboxes, expenses, members] = await Promise.all([
        supabase.from('clients').select('id').eq('route_id', route.id).limit(1),
        supabase.from('loans').select('id').eq('route_id', route.id).limit(1),
        supabase.from('cashboxes').select('id').eq('route_id', route.id).limit(1),
        supabase.from('expenses').select('id').eq('route_id', route.id).limit(1),
        supabase.from('profiles').select('id').eq('route_id', route.id).limit(1),
      ])
      const lookupError = clients.error ?? loans.error ?? cashboxes.error ?? expenses.error ?? members.error
      if (lookupError) throw lookupError
      if ([clients, loans, cashboxes, expenses, members].some((result) => result.data?.length)) {
        setMessage('Esta rota possui vinculos. Use Arquivar para preservar clientes e historico financeiro.')
        return
      }
      const { error } = await supabase.from('routes').delete().eq('id', route.id)
      if (error) throw error
      await registerRouteAudit(profile, 'routes', route.id, 'delete', route, null)
      if (editing?.id === route.id) setEditing(null)
      setMessage('Rota excluida definitivamente.')
      routes.reload()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'excluir a rota'))
    }
  }

  function startEditing(route: RouteRecord) {
    setEditing(route)
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Rotas</h1>
          <p>Rota e a carteira/local de cobranca. Vincule o afiliado principal sem misturar os dois conceitos.</p>
        </div>
      </div>
      <form className="content-panel form-grid" key={editing?.id ?? 'new'} onSubmit={handleSubmit}>
        <label>Nome<input name="name" required defaultValue={editing?.name ?? ''} /></label>
        <label>Cidade<input name="city" defaultValue={editing?.city ?? ''} /></label>
        <label>Bairro<input name="neighborhood" defaultValue={editing?.neighborhood ?? ''} /></label>
        <label>Meta<input name="goalAmount" type="number" step="0.01" defaultValue={editing?.goal_amount ?? 0} /></label>
        <label>Afiliado principal<select name="collectorId" defaultValue={editing?.collector_id ?? ''}><option value="">Sem afiliado</option>{collectors.data.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}</option>)}</select></label>
        <label>Dias de cobranca<input name="collectionDays" placeholder="1,2,3,4,5" defaultValue={editing?.collection_days?.join(',') ?? ''} /></label>
        <label>Status<select name="status" defaultValue={editing?.is_active === false ? 'inactive' : 'active'}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
        <label className="full-span">Descricao<textarea name="description" defaultValue={editing?.description ?? ''} /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <div className="button-row full-span">
          <button type="submit">{editing ? 'Salvar alteracoes' : 'Cadastrar rota'}</button>
          {editing ? <button className="secondary-button" onClick={() => setEditing(null)} type="button">Cancelar</button> : null}
        </div>
      </form>
      <div className="mobile-card-list">
        {routes.data.map((route) => (
          <article className="mobile-data-card" key={route.id}>
            <div>
              <strong>{route.name}</strong>
              <small>{[route.neighborhood, route.city].filter(Boolean).join(', ') || 'Local nao informado'}</small>
            </div>
            <div className="mini-totals">
              <b>Afiliado: {route.collector_id ? affiliateNames.get(route.collector_id) ?? '-' : '-'}</b>
              <b>Dias: {formatCollectionDays(route.collection_days)}</b>
              <b>{route.is_active ? 'Ativa' : 'Arquivada'}</b>
            </div>
            <div className="button-row">
              <Link className="button-link" to={`/rotas/${route.id}`}><Eye size={16} />Detalhes</Link>
              <button className="secondary-button" onClick={() => startEditing(route)} type="button"><Pencil size={16} />Editar</button>
              <button className="secondary-button" onClick={() => toggleRoute(route)} type="button">{route.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}{route.is_active ? 'Arquivar' : 'Reativar'}</button>
              <button className="destructive-button" onClick={() => deleteRoute(route)} type="button"><Trash2 size={16} />Excluir</button>
            </div>
          </article>
        ))}
      </div>
      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Local</th><th>Afiliado principal</th><th>Dias</th><th>Meta</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>{routes.data.map((route) => <tr key={route.id}><td><Link to={`/rotas/${route.id}`}>{route.name}</Link></td><td>{[route.neighborhood, route.city].filter(Boolean).join(', ') || '-'}</td><td>{route.collector_id ? affiliateNames.get(route.collector_id) ?? '-' : '-'}</td><td>{formatCollectionDays(route.collection_days)}</td><td>{formatCurrency(route.goal_amount)}</td><td>{route.is_active ? 'Ativa' : 'Arquivada'}</td><td><div className="button-row compact-actions"><button className="secondary-button" onClick={() => startEditing(route)} type="button"><Pencil size={15} />Editar</button><button className="secondary-button" onClick={() => toggleRoute(route)} type="button">{route.is_active ? <Archive size={15} /> : <RotateCcw size={15} />}{route.is_active ? 'Arquivar' : 'Reativar'}</button><button className="destructive-button" onClick={() => deleteRoute(route)} type="button"><Trash2 size={15} />Excluir</button></div></td></tr>)}</tbody>
        </table>
      </section>
    </section>
  )
}

function formatCollectionDays(days?: number[]) {
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
  return days?.length ? days.map((day) => labels[day - 1]).filter(Boolean).join(', ') : '-'
}

async function registerRouteAudit(...parameters: Parameters<typeof insertAuditLog>): Promise<boolean> {
  try {
    await insertAuditLog(...parameters)
    return true
  } catch (error) {
    console.error('Nao foi possivel registrar a auditoria da rota:', error)
    return false
  }
}
