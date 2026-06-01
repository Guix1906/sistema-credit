import { Pencil, Plus, Save, UserCheck, UserX, X } from 'lucide-react'
import { FormEvent, useState } from 'react'

import { MaskedInput } from '../components/masked-input'
import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { getOperationErrorMessage } from '../lib/errors'
import { nullableText, toNumber } from '../lib/formatters'
import { maskDocument, maskPhone } from '../lib/masks'
import { supabase } from '../lib/supabase'
import { insertAuditLog, listRoutes } from '../services/finance-service'
import type { Profile, UserRole } from '../types/auth'

const roles: UserRole[] = ['admin', 'gerente', 'afiliado', 'cobrador', 'atendente']

export function TeamPage() {
  const { profile } = useAuth()
  const routes = useAsyncData(listRoutes, [])
  const members = useAsyncData(listMembers, [])
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !editing) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      full_name: String(formData.get('fullName') ?? ''),
      email: String(formData.get('email') ?? '').trim(),
      phone: nullableText(formData.get('phone')),
      cpf: nullableText(formData.get('cpf')),
      role: String(formData.get('role')) as UserRole,
      route_id: nullableText(formData.get('routeId')),
      commission_rate: toNumber(formData.get('commissionRate')),
      is_active: formData.get('status') === 'active',
    }
    setSavingId(editing.id)
    try {
      const { error } = await supabase.functions.invoke('update-team-user', { body: {
        userId: editing.id,
        fullName: payload.full_name,
        email: payload.email,
        phone: payload.phone,
        cpf: payload.cpf,
        role: payload.role,
        routeId: payload.route_id,
        commissionRate: payload.commission_rate,
        isActive: payload.is_active,
      } })
      if (error) throw error
      await insertAuditLog(profile, 'profiles', editing.id, 'update', editing, payload)
      setMessage('Perfil atualizado.')
      setEditing(null)
      members.reload()
      form.reset()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'atualizar o perfil'))
    } finally {
      setSavingId(null)
    }
  }

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const { error } = await supabase.functions.invoke('create-team-user', { body: {
      fullName: String(formData.get('fullName') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      phone: nullableText(formData.get('phone')),
      cpf: nullableText(formData.get('cpf')),
      role: String(formData.get('role')),
      routeId: nullableText(formData.get('routeId')),
      commissionRate: toNumber(formData.get('commissionRate')),
    } })
    if (error) setMessage(`${error.message}. Publique a Edge Function create-team-user.`)
    else {
      setMessage('Usuario criado.')
      setCreating(false)
      form.reset()
      members.reload()
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
    } catch (error) {
      setMessage(getOperationErrorMessage(error, member.is_active ? 'desativar o perfil' : 'ativar o perfil'))
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

      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Telefone</th><th>Comissao</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>{members.data.map((member) => <tr key={member.id}><td>{member.full_name}</td><td>{member.email}</td><td>{member.role}</td><td>{member.phone ?? '-'}</td><td>{member.commission_rate ?? 0}%</td><td>{member.is_active ? 'Ativo' : 'Inativo'}</td><td><div className="button-row compact-actions"><button className="secondary-button" onClick={() => startEditing(member)} type="button"><Pencil size={15} />Editar</button><button className="secondary-button" disabled={savingId === member.id} onClick={() => toggleMember(member)} type="button">{member.is_active ? <UserX size={15} /> : <UserCheck size={15} />}{member.is_active ? 'Desativar' : 'Ativar'}</button></div></td></tr>)}</tbody>
        </table>
      </section>
    </section>
  )
}

async function listMembers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return (data ?? []) as Profile[]
}
