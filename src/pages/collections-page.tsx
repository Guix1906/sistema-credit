import { CheckCircle2, History, MessageCircle, PencilLine, PhoneCall, Plus, Search, Send, Trash2, UserRound, XCircle } from 'lucide-react'
import { FormEvent, useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ConfirmDialog } from '../components/confirm-dialog'
import { UiModal } from '../components/ui-modal'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { createWhatsappUrl } from '../lib/contact-links'
import {
  isPastSettlementDeadline,
  isRecentlyRenewed,
  resolveSettlementStatus,
  settlementBadgeLabels,
  settlementClassNames,
  type CollectionSettlementStatus,
} from '../lib/collection-settlement'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import {
  addBillingObservation,
  createReceivable,
  deleteReceivable,
  getActiveLoanSettings,
  getWalletFilterOptions,
  listDailyBillingRows,
  registerDailyBillingPayment,
  updateDailyBillingStatus,
  updateReceivable,
  type BillingChannel,
  type BillingStatus,
  type DailyBillingRow,
  type ReceivableInput,
  type ReceivableRecord,
} from '../services/finance-service'

type PeriodFilter = 'all' | 'today' | 'tomorrow' | 'week' | 'month' | 'overdue' | 'custom'
type QuickFilter = 'all' | 'overdue' | 'today' | 'paid' | 'pending'
type CollectionStatus = 'pendente' | 'pago' | 'atrasado' | 'com_multa' | 'parcial'
type CollectionRow = DailyBillingRow & {
  lateFeeAmount: number
  remainingOriginal: number
  totalToReceive: number
  viewStatus: CollectionStatus
  settlementStatus: CollectionSettlementStatus
  settlementBadge: string
  settlementClassName: string
  settlementDeadlinePassed: boolean
  fewInstallmentsLeft: boolean
  recentlyRenewed: boolean
}

type PaymentDraft = {
  amount: string
  quantity: string
  note: string
}

const statusLabels: Record<CollectionStatus, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  atrasado: 'Atrasado',
  com_multa: 'Com multa',
  parcial: 'Parcial',
}

const billingStatusLabels: Record<BillingStatus, string> = {
  a_receber: 'A receber',
  vence_hoje: 'Vence hoje',
  pago: 'Pago',
  parcialmente_pago: 'Parcialmente pago',
  em_atraso: 'Em atraso',
  cobranca_enviada: 'Cobranca enviada',
  negociado: 'Negociado',
  cancelado: 'Cancelado',
}

const billingStatusClasses: Record<BillingStatus, string> = {
  a_receber: 'billing-status-open',
  vence_hoje: 'billing-status-today',
  pago: 'billing-status-paid',
  parcialmente_pago: 'billing-status-partial',
  em_atraso: 'billing-status-overdue',
  cobranca_enviada: 'billing-status-sent',
  negociado: 'billing-status-negotiated',
  cancelado: 'billing-status-cancelled',
}

const dailyFilterLabels: Record<QuickFilter, string> = {
  all: 'Todos',
  paid: 'Pagos',
  pending: 'Pendentes',
  overdue: 'Atrasados',
  today: 'Vencendo hoje',
}

