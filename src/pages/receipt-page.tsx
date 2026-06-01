import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAsyncData } from '../hooks/use-async-data'
import { formatCurrency, formatDate } from '../lib/formatters'
import { supabase } from '../lib/supabase'

type ReceiptData = {
  payment: Record<string, unknown> | null
  client: Record<string, unknown> | null
  loan: Record<string, unknown> | null
  installment: Record<string, unknown> | null
}

export function ReceiptPage() {
  const { id } = useParams()
  const loader = useCallback(async (): Promise<ReceiptData> => {
    if (!id) throw new Error('Pagamento nao informado.')
    const payment = await supabase.from('payments').select('*').eq('id', id).single()
    if (payment.error) throw payment.error
    const [client, loan, installment] = await Promise.all([
      supabase.from('clients').select('name, document_number, phone').eq('id', payment.data.client_id).single(),
      supabase.from('loans').select('id, total_amount').eq('id', payment.data.loan_id).single(),
      payment.data.installment_id ? supabase.from('installments').select('installment_number, due_date').eq('id', payment.data.installment_id).single() : Promise.resolve({ data: null, error: null }),
    ])
    if (client.error) throw client.error
    if (loan.error) throw loan.error
    if (installment.error) throw installment.error
    return { payment: payment.data, client: client.data, loan: loan.data, installment: installment.data as Record<string, unknown> | null }
  }, [id])
  const { data, loading, error } = useAsyncData(loader, { payment: null as Record<string, unknown> | null, client: null as Record<string, unknown> | null, loan: null as Record<string, unknown> | null, installment: null as Record<string, unknown> | null })

  return (
    <section className="page-stack receipt-shell">
      <div className="page-title-row no-print">
        <div><h1>Recibo</h1><p>Comprovante do pagamento registrado.</p></div>
        <div className="button-row"><button onClick={() => window.print()} type="button">Imprimir recibo</button><Link className="button-link" to="/pagamentos">Voltar</Link></div>
      </div>
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="skeleton-card" /> : null}
      {data.payment ? (
        <article className="content-panel receipt-card">
          <h1>Recibo de pagamento</h1>
          <p>Recebemos de <strong>{String(data.client?.name ?? '-')}</strong> o valor de <strong>{formatCurrency(Number(data.payment.amount))}</strong>.</p>
          <dl className="detail-grid">
            <div><dt>Cliente</dt><dd>{String(data.client?.name ?? '-')}</dd></div>
            <div><dt>Documento</dt><dd>{String(data.client?.document_number ?? '-')}</dd></div>
            <div><dt>Venda</dt><dd>{String(data.loan?.id ?? '-').slice(0, 8)}</dd></div>
            <div><dt>Parcela</dt><dd>{String(data.installment?.installment_number ?? '-')}</dd></div>
            <div><dt>Data</dt><dd>{formatDate(String(data.payment.paid_at))}</dd></div>
            <div><dt>Forma</dt><dd>{String(data.payment.payment_method)}</dd></div>
            <div><dt>Multa</dt><dd>{formatCurrency(Number(data.payment.late_fee_amount ?? 0))}</dd></div>
            <div><dt>Total pago</dt><dd>{formatCurrency(Number(data.payment.amount))}</dd></div>
          </dl>
          <p className="receipt-signature">Assinatura: ________________________________________</p>
        </article>
      ) : null}
    </section>
  )
}
