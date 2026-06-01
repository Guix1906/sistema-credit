import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import { supabase } from '../lib/supabase'
import { fetchOpenInstallments, getActiveLoanSettings, getSelectOptions, listRecentPayments, registerPayment } from '../services/finance-service'
import { uploadReceipt } from '../services/storage-service'

export function PaymentsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const installments = useAsyncData(fetchOpenInstallments, [])
  const recentPayments = useAsyncData(listRecentPayments, [])
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(settingsLoader, null)
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const [selectedId, setSelectedId] = useState(() => searchParams.get('installmentId') ?? '')
  const [clientId, setClientId] = useState('')
  const [loanId, setLoanId] = useState('')
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
  const lateFee = selected ? calculateLateFee({ remainingInstallmentAmount: selected.amount - selected.paid_amount, dailyLateFeePercent, dueDate: selected.due_date }) : null

  useEffect(() => {
    if (!selected) return
    setClientId(selected.client?.id ?? '')
    setLoanId(selected.loan_id)
  }, [selected])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !selected) return
    const formData = new FormData(event.currentTarget)
    try {
      const paymentId = await registerPayment(profile, {
        installmentId: selected.id,
        amountPaid: toNumber(formData.get('amountPaid')),
        paymentDate: String(formData.get('paymentDate')),
        paymentMethod: String(formData.get('paymentMethod')),
        cashboxId: String(formData.get('cashboxId') || '') || undefined,
        notes: String(formData.get('notes') || ''),
        dailyLateFeePercent,
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
    setMessage('')
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Pagamentos</h1><p>Registre pagamento total ou parcial, multa, caixa destino, recibo e auditoria.</p></div></div>
      <form className="content-panel form-grid" onSubmit={handleSubmit}>
        <label>Cliente<select required value={clientId} onChange={(event) => { setClientId(event.target.value); setLoanId(''); setSelectedId('') }}><option value="">Selecione</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label>Emprestimo<select required value={loanId} onChange={(event) => { setLoanId(event.target.value); setSelectedId('') }}><option value="">Selecione</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{formatCurrency(loan.total_amount)} - {formatDate(loan.issued_at)}</option>)}</select></label>
        <label className="full-span">Parcela<select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione</option>{visibleInstallments.map((item) => <option key={item.id} value={item.id}>Parcela {item.installment_number} - {formatDate(item.due_date)} - {formatCurrency(item.amount - item.paid_amount)}</option>)}</select></label>
        <label>Valor original<input readOnly value={formatCurrency(selected?.amount)} /></label>
        <label>Multa ({dailyLateFeePercent}% ao dia)<input readOnly value={formatCurrency(lateFee?.lateFeeAmount)} /></label>
        <label>Total atualizado<input readOnly value={formatCurrency(lateFee?.updatedTotal)} /></label>
        <label>Valor pago<input key={`${selectedId}-${lateFee?.updatedTotal ?? 0}`} required name="amountPaid" type="number" step="0.01" defaultValue={lateFee?.updatedTotal ?? 0} /></label>
        <label>Data<input required name="paymentDate" type="date" defaultValue={localIsoDate()} /></label>
        <label>Forma de pagamento<select name="paymentMethod"><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="bank_transfer">Transferencia</option><option value="other">Outra</option></select></label>
        <label>Caixa destino<select name="cashboxId"><option value="">Sem caixa</option>{options.data.cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>)}</select></label>
        <label>Comprovante<input type="file" name="receipt" /></label>
        <label>Responsavel<input readOnly value={profile?.full_name ?? ''} /></label>
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
