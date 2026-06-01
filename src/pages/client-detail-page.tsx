import { MessageCircle, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useCallback, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { MaskedInput } from '../components/masked-input'
import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import { maskDocument, maskPhone } from '../lib/masks'
import { supabase } from '../lib/supabase'
import { getActiveLoanSettings, getSelectOptions, insertAuditLog } from '../services/finance-service'
import { createClientDocumentSignedUrl } from '../services/storage-service'
import type { ClientRecord, InstallmentRecord, LoanRecord } from '../types/finance'

type ClientDocument = {
  id: string
  document_type: string
  file_name: string
  file_path: string
  created_at: string
}

export function ClientDetailPage() {
  const { profile } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [editing, setEditing] = useState(() => searchParams.get('edit') === '1')
  const [message, setMessage] = useState('')
  const loader = useCallback(async () => {
    if (!id) throw new Error('Cliente nao informado.')
    const clientResponse = await supabase.from('clients').select('*').eq('id', id).single()
    if (clientResponse.error) throw clientResponse.error
    const loansResponse = await supabase.from('loans').select('*').eq('client_id', id).order('issued_at', { ascending: false })
    if (loansResponse.error) throw loansResponse.error
    const loans = (loansResponse.data ?? []) as LoanRecord[]
    const installmentsResponse = loans.length
      ? await supabase.from('installments').select('*').in('loan_id', loans.map((loan) => loan.id)).order('due_date')
      : { data: [], error: null }
    if (installmentsResponse.error) throw installmentsResponse.error
    const documentsResponse = await supabase.from('client_documents').select('id, document_type, file_name, file_path, created_at').eq('client_id', id).order('created_at', { ascending: false })
    if (documentsResponse.error) throw documentsResponse.error
    return {
      client: clientResponse.data as ClientRecord,
      loans,
      installments: (installmentsResponse.data ?? []) as InstallmentRecord[],
      documents: (documentsResponse.data ?? []) as ClientDocument[],
    }
  }, [id])
  const { data, loading, error, reload } = useAsyncData(loader, { client: null as ClientRecord | null, loans: [] as LoanRecord[], installments: [] as InstallmentRecord[], documents: [] as ClientDocument[] })
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(settingsLoader, null)
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const routeName = options.data.routes.find((route) => route.id === data.client?.route_id)?.name ?? '-'
  const affiliateName = options.data.collectors.find((affiliate) => affiliate.id === data.client?.affiliate_id)?.full_name ?? '-'
  const total = data.loans.reduce((sum, loan) => sum + loan.total_amount, 0)
  const paid = data.installments.reduce((sum, installment) => sum + installment.paid_amount, 0)
  const open = Math.max(total - paid, 0)
  const today = localIsoDate()
  const overdue = data.installments.filter((installment) => installment.status !== 'paid' && installment.due_date < today)

  async function openDocument(path: string) {
    try {
      window.open(await createClientDocumentSignedUrl(path), '_blank', 'noopener,noreferrer')
    } catch (documentError) {
      window.alert(documentError instanceof Error ? documentError.message : 'Nao foi possivel abrir o documento.')
    }
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !data.client) return
    const formData = new FormData(event.currentTarget)
    const payload = {
      name: String(formData.get('name') ?? ''),
      document_number: String(formData.get('documentNumber') ?? '') || null,
      phone: String(formData.get('phone') ?? '') || null,
      whatsapp: String(formData.get('whatsapp') ?? '') || null,
      address: String(formData.get('address') ?? '') || null,
      neighborhood: String(formData.get('neighborhood') ?? '') || null,
      city: String(formData.get('city') ?? '') || null,
      route_id: String(formData.get('routeId') ?? '') || null,
      affiliate_id: String(formData.get('affiliateId') ?? '') || null,
      reference_point: String(formData.get('referencePoint') ?? '') || null,
      notes: String(formData.get('notes') ?? '') || null,
    }
    const { error: updateError } = await supabase.from('clients').update(payload).eq('id', data.client.id)
    if (updateError) setMessage(updateError.message)
    else {
      await insertAuditLog(profile, 'clients', data.client.id, 'update', data.client, payload)
      setMessage('Cliente atualizado.')
      setEditing(false)
      reload()
    }
  }

  async function toggleClient() {
    if (!profile || !data.client) return
    const next = { is_active: !data.client.is_active, status: data.client.is_active ? 'inactive' : 'active' }
    const { error: updateError } = await supabase.from('clients').update(next).eq('id', data.client.id)
    if (updateError) setMessage(updateError.message)
    else {
      await insertAuditLog(profile, 'clients', data.client.id, 'update', { is_active: data.client.is_active }, next)
      setMessage(data.client.is_active ? 'Cliente desativado.' : 'Cliente ativado.')
      reload()
    }
  }

  async function deleteClient() {
    if (!data.client || !window.confirm(`Excluir o cliente "${data.client.name}"? Esta acao nao pode ser desfeita.`)) return
    const { error: deleteError } = await supabase.rpc('purge_client_permanently', { p_client_id: data.client.id })
    if (deleteError) setMessage(deleteError.message)
    else navigate('/clientes')
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>{data.client?.name ?? 'Cliente'}</h1>
          <p>{data.client?.document_number ?? 'Sem documento'} - {data.client?.phone ?? data.client?.whatsapp ?? 'Sem telefone'}</p>
        </div>
        <div className="button-row">
          {data.client?.whatsapp || data.client?.phone ? <a className="button-link" href={`https://wa.me/${data.client.whatsapp ?? data.client.phone}`} target="_blank" rel="noreferrer"><MessageCircle size={17} />WhatsApp</a> : null}
          <Link className="button-link" to="/vendas"><Plus size={17} />Nova venda</Link>
          <button className="secondary-button" onClick={() => setEditing((value) => !value)} type="button">Editar</button>
          <button className="secondary-button" onClick={toggleClient} type="button">{data.client?.is_active ? 'Desativar' : 'Ativar'}</button>
          <button className="destructive-button" onClick={deleteClient} type="button"><Trash2 size={17} />Excluir</button>
        </div>
      </div>

      {message ? <p className="form-message">{message}</p> : null}
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}

      <div className="summary-grid">
        <Metric label="Total a pagar" value={formatCurrency(total)} />
        <Metric label="Total pago" value={formatCurrency(paid)} />
        <Metric label="Total em aberto" value={formatCurrency(open)} />
        <Metric label="Parcelas atrasadas" value={String(overdue.length)} />
      </div>

      {editing && data.client ? (
        <form className="content-panel form-grid" onSubmit={saveClient}>
          <h2 className="full-span">Editar dados pessoais</h2>
          <label>Nome<input name="name" required defaultValue={data.client.name} /></label>
          <label>CPF/CNPJ<MaskedInput mask={maskDocument} name="documentNumber" defaultValue={data.client.document_number ?? ''} /></label>
          <label>Telefone<MaskedInput mask={maskPhone} name="phone" defaultValue={data.client.phone ?? ''} /></label>
          <label>WhatsApp<MaskedInput mask={maskPhone} name="whatsapp" defaultValue={data.client.whatsapp ?? ''} /></label>
          <label>Endereco<input name="address" defaultValue={data.client.address ?? ''} /></label>
          <label>Bairro<input name="neighborhood" defaultValue={data.client.neighborhood ?? ''} /></label>
          <label>Cidade<input name="city" defaultValue={data.client.city ?? ''} /></label>
          <label>Rota<select name="routeId" defaultValue={data.client.route_id ?? ''}><option value="">Sem rota</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
          <label>Afiliado responsavel<select name="affiliateId" defaultValue={data.client.affiliate_id ?? ''}><option value="">Sem afiliado</option>{options.data.collectors.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}</option>)}</select></label>
          <label>Referencia<input name="referencePoint" defaultValue={data.client.reference_point ?? ''} /></label>
          <label className="full-span">Observacoes<textarea name="notes" defaultValue={data.client.notes ?? ''} /></label>
          <button className="full-span" type="submit">Salvar cliente</button>
        </form>
      ) : (
        <section className="content-panel">
          <h2>Dados pessoais</h2>
          <dl className="detail-grid">
            <div><dt>Endereco</dt><dd>{data.client?.address ?? '-'}</dd></div>
            <div><dt>Bairro</dt><dd>{data.client?.neighborhood ?? '-'}</dd></div>
            <div><dt>Cidade</dt><dd>{data.client?.city ?? '-'}</dd></div>
            <div><dt>Rota</dt><dd>{routeName}</dd></div>
            <div><dt>Afiliado responsavel</dt><dd>{affiliateName}</dd></div>
            <div><dt>Referencia</dt><dd>{data.client?.reference_point ?? '-'}</dd></div>
            <div className="full-span"><dt>Observacoes</dt><dd>{data.client?.notes ?? '-'}</dd></div>
          </dl>
        </section>
      )}

      <section className="content-panel desktop-table-wrap">
        <h2>Vendas</h2>
        <table>
          <thead><tr><th>Venda</th><th>Emissao</th><th>Total</th><th>Pago</th><th>Aberto</th><th>Status</th></tr></thead>
          <tbody>{data.loans.map((loan) => <tr key={loan.id}><td><Link to={`/vendas/${loan.id}`}>{loan.id.slice(0, 8)}</Link></td><td>{formatDate(loan.issued_at)}</td><td>{formatCurrency(loan.total_amount)}</td><td>{formatCurrency(loan.paid_amount)}</td><td>{formatCurrency(loan.remaining_amount)}</td><td>{loan.status}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="content-panel desktop-table-wrap">
        <h2>Parcelas abertas e atrasos</h2>
        <table>
          <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Multa atual</th><th>Status</th></tr></thead>
          <tbody>{data.installments.filter((installment) => installment.status !== 'paid').map((installment) => {
            const fee = calculateLateFee({ remainingInstallmentAmount: installment.amount - installment.paid_amount, dailyLateFeePercent: settings.data?.late_fee_rate ?? 20, dueDate: installment.due_date })
            return <tr key={installment.id}><td>{installment.installment_number}</td><td>{formatDate(installment.due_date)}</td><td>{formatCurrency(installment.amount)}</td><td>{formatCurrency(installment.paid_amount)}</td><td>{formatCurrency(fee.lateFeeAmount)}</td><td>{installment.status}</td></tr>
          })}</tbody>
        </table>
      </section>

      <section className="content-panel desktop-table-wrap">
        <h2>Documentos</h2>
        <table>
          <thead><tr><th>Tipo</th><th>Arquivo</th><th>Criado em</th><th>Acao</th></tr></thead>
          <tbody>{data.documents.map((document) => <tr key={document.id}><td>{document.document_type}</td><td>{document.file_name}</td><td>{new Date(document.created_at).toLocaleString('pt-BR')}</td><td><button className="secondary-button" onClick={() => openDocument(document.file_path)} type="button">Abrir</button></td></tr>)}</tbody>
        </table>
        {!data.documents.length ? <p className="muted-copy">Nenhum documento cadastrado.</p> : null}
      </section>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>
}
