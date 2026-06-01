import { CalendarClock, CheckCircle2, MessageCircle, PhoneCall, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import { fetchCollectionInstallments, getSelectOptions, refreshOverdueAlerts, registerCollectionContact, renegotiateLoan } from '../services/finance-service'
import { getActiveLoanSettings } from '../services/finance-service'

type CollectionFilter = 'overdue' | 'today' | 'upcoming' | 'all'
type CollectionStatus = 'open' | 'paid' | 'partial' | 'all'

export function CollectionsPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(settingsLoader, null)
  const loader = useCallback(async () => {
    await refreshOverdueAlerts()
    return fetchCollectionInstallments()
  }, [])
  const { data, loading, error, reload } = useAsyncData(loader, [])
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<CollectionFilter>(() => {
    const queue = searchParams.get('queue')
    return queue === 'overdue' || queue === 'today' || queue === 'upcoming' ? queue : 'all'
  })
  const [routeId, setRouteId] = useState('')
  const [collectorId, setCollectorId] = useState('')
  const [term, setTerm] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [status, setStatus] = useState<CollectionStatus>('open')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const today = localIsoDate()
  const isOpen = (item: (typeof data)[number]) => item.status !== 'paid'
  const routeNames = useMemo(() => new Map(options.data.routes.map((route) => [route.id, route.name])), [options.data.routes])
  const collectorNames = useMemo(() => new Map(options.data.collectors.map((collector) => [collector.id, collector.full_name])), [options.data.collectors])
  const dailyReceivables = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00`)
    date.setDate(date.getDate() + index)
    const isoDate = localIsoDate(date)
    const installments = data.filter((item) => isOpen(item) && item.due_date === isoDate)
    return {
      date: isoDate,
      count: installments.length,
      total: installments.reduce((sum, item) => sum + Math.max(item.amount - item.paid_amount, 0), 0),
    }
  }), [data, today])
  const routeFilteredItems = data.filter((item) => {
    const safeTerm = term.trim().toLowerCase()
    const matchesTerm = !safeTerm || [item.client?.name, item.client?.document_number, item.client?.phone]
      .some((value) => value?.toLowerCase().includes(safeTerm))
    return (!routeId || item.loan?.route_id === routeId)
      && (!collectorId || item.loan?.collector_id === collectorId)
      && matchesTerm
  })
  const overdue = routeFilteredItems.filter((item) => isOpen(item) && item.due_date < today)
  const dueToday = routeFilteredItems.filter((item) => isOpen(item) && item.due_date === today)
  const upcoming = routeFilteredItems.filter((item) => isOpen(item) && item.due_date > today)
  const totalPaid = routeFilteredItems.reduce((sum, item) => sum + item.paid_amount, 0)
  const totalOpen = routeFilteredItems.reduce((sum, item) => sum + Math.max(item.amount - item.paid_amount, 0), 0)
  const visibleItems = routeFilteredItems.filter((item) => {
    const matchesQueue =
      filter === 'all'
      || (filter === 'overdue' && item.due_date < today)
      || (filter === 'today' && item.due_date === today)
      || (filter === 'upcoming' && item.due_date > today)
    const matchesStatus =
      status === 'all'
      || (status === 'open' && isOpen(item))
      || (status === 'paid' && item.status === 'paid')
      || (status === 'partial' && item.status === 'partial')
    return matchesQueue
      && matchesStatus
      && (!selectedDate || item.due_date === selectedDate)
      && (!startDate || item.due_date >= startDate)
      && (!endDate || item.due_date <= endDate)
  })

  async function handleContact(itemId: string, kind: 'call' | 'promise' | 'renegotiate') {
    const item = data.find((current) => current.id === itemId)
    if (!profile || !item?.client || !item.loan) return
    try {
      const promiseDate = kind === 'promise' ? window.prompt('Data prometida para pagamento (AAAA-MM-DD)') : null
      if (kind === 'renegotiate') {
        const termDays = Number(window.prompt('Modalidade em dias: 20, 24 ou 30', '20'))
        const frequency = window.prompt('Frequencia: daily, weekly, biweekly ou monthly', 'daily') ?? 'daily'
        const startDate = window.prompt('Data inicial (AAAA-MM-DD)', localIsoDate()) ?? ''
        const count = await renegotiateLoan(item.loan.id, { termDays, frequency, startDate })
        setMessage(`Renegociacao concluida com ${count} novas parcelas.`)
        reload()
        return
      }
      const result = kind === 'promise'
        ? 'Promessa de pagamento registrada'
        : 'Contato registrado pela tela de cobrancas'
      await registerCollectionContact(profile, {
        clientId: item.client.id,
        loanId: item.loan.id,
        installmentId: item.id,
        contactType: 'call',
        result,
        nextContactAt: promiseDate ? `${promiseDate}T09:00:00` : null,
      })
      setMessage(kind === 'promise' ? 'Promessa registrada no historico de cobranca.' : 'Contato registrado no historico de cobranca.')
      reload()
    } catch (contactError) {
      setMessage(contactError instanceof Error ? contactError.message : 'Erro ao registrar contato.')
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Cobrancas</h1>
          <p>Parcelas vencidas, multa atualizada e acoes de contato.</p>
        </div>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      <div className="summary-grid collection-summary-grid">
        <CollectionMetric label="Atrasadas" value={overdue.length} icon={TriangleAlert} />
        <CollectionMetric label="Vencendo hoje" value={dueToday.length} icon={CalendarClock} />
        <CollectionMetric label="Proximas" value={upcoming.length} icon={CheckCircle2} />
        <CollectionMetric label="Total em aberto" value={formatCurrency(totalOpen)} icon={CalendarClock} />
        <CollectionMetric label="Total recebido" value={formatCurrency(totalPaid)} icon={CheckCircle2} />
      </div>
      <section className="content-panel collection-toolbar">
        <div className="segmented-control collection-filter">
          <button className={filter === 'overdue' ? 'active' : ''} onClick={() => setFilter('overdue')} type="button">Atrasadas</button>
          <button className={filter === 'today' ? 'active' : ''} onClick={() => setFilter('today')} type="button">Hoje</button>
          <button className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')} type="button">Proximas</button>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} type="button">Todas</button>
        </div>
        <div className="filter-grid-desktop">
          <input onChange={(event) => setTerm(event.target.value)} placeholder="Nome, CPF ou telefone" value={term} />
          <select onChange={(event) => setRouteId(event.target.value)} value={routeId}><option value="">Todas as rotas</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select>
          <select onChange={(event) => setCollectorId(event.target.value)} value={collectorId}><option value="">Todos os afiliados</option>{options.data.collectors.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}</option>)}</select>
          <select onChange={(event) => setStatus(event.target.value as CollectionStatus)} value={status}><option value="open">Em aberto</option><option value="partial">Parciais</option><option value="paid">Pagas</option><option value="all">Todos os status</option></select>
          <label>De<input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
          <label>Ate<input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
        </div>
      </section>
      <section className="content-panel daily-receivables-panel">
        <div className="page-title-row">
          <div><h2>Recebimentos por dia</h2><p>Agenda dos proximos sete dias para organizar a rota.</p></div>
          {selectedDate ? <button className="secondary-button" onClick={() => setSelectedDate('')} type="button">Limpar dia</button> : null}
        </div>
        <div className="daily-receivables-grid">
          {dailyReceivables.map((day) => (
            <button className={selectedDate === day.date ? 'active' : ''} key={day.date} onClick={() => { setSelectedDate(day.date); setFilter('all') }} type="button">
              <span>{formatDate(day.date)}</span>
              <strong>{formatCurrency(day.total)}</strong>
              <small>{day.count} parcela{day.count === 1 ? '' : 's'}</small>
            </button>
          ))}
        </div>
      </section>
      <div className="mobile-card-list always-grid">
        {visibleItems.map((item) => {
          const remaining = Math.max(item.amount - item.paid_amount, 0)
          const fee = calculateLateFee({ remainingInstallmentAmount: remaining, dailyLateFeePercent: settings.data?.late_fee_rate ?? 20, dueDate: item.due_date })
          const queueLabel = item.status === 'paid' ? 'Paga' : item.due_date < today ? `${fee.daysLate} dias de atraso` : item.due_date === today ? 'Vence hoje' : 'A vencer'
          return (
            <article className="mobile-data-card" key={item.id}>
              <strong>{item.client?.name ?? 'Cliente'}</strong>
              <span>Parcela {item.installment_number} - vencimento {formatDate(item.due_date)}</span>
              <small>{queueLabel} · {routeNames.get(item.loan?.route_id ?? '') ?? 'Sem rota'} · {collectorNames.get(item.loan?.collector_id ?? '') ?? 'Sem afiliado'}</small>
              <div className="mini-totals">
                <b>{formatCurrency(item.amount)}</b>
                <b>{formatCurrency(fee.lateFeeAmount)}</b>
                <b>{formatCurrency(fee.updatedTotal)}</b>
              </div>
              <div className="button-row">
                <button onClick={() => handleContact(item.id, 'call')} type="button"><PhoneCall size={17} />Contato</button>
                <a className="button-link" href={`https://wa.me/${item.client?.whatsapp ?? item.client?.phone ?? ''}`} target="_blank" rel="noreferrer"><MessageCircle size={17} />WhatsApp</a>
                <button className="secondary-button" onClick={() => handleContact(item.id, 'promise')} type="button">Promessa</button>
                {item.status !== 'paid' ? <Link className="button-link" to={`/pagamentos?installmentId=${item.id}`}>Pagamento</Link> : null}
                {item.client ? <Link className="button-link secondary-button" to={`/clientes/${item.client.id}`}>Historico</Link> : null}
                <button className="secondary-button" onClick={() => handleContact(item.id, 'renegotiate')} type="button">Renegociar</button>
              </div>
            </article>
          )
        })}
      </div>
      {!loading && !visibleItems.length ? <div className="dashboard-empty"><CheckCircle2 size={22} /><strong>Nenhuma parcela nesta fila</strong><span>Use os filtros para consultar parcelas vencendo hoje, proximas ou todas em aberto.</span></div> : null}
    </section>
  )
}

function CollectionMetric({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof TriangleAlert }) {
  return <article className="metric-card"><Icon size={20} /><span>{label}</span><strong>{value}</strong></article>
}
