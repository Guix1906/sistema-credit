import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { FilePicker } from '../components/file-picker'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import { supabase } from '../lib/supabase'
import { getUserDisplayName } from '../lib/user-display-name'
import { fetchOpenInstallments, getActiveLoanSettings, getSelectOptions, listRecentPayments, registerPayment } from '../services/finance-service'
import { getAppSettings } from '../services/settings-service'
import { uploadReceipt } from '../services/storage-service'

const fallbackPaymentMethods = ['cash', 'pix', 'bank_transfer', 'other']
const paymentMethodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  bank_transfer: 'Transferencia',
  debit_card: 'Cartao de debito',
  credit_card: 'Cartao de credito',
  other: 'Outra',
}

export function PaymentsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, user } = useAuth()
  const installments = useAsyncData(fetchOpenInstallments, [])
  const recentPayments = useAsyncData(listRecentPayments, [])
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(settingsLoader, null)
  const appSettingsLoader = useCallback(() => profile ? getAppSettings(profile.id) : Promise.resolve(null), [profile?.id])
  const appSettings = useAsyncData(appSettingsLoader, null)
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const [selectedId, setSelectedId] = useState(() => searchParams.get('installmentId') ?? '')
  const [clientId, setClientId] = useState('')
  const [loanId, setLoanId] = useState('')
  const [paymentDate, setPaymentDate] = useState(localIsoDate())
  const [amountPaid, setAmountPaid] = useState('')
  const [applyLateFee, setApplyLateFee] = useState(false)
  const [lateFeeDays, setLateFeeDays] = useState('')
  const [message, setMessage] = useState('')
  const selected = installments.data.find((item) => item.id === selectedId)
  const clients = useMemo(() => {
    const byId = new Map(installments.data.flatMap((item) => item.client ? [[item.client.id, item.client] as const] : []))
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [installments.data])
  const loans = useMemo(() => {
    const byId = new Map(installments.data
      .filter((item) => item.client?.id === clientId && item.loan)
      .map((item) => [item.loan!.id, item.loan!] as const))
    return [...byId.values()]
  }, [clientId, installments.data])
  const visibleInstallments = installments.data.filter((item) => item.client?.id === clientId && item.loan_id === loanId)
  const dailyLateFeePercent = settings.data?.late_fee_rate ?? 20
  const paymentMethods = appSettings.data?.payment_methods?.length ? appSettings.data.payment_methods : fallbackPaymentMethods
  const selectedRemainingAmount = selected ? Math.max(selected.amount - selected.paid_amount, 0) : 0
  const automaticLateFee = selected ? calculateLateFee({ remainingInstallmentAmount: selectedRemainingAmount, dailyLateFeePercent, dueDate: selected.due_date, paymentDate }) : null
  const suggestedLateFeeDays = selected ? Math.max(1, automaticLateFee?.daysLate ?? 0) : 0
  const typedLateFeeDays = Math.max(0, Math.floor(Number(lateFeeDays.replace(',', '.')) || 0))
  const manualLateFeeDays = applyLateFee ? Math.max(1, typedLateFeeDays) : typedLateFeeDays
  const calculatedLateFee = selected ? calculateLateFee({ remainingInstallmentAmount: selectedRemainingAmount, dailyLateFeePercent, dueDate: selected.due_date, paymentDate, fixedDaysLate: applyLateFee ? manualLateFeeDays : 0 }) : null
  const paymentTotal = applyLateFee ? calculatedLateFee?.updatedTotal ?? 0 : selectedRemainingAmount
  const displayedLateFeeAmount = applyLateFee ? calculatedLateFee?.lateFeeAmount ?? 0 : 0
  const displayedDaysLate = applyLateFee ? calculatedLateFee?.daysLate ?? 0 : 0

  useEffect(() => {
    if (!selected) return
    setClientId(selected.client?.id ?? '')
    setLoanId(selected.loan_id)
    setApplyLateFee(false)
  }, [selected])

  useEffect(() => {
    setLateFeeDays(selected ? String(suggestedLateFeeDays) : '')
  }, [selected, suggestedLateFeeDays])

  useEffect(() => {
    setAmountPaid(selected ? String(paymentTotal) : '')
  }, [paymentTotal, selected])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !selected) return
    const formData = new FormData(event.currentTarget)
    try {
      const paymentId = await registerPayment(profile, {
        installmentId: selected.id,
        amountPaid: toNumber(formData.get('amountPaid')),
        paymentDate,
        paymentMethod: String(formData.get('paymentMethod')),
        cashboxId: String(formData.get('cashboxId') || '') || undefined,
        notes: String(formData.get('notes') || ''),
        dailyLateFeePercent,
        applyLateFee: formData.get('applyLateFee') === 'on',
        lateFeeDays: toNumber(formData.get('lateFeeDays')),
      })
      const receipt = formData.get('receipt')
      if (receipt instanceof File && receipt.size > 0) {
        const receiptPath = await uploadReceipt(profile, { file: receipt, folder: 'payments', recordId: paymentId })
        const { error: receiptError } = await supabase.from('payments').update({ receipt_path: receiptPath }).eq('id', paymentId)
        if (receiptError) throw receiptError
      }
      setMessage('Pagamento registrado com sucesso. Abrindo recibo...')
      installments.reload()
      recentPayments.reload()
      navigate(`/recibos/${paymentId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao registrar pagamento.')
    }
  }

  function clearSelection() {
    setClientId('')
    setLoanId('')
    setSelectedId('')
    setPaymentDate(localIsoDate())
    setAmountPaid('')
    setApplyLateFee(false)
    setLateFeeDays('')
    setMessage('')
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Pagamentos</h1><p>Registre pagamento total ou parcial, multa, caixa destino, recibo e auditoria.</p></div></div>
      <form className="content-panel form-grid" onSubmit={handleSubmit}>
        <label>Cliente<select required value={clientId} onChange={(event) => { setClientId(event.target.value); setLoanId(''); setSelectedId('') }}><option value="">Selecione</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label>Emprestimo<select required value={loanId} onChange={(event) => { setLoanId(event.target.value); setSelectedId('') }}><option value="">Selecione</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{formatCurrency(loan.total_amount)} - {formatDate(loan.issued_at)}</option>)}</select></label>
        <label className="full-span">Parcela<select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione</option>{visibleInstallments.map((item) => <option key={item.id} value={item.id}>Parcela {item.installment_number} - {formatDate(item.due_date)} - {formatCurrency(item.amount - item.paid_amount)}</option>)}</select></label>
        <div className="value-summary-grid full-span">
          <PaymentSummaryItem label="Valor original" value={formatCurrency(selected?.amount)} />
          <PaymentSummaryItem label="Dias de multa" value={String(displayedDaysLate)} />
          <PaymentSummaryItem label={`Multa (${dailyLateFeePercent}% ao dia)`} value={formatCurrency(displayedLateFeeAmount)} tone={applyLateFee ? 'warning' : 'default'} />
          <PaymentSummaryItem label="Total atualizado" value={formatCurrency(paymentTotal)} tone="strong" />
        </div>
        <label className="checkbox-row full-span"><input checked={applyLateFee} disabled={!selected} name="applyLateFee" onChange={(event) => { const checked = event.target.checked; setApplyLateFee(checked); if (checked && manualLateFeeDays === 0) setLateFeeDays(String(suggestedLateFeeDays)) }} type="checkbox" />Cobrar multa de atraso nesta parcela</label>
        <label>Dias de multa<input disabled={!applyLateFee || !selected} min="1" name="lateFeeDays" required={applyLateFee} type="number" step="1" value={lateFeeDays} onChange={(event) => setLateFeeDays(event.target.value)} /></label>
        <label>Valor pago<input required name="amountPaid" type="number" step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} /></label>
        <label>Data<input required name="paymentDate" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
        <label>Forma de pagamento<select name="paymentMethod">{paymentMethods.map((method) => <option key={method} value={method}>{paymentMethodLabels[method] ?? method}</option>)}</select></label>
        <label>Caixa destino<select name="cashboxId"><option value="">Sem caixa</option>{options.data.cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>)}</select></label>
        <FilePicker name="receipt" label="Comprovante" hint="Anexe imagem ou PDF do pagamento" />
        <div className="readonly-field"><span>Responsavel</span><strong>{getUserDisplayName(profile, user)}</strong></div>
        <label className="full-span">Observacao<textarea name="notes" /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <div className="button-row full-span"><button type="submit">Registrar pagamento</button><button className="secondary-button" onClick={clearSelection} type="button">Cancelar</button></div>
      </form>
      <section className="content-panel">
        <div className="page-title-row"><div><h2>Pagamentos recentes</h2><p>Ultimos recebimentos registrados no banco.</p></div></div>
        <div className="mobile-card-list always-grid">
          {recentPayments.data.map((payment) => <article className="mobile-data-card" key={payment.id}><strong>{payment.client?.name ?? 'Cliente'}</strong><span>Parcela {payment.installment?.installment_number ?? '-'}</span><small>{formatDate(payment.paid_at)} - {payment.payment_method}</small><b>{formatCurrency(payment.amount)}</b></article>)}
        </div>
      </section>
    </section>
  )
}

function PaymentSummaryItem({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' | 'strong' }) {
  return <article className={`value-summary-card value-summary-${tone}`}><span>{label}</span><strong>{value}</strong></article>
}
