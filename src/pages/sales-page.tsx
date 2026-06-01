import { CircleDollarSign, Search, UserRound, UserRoundPlus } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { MaskedInput } from '../components/masked-input'
import { useAuth } from '../contexts/auth-context'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { getOperationErrorMessage } from '../lib/errors'
import { formatCurrency, nullableText, toNumber } from '../lib/formatters'
import { calculateLoan, type LoanCalculationResult, type LoanTermDays, type PaymentFrequency } from '../lib/loan-calculator'
import { maskDocument, maskPhone } from '../lib/masks'
import { createSale, getSelectOptions, searchClients } from '../services/finance-service'
import { uploadClientDocument } from '../services/storage-service'
import type { ClientRecord } from '../types/finance'

export function SalesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const simulation = (location.state as { simulation?: LoanCalculationResult } | null)?.simulation
  const simulationMeta = (location.state as { simulationMeta?: { routeId?: string; collectorId?: string; cashboxId?: string } } | null)?.simulationMeta
  const options = useAsyncData(getSelectOptions, { routes: [], collectors: [], cashboxes: [] })
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [preview, setPreview] = useState<LoanCalculationResult | null>(() => simulation ?? createDefaultPreview())
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchingClients, setSearchingClients] = useState(true)
  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedClientId), [clients, selectedClientId])

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(async () => {
      setSearchingClients(true)
      try {
        const result = await searchClients(clientSearch, { activeOnly: true })
        if (active) setClients(result)
      } catch (error) {
        if (active) setMessage(getOperationErrorMessage(error, 'buscar os clientes'))
      } finally {
        if (active) setSearchingClients(false)
      }
    }, clientSearch ? 250 : 0)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [clientSearch])

  function updatePreview(form: HTMLFormElement) {
    const formData = new FormData(form)
    const borrowedAmount = toNumber(formData.get('borrowedAmount'))
    if (!borrowedAmount) return
    try {
      setPreview(
        calculateLoan({
          borrowedAmount,
          interestRatePercent: toNumber(formData.get('interestRatePercent')),
          termDays: Number(formData.get('termDays')) as LoanTermDays,
          paymentFrequency: String(formData.get('paymentFrequency')) as PaymentFrequency,
          startDate: String(formData.get('startDate')),
        }),
      )
    } catch {
      setPreview(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    setMessage('')
    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const sale = await createSale(profile, {
        mode,
        existingClientId: nullableText(formData.get('existingClientId')) ?? undefined,
        client: {
          name: String(formData.get('name') ?? ''),
          document_number: nullableText(formData.get('documentNumber')) ?? undefined,
          rg: nullableText(formData.get('rg')) ?? undefined,
          phone: nullableText(formData.get('phone')) ?? undefined,
          whatsapp: nullableText(formData.get('whatsapp')) ?? undefined,
          address: nullableText(formData.get('address')) ?? undefined,
          neighborhood: nullableText(formData.get('neighborhood')) ?? undefined,
          city: nullableText(formData.get('city')) ?? undefined,
          reference_point: nullableText(formData.get('referencePoint')) ?? undefined,
          notes: nullableText(formData.get('notes')) ?? undefined,
        },
        loan: {
          borrowedAmount: toNumber(formData.get('borrowedAmount')),
          interestRatePercent: toNumber(formData.get('interestRatePercent')),
          termDays: Number(formData.get('termDays')) as LoanTermDays,
          paymentFrequency: String(formData.get('paymentFrequency')) as PaymentFrequency,
          startDate: String(formData.get('startDate')),
          routeId: nullableText(formData.get('routeId')) ?? undefined,
          collectorId: nullableText(formData.get('collectorId')) ?? undefined,
          cashboxId: nullableText(formData.get('cashboxId')) ?? undefined,
        },
      })

      const photo = formData.get('photo')
      const documents = formData.getAll('documents').filter((item): item is File => item instanceof File && item.size > 0)
      const uploads: Promise<string>[] = []
      if (photo instanceof File && photo.size > 0) {
        uploads.push(uploadClientDocument(profile, { clientId: sale.clientId, file: photo, documentType: 'photo' }))
      }
      uploads.push(...documents.map((file) => uploadClientDocument(profile, { clientId: sale.clientId, file, documentType: 'document' })))
      if (uploads.length) {
        try {
          await Promise.all(uploads)
        } catch (uploadError) {
          setMessage(`Venda salva, mas o upload falhou: ${uploadError instanceof Error ? uploadError.message : 'erro no Storage'}. Aplique a migration de buckets se ainda nao aplicou.`)
          return
        }
      }
      navigate(`/vendas/${sale.loanId}`)
    } catch (error) {
      setMessage(getOperationErrorMessage(error, 'salvar a venda'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-stack">
      <div className="page-title-row">
        <div>
          <h1>Nova venda</h1>
          <p>Crie o emprestimo, gere parcelas e registre a saida de caixa em um unico fluxo.</p>
        </div>
      </div>

      <form className="form-layout sales-form-layout" onSubmit={handleSubmit} onChange={(event) => updatePreview(event.currentTarget)}>
        <section className="content-panel sale-client-panel">
          <SectionHeading icon={UserRound} title="Cliente" description="Selecione um cadastro ou crie um novo." />
          <div className="segmented-control sale-client-mode">
            <button className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')} type="button"><UserRound size={16} />Cliente existente</button>
            <button className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')} type="button"><UserRoundPlus size={16} />Novo cliente</button>
          </div>

          {mode === 'existing' ? (
            <div className="existing-client-picker">
              <label>
                Buscar por nome, CPF ou telefone
                <span className="sale-search-input"><Search size={17} /><input onChange={(event) => setClientSearch(event.target.value)} placeholder="Digite para buscar" type="search" value={clientSearch} /></span>
              </label>
              <label>
                Cliente encontrado
                <select name="existingClientId" onChange={(event) => setSelectedClientId(event.target.value)} required value={selectedClientId}>
                  <option value="">Selecione um cliente</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name} - {client.document_number ?? client.phone ?? 'sem documento'}</option>)}
                </select>
              </label>
              {selectedClient ? (
                <article className="selected-client-summary">
                  <span className="selected-client-avatar">{selectedClient.name.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{selectedClient.name}</strong><small>{selectedClient.document_number ?? 'Documento nao informado'} | {selectedClient.phone ?? selectedClient.whatsapp ?? 'Telefone nao informado'}</small></div>
                </article>
              ) : <p className="sale-helper-copy">{searchingClients ? 'Buscando clientes...' : clients.length ? 'Selecione um cliente para continuar.' : 'Nenhum cliente encontrado. Use a opcao Novo cliente.'}</p>}
            </div>
          ) : (
            <div className="sale-client-fields">
              <label>Nome<input name="name" required /></label>
              <label>CPF/CNPJ<MaskedInput mask={maskDocument} name="documentNumber" /></label>
              <label>RG<input name="rg" /></label>
              <label>Telefone<MaskedInput mask={maskPhone} name="phone" required /></label>
              <label>WhatsApp<MaskedInput mask={maskPhone} name="whatsapp" /></label>
              <label>Endereco<input name="address" /></label>
              <label>Bairro<input name="neighborhood" /></label>
              <label>Cidade<input name="city" /></label>
              <label>Referencia<input name="referencePoint" /></label>
              <label className="full-span">Observacoes<textarea name="notes" /></label>
              <label>Foto<input accept="image/*" name="photo" type="file" /></label>
              <label>Documentos<input multiple name="documents" type="file" /></label>
            </div>
          )}
        </section>

        <section className="content-panel sale-loan-panel">
          <SectionHeading icon={CircleDollarSign} title="Dados da venda" description="Defina valores, prazo e destino financeiro." finance />
          <div className="sale-loan-fields">
            <label>Valor emprestado<input defaultValue={simulation?.borrowedAmount ?? 200} name="borrowedAmount" required step="0.01" type="number" /></label>
            <label>Taxa<input defaultValue={simulation?.interestRatePercent ?? 20} name="interestRatePercent" required step="0.01" type="number" /></label>
            <label>Modalidade<select defaultValue={simulation?.termDays ?? 20} name="termDays"><option value="20">20 dias</option><option value="24">24 dias</option><option value="30">30 dias</option></select></label>
            <label>Forma de pagamento<select defaultValue={simulation?.paymentFrequency ?? 'daily'} name="paymentFrequency"><option value="daily">Diaria</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select></label>
            <label>Data inicial<input defaultValue={localIsoDate()} name="startDate" required type="date" /></label>
            <label>Data final<input readOnly value={preview?.installments.at(-1)?.dueDate ?? ''} /></label>
            <label>Rota<select defaultValue={simulationMeta?.routeId ?? ''} name="routeId"><option value="">Sem rota</option>{options.data.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
            <label>Afiliado responsavel<select defaultValue={simulationMeta?.collectorId ?? ''} name="collectorId"><option value="">Sem afiliado</option>{options.data.collectors.map((affiliate) => <option key={affiliate.id} value={affiliate.id}>{affiliate.full_name}</option>)}</select></label>
            <label>Caixa origem<select defaultValue={simulationMeta?.cashboxId ?? ''} name="cashboxId"><option value="">Sem caixa</option>{options.data.cashboxes.map((cashbox) => <option key={cashbox.id} value={cashbox.id}>{cashbox.name} - {formatCurrency(cashbox.current_balance)}</option>)}</select></label>
          </div>
          <div className="result-grid">
            <Result label="Total a receber" value={formatCurrency(preview?.totalReceivable)} />
            <Result label="Valor da parcela" value={formatCurrency(preview?.installmentAmount)} />
            <Result label="Lucro previsto" value={formatCurrency(preview?.expectedProfit)} />
          </div>
          {message ? <p className="form-message">{message}</p> : null}
          <button disabled={saving} type="submit">{saving ? 'Salvando...' : 'Salvar venda'}</button>
        </section>
      </form>
    </section>
  )
}

function SectionHeading({ icon: Icon, title, description, finance = false }: { icon: typeof UserRound; title: string; description: string; finance?: boolean }) {
  return <div className="sale-section-heading"><span className={`sale-section-icon ${finance ? 'sale-finance-icon' : ''}`}><Icon size={18} /></span><div><h2>{title}</h2><p>{description}</p></div></div>
}

function createDefaultPreview() {
  return calculateLoan({
    borrowedAmount: 200,
    interestRatePercent: 20,
    termDays: 20,
    paymentFrequency: 'daily',
    startDate: localIsoDate(),
  })
}

function Result({ label, value }: { label: string; value: string }) {
  return <article><span>{label}</span><strong>{value}</strong></article>
}
