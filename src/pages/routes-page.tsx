import { Archive, Eye, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'

import { ConfirmDialog } from '../components/confirm-dialog'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { getOperationErrorMessage } from '../lib/errors'
import { formatCurrency, nullableText, toNumber } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import { insertAuditLog, listRegisteredAffiliates, listRoutes } from '../services/finance-service'
import type { RouteRecord } from '../types/finance'

export function RoutesPage() {
  const { profile } = useAuth()
  const routes = useAsyncData(listRoutes, [])
  const affiliates = useAsyncData(listRegisteredAffiliates, [])
  const affiliateNames = new Map(affiliates.data.map((affiliate) => [affiliate.id, affiliate.full_name]))
  const [editing, setEditing] = useState<RouteRecord | null>(null)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('all')
  const [routeToDelete, setRouteToDelete] = useState<RouteRecord | null>(null)
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null)
  const visibleRoutes = routes.data.filter((route) => {
    const safeTerm = term.trim().toLowerCase()
    return (!safeTerm || [route.name, route.city, route.neighborhood].some((value) => value?.toLowerCase().includes(safeTerm)))
      && (status === 'all' || (status === 'active' ? route.is_active : !route.is_active))
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) {
      setMessage('Sua sessao expirou. Entre novamente para cadastrar a rota.')
      return
    }
    const form = event.currentTarget
    const formData = new FormData(form)
    const mainCollectionDay = Number(formData.get('mainCollectionDay')) || null
    const collectionDays = String(formData.get('collectionDays') ?? '').split(',').map((day) => Number(day.trim())).filter((day) => day >= 1 && day <= 7)
    const payload = {
      name: String(formData.get('name') ?? '').trim(),
      city: nullableText(formData.get('city')),
      neighborhood: nullableText(formData.get('neighborhood')),
      description: nullableText(formData.get('description')),
      observations: nullableText(formData.get('observations')),
      collector_id: nullableText(formData.get('collectorId')),
      main_collection_day: mainCollectionDay,
      collection_days: [...new Set([mainCollectionDay, ...collectionDays].filter((day): day is number => Boolean(day)))],
      goal_amount: toNumber(formData.get('goalAmount')),
      is_active: formData.get('status') === 'active',
    }

    try {
      if (editing) {
        const savedPayload = await saveRouteWithSchemaFallback(payload, editing.id)
        const audited = await registerRouteAudit(profile, 'routes', editing.id, 'update', editing, savedPayload)
        setMessage(getSavedRouteMessage('Rota atualizada.', audited, savedPayload))
      } else {
        const insertPayload = { ...payload, owner_id: profile.id }
        const { id, savedPayload } = await createRouteWithSchemaFallback(insertPayload)
        const audited = await registerRouteAudit(profile, 'routes', id, 'insert', null, savedPayload)
        setMessage(getSavedRouteMessage('Rota cadastrada.', audited, savedPayload))
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

  async function deleteRoute() {
    if (!profile || !routeToDelete) {
      setMessage('Sua sessao expirou. Entre novamente para excluir a rota.')
      return
    }
    setDeletingRouteId(routeToDelete.id)
    try {
      const { data, error } = await supabase.rpc('delete_empty_route', { p_route_id: routeToDelete.id })
      if (error) throw error
      const result = data as { clientes_desvinculados?: number; usuarios_desvinculados?: number } | null
      if (editing?.id === routeToDelete.id) setEditing(null)
      const unlinked = Number(result?.clientes_desvinculados ?? 0) + Number(result?.usuarios_desvinculados ?? 0)
      setMessage(unlinked ? `Rota excluida. ${unlinked} vinculo(s) simples foram desvinculados.` : 'Rota excluida definitivamente.')
      setRouteToDelete(null)
      routes.reload()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'excluir a rota'))
    } finally {
      setDeletingRouteId(null)
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
        <label>Afiliado principal<select name="collectorId" defaultValue={editing?.collector_id ?? ''}><option value="">Sem afiliado</option>{affiliates.data.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}{affiliate.is_active ? '' : ' (inativo)'}</option>)}</select></label>
        <label>Dia principal de cobranca<select name="mainCollectionDay" defaultValue={editing?.main_collection_day ?? ''}><option value="">Nao informado</option>{WEEK_DAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
        <label>Dias adicionais de cobranca<input name="collectionDays" placeholder="1,2,3,4,5" defaultValue={editing?.collection_days?.filter((day) => day !== editing.main_collection_day).join(',') ?? ''} /></label>
        <label>Status<select name="status" defaultValue={editing?.is_active === false ? 'inactive' : 'active'}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
        <label className="full-span">Descricao<textarea name="description" defaultValue={editing?.description ?? ''} /></label>
        <label className="full-span">Observacoes<textarea name="observations" defaultValue={editing?.observations ?? ''} /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <div className="button-row full-span">
          <button type="submit">{editing ? 'Salvar alteracoes' : 'Cadastrar rota'}</button>
          {editing ? <button className="secondary-button" onClick={() => setEditing(null)} type="button">Cancelar</button> : null}
        </div>
      </form>
      <section className="content-panel filter-grid-desktop">
        <input onChange={(event) => setTerm(event.target.value)} placeholder="Buscar rota, cidade ou bairro" value={term} />
        <select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">Todos os status</option><option value="active">Ativas</option><option value="inactive">Arquivadas</option></select>
      </section>
      <div className="mobile-card-list">
        {visibleRoutes.map((route) => (
          <article className="mobile-data-card" key={route.id}>
            <div>
              <strong>{route.name}</strong>
              <small>{[route.neighborhood, route.city].filter(Boolean).join(', ') || 'Local nao informado'}</small>
            </div>
            <div className="mini-totals">
              <b>Afiliado: {route.collector_id ? affiliateNames.get(route.collector_id) ?? '-' : '-'}</b>
              <b>Dia principal: {formatCollectionDay(route.main_collection_day)}</b>
              <b>Dias: {formatCollectionDays(route.collection_days)}</b>
              <b>{route.is_active ? 'Ativa' : 'Arquivada'}</b>
            </div>
            <div className="button-row">
              <Link className="button-link" to={`/rotas/${route.id}`}><Eye size={16} />Detalhes</Link>
              <button className="secondary-button" onClick={() => startEditing(route)} type="button"><Pencil size={16} />Editar</button>
              <button className="secondary-button" onClick={() => toggleRoute(route)} type="button">{route.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}{route.is_active ? 'Arquivar' : 'Reativar'}</button>
              <button className="destructive-button" onClick={() => setRouteToDelete(route)} type="button"><Trash2 size={16} />Excluir</button>
            </div>
          </article>
        ))}
      </div>
      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Local</th><th>Afiliado principal</th><th>Dia principal</th><th>Dias</th><th>Meta</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>{visibleRoutes.map((route) => <tr key={route.id}><td><Link to={`/rotas/${route.id}`}>{route.name}</Link></td><td>{[route.neighborhood, route.city].filter(Boolean).join(', ') || '-'}</td><td>{route.collector_id ? affiliateNames.get(route.collector_id) ?? '-' : '-'}</td><td>{formatCollectionDay(route.main_collection_day)}</td><td>{formatCollectionDays(route.collection_days)}</td><td>{formatCurrency(route.goal_amount)}</td><td>{route.is_active ? 'Ativa' : 'Arquivada'}</td><td><div className="button-row compact-actions"><button className="secondary-button" onClick={() => startEditing(route)} type="button"><Pencil size={15} />Editar</button><button className="secondary-button" onClick={() => toggleRoute(route)} type="button">{route.is_active ? <Archive size={15} /> : <RotateCcw size={15} />}{route.is_active ? 'Arquivar' : 'Reativar'}</button><button className="destructive-button" onClick={() => setRouteToDelete(route)} type="button"><Trash2 size={15} />Excluir</button></div></td></tr>)}</tbody>
        </table>
      </section>
      <ConfirmDialog
        open={Boolean(routeToDelete)}
        title="Confirmar exclusao"
        description={`Excluir definitivamente a rota "${routeToDelete?.name ?? ''}"? Esta acao nao pode ser desfeita.`}
        confirmLabel="Excluir rota"
        loading={deletingRouteId === routeToDelete?.id}
        onClose={() => setRouteToDelete(null)}
        onConfirm={deleteRoute}
      />
    </section>
  )
}

function formatCollectionDays(days?: number[]) {
  return days?.length ? days.map(formatCollectionDay).filter((day) => day !== '-').join(', ') : '-'
}

function formatCollectionDay(day?: number | null) {
  return day ? WEEK_DAYS[day - 1] ?? '-' : '-'
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']

async function saveRouteWithSchemaFallback(payload: RoutePayload, routeId: string): Promise<RoutePayload | LegacyRoutePayload> {
  const { error } = await supabase.from('routes').update(payload).eq('id', routeId)
  if (!error) return payload
  if (!isMissingRouteMetadataColumn(error)) throw error
  const legacyPayload = toLegacyRoutePayload(payload)
  const { error: legacyError } = await supabase.from('routes').update(legacyPayload).eq('id', routeId)
  if (legacyError) throw legacyError
  return legacyPayload
}

async function createRouteWithSchemaFallback(payload: RoutePayload & { owner_id: string }): Promise<{ id: string; savedPayload: RoutePayload | LegacyRoutePayload }> {
  const { data, error } = await supabase.from('routes').insert(payload).select('id').single()
  if (!error) return { id: data.id, savedPayload: payload }
  if (!isMissingRouteMetadataColumn(error)) throw error
  const legacyPayload = toLegacyRoutePayload(payload)
  const { data: legacyData, error: legacyError } = await supabase.from('routes').insert(legacyPayload).select('id').single()
  if (legacyError) throw legacyError
  return { id: legacyData.id, savedPayload: legacyPayload }
}

function toLegacyRoutePayload<T extends RoutePayload>(payload: T): Omit<T, 'main_collection_day' | 'observations'> {
  const { main_collection_day: _mainCollectionDay, observations: _observations, ...legacyPayload } = payload
  return legacyPayload
}

function isMissingRouteMetadataColumn(error: { message?: string }): boolean {
  return Boolean(error.message?.includes("'main_collection_day'") || error.message?.includes("'observations'"))
}

function getSavedRouteMessage(message: string, audited: boolean, payload: RoutePayload | LegacyRoutePayload): string {
  const auditMessage = audited ? '' : ' O registro de auditoria sera revisado.'
  const schemaMessage = 'main_collection_day' in payload ? '' : ' Publique a migration pendente para persistir observacoes e o dia principal separadamente.'
  return `${message}${auditMessage}${schemaMessage}`
}

type RoutePayload = {
  name: string
  city: string | null
  neighborhood: string | null
  description: string | null
  observations: string | null
  collector_id: string | null
  main_collection_day: number | null
  collection_days: number[]
  goal_amount: number
  is_active: boolean
}

type LegacyRoutePayload = Omit<RoutePayload, 'main_collection_day' | 'observations'>

async function registerRouteAudit(...parameters: Parameters<typeof insertAuditLog>): Promise<boolean> {
  try {
    await insertAuditLog(...parameters)
    return true
  } catch (error) {
    console.error('Nao foi possivel registrar a auditoria da rota:', error)
    return false
  }
}
