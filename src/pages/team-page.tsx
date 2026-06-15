import { Pencil, Plus, Save, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { FormEvent, useState } from 'react'

import { ConfirmDialog } from '../components/confirm-dialog'
import { MaskedInput } from '../components/masked-input'
import { StatusBadge } from '../components/status-badge'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { getOperationErrorMessage } from '../lib/errors'
import { formatCurrency } from '../lib/formatters'
import { maskDocument, maskPhone } from '../lib/masks'
import { supabase } from '../lib/supabase'
import { buildCreateTeamUserBody, buildTeamUserProfilePayload, buildUpdateTeamUserBody } from '../lib/team-user-payload'
import { insertAuditLog, listRoutes } from '../services/finance-service'
import type { Profile, UserRole } from '../types/auth'

const roles: UserRole[] = ['admin', 'gerente', 'afiliado', 'cobrador', 'atendente']

export function TeamPage() {
  const { profile, refreshProfile } = useAuth()
  const routes = useAsyncData(listRoutes, [])
  const members = useAsyncData(listMembers, [])
  const metrics = useAsyncData(listMemberMetrics, {})
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [memberToDelete, setMemberToDelete] = useState<Profile | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !editing) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = buildTeamUserProfilePayload(formData)
    const editedMemberId = editing.id
    setSavingId(editing.id)
    try {
      const { error } = await supabase.functions.invoke('update-team-user', { body: buildUpdateTeamUserBody(editedMemberId, payload) })
      if (error) throw error
      await insertAuditLog(profile, 'profiles', editedMemberId, 'update', editing, payload)
      if (editedMemberId === profile.id) {
        await refreshProfile()
        const { error: sessionRefreshError } = await supabase.auth.refreshSession()
        if (sessionRefreshError) console.error('Erro ao atualizar sessao apos editar perfil:', sessionRefreshError)
      }
      setMessage('Perfil atualizado.')
      setEditing(null)
      members.reload()
      metrics.reload()
      form.reset()
    } catch (error) {
      setMessage(await getFunctionErrorMessage(error, 'atualizar o perfil'))
    } finally {
      setSavingId(null)
    }
  }

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      const { error } = await supabase.functions.invoke('create-team-user', { body: buildCreateTeamUserBody(formData) })
      if (error) throw error
      setMessage('Usuario criado.')
      setCreating(false)
      form.reset()
      members.reload()
      metrics.reload()
    } catch (error) {
      setMessage(await getFunctionErrorMessage(error, 'criar o usuario'))
    }
  }

  async function toggleMember(member: Profile) {
    if (!profile) return
    const next = { is_active: !member.is_active }
    setSavingId(member.id)
    try {
      const { error } = await supabase.from('profiles').update(next).eq('id', member.id)
      if (error) throw error
      await insertAuditLog(profile, 'profiles', member.id, 'update', { is_active: member.is_active }, next)
      setMessage(member.is_active ? 'Perfil desativado.' : 'Perfil ativado.')
      if (editing?.id === member.id) setEditing({ ...editing, ...next })
      members.reload()
      metrics.reload()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, member.is_active ? 'desativar o perfil' : 'ativar o perfil'))
    } finally {
      setSavingId(null)
    }
  }

  async function deleteMember() {
    if (!profile || !memberToDelete || memberToDelete.id === profile.id) {
      setMessage('Voce nao pode excluir o usuario conectado.')
      return
    }
    setSavingId(memberToDelete.id)
    try {
      const { error } = await supabase.functions.invoke('delete-team-user', { body: { userId: memberToDelete.id } })
      if (error) throw error
      await insertAuditLog(profile, 'profiles', memberToDelete.id, 'delete', memberToDelete, null)
      if (editing?.id === memberToDelete.id) setEditing(null)
      setMessage('Usuario excluido definitivamente.')
      setMemberToDelete(null)
      members.reload()
      routes.reload()
      metrics.reload()
    } catch (error) {
      setMessage(await getFunctionErrorMessage(error, 'excluir o usuario'))
    } finally {
      setSavingId(null)
    }
  }

  function startEditing(member: Profile) {
    setCreating(false)
    setMessage('')
    setEditing(member)
  }

  function toggleCreating() {
    setEditing(null)
    setMessage('')
    setCreating((value) => !value)
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Afiliados/Cobradores</h1>
          <p>Crie um acesso individual para cada responsavel e vincule sua rota. Cada usuario visualiza somente a carteira permitida para seu perfil.</p>
        </div>
        {profile?.role === 'admin' ? <button onClick={toggleCreating} type="button">{creating ? <X size={17} /> : <Plus size={17} />}{creating ? 'Fechar cadastro' : 'Novo usuario'}</button> : null}
      </div>

      {creating ? (
        <form className="content-panel form-grid" onSubmit={createMember}>
          <h2 className="full-span">Novo usuario</h2>
          <label>Nome<input name="fullName" required /></label>
          <label>E-mail<input name="email" required type="email" /></label>
          <label>Senha inicial<input name="password" required type="password" minLength={6} /></label>
          <label>Telefone<MaskedInput mask={maskPhone} name="phone" /></label>
          <label>CPF<MaskedInput mask={maskDocument} name="cpf" /></label>
          <label>Papel<select name="role">{roles.filter((role) => role !== 'admin').map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <label>Rota<select name="routeId"><option value="">Sem rota</option>{routes.data.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
          <label>Comissao (%)<input name="commissionRate" type="number" step="0.01" defaultValue="0" /></label>
          <div className="button-row full-span">
            <button type="submit"><Plus size={17} />Criar usuario</button>
            <button className="secondary-button" onClick={() => setCreating(false)} type="button"><X size={17} />Cancelar</button>
          </div>
        </form>
      ) : null}

      {editing ? (
        <form className="content-panel form-grid" key={editing.id} onSubmit={handleSubmit}>
          <h2 className="full-span">Editar afiliado/cobrador</h2>
          <label>Nome<input name="fullName" required defaultValue={editing.full_name} /></label>
          <label>E-mail<input name="email" required type="email" defaultValue={editing.email} /></label>
          <label>Telefone<MaskedInput mask={maskPhone} name="phone" defaultValue={editing.phone ?? ''} /></label>
          <label>CPF<MaskedInput mask={maskDocument} name="cpf" defaultValue={editing.cpf ?? ''} /></label>
          <label>Papel<select name="role" defaultValue={editing.role}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <label>Rota<select name="routeId" defaultValue={editing.route_id ?? ''}><option value="">Sem rota</option>{routes.data.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
          <label>Comissao (%)<input name="commissionRate" type="number" step="0.01" defaultValue={editing.commission_rate ?? 0} /></label>
          <label>Status<select name="status" defaultValue={editing.is_active ? 'active' : 'inactive'}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
          {message ? <p className="form-message full-span">{message}</p> : null}
          <div className="button-row full-span"><button disabled={savingId === editing.id} type="submit"><Save size={17} />Salvar perfil</button><button className="secondary-button" onClick={() => setEditing(null)} type="button"><X size={17} />Cancelar</button></div>
        </form>
      ) : message ? <p className="form-message">{message}</p> : null}

      {members.error ? <p className="form-message">{members.error}</p> : null}
      {members.loading ? <div className="skeleton-card" /> : null}

      <div className="mobile-card-list">
        {members.data.map((member) => (
          <article className="mobile-data-card team-member-card" key={member.id}>
            <div><strong>{member.full_name}</strong><small>{member.email}</small></div>
            <div className="mini-totals"><b>{formatRole(member.role)}</b><b>{member.commission_rate ?? 0}% comissao</b><b><StatusBadge value={member.is_active ? 'active' : 'inactive'} /></b></div>
            <div className="mini-totals"><b>Recebido: {formatCurrency(metrics.data[member.id]?.received ?? 0)}</b><b>Atrasado: {formatCurrency(metrics.data[member.id]?.overdue ?? 0)}</b><b>Clientes: {metrics.data[member.id]?.clients ?? 0}</b></div>
            <div className="button-row">
              <button className="secondary-button" onClick={() => startEditing(member)} type="button"><Pencil size={15} />Editar</button>
              <button className="secondary-button" disabled={savingId === member.id} onClick={() => toggleMember(member)} type="button">{member.is_active ? <UserX size={15} /> : <UserCheck size={15} />}{member.is_active ? 'Desativar' : 'Ativar'}</button>
              {member.id !== profile?.id ? <button className="destructive-button" disabled={savingId === member.id} onClick={() => setMemberToDelete(member)} type="button"><Trash2 size={15} />Excluir</button> : null}
            </div>
          </article>
        ))}
      </div>
      <section className="content-panel desktop-table-wrap">
        <table className="team-members-table">
          <thead><tr><th>Nome</th><th>Papel</th><th>Recebido</th><th>Atrasado</th><th>Clientes</th><th>Vendas</th><th>Comissao</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>{members.data.map((member) => <tr key={member.id}><td>{member.full_name}<small>{member.email}</small></td><td>{formatRole(member.role)}</td><td>{formatCurrency(metrics.data[member.id]?.received ?? 0)}</td><td>{formatCurrency(metrics.data[member.id]?.overdue ?? 0)}</td><td>{metrics.data[member.id]?.clients ?? 0}</td><td>{metrics.data[member.id]?.sales ?? 0}</td><td>{formatCurrency((metrics.data[member.id]?.received ?? 0) * ((member.commission_rate ?? 0) / 100))}</td><td><StatusBadge value={member.is_active ? 'active' : 'inactive'} /></td><td><div className="button-row compact-actions"><button className="secondary-button" onClick={() => startEditing(member)} type="button"><Pencil size={15} />Editar</button><button className="secondary-button" disabled={savingId === member.id} onClick={() => toggleMember(member)} type="button">{member.is_active ? <UserX size={15} /> : <UserCheck size={15} />}{member.is_active ? 'Desativar' : 'Ativar'}</button>{member.id !== profile?.id ? <button className="destructive-button" disabled={savingId === member.id} onClick={() => setMemberToDelete(member)} type="button"><Trash2 size={15} />Excluir</button> : null}</div></td></tr>)}</tbody>
        </table>
      </section>
      <ConfirmDialog
        open={Boolean(memberToDelete)}
        title="Confirmar exclusao"
        description={`Excluir definitivamente o usuario "${memberToDelete?.full_name ?? ''}"? Esta acao nao pode ser desfeita.`}
        confirmLabel="Excluir usuario"
        loading={savingId === memberToDelete?.id}
        onClose={() => setMemberToDelete(null)}
        onConfirm={deleteMember}
      />
    </section>
  )
}

function formatRole(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin: 'Admin',
    gerente: 'Gerente',
    afiliado: 'Afiliado',
    cobrador: 'Cobrador',
    atendente: 'Atendente',
  }
  return labels[role] ?? role
}

async function listMembers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return (data ?? []) as Profile[]
}

