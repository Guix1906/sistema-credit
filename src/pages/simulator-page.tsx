import { FileText, RotateCcw, Send, ShoppingCart } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { localIsoDate } from '../lib/dates'
import { formatCurrency, formatDate, toNumber } from '../lib/formatters'
import { calculateLoan, type LoanCalculationResult, type LoanTermDays, type PaymentFrequency } from '../lib/loan-calculator'
import { getSelectOptions } from '../services/finance-service'
import { useAsyncData } from '../hooks/use-async-data'

const today = localIsoDate()

export function SimulatorPage() {
  const navigate = useNavigate()
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const [result, setResult] = useState<LoanCalculationResult | null>(null)
  const [simulationMeta, setSimulationMeta] = useState({ routeId: '', collectorId: '', cashboxId: '' })
  const [formKey, setFormKey] = useState(0)
  const whatsappText = useMemo(() => {
    if (!result) return ''
    return encodeURIComponent(
      `Simulação de empréstimo\nValor: ${formatCurrency(result.borrowedAmount)}\nJuros: ${formatCurrency(result.interestAmount)}\nTotal: ${formatCurrency(result.totalReceivable)}\nParcelas: ${result.installmentCount}x de ${formatCurrency(result.installmentAmount)}`,
    )
  }, [result])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSimulationMeta({
      routeId: String(formData.get('routeId') ?? ''),
      collectorId: String(formData.get('collectorId') ?? ''),
      cashboxId: String(formData.get('cashboxId') ?? ''),
    })
    setResult(
      calculateLoan({
        borrowedAmount: toNumber(formData.get('borrowedAmount')),
        interestRatePercent: toNumber(formData.get('interestRatePercent')),
        termDays: Number(formData.get('termDays')) as LoanTermDays,
        paymentFrequency: String(formData.get('paymentFrequency')) as PaymentFrequency,
        startDate: String(formData.get('startDate')),
      }),
    )
  }

  function clear() {
    setResult(null)
    setFormKey((key) => key + 1)
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Simulador</h1>
          <p>Calcule juros, parcelas, datas e lucro previsto antes de converter em venda.</p>
        </div>
      </div>

      <div className="form-layout">
        <form className="content-panel form-grid" key={formKey} onSubmit={handleSubmit}>
          <label>
            Valor emprestado
            <input name="borrowedAmount" placeholder="200,00" required type="number" min="1" step="0.01" defaultValue="200" />
          </label>
          <label>
            Taxa de juros (%)
            <input name="interestRatePercent" required type="number" min="0" step="0.01" defaultValue="20" />
          </label>
          <label>
            Modalidade
            <select name="termDays" defaultValue="20">
              <option value="20">20 dias</option>
              <option value="24">24 dias</option>
              <option value="30">30 dias</option>
            </select>
          </label>
          <label>
            Forma de pagamento
            <select name="paymentFrequency" defaultValue="daily">
              <option value="daily">Diária</option>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quinzenal</option>
              <option value="monthly">Mensal</option>
            </select>
          </label>
          <label>
            Data inicial
            <input name="startDate" required type="date" defaultValue={today} />
          </label>
          <label>
            Rota
            <select name="routeId">
              <option value="">Sem rota</option>
              {options.data.routes.map((route) => (
                <option key={route.id} value={route.id}>{route.name}</option>
              ))}
            </select>
          </label>
          <label>
            Afiliado responsavel
            <select name="collectorId">
              <option value="">Sem afiliado</option>
              {options.data.collectors.map((collector) => (
                <option key={collector.id} value={collector.id}>{collector.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Caixa
            <select name="cashboxId">
              <option value="">Sem caixa</option>
              {options.data.cashboxes.map((cashbox) => (
                <option key={cashbox.id} value={cashbox.id}>{cashbox.name}</option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button type="submit">Simular</button>
            <button className="secondary-button" onClick={clear} type="button"><RotateCcw size={17} />Limpar</button>
          </div>
        </form>

        <section className="content-panel result-panel">
          <h2>Resultado</h2>
          {result ? (
            <>
              <div className="result-grid">
                <ResultItem label="Valor emprestado" value={formatCurrency(result.borrowedAmount)} />
                <ResultItem label="Juros" value={formatCurrency(result.interestAmount)} />
                <ResultItem label="Total a receber" value={formatCurrency(result.totalReceivable)} />
                <ResultItem label="Lucro previsto" value={formatCurrency(result.expectedProfit)} />
                <ResultItem label="Quantidade de parcelas" value={String(result.installmentCount)} />
                <ResultItem label="Valor da parcela" value={formatCurrency(result.installmentAmount)} />
              </div>
              <div className="button-row">
                <button type="button" onClick={() => navigate('/vendas', { state: { simulation: result, simulationMeta } })}><ShoppingCart size={17} />Converter em venda</button>
                <button className="secondary-button" type="button" onClick={() => window.print()}><FileText size={17} />Gerar PDF</button>
                <a className="button-link" href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer"><Send size={17} />WhatsApp</a>
              </div>
              <div className="installment-list">
                {result.installments.map((installment) => (
                  <div key={installment.installmentNumber}>
                    <span>#{installment.installmentNumber}</span>
                    <strong>{formatCurrency(installment.amount)}</strong>
                    <small>{formatDate(installment.dueDate)}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted-copy">Preencha os campos e clique em simular.</p>
          )}
        </section>
      </div>
    </section>
  )
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
