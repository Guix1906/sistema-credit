import { ArrowLeft, Download, ReceiptText } from 'lucide-react'
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAsyncData } from '../hooks/use-async-data'
import { downloadCsv } from '../lib/exporters'
import { formatCurrency, formatDate } from '../lib/formatters'
import { supabase } from '../lib/supabase'
import type { InstallmentRecord, LoanRecord } from '../types/finance'

type PaymentRecord = {
  id: string
  amount: number
  paid_at: string
  payment_method: string
  notes: string | null
}

type SaleDetail = {
  loan: LoanRecord | null
  installments: InstallmentRecord[]
  payments: PaymentRecord[]
}

const emptySaleDetail: SaleDetail = {
  loan: null,
  installments: [],
  payments: [],
}

export function SaleDetailPage() {
  const { id } = useParams()
  const loader = useCallback(async (): Promise<SaleDetail> => {
    if (!id) return emptySaleDetail
    const [loan, installments, payments] = await Promise.all([
      supabase.from('loans').select('*').eq('id', id).maybeSingle(),
      supabase.from('installments').select('*').eq('loan_id', id).order('installment_number'),
      supabase.from('payments').select('id, amount, paid_at, payment_method, notes').eq('loan_id', id).order('paid_at', { ascending: false }),
    ])
    if (loan.error) throw loan.error
    if (installments.error) throw installments.error
    if (payments.error) throw payments.error
    return {
      loan: loan.data as LoanRecord | null,
      installments: (installments.data ?? []) as InstallmentRecord[],
      payments: (payments.data ?? []) as PaymentRecord[],
    }
  }, [id])
  const { data, loading, error } = useAsyncData(loader, emptySaleDetail)
  const loan = data.loan

  return (
    <section className="page-stack sale-detail-page">
      <div className="page-title-row">
        <div>
          <Link className="sale-detail-back" to="/carteira"><ArrowLeft size={16} />Voltar para carteira</Link>
          <h1>Detalhe da venda</h1>
          <p>Venda, parcelas e pagamentos vinculados ao registro selecionado.</p>
        </div>
        <Link className="button-link" to="/vendas">Nova venda</Link>
      </div>

      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <SaleDetailSkeleton /> : null}
      {!loading && loan ? (
        <>
          <div className="sale-detail-summary">
            <Metric label="Emprestado" value={formatCurrency(loan.principal_amount)} />
            <Metric label="Total a receber" value={formatCurrency(loan.total_amount)} />
            <Metric label="Pago" value={formatCurrency(loan.paid_amount)} />
            <Metric label="Em aberto" value={formatCurrency(loan.remaining_amount)} />
            <Metric label="Status" value={loan.status} status />
          </div>

          <section className="content-panel sale-detail-panel">
            <div className="sale-detail-panel-heading">
              <div><h2>Parcelas</h2><p>{data.installments.length} registros gerados para esta venda.</p></div>
            </div>
            <div className="sale-detail-table-wrap">
              <table>
                <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Status</th></tr></thead>
                <tbody>{data.installments.map((item) => <tr key={item.id}><td>{item.installment_number}</td><td>{formatDate(item.due_date)}</td><td>{formatCurrency(item.amount)}</td><td>{formatCurrency(item.paid_amount)}</td><td><span className={`soft-badge badge-${item.status}`}>{item.status}</span></td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="content-panel sale-detail-panel">
            <div className="sale-detail-panel-heading">
              <div><h2>Pagamentos</h2><p>Recebimentos registrados nesta venda.</p></div>
              <button className="secondary-button" disabled={!data.payments.length} onClick={() => downloadCsv(`pagamentos-${id}.csv`, data.payments)} type="button"><Download size={16} />Exportar CSV</button>
            </div>
            {data.payments.length ? (
              <div className="sale-detail-table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Valor</th><th>Forma</th><th>Observacao</th></tr></thead>
                  <tbody>{data.payments.map((item) => <tr key={item.id}><td>{formatDate(item.paid_at)}</td><td>{formatCurrency(item.amount)}</td><td><span className="soft-badge">{item.payment_method}</span></td><td>{item.notes ?? '-'}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="dashboard-empty"><ReceiptText size={20} /><strong>Nenhum pagamento registrado</strong><span>Os recebimentos desta venda aparecerao aqui.</span></div>}
          </section>
        </>
      ) : null}
      {!loading && !loan ? <p className="muted-copy">Venda nao encontrada.</p> : null}
    </section>
  )
}

function Metric({ label, value, status = false }: { label: string; value: string | number | undefined; status?: boolean }) {
  return <article className="sale-detail-metric"><span>{label}</span>{status ? <strong className={`soft-badge badge-${value}`}>{value}</strong> : <strong>{value ?? 0}</strong>}</article>
}

function SaleDetailSkeleton() {
  return <div className="sale-detail-skeleton"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div>
}