const dailyFilterOrder: QuickFilter[] = ['all', 'paid', 'pending', 'overdue', 'today']

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
  const options = useAsyncData(getWalletFilterOptions, { routes: [], collectors: [], clients: [], statuses: [] }, { cacheKey: 'shared:wallet-filter-options', staleTime: 5 * 60 * 1000, gcTime: 20 * 60 * 1000 })
  const { data, loading, error, reload } = useAsyncData(listDailyBillingRows, [], { cacheKey: 'collections:daily-billing', staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 })
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const loanSettings = useAsyncData(settingsLoader, null, { cacheKey: profile?.id ? `loan-settings:${profile.id}` : undefined, staleTime: 5 * 60 * 1000, gcTime: 20 * 60 * 1000 })
  const [message, setMessage] = useState('')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [filterDate, setFilterDate] = useState('')
  const [customStartDate, setCustomStartDate] = useState(localIsoDate())
  const [customEndDate, setCustomEndDate] = useState(localIsoDate())
  const [status, setStatus] = useState<CollectionStatus | 'all'>('all')
  const [clientId, setClientId] = useState(() => searchParams.get('clientId') ?? '')
  const [routeId, setRouteId] = useState(() => searchParams.get('routeId') ?? '')
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
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({})
  const [actionLoadingId, setActionLoadingId] = useState('')

  const today = localIsoDate()
  const dailyLateFeePercent = loanSettings.data?.late_fee_rate ?? 0
  const rows = useMemo(() => data.map((row) => enrichCollectionRow(row, today, dailyLateFeePercent)), [dailyLateFeePercent, data, today])
  const periodRange = useMemo(() => getPeriodRange(period, customStartDate, customEndDate), [period, customStartDate, customEndDate])
  const visibleRows = rows.filter((row) => {
    const safeTerm = term.trim().toLowerCase()
    const matchesTerm = !safeTerm || [row.clientName, row.clientCode, row.clientId, row.loanId, row.sourceId, row.description, row.phone, row.notes, row.nextAction, row.routeName, row.clientAddress, row.clientReferencePoint]
      .some((value) => value?.toLowerCase().includes(safeTerm))
    const matchesPeriod = period === 'overdue'
      ? row.viewStatus === 'atrasado' || row.viewStatus === 'com_multa'
      : period === 'all'
        ? true
      : row.dueDate >= periodRange.start && row.dueDate <= periodRange.end
    const matchesQuick =
      quickFilter === 'all'
      || (quickFilter === 'overdue' && (row.viewStatus === 'atrasado' || row.viewStatus === 'com_multa'))
      || (quickFilter === 'today' && row.dueDate === today)
      || (quickFilter === 'paid' && row.viewStatus === 'pago')
      || (quickFilter === 'pending' && row.viewStatus !== 'pago')
    return matchesPeriod
      && matchesQuick
      && matchesTerm
      && (!filterDate || row.dueDate === filterDate)
      && (status === 'all' || row.viewStatus === status)
      && (!clientId || row.clientId === clientId)
      && (!routeId || row.routeId === routeId)
      && (!responsibleId || row.responsibleId === responsibleId)
      && (!paymentMethod || row.paymentMethod === paymentMethod)
  })

  const summary = useMemo(() => {
    const todayRows = rows.filter((row) => row.dueDate === today)
    const chargedToday = new Set(rows.flatMap((row) => row.histories.filter((history) => history.created_at.slice(0, 10) === today).map((history) => history.client_id)))
    const unpaidToday = todayRows.filter((row) => row.viewStatus !== 'pago')
    const paidToday = todayRows.filter((row) => row.viewStatus === 'pago')
    const overdueRows = rows.filter((row) => row.viewStatus === 'atrasado' || row.viewStatus === 'com_multa')
    return {
      totalToday: todayRows.length,
      pendingCount: unpaidToday.filter((row) => row.viewStatus === 'pendente' || row.viewStatus === 'parcial').length,
      paidCount: paidToday.length,
      overdueCount: overdueRows.length,
      renewedCount: rows.filter((row) => row.settlementStatus === 'renewed').length,
      finishingCount: rows.filter((row) => row.settlementStatus === 'finishing').length,
      currentCount: rows.filter((row) => row.settlementStatus === 'current' || row.settlementStatus === 'paid').length,
      negotiatedCount: rows.filter((row) => row.status === 'negociado').length,
      receivableToday: sum(todayRows.map((row) => row.totalToReceive)),
      receivedToday: sum(paidToday.map((row) => row.paidAmount)),
      missingToday: sum(unpaidToday.map((row) => row.totalToReceive)),
      overdueTotal: sum(overdueRows.map((row) => row.totalToReceive)),
      chargedTodayCount: chargedToday.size,
      lateFeeTotal: sum(overdueRows.map((row) => row.lateFeeAmount)),
    }
  }, [rows, today])

  const selectedNoteTarget = rows.find((row) => row.id === noteTargetId) ?? null
  const selectedWhatsappTarget = rows.find((row) => row.id === whatsappTargetId) ?? null
  const selectedHistoryTarget = rows.find((row) => row.id === historyTargetId) ?? null

  async function handleStatus(row: DailyBillingRow, nextStatus: BillingStatus, channel: BillingChannel = 'other') {
    if (!profile) return
    try {
      await updateDailyBillingStatus(profile, row, { status: nextStatus, channel })
      setMessage(`${billingStatusLabels[nextStatus]} registrado para ${row.clientName}.`)
      reload()
    } catch (statusError) {
      setMessage(statusError instanceof Error ? statusError.message : 'Erro ao atualizar cobranca.')
    }
  }

  async function handlePayment(row: CollectionRow) {
    if (!profile) return
    const draft = getPaymentDraft(row.id)
    const amountPaid = toNumber(draft.amount)
    const installmentQuantity = Number(draft.quantity || 0)
    if (!(amountPaid > 0) && !(installmentQuantity > 0)) {
      setMessage('Informe o valor pago ou a quantidade de parcelas.')
      return
    }
    setActionLoadingId(row.id)
    try {
      await registerDailyBillingPayment(profile, row, {
        amountPaid: amountPaid > 0 ? amountPaid : undefined,
        installmentQuantity: installmentQuantity > 0 ? installmentQuantity : undefined,
        paymentMethod: row.paymentMethod,
        notes: draft.note,
        dailyLateFeePercent,
      })
      setPaymentDrafts((current) => ({ ...current, [row.id]: { amount: '', quantity: '', note: '' } }))
      setMessage('Pagamento registrado com sucesso.')
      reload()
    } catch (paymentError) {
      setMessage(paymentError instanceof Error ? paymentError.message : 'Erro ao registrar pagamento.')
    } finally {
      setActionLoadingId('')
    }
  }

  async function handleNoPayment(row: CollectionRow) {
    if (!profile) return
    const nextStatus: BillingStatus = row.settlementDeadlinePassed || row.dueDate < today ? 'em_atraso' : 'a_receber'
    const draft = getPaymentDraft(row.id)
    setActionLoadingId(row.id)
    try {
      await updateDailyBillingStatus(profile, row, {
        status: nextStatus,
        note: draft.note || (row.settlementDeadlinePassed ? 'Nao pagou. Passou do prazo de quitacao.' : 'Nao pagou. Mantido como pendente.'),
        channel: 'other',
      })
      setMessage(`${row.clientName} marcado como ${nextStatus === 'em_atraso' ? 'em atraso' : 'pendente'}.`)
      reload()
    } catch (statusError) {
      setMessage(statusError instanceof Error ? statusError.message : 'Erro ao marcar como nao pago.')
    } finally {
      setActionLoadingId('')
    }
  }

  function getPaymentDraft(rowId: string): PaymentDraft {
    return paymentDrafts[rowId] ?? { amount: '', quantity: '', note: '' }
  }

  function updatePaymentDraft(rowId: string, patch: Partial<PaymentDraft>) {
    setPaymentDrafts((current) => ({ ...current, [rowId]: { ...(current[rowId] ?? { amount: '', quantity: '', note: '' }), ...patch } }))
  }

  function toggleCard(rowId: string) {
    setExpandedCards((current) => ({ ...current, [rowId]: !current[rowId] }))
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
          <h1>Cartoes</h1>
          <p>Cobranca diaria com cartoes claros, busca rapida e acoes de pagamento no celular.</p>
        </div>
        <button onClick={openCreateReceivable} type="button"><Plus size={17} />Novo recebimento</button>
      </div>

      {message ? <p className="form-message">{message}</p> : null}
      {error ? <div className="form-message billing-error-state"><span>{error}</span><button className="secondary-button" onClick={() => reload()} type="button">Tentar novamente</button></div> : null}
      {loading ? <BillingCardSkeleton /> : null}

      <div className="summary-grid billing-summary-grid">
        <BillingMetric label="Total a receber hoje" value={formatCurrency(summary.receivableToday)} />
        <BillingMetric label="Total ja recebido hoje" value={formatCurrency(summary.receivedToday)} />
        <BillingMetric label="Total em atraso" value={formatCurrency(summary.overdueTotal)} tone="danger" />
        <BillingMetric label="Renovados" value={String(summary.renewedCount)} />
        <BillingMetric label="Terminando" value={String(summary.finishingCount)} tone="warning" />
        <BillingMetric label="Em dia / pagos" value={String(summary.currentCount)} />
      </div>

      <section className="content-panel billing-toolbar">
        <div className="billing-daily-tabs" aria-label="Filtros de cobranca diaria">
          {dailyFilterOrder.map((value) => (
            <button className={quickFilter === value ? 'active' : ''} key={value} onClick={() => setQuickFilter(value)} type="button">
              {dailyFilterLabels[value]}
            </button>
          ))}
        </div>

        <label className="billing-search-field">
          <Search size={17} />
          <input onChange={(event) => setTerm(event.target.value)} placeholder="Filtrar..." value={term} />
        </label>

        <div className="billing-color-legend" aria-label="Legenda de cores dos cartoes">
          <span><i className="legend-renewed" />Normal/renovado</span>
          <span><i className="legend-finishing" />Vence hoje/terminando</span>
          <span><i className="legend-overdue" />Atrasado</span>
          <span><i className="legend-current" />Pago</span>
        </div>

        <details className="billing-advanced-filters">
          <summary>Filtros avancados</summary>
          <div className="filter-grid-desktop billing-filter-grid">
            <div className="segmented-control billing-period-control full-span">
              <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')} type="button">Todos</button>
              <button className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')} type="button">Hoje</button>
              <button className={period === 'tomorrow' ? 'active' : ''} onClick={() => setPeriod('tomorrow')} type="button">Amanha</button>
              <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')} type="button">Semana</button>
              <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')} type="button">Mes</button>
              <button className={period === 'overdue' ? 'active' : ''} onClick={() => setPeriod('overdue')} type="button">Vencidos</button>
              <button className={period === 'custom' ? 'active' : ''} onClick={() => setPeriod('custom')} type="button">Personalizado</button>
            </div>
            <label>Data<input onChange={(event) => setFilterDate(event.target.value)} type="date" value={filterDate} /></label>
            <select onChange={(event) => setStatus(event.target.value as CollectionStatus | 'all')} value={status}>
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
              <th>Quitacao</th>
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
                <td><SettlementBadge row={row} /></td>
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
                    onNoPayment={handleNoPayment}
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
          <BillingClientCard
            draft={getPaymentDraft(row.id)}
            expanded={Boolean(expandedCards[row.id])}
            key={row.id}
            loading={actionLoadingId === row.id}
            row={row}
            onDelete={handleDeleteReceivable}
            onDraftChange={(patch) => updatePaymentDraft(row.id, patch)}
            onEdit={openEditReceivable}
            onNoPayment={handleNoPayment}
            onPay={handlePayment}
            onToggleDetails={() => toggleCard(row.id)}
            onWhatsapp={openWhatsapp}
          />
        ))}
        {!loading && !visibleRows.length ? <div className="dashboard-empty"><CheckCircle2 size={22} /><strong>Nenhum cliente encontrado</strong><span>Ajuste os filtros ou tente buscar por outro nome, codigo ou telefone.</span></div> : null}
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
              <span>{history.previous_status ? billingStatusLabels[history.previous_status] : '-'} para {billingStatusLabels[history.new_status]}</span>
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
  return <span className={`billing-status-badge ${billingStatusClasses[status]}`}>{billingStatusLabels[status]}</span>
}

