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
      setMessage(route.is_active ? 'Rota desativada.' : 'Rota ativada.')
      routes.reload()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'alterar a rota'))
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Rotas</h1>
          <p>Cadastro e edicao de rotas com meta, cidade, bairro e cobrador responsavel.</p>
        </div>
      </div>
      <form className="content-panel form-grid" key={editing?.id ?? 'new'} onSubmit={handleSubmit}>
        <label>Nome<input name="name" required defaultValue={editing?.name ?? ''} /></label>
        <label>Cidade<input name="city" defaultValue={editing?.city ?? ''} /></label>
        <label>Bairro<input name="neighborhood" defaultValue={editing?.neighborhood ?? ''} /></label>
        <label>Meta<input name="goalAmount" type="number" step="0.01" defaultValue={editing?.goal_amount ?? 0} /></label>
        <label>Cobrador<select name="collectorId" defaultValue={editing?.collector_id ?? ''}><option value="">Sem cobrador</option>{collectors.data.map((collector) => <option key={collector.id} value={collector.id}>{collector.full_name}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={editing?.is_active === false ? 'inactive' : 'active'}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
        <label className="full-span">Descricao<textarea name="description" defaultValue={editing?.description ?? ''} /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <div className="button-row full-span">
          <button type="submit">{editing ? 'Salvar alteracoes' : 'Cadastrar rota'}</button>
          {editing ? <button className="secondary-button" onClick={() => setEditing(null)} type="button">Cancelar</button> : null}
        </div>
      </form>
      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Cidade</th><th>Bairro</th><th>Meta</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>{routes.data.map((route) => <tr key={route.id}><td><Link to={`/rotas/${route.id}`}>{route.name}</Link></td><td>{route.city ?? '-'}</td><td>{route.neighborhood ?? '-'}</td><td>{formatCurrency(route.goal_amount)}</td><td>{route.is_active ? 'Ativa' : 'Inativa'}</td><td><div className="button-row"><button className="secondary-button" onClick={() => setEditing(route)} type="button">Editar</button><button className="secondary-button" onClick={() => toggleRoute(route)} type="button">{route.is_active ? 'Desativar' : 'Ativar'}</button></div></td></tr>)}</tbody>
        </table>
      </section>
    </section>
  )
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
