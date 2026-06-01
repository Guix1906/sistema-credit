import { MessageCircle, PhoneCall } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import { fetchOpenInstallments, refreshOverdueAlerts, registerCollectionContact, renegotiateLoan } from '../services/finance-service'
import { getActiveLoanSettings } from '../services/finance-service'

export function CollectionsPage() {
  const { profile } = useAuth()
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(settingsLoader, null)
  const loader = useCallback(async () => {
    await refreshOverdueAlerts()
    return fetchOpenInstallments()
  }, [])
  const { data, loading, error, reload } = useAsyncData(loader, [])
  const [message, setMessage] = useState('')
  const today = localIsoDate()
  const overdue = data.filter((item) => item.due_date < today)

  async function handleContact(itemId: string, kind: 'call' | 'promise' | 'renegotiate') {
    const item = overdue.find((current) => current.id === itemId)
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
      <div className="mobile-card-list always-grid">
        {overdue.map((item) => {
          const fee = calculateLateFee({ remainingInstallmentAmount: item.amount - item.paid_amount, dailyLateFeePercent: settings.data?.late_fee_rate ?? 20, dueDate: item.due_date })
          return (
            <article className="mobile-data-card" key={item.id}>
              <strong>{item.client?.name ?? 'Cliente'}</strong>
              <span>Parcela {item.installment_number} - vencimento {formatDate(item.due_date)}</span>
              <small>{fee.daysLate} dias de atraso</small>
              <div className="mini-totals">
                <b>{formatCurrency(item.amount)}</b>
                <b>{formatCurrency(fee.lateFeeAmount)}</b>
                <b>{formatCurrency(fee.updatedTotal)}</b>
              </div>
              <div className="button-row">
                <button onClick={() => handleContact(item.id, 'call')} type="button"><PhoneCall size={17} />Contato</button>
                <a className="button-link" href={`https://wa.me/${item.client?.whatsapp ?? item.client?.phone ?? ''}`} target="_blank" rel="noreferrer"><MessageCircle size={17} />WhatsApp</a>
                <button className="secondary-button" onClick={() => handleContact(item.id, 'promise')} type="button">Promessa</button>
                <Link className="button-link" to={`/pagamentos?installmentId=${item.id}`}>Pagamento</Link>
                <button className="secondary-button" onClick={() => handleContact(item.id, 'renegotiate')} type="button">Renegociar</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
