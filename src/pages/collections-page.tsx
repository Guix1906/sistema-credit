import { CheckCircle2, History, MessageCircle, PencilLine, PhoneCall, Plus, Send, Trash2 } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ConfirmDialog } from '../components/confirm-dialog'
import { UiModal } from '../components/ui-modal'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { createWhatsappUrl } from '../lib/contact-links'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import {
  addBillingObservation,
  createReceivable,
  deleteReceivable,
  getWalletFilterOptions,
  listDailyBillingRows,
  updateDailyBillingStatus,
  updateReceivable,
  type BillingChannel,
  type BillingStatus,
  type DailyBillingRow,
  type ReceivableInput,
  type ReceivableRecord,
} from '../services/finance-service'

type PeriodFilter = 'today' | 'tomorrow' | 'week' | 'month' | 'overdue' | 'custom'
type QuickFilter = 'all' | 'overdue' | 'today' | 'paid' | 'pending'

const statusLabels: Record<BillingStatus, string> = {
  a_receber: 'A receber',
  vence_hoje: 'Vence hoje',
  pago: 'Pago',
  parcialmente_pago: 'Parcialmente pago',
  em_atraso: 'Em atraso',
  cobranca_enviada: 'Cobranca enviada',
  negociado: 'Negociado',
  cancelado: 'Cancelado',
}

const statusClasses: Record<BillingStatus, string> = {
  a_receber: 'billing-status-open',
  vence_hoje: 'billing-status-today',
  pago: 'billing-status-paid',
  parcialmente_pago: 'billing-status-partial',
  em_atraso: 'billing-status-overdue',
  cobranca_enviada: 'billing-status-sent',
  negociado: 'billing-status-negotiated',
  cancelado: 'billing-status-cancelled',
}

const channelLabels: Record<BillingChannel, string> = {
  whatsapp: 'WhatsApp',
  call: 'Ligacao',
  in_person: 'Presencial',
  other: 'Outro',
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  bank_transfer: 'Transferencia',
  debit_card: 'Cartao de debito',
  credit_card: 'Cartao de credito',
  boleto: 'Boleto',
  other: 'Outra',
}

const paymentMethods = ['cash', 'pix', 'bank_transfer', 'debit_card', 'credit_card', 'boleto', 'other']