type MemberMetrics = { received: number; overdue: number; clients: number; sales: number }

async function listMemberMetrics(): Promise<Record<string, MemberMetrics>> {
  const [loansResult, clientsResult] = await Promise.all([
    supabase.from('loans').select('client_id, collector_id, paid_amount, remaining_amount, status'),
    supabase.from('clients').select('id, affiliate_id').eq('is_active', true),
  ])
  const error = loansResult.error ?? clientsResult.error
  if (error) throw error
  const result: Record<string, MemberMetrics> = {}
  const clientSets = new Map<string, Set<string>>()
  for (const loan of loansResult.data ?? []) {
    if (!loan.collector_id) continue
    const metric = result[loan.collector_id] ?? { received: 0, overdue: 0, clients: 0, sales: 0 }
    metric.received += Number(loan.paid_amount ?? 0)
    metric.overdue += ['overdue', 'defaulted'].includes(loan.status) ? Number(loan.remaining_amount ?? 0) : 0
    metric.sales += 1
    result[loan.collector_id] = metric
    const set = clientSets.get(loan.collector_id) ?? new Set<string>()
    set.add(loan.client_id)
    clientSets.set(loan.collector_id, set)
  }
  for (const client of clientsResult.data ?? []) {
    if (!client.affiliate_id) continue
    const set = clientSets.get(client.affiliate_id) ?? new Set<string>()
    set.add(client.id)
    clientSets.set(client.affiliate_id, set)
  }
  clientSets.forEach((clients, memberId) => {
    const metric = result[memberId] ?? { received: 0, overdue: 0, clients: 0, sales: 0 }
    metric.clients = clients.size
    result[memberId] = metric
  })
  return result
}

async function getFunctionErrorMessage(error: unknown, operation: string): Promise<string> {
  const context = error instanceof Error && 'context' in error ? (error as Error & { context?: Response }).context : null
  if (context) {
    try {
      const body = await context.clone().json() as { error?: string }
      if (body.error) return body.error
    } catch {
      // Use the shared fallback when the relay does not return JSON.
    }
  }
  return getOperationErrorMessage(error, operation)
}
