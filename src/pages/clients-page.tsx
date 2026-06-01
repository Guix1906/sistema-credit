import { MessageCircle, Pencil, Plus, Trash2, UserRoundPlus, X } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { MaskedInput } from '../components/masked-input'
import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { getOperationErrorMessage } from '../lib/errors'
import { formatCurrency, nullableText } from '../lib/formatters'
import { maskDocument, maskPhone } from '../lib/masks'
import { supabase } from '../lib/supabase'
import { createClient, getSelectOptions, listClientsWithTotals } from '../services/finance-service'

export function ClientsPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [term, setTerm] = useState(() => searchParams.get('search') ?? '')
  const [routeId, setRouteId] = useState('')
  const [collectorId, setCollectorId] = useState('')
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const loader = useCallback(() => listClientsWithTotals(term, { routeId, status, collectorId }), [term, routeId, status, collectorId])
  const { data: clients, loading, error, reload } = useAsyncData(loader, [])

  useEffect(() => {
    setTerm(searchParams.get('search') ?? '')
  }, [searchParams])

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) {
      setMessage('Sua sessao expirou. Entre novamente para cadastrar o cliente.')
      return
    }
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      await createClient(profile, {
        name: String(formData.get('name') ?? ''),
        documentNumber: nullableText(formData.get('documentNumber')) ?? undefined,
        phone: nullableText(formData.get('phone')) ?? undefined,
        whatsapp: nullableText(formData.get('whatsapp')) ?? undefined,
        address: nullableText(formData.get('address')) ?? undefined,
        neighborhood: nullableText(formData.get('neighborhood')) ?? undefined,
        city: nullableText(formData.get('city')) ?? undefined,
        notes: nullableText(formData.get('notes')) ?? undefined,
        routeId: nullableText(formData.get('routeId')) ?? undefined,
        affiliateId: nullableText(formData.get('affiliateId')) ?? undefined,
      })
      setMessage('Cliente cadastrado.')
      setCreating(false)
      form.reset()
      reload()
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'cadastrar o cliente'))
    }
  }

  async function deleteClient(id: string, name: string) {
    if (profile?.role === 'admin') {
      const confirmation = window.prompt(`Excluir permanentemente o cliente "${name}" e todo o historico operacional relacionado? Esta acao nao pode ser desfeita. Digite EXCLUIR para confirmar.`)
      if (confirmation !== 'EXCLUIR') return
      try {
        const { error: purgeError } = await supabase.rpc('purge_client_permanently', { p_client_id: id })
        if (purgeError) throw purgeError
        setMessage('Cliente e historico operacional excluidos permanentemente.')
        reload()
      } catch (purgeError) {
        setMessage(getOperationErrorMessage(purgeError, 'excluir permanentemente o cliente'))
      }
      return
    }
    if (!window.confirm(`Remover o cliente "${name}"? Se existir historico financeiro, o cliente sera arquivado para preservar os registros.`)) return
    try {
      const { data, error: deleteError } = await supabase.rpc('delete_or_archive_client', { p_client_id: id })
      if (deleteError) throw deleteError
      const result = data as { mode?: 'deleted' | 'archived' } | null
      setMessage(result?.mode === 'archived' ? 'Cliente arquivado. O historico financeiro foi preservado.' : 'Cliente excluido definitivamente.')
      reload()
    } catch (deleteError) {
      setMessage(getOperationErrorMessage(deleteError, 'excluir o cliente'))
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Clientes</h1>
          <p>Carteira de clientes com rota local e afiliado responsavel claramente separados.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" onClick={() => setCreating((current) => !current)} type="button">{creating ? <X size={17} /> : <UserRoundPlus size={17} />}{creating ? 'Fechar cadastro' : 'Novo cliente'}</button>
          <Link className="button-link" to="/vendas"><Plus size={17} />Nova venda</Link>
        </div>
      </div>

      {creating ? (
        <form className="content-panel compact-client-form" onSubmit={handleCreateClient}>
          <div className="compact-form-heading"><h2>Cadastrar cliente</h2><p>Dados principais para localizar o cliente e iniciar vendas.</p></div>
          <div className="compact-client-fields">
            <label>Nome<input name="name" required /></label>
            <label>CPF/CNPJ<MaskedInput mask={maskDocument} name="documentNumber" /></label>
            <label>Telefone<MaskedInput mask={maskPhone} name="phone" required /></label>
            <label>WhatsApp<MaskedInput mask={maskPhone} name="whatsapp" /></label>
            <label>Rota<select name="routeId"><option value="">Sem rota</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
            <label>Afiliado responsavel<select name="affiliateId"><option value="">Sem afiliado</option>{options.data.collectors.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}</option>)}</select></label>
            <label>Cidade<input name="city" /></label>
            <label>Bairro<input name="neighborhood" /></label>
            <label>Endereco<input name="address" /></label>
            <label className="full-span">Observacoes<textarea name="notes" /></label>
          </div>
          <button type="submit">Salvar cliente</button>
        </form>
      ) : null}

      <section className="content-panel filter-grid-desktop">
        <input onChange={(event) => setTerm(event.target.value)} placeholder="Nome, CPF ou telefone" value={term} />
        <select onChange={(event) => setRouteId(event.target.value)} value={routeId}><option value="">Todas as rotas</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
        <select onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="paid_off">Quitados</option><option value="overdue">Atrasados</option><option value="inactive">Inativos</option></select>
        <select onChange={(event) => setCollectorId(event.target.value)} value={collectorId}><option value="">Todos os afiliados</option>{options.data.collectors.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}</option>)}</select>
        <button onClick={reload} type="button">Filtrar</button>
      </section>

      {error ? <p className="form-message">{error}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      {!loading && !clients.length ? <p className="sale-helper-copy">Nenhum cliente cadastrado ou visivel para este perfil.</p> : null}

      <div className="mobile-card-list">
        {clients.map((client) => (
          <article className="mobile-data-card" key={client.id}>
            <strong>{client.name}</strong>
            <span>{client.phone ?? client.whatsapp ?? 'Sem telefone'}</span>
            <small>{client.route_name ?? 'Sem rota'} | {client.affiliate_name ?? 'Sem afiliado'} | {client.status}</small>
            <div className="mini-totals">
              <b>{formatCurrency(client.total_to_pay)}</b>
              <b>{formatCurrency(client.total_paid)}</b>
              <b>{formatCurrency(client.total_open)}</b>
            </div>
            <div className="button-row">
              <Link className="button-link" to={`/clientes/${client.id}`}>Detalhes</Link>
              <Link className="button-link secondary-button" to={`/clientes/${client.id}?edit=1`}><Pencil size={16} />Editar</Link>
              <button className="destructive-button" onClick={() => deleteClient(client.id, client.name)} type="button"><Trash2 size={16} />{profile?.role === 'admin' ? 'Excluir permanentemente' : 'Excluir'}</button>
              {client.whatsapp ? <a className="button-link" href={`https://wa.me/${client.whatsapp}`} rel="noreferrer" target="_blank"><MessageCircle size={17} />WhatsApp</a> : null}
            </div>
          </article>
        ))}
      </div>

      <section className="content-panel desktop-table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>Rota</th><th>Afiliado</th><th>Total a pagar</th><th>Total pago</th><th>Aberto</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td><Link to={`/clientes/${client.id}`}>{client.name}</Link></td><td>{client.phone ?? client.whatsapp ?? '-'}</td><td>{client.route_name ?? '-'}</td><td>{client.affiliate_name ?? '-'}</td>
                <td>{formatCurrency(client.total_to_pay)}</td><td>{formatCurrency(client.total_paid)}</td><td>{formatCurrency(client.total_open)}</td><td>{client.status}</td><td><div className="button-row compact-actions"><Link className="button-link secondary-button" to={`/clientes/${client.id}?edit=1`}><Pencil size={15} />Editar</Link><button className="destructive-button" onClick={() => deleteClient(client.id, client.name)} type="button"><Trash2 size={15} />{profile?.role === 'admin' ? 'Excluir permanentemente' : 'Excluir'}</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}