export function CollectionsPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const options = useAsyncData(getWalletFilterOptions, { routes: [], collectors: [], clients: [], statuses: [] })
  const { data, loading, error, reload } = useAsyncData(listDailyBillingRows, [])
  const [message, setMessage] = useState('')
  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [filterDate, setFilterDate] = useState('')
  const [customStartDate, setCustomStartDate] = useState(localIsoDate())
  const [customEndDate, setCustomEndDate] = useState(localIsoDate())
  const [status, setStatus] = useState<BillingStatus | 'all'>('all')
  const [clientId, setClientId] = useState(() => searchParams.get('clientId') ?? '')
  const [responsibleId, setResponsibleId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [term, setTerm] = useState('')
  const [receivableModalOpen, setReceivableModalOpen] = useState(false)
  const [editingReceivable, setEditingReceivable] = useState<ReceivableRecord | null>(null)
  const [noteTargetId, setNoteTargetId] = useState('')
  const [whatsappTargetId, setWhatsappTargetId] = useState('')
  const [whatsappMessage, setWhatsappMessage] = useState('')
  const [historyTargetId, setHistoryTargetId] = useState('')
  const [receivableToDelete, setReceivableToDelete] = useState<DailyBillingRow | null>(null)
  const [deletingReceivableId, setDeletingReceivableId] = useState('')

  const today = localIsoDate()
  const periodRange = useMemo(() => getPeriodRange(period, customStartDate, customEndDate), [period, customStartDate, customEndDate])
  const visibleRows = data.filter((row) => {
    const safeTerm = term.trim().toLowerCase()
    const matchesTerm = !safeTerm || [row.clientName, row.description, row.phone, row.notes, row.nextAction]
      .some((value) => value?.toLowerCase().includes(safeTerm))
    const matchesPeriod = period === 'overdue'
      ? row.status !== 'pago' && row.status !== 'cancelado' && row.dueDate < today
      : row.dueDate >= periodRange.start && row.dueDate <= periodRange.end
    const matchesQuick =
      quickFilter === 'all'
      || (quickFilter === 'overdue' && row.status !== 'pago' && row.status !== 'cancelado' && row.dueDate < today)
      || (quickFilter === 'today' && row.dueDate === today)
      || (quickFilter === 'paid' && row.status === 'pago')
      || (quickFilter === 'pending' && row.status !== 'pago' && row.status !== 'cancelado')
    return matchesPeriod
      && matchesQuick
      && matchesTerm
      && (!filterDate || row.dueDate === filterDate)
      && (status === 'all' || row.status === status)
      && (!clientId || row.clientId === clientId)
      && (!responsibleId || row.responsibleId === responsibleId)
      && (!paymentMethod || row.paymentMethod === paymentMethod)
  })

  const summary = useMemo(() => {
    const todayRows = data.filter((row) => row.dueDate === today)
    const chargedToday = new Set(data.flatMap((row) => row.histories.filter((history) => history.created_at.slice(0, 10) === today).map((history) => history.client_id)))
    return {
      receivableToday: sum(todayRows.filter((row) => row.status !== 'pago' && row.status !== 'cancelado').map((row) => remainingAmount(row))),
      receivedToday: sum(data.filter((row) => row.status === 'pago' && row.paidAt?.slice(0, 10) === today).map((row) => row.paidAmount || row.amount)),
      overdueTotal: sum(data.filter((row) => row.status !== 'pago' && row.status !== 'cancelado' && row.dueDate < today).map((row) => remainingAmount(row))),
      pendingCount: data.filter((row) => row.status !== 'pago' && row.status !== 'cancelado').length,
      chargedTodayCount: chargedToday.size,
      negotiatedCount: data.filter((row) => row.status === 'negociado').length,
    }
  }, [data, today])

  const selectedNoteTarget = data.find((row) => row.id === noteTargetId) ?? null
  const selectedWhatsappTarget = data.find((row) => row.id === whatsappTargetId) ?? null
  const selectedHistoryTarget = data.find((row) => row.id === historyTargetId) ?? null

  async function handleStatus(row: DailyBillingRow, nextStatus: BillingStatus, channel: BillingChannel = 'other') {
    if (!profile) return
    try {
      await updateDailyBillingStatus(profile, row, { status: nextStatus, channel })
      setMessage(`${statusLabels[nextStatus]} registrado para ${row.clientName}.`)
      reload()
    } catch (statusError) {
      setMessage(statusError instanceof Error ? statusError.message : 'Erro ao atualizar cobranca.')
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !selectedNoteTarget) return
    const formData = new FormData(event.currentTarget)
    try {
      await addBillingObservation(profile, selectedNoteTarget, String(formData.get('note') || ''), String(formData.get('channel') || 'other') as BillingChannel)
      setMessage('Observacao adicionada ao historico.')
      setNoteTargetId('')
      reload()
    } catch (noteError) {
      setMessage(noteError instanceof Error ? noteError.message : 'Erro ao salvar observacao.')
    }
  }

  async function handleWhatsappSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !selectedWhatsappTarget) return
    try {
      await updateDailyBillingStatus(profile, selectedWhatsappTarget, { status: 'cobranca_enviada', note: whatsappMessage, channel: 'whatsapp' })
      const url = createWhatsappUrl(selectedWhatsappTarget.phone, whatsappMessage)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      setWhatsappTargetId('')
      setMessage('Cobranca enviada registrada no historico.')
      reload()
    } catch (whatsappError) {
      setMessage(whatsappError instanceof Error ? whatsappError.message : 'Erro ao registrar envio.')
    }
  }

  async function handleReceivableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    const formData = new FormData(event.currentTarget)
    const input: ReceivableInput = {
      clientId: String(formData.get('clientId') || ''),
      description: String(formData.get('description') || ''),
      amount: toNumber(formData.get('amount')),
      dueDate: String(formData.get('dueDate') || ''),
      paymentMethod: String(formData.get('paymentMethod') || 'cash'),
      notes: String(formData.get('notes') || ''),
      responsibleId: String(formData.get('responsibleId') || ''),
      recurrence: String(formData.get('recurrence') || ''),
    }
    try {
      if (editingReceivable) {
        await updateReceivable(profile, editingReceivable.id, input)
        setMessage('Recebimento atualizado.')
      } else {
        await createReceivable(profile, input)
        setMessage('Recebimento cadastrado.')
      }
      closeReceivableModal()
      reload()
    } catch (receivableError) {
      setMessage(receivableError instanceof Error ? receivableError.message : 'Erro ao salvar recebimento.')
    }
  }

  async function confirmDeleteReceivable() {
    if (!profile || !receivableToDelete || receivableToDelete.source !== 'receivable') return
    setDeletingReceivableId(receivableToDelete.id)
    try {
      await deleteReceivable(profile, receivableToDelete.sourceId)
      setMessage('Recebimento excluido.')
      setReceivableToDelete(null)
      reload()
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir recebimento.')
    } finally {
      setDeletingReceivableId('')
    }
  }

  function openWhatsapp(row: DailyBillingRow) {
    setWhatsappTargetId(row.id)
    setWhatsappMessage(buildWhatsappMessage(row))
  }

  function openCreateReceivable() {
    setEditingReceivable(null)
    setReceivableModalOpen(true)
  }

  function openEditReceivable(row: DailyBillingRow) {
    if (!row.manualReceivable) return
    setEditingReceivable(row.manualReceivable)
    setReceivableModalOpen(true)
  }

  function closeReceivableModal() {
    setEditingReceivable(null)
    setReceivableModalOpen(false)
  }

  return (
    <section className="page-stack billing-page">
      <div className="page-title-row billing-title-row">
        <div>
          <span className="billing-eyebrow">Financeiro</span>
          <h1>Cobrancas</h1>
          <p>Organize recebimentos, acompanhe atrasos, envie WhatsApp e registre cada contato de cobranca.</p>
        </div>
        <button onClick={openCreateReceivable} type="button"><Plus size={17} />Novo recebimento</button>
      </div>

      {message ? <p className="form-message">{message}</p> : null}
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}

      <div className="summary-grid billing-summary-grid">
        <BillingMetric label="Total a receber hoje" value={formatCurrency(summary.receivableToday)} />
        <BillingMetric label="Total ja recebido hoje" value={formatCurrency(summary.receivedToday)} />
        <BillingMetric label="Total em atraso" value={formatCurrency(summary.overdueTotal)} tone="danger" />
        <BillingMetric label="Cobrancas pendentes" value={String(summary.pendingCount)} />
        <BillingMetric label="Clientes cobrados hoje" value={String(summary.chargedTodayCount)} />
        <BillingMetric label="Pagamentos negociados" value={String(summary.negotiatedCount)} tone="warning" />
      </div>

      <section className="content-panel billing-toolbar">
        <div className="segmented-control billing-period-control">
          <button className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')} type="button">Hoje</button>
          <button className={period === 'tomorrow' ? 'active' : ''} onClick={() => setPeriod('tomorrow')} type="button">Amanha</button>
          <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')} type="button">Semana</button>
          <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')} type="button">Mes</button>
          <button className={period === 'overdue' ? 'active' : ''} onClick={() => setPeriod('overdue')} type="button">Vencidos</button>
          <button className={period === 'custom' ? 'active' : ''} onClick={() => setPeriod('custom')} type="button">Personalizado</button>
        </div>

        <div className="billing-quick-filters">
          <button className={quickFilter === 'all' ? 'active' : ''} onClick={() => setQuickFilter('all')} type="button">Todos</button>
          <button className={quickFilter === 'overdue' ? 'active' : ''} onClick={() => setQuickFilter('overdue')} type="button">Vencidos</button>
          <button className={quickFilter === 'today' ? 'active' : ''} onClick={() => setQuickFilter('today')} type="button">Vencem hoje</button>
          <button className={quickFilter === 'paid' ? 'active' : ''} onClick={() => setQuickFilter('paid')} type="button">Pagos</button>
          <button className={quickFilter === 'pending' ? 'active' : ''} onClick={() => setQuickFilter('pending')} type="button">Pendentes</button>
        </div>

        <input className="billing-search-input" onChange={(event) => setTerm(event.target.value)} placeholder="Buscar cliente, telefone ou descricao" value={term} />

        <details className="billing-advanced-filters">
          <summary>Filtros avancados</summary>
          <div className="filter-grid-desktop billing-filter-grid">
            <label>Data<input onChange={(event) => setFilterDate(event.target.value)} type="date" value={filterDate} /></label>
            <select onChange={(event) => setStatus(event.target.value as BillingStatus | 'all')} value={status}>
              <option value="all">Todos os status</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select onChange={(event) => setClientId(event.target.value)} value={clientId}>
              <option value="">Todos os clientes</option>
              {options.data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <select onChange={(event) => setResponsibleId(event.target.value)} value={responsibleId}>
              <option value="">Todos os responsaveis</option>
              {options.data.collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.full_name}</option>)}
            </select>
            <select onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>
              <option value="">Todas as formas</option>
              {paymentMethods.map((method) => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
            </select>
            {period === 'custom' ? (
              <>
                <label>De<input onChange={(event) => setCustomStartDate(event.target.value)} type="date" value={customStartDate} /></label>
                <label>Ate<input onChange={(event) => setCustomEndDate(event.target.value)} type="date" value={customEndDate} /></label>
              </>
            ) : null}
          </div>
        </details>
      </section>

      <section className="content-panel desktop-table-wrap billing-table-panel">
        <div className="billing-section-heading">
          <div>
            <h2>Recebimentos previstos</h2>
            <p>{visibleRows.length} cobranca{visibleRows.length === 1 ? '' : 's'} no filtro atual.</p>
          </div>
        </div>
        <table className="billing-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Descricao</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Forma</th>
              <th>Status</th>
              <th>Telefone/WhatsApp</th>
              <th>Observacoes</th>
              <th>Responsavel</th>
              <th>Ultima cobranca</th>
              <th>Proxima acao</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td><Link to={`/clientes/${row.clientId}`}>{row.clientName}</Link><small>{row.source === 'receivable' ? 'Manual' : 'Parcela automatica'}</small></td>
                <td>{row.description}</td>
                <td><strong>{formatCurrency(remainingAmount(row))}</strong><small>Total: {formatCurrency(row.amount)}</small></td>
                <td>{formatDate(row.dueDate)}</td>
                <td>{paymentMethodLabels[row.paymentMethod] ?? row.paymentMethod}</td>
                <td><BillingStatusBadge status={row.status} /></td>
                <td>{row.phone ?? '-'}</td>
                <td>{row.notes ?? '-'}</td>
                <td>{row.responsibleName ?? '-'}</td>
                <td>{row.lastBillingAt ? formatDate(row.lastBillingAt) : '-'}</td>
                <td>{row.nextAction ?? '-'}</td>
                <td>
                  <BillingActions
                    row={row}
                    onDelete={handleDeleteReceivable}
                    onEdit={openEditReceivable}
                    onHistory={(item) => setHistoryTargetId(item.id)}
                    onNote={(item) => setNoteTargetId(item.id)}
                    onStatus={handleStatus}
                    onWhatsapp={openWhatsapp}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !visibleRows.length ? <div className="dashboard-empty"><CheckCircle2 size={22} /><strong>Nenhuma cobranca encontrada</strong><span>Ajuste os filtros ou cadastre um recebimento manual.</span></div> : null}
      </section>

      <div className="mobile-card-list always-grid billing-mobile-list">
        {visibleRows.map((row) => (
          <article className="mobile-data-card" key={row.id}>
            <div className="billing-card-heading">
              <div>
                <strong>{row.clientName}</strong>
                <small>{row.description}</small>
              </div>
              <BillingStatusBadge status={row.status} />
            </div>
            <div className="billing-card-main">
              <strong>{formatCurrency(remainingAmount(row))}</strong>
              <span>Vence em {formatDate(row.dueDate)}</span>
            </div>
            <div className="billing-card-meta">
              <span>{paymentMethodLabels[row.paymentMethod] ?? row.paymentMethod}</span>
              <span>{row.phone ?? 'Sem telefone'}</span>
              <span>{row.responsibleName ?? 'Sem responsavel'}</span>
            </div>
            {row.notes ? <small>Obs.: {row.notes}</small> : null}
            {row.nextAction ? <small>Proxima acao: {row.nextAction}</small> : null}
            <BillingActions
              row={row}
              onDelete={handleDeleteReceivable}
              onEdit={openEditReceivable}
              onHistory={(item) => setHistoryTargetId(item.id)}
              onNote={(item) => setNoteTargetId(item.id)}
              onStatus={handleStatus}
              onWhatsapp={openWhatsapp}
            />
          </article>
        ))}
        {!loading && !visibleRows.length ? <div className="dashboard-empty"><CheckCircle2 size={22} /><strong>Nenhuma cobranca encontrada</strong><span>Ajuste os filtros ou cadastre um recebimento manual.</span></div> : null}
      </div>

      <UiModal open={receivableModalOpen} title={editingReceivable ? 'Editar recebimento' : 'Novo recebimento'} description="Cadastre recebimentos fora das parcelas automaticas." onClose={closeReceivableModal}>
        <form className="form-grid modal-form" onSubmit={handleReceivableSubmit}>
          <label className="full-span">Cliente<select name="clientId" required defaultValue={editingReceivable?.client_id ?? ''}><option value="">Selecione</option>{options.data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="full-span">Descricao<input name="description" required defaultValue={editingReceivable?.description ?? ''} /></label>
          <label>Valor<input name="amount" min="0.01" required step="0.01" type="number" defaultValue={editingReceivable?.amount ?? ''} /></label>
          <label>Data de vencimento<input name="dueDate" required type="date" defaultValue={editingReceivable?.due_date ?? today} /></label>
          <label>Forma de pagamento<select name="paymentMethod" defaultValue={editingReceivable?.payment_method ?? 'cash'}>{paymentMethods.map((method) => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}</select></label>
          <label>Responsavel<select name="responsibleId" defaultValue={editingReceivable?.responsible_id ?? ''}><option value="">Sem responsavel</option>{options.data.collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.full_name}</option>)}</select></label>
          <label>Recorrencia<input name="recurrence" placeholder="Ex.: mensal, semanal" defaultValue={editingReceivable?.recurrence ?? ''} /></label>
          <label className="full-span">Observacoes<textarea name="notes" defaultValue={editingReceivable?.notes ?? ''} /></label>
          <div className="button-row full-span">
            <button type="submit">{editingReceivable ? 'Salvar alteracoes' : 'Cadastrar recebimento'}</button>
            <button className="secondary-button" onClick={closeReceivableModal} type="button">Cancelar</button>
          </div>
        </form>
      </UiModal>

      <UiModal open={Boolean(noteTargetId)} title="Adicionar observacao" description={selectedNoteTarget?.clientName ?? 'Cobranca'} onClose={() => setNoteTargetId('')}>
        <form className="form-grid modal-form" onSubmit={handleNoteSubmit}>
          <label>Canal<select name="channel" defaultValue="other">{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="full-span">Observacao<textarea name="note" required placeholder="Ex.: cliente pediu retorno no fim do dia" /></label>
          <div className="button-row full-span">
            <button type="submit">Salvar observacao</button>
            <button className="secondary-button" onClick={() => setNoteTargetId('')} type="button">Cancelar</button>
          </div>
        </form>
      </UiModal>

      <UiModal open={Boolean(whatsappTargetId)} title="Enviar WhatsApp" description={selectedWhatsappTarget?.clientName ?? 'Mensagem de cobranca'} onClose={() => setWhatsappTargetId('')}>
        <form className="form-grid modal-form" onSubmit={handleWhatsappSubmit}>
          <label className="full-span">Mensagem<textarea name="message" required value={whatsappMessage} onChange={(event) => setWhatsappMessage(event.target.value)} /></label>
          <div className="button-row full-span">
            <button disabled={!selectedWhatsappTarget?.phone} type="submit"><Send size={17} />Abrir WhatsApp</button>
            <button className="secondary-button" onClick={() => setWhatsappTargetId('')} type="button">Cancelar</button>
          </div>
        </form>
      </UiModal>

      <UiModal open={Boolean(historyTargetId)} title="Historico de cobranca" description={selectedHistoryTarget?.clientName ?? 'Cliente'} onClose={() => setHistoryTargetId('')}>
        <div className="billing-history-list">
          {selectedHistoryTarget?.histories.map((history) => (
            <article key={history.id}>
              <strong>{formatDate(history.created_at)} - {channelLabels[history.channel]}</strong>
              <span>{history.previous_status ? statusLabels[history.previous_status] : '-'} para {statusLabels[history.new_status]}</span>
              <small>{history.note ?? 'Sem observacao'}</small>
            </article>
          ))}
          {!selectedHistoryTarget?.histories.length ? <p className="muted-copy">Nenhum historico registrado para este pagamento.</p> : null}
        </div>
      </UiModal>

      <ConfirmDialog
        open={Boolean(receivableToDelete)}
        title="Excluir recebimento"
        description={`Excluir o recebimento "${receivableToDelete?.description ?? ''}"? Esta acao remove o registro manual de cobranca.`}
        confirmLabel="Excluir recebimento"
        loading={deletingReceivableId === receivableToDelete?.id}
        onClose={() => setReceivableToDelete(null)}
        onConfirm={confirmDeleteReceivable}
      />
    </section>
  )

  function handleDeleteReceivable(row: DailyBillingRow) {
    if (row.source === 'receivable') setReceivableToDelete(row)
  }
}

function BillingMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' | 'warning' }) {
  return <article className={`metric-card billing-metric billing-metric-${tone}`}><span>{label}</span><strong>{value}</strong></article>
}

function BillingStatusBadge({ status }: { status: BillingStatus }) {
  return <span className={`billing-status-badge ${statusClasses[status]}`}>{statusLabels[status]}</span>
}

function BillingActions({ row, onDelete, onEdit, onHistory, onNote, onStatus, onWhatsapp }: {
  row: DailyBillingRow
  onDelete: (row: DailyBillingRow) => void
  onEdit: (row: DailyBillingRow) => void
  onHistory: (row: DailyBillingRow) => void
  onNote: (row: DailyBillingRow) => void
  onStatus: (row: DailyBillingRow, status: BillingStatus, channel?: BillingChannel) => void
  onWhatsapp: (row: DailyBillingRow) => void
}) {
  const isClosed = row.status === 'pago' || row.status === 'cancelado'

  return (
    <div className="billing-actions">
      <div className="billing-primary-actions">
        <button className="secondary-button" disabled={isClosed} onClick={() => onStatus(row, 'pago')} title="Marcar como pago" type="button"><CheckCircle2 size={16} />Pago</button>
        <button className="secondary-button" disabled={isClosed} onClick={onWhatsapp.bind(null, row)} title="Abrir WhatsApp do cliente" type="button"><MessageCircle size={16} />WhatsApp</button>
        <button className="secondary-button" onClick={() => onNote(row)} title="Adicionar observacao" type="button"><PencilLine size={16} />Obs.</button>
      </div>
      <details className="billing-more-actions">
        <summary>Mais acoes</summary>
        <div>
          <button className="secondary-button" disabled={isClosed} onClick={() => onStatus(row, 'cobranca_enviada', 'call')} title="Marcar cobranca enviada" type="button"><PhoneCall size={16} />Enviada</button>
          <button className="secondary-button" disabled={isClosed} onClick={() => onStatus(row, 'negociado')} title="Marcar como negociado" type="button">Negociado</button>
          <button className="secondary-button" onClick={() => onHistory(row)} title="Ver historico do cliente" type="button"><History size={16} />Historico</button>
          <Link className="button-link secondary-button" to={`/clientes/${row.clientId}`}>Cliente</Link>
          {row.source === 'receivable' ? <button className="secondary-button" onClick={() => onEdit(row)} title="Editar recebimento manual" type="button"><PencilLine size={16} />Editar</button> : null}
          {row.source === 'receivable' ? <button className="destructive-button" onClick={() => onDelete(row)} title="Excluir recebimento manual" type="button"><Trash2 size={16} />Excluir</button> : null}
        </div>
      </details>
    </div>
  )
}

function buildWhatsappMessage(row: DailyBillingRow): string {
  return `Ol\u00e1, tudo bem? Estou entrando em contato para lembrar sobre o pagamento referente a ${row.description}, no valor de ${formatCurrency(remainingAmount(row))}, com vencimento em ${formatDate(row.dueDate)}. Qualquer d\u00favida fico \u00e0 disposi\u00e7\u00e3o.`
}

function remainingAmount(row: DailyBillingRow): number {
  return Math.max(row.amount - row.paidAmount, 0)
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number(value) || 0), 0)
}

function getPeriodRange(period: PeriodFilter, customStartDate: string, customEndDate: string): { start: string; end: string } {
  const today = localIsoDate()
  if (period === 'tomorrow') {
    const tomorrow = addDays(today, 1)
    return { start: tomorrow, end: tomorrow }
  }
  if (period === 'week') return { start: today, end: addDays(today, 6) }
  if (period === 'month') {
    const date = new Date(`${today}T00:00:00`)
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    return { start: today, end: localIsoDate(end) }
  }
  if (period === 'custom') return customStartDate <= customEndDate ? { start: customStartDate, end: customEndDate } : { start: customEndDate, end: customStartDate }
  return { start: today, end: today }
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return localIsoDate(date)
}
