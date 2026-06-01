import { FormEvent, useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { formatCurrency, toNumber } from '../lib/formatters'
import { calculateLateFee } from '../lib/late-fee-calculator'
import { supabase } from '../lib/supabase'
import { fetchOpenInstallments, getActiveLoanSettings, getSelectOptions, registerPayment } from '../services/finance-service'
import { uploadReceipt } from '../services/storage-service'

export function PaymentsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const installments = useAsyncData(fetchOpenInstallments, [])
  const settingsLoader = useCallback(() => getActiveLoanSettings(profile?.id), [profile?.id])
  const settings = useAsyncData(settingsLoader, null)
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const [selectedId, setSelectedId] = useState(() => searchParams.get('installmentId') ?? '')
  const [message, setMessage] = useState('')
  const selected = installments.data.find((item) => item.id === selectedId)
  const dailyLateFeePercent = settings.data?.late_fee_rate ?? 20
  const lateFee = selected ? calculateLateFee({ remainingInstallmentAmount: selected.amount - selected.paid_amount, dailyLateFeePercent, dueDate: selected.due_date }) : null

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
      navigate(`/recibos/${paymentId}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao registrar pagamento.')
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row"><div><h1>Pagamentos</h1><p>Registre pagamento total ou parcial, multa, caixa destino, recibo e auditoria.</p></div></div>
      <form className="content-panel form-grid" onSubmit={handleSubmit}>
        <label className="full-span">Parcela<select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Selecione</option>{installments.data.map((item) => <option key={item.id} value={item.id}>{item.client?.name ?? 'Cliente'} · Parcela {item.installment_number} · {formatCurrency(item.amount - item.paid_amount)}</option>)}</select></label>
        <label>Valor original<input readOnly value={formatCurrency(selected?.amount)} /></label>
        <label>Multa ({dailyLateFeePercent}% ao dia)<input readOnly value={formatCurrency(lateFee?.lateFeeAmount)} /></label>
        <label>Total atualizado<input readOnly value={formatCurrency(lateFee?.updatedTotal)} /></label>
        <label>Valor pago<input key={`${selectedId}-${lateFee?.updatedTotal ?? 0}`} required name="amountPaid" type="number" step="0.01" defaultValue={lateFee?.updatedTotal ?? 0} /></label>
        <label>Data<input required name="paymentDate" type="date" defaultValue={localIsoDate()} /></label>
        <label>Forma de pagamento<select name="paymentMethod"><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="bank_transfer">Transferência</option><option value="other">Outra</option></select></label>
        <label>Caixa destino<select name="cashboxId"><option value="">Sem caixa</option>{options.data.cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>)}</select></label>
        <label>Comprovante<input type="file" name="receipt" /></label>
        <label className="full-span">Observação<textarea name="notes" /></label>
        {message ? <p className="form-message full-span">{message}</p> : null}
        <button className="full-span" type="submit">Registrar pagamento</button>
      </form>
    </section>
  )
}