function SettlementBadge({ row }: { row: CollectionRow }) {
  return <span className={`settlement-badge ${row.settlementClassName}`}>{row.settlementBadge}</span>
}

function BillingClientCard({ draft, expanded, loading, row, onDelete, onDraftChange, onEdit, onNoPayment, onPay, onToggleDetails, onWhatsapp }: {
  draft: PaymentDraft
  expanded: boolean
  loading: boolean
  row: CollectionRow
  onDelete: (row: CollectionRow) => void
  onDraftChange: (patch: Partial<PaymentDraft>) => void
  onEdit: (row: CollectionRow) => void
  onNoPayment: (row: CollectionRow) => void
  onPay: (row: CollectionRow) => void
  onToggleDetails: () => void
  onWhatsapp: (row: CollectionRow) => void
}) {
  const isClosed = row.status === 'pago' || row.status === 'cancelado'
  const cardClassName = getCardToneClass(row)
  const daysLate = getDaysLate(row.dueDate)
  const address = [row.clientAddress, row.clientNeighborhood, row.clientCity].filter(Boolean).join(', ')

  return (
    <article className={`billing-client-card ${cardClassName}`}>
      <header className="billing-client-card-header">
        <div className="billing-client-avatar"><UserRound size={22} /></div>
        <div>
          <strong>{row.clientCode} - {row.clientName}</strong>
          <span>{row.source === 'receivable' ? 'Recebimento manual' : `Cartao ${row.loanId?.slice(0, 8) ?? '-'}`}</span>
        </div>
        <SettlementBadge row={row} />
      </header>

      <div className="billing-client-card-body">
        {row.settlementDeadlinePassed ? <div className="billing-overdue-warning">Passou do prazo de quitacao</div> : null}
        <div className="billing-info-grid">
          <InfoItem label="Parcela" value={formatCurrency(row.amount)} />
          <InfoItem label="Pagas" value={`${row.paidInstallments} - ${formatCurrency(row.loanPaidAmount)}`} />
          <InfoItem label="Faltantes" value={`${row.pendingInstallments} - ${formatCurrency(row.loanRemainingAmount || remainingAmount(row))}`} />
          <InfoItem label="Vencimento" value={formatDate(row.dueDate)} />
          <InfoItem label="Dias em atraso" value={daysLate > 0 ? String(daysLate) : '-'} danger={daysLate > 0} />
          <InfoItem label="Multa/juros" value={row.lateFeeAmount > 0 ? formatCurrency(row.lateFeeAmount) : '-'} danger={row.lateFeeAmount > 0} />
        </div>

        <div className="billing-card-payment">
          <label>Valor pago<input disabled={isClosed || loading} inputMode="decimal" min="0" onChange={(event) => onDraftChange({ amount: event.target.value })} placeholder={formatCurrency(remainingAmount(row))} type="number" value={draft.amount} /></label>
          <label>Parcelas<input disabled={isClosed || loading} inputMode="numeric" min="1" onChange={(event) => onDraftChange({ quantity: event.target.value })} placeholder="Qtd." type="number" value={draft.quantity} /></label>
          <label className="billing-card-note">Observacao<input disabled={loading} onChange={(event) => onDraftChange({ note: event.target.value })} placeholder="Opcional" value={draft.note} /></label>
        </div>

        <div className="billing-card-action-row">
          <button className="billing-pay-button" disabled={isClosed || loading} onClick={() => onPay(row)} type="button"><CheckCircle2 size={17} />{loading ? 'Registrando...' : 'Pagar'}</button>
          <button className="secondary-button billing-no-pay-button" disabled={isClosed || loading} onClick={() => onNoPayment(row)} type="button"><XCircle size={17} />Nao pagou</button>
          <button className="secondary-button billing-details-button" onClick={onToggleDetails} type="button">Mais detalhes {expanded ? '-' : '+'}</button>
        </div>

        <div className={`billing-expanded-details ${expanded ? 'open' : ''}`}>
          <div className="billing-detail-grid">
            <DetailItem label="Telefone" value={row.phone ?? 'Sem telefone'} />
            <DetailItem label="Endereco" value={address || 'Endereco nao informado'} />
            <DetailItem label="Referencia" value={row.clientReferencePoint ?? '-'} />
            <DetailItem label="Contrato/cartao" value={row.loanId ?? row.sourceId} />
            <DetailItem label="Observacoes" value={row.notes ?? row.loanNotes ?? '-'} />
          </div>
          <div className="billing-history-inline">
            <strong>Historico de pagamentos</strong>
            {row.histories.slice(0, 3).map((history) => (
              <span key={history.id}>{formatDate(history.created_at)} - {billingStatusLabels[history.new_status]}{history.note ? `: ${history.note}` : ''}</span>
            ))}
            {!row.histories.length ? <span>Nenhum historico registrado.</span> : null}
          </div>
          <div className="billing-expanded-actions">
            <button className="secondary-button" disabled={!row.phone} onClick={() => onWhatsapp(row)} type="button"><MessageCircle size={16} />WhatsApp</button>
            <Link className="button-link secondary-button" to={`/clientes/${row.clientId}`}>Ficha completa</Link>
            {row.source === 'receivable' ? <button className="secondary-button" onClick={() => onEdit(row)} type="button"><PencilLine size={16} />Editar</button> : null}
            {row.source === 'receivable' ? <button className="destructive-button" onClick={() => onDelete(row)} type="button"><Trash2 size={16} />Excluir</button> : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function InfoItem({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={danger ? 'danger' : ''}><span>{label}</span><strong>{value}</strong></div>
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function BillingCardSkeleton() {
  return (
    <div className="billing-skeleton-list">
      <div className="billing-card-skeleton" />
      <div className="billing-card-skeleton" />
      <div className="billing-card-skeleton" />
    </div>
  )
}

function BillingActions({ row, onDelete, onEdit, onHistory, onNoPayment, onNote, onStatus, onWhatsapp }: {
  row: CollectionRow
  onDelete: (row: CollectionRow) => void
  onEdit: (row: CollectionRow) => void
  onHistory: (row: CollectionRow) => void
  onNoPayment: (row: CollectionRow) => void
  onNote: (row: CollectionRow) => void
  onStatus: (row: CollectionRow, status: BillingStatus, channel?: BillingChannel) => void
  onWhatsapp: (row: CollectionRow) => void
}) {
  const isClosed = row.status === 'pago' || row.status === 'cancelado'

  return (
    <div className="billing-actions">
      <div className="billing-primary-actions">
        <button className="secondary-button billing-pay-button" disabled={isClosed} onClick={() => onStatus(row, 'pago')} title="Registrar pagamento" type="button"><CheckCircle2 size={16} />Pagar</button>
        <button className="secondary-button billing-no-pay-button" disabled={isClosed} onClick={() => onNoPayment(row)} title="Marcar como nao pagou" type="button"><XCircle size={16} />Nao pagou</button>
        <button className="secondary-button" onClick={() => onHistory(row)} title="Ver mais detalhes" type="button"><History size={16} />Mais detalhes</button>
      </div>
      <details className="billing-more-actions">
        <summary>Mais acoes</summary>
        <div>
          <button className="secondary-button" disabled={isClosed} onClick={onWhatsapp.bind(null, row)} title="Abrir WhatsApp do cliente" type="button"><MessageCircle size={16} />WhatsApp</button>
          <button className="secondary-button" onClick={() => onNote(row)} title="Adicionar observacao" type="button"><PencilLine size={16} />Obs.</button>
          <button className="secondary-button" disabled={isClosed} onClick={() => onStatus(row, 'cobranca_enviada', 'call')} title="Marcar cobranca enviada" type="button"><PhoneCall size={16} />Enviada</button>
          <button className="secondary-button" disabled={isClosed} onClick={() => onStatus(row, 'negociado')} title="Marcar como negociado" type="button">Negociado</button>
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

function enrichCollectionRow(row: DailyBillingRow, today: string, dailyLateFeePercent: number): CollectionRow {
  const remainingOriginal = remainingAmount(row)
  const lateFee = row.status !== 'pago' && row.dueDate < today
    ? calculateLateFee({
      remainingInstallmentAmount: remainingOriginal,
      dailyLateFeePercent,
      dueDate: row.dueDate,
      paymentDate: today,
    }).lateFeeAmount
    : 0
  const viewStatus = resolveCollectionStatus(row, today, lateFee)
  const settlementStatus = resolveSettlementStatus(row, today)
  return {
    ...row,
    lateFeeAmount: lateFee,
    remainingOriginal,
    totalToReceive: Math.max(remainingOriginal + lateFee, 0),
    viewStatus,
    settlementStatus,
    settlementBadge: settlementBadgeLabels[settlementStatus],
    settlementClassName: settlementClassNames[settlementStatus],
    settlementDeadlinePassed: isPastSettlementDeadline(row, today),
    fewInstallmentsLeft: row.pendingInstallments > 0 && row.pendingInstallments <= 3,
    recentlyRenewed: isRecentlyRenewed(row, today),
  }
}

function resolveCollectionStatus(row: DailyBillingRow, today: string, lateFeeAmount: number): CollectionStatus {
  if (row.status === 'pago') return 'pago'
  if (row.status === 'parcialmente_pago') return 'parcial'
  if (row.dueDate < today && lateFeeAmount > 0) return 'com_multa'
  if (row.dueDate < today || row.status === 'em_atraso') return 'atrasado'
  return 'pendente'
}

function getCardToneClass(row: CollectionRow): string {
  if (row.status === 'cancelado' || row.settlementStatus === 'inactive') return 'card-inactive'
  if (row.viewStatus === 'pago' || row.settlementStatus === 'paid') return 'card-paid'
  if (row.settlementDeadlinePassed || row.viewStatus === 'atrasado' || row.viewStatus === 'com_multa') return 'card-overdue'
  if (row.dueDate === localIsoDate() || row.settlementStatus === 'finishing') return 'card-warning'
  return 'card-normal'
}

function getDaysLate(dueDate: string): number {
  const today = new Date(`${localIsoDate()}T00:00:00`)
  const due = new Date(`${dueDate}T00:00:00`)
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000))
}

function remainingAmount(row: DailyBillingRow): number {
  return Math.max(row.amount - row.paidAmount, 0)
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number(value) || 0), 0)
}

function getPeriodRange(period: PeriodFilter, customStartDate: string, customEndDate: string): { start: string; end: string } {
  const today = localIsoDate()
  if (period === 'all') return { start: '0000-01-01', end: '9999-12-31' }
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
