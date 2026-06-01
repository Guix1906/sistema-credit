import { calculateLateFee } from '../lib/late-fee-calculator'
import { calculateLoan } from '../lib/loan-calculator'
import { localIsoDate } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'
import type { CashboxRecord, ClientRecord, InstallmentRecord, LoanRecord, RouteRecord, SaleFormInput, SelectOptionRecord } from '../types/finance'

export type DashboardMetrics = {
  totalInvested: number
  totalReceivable: number
  expectedProfit: number
  totalReceived: number
  realizedProfit: number
  openTotal: number
  overdueTotal: number
  activeClients: number
  paidOffClients: number
  overdueLoans: number
  dueTodayCount: number
  monthExpenses: number
  majorCashBalance: number
  minorCashBalance: number
  routePerformance: Array<{ id: string; name: string; received: number; receivable: number; overdue: number }>
  collectorPerformance: Array<{ id: string; name: string; received: number; receivable: number; overdue: number }>
}

export type ClientWithTotals = ClientRecord & {
  route_name: string | null
  affiliate_name: string | null
  total_to_pay: number
  total_paid: number
  total_open: number
}

export type WalletRow = {
  loan: LoanRecord
  client: ClientRecord | null
  paidInstallments: number
  pendingInstallments: number
}

export type LoanSettingsRecord = {
  id: string
  owner_id: string
  name: string
  interest_rate: number
  late_fee_rate: number
  default_installments: number
  default_frequency: string
  is_active: boolean
}

export type CashMovementRecord = {
  id: string
  owner_id: string
  cashbox_id: string
  payment_id: string | null
  type: 'inflow' | 'outflow' | 'adjustment'
  amount: number
  description: string
  occurred_at: string
  reversed_movement_id?: string | null
}

export async function getSelectOptions(): Promise<SelectOptionRecord> {
  const [routes, collectors, cashboxes] = await Promise.all([listRoutes(), listCollectors(), listCashboxes()])
  return { routes: routes.filter((route) => route.is_active), collectors, cashboxes }
}

export async function getActiveLoanSettings(_ownerId?: string): Promise<LoanSettingsRecord | null> {
  let query = supabase.from('loan_settings').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as LoanSettingsRecord | null
}

export async function listRoutes(): Promise<RouteRecord[]> {
  const { data, error } = await supabase.from('routes').select('id, owner_id, name, description, collector_id, collection_days, city, neighborhood, goal_amount, is_active').order('name')
  if (error) throw error
  return (data ?? []) as RouteRecord[]
}

export async function listCollectors(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').in('role', ['afiliado', 'cobrador']).eq('is_active', true).order('full_name')
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function listCashboxes(): Promise<CashboxRecord[]> {
  const { data, error } = await supabase.from('cashboxes').select('id, owner_id, name, current_balance, status, kind, route_id, allow_negative').eq('status', 'open').order('name')
  if (error) throw error
  return (data ?? []) as CashboxRecord[]
}

export async function searchClients(term = '', filters: { routeId?: string; collectorId?: string; activeOnly?: boolean } = {}): Promise<ClientRecord[]> {
  let query = supabase.from('clients').select('id, owner_id, route_id, affiliate_id, name, document_number, rg, phone, whatsapp, email, address, neighborhood, city, state, postal_code, reference_point, notes, status, is_active').order('name').limit(30)
  const safeTerm = term.trim().replace(/[,%()]/g, '')
  if (safeTerm) {
    const digits = safeTerm.replace(/\D/g, '')
    const terms = digits && digits !== safeTerm ? [safeTerm, digits] : [safeTerm]
    const filters = terms.flatMap((value) => [
      `name.ilike.%${value}%`,
      `document_number.ilike.%${value}%`,
      `phone.ilike.%${value}%`,
      `whatsapp.ilike.%${value}%`,
    ])
    query = query.or(filters.join(','))
  }
  if (filters.routeId) query = query.eq('route_id', filters.routeId)
  if (filters.activeOnly) query = query.eq('is_active', true)
  if (filters.collectorId) {
    const [routesResult, collectorResult] = await Promise.all([
      supabase.from('routes').select('id').eq('collector_id', filters.collectorId),
      supabase.from('profiles').select('route_id').eq('id', filters.collectorId).maybeSingle(),
    ])
    const { data: routes, error: routesError } = routesResult
    if (routesError) throw routesError
    if (collectorResult.error) throw collectorResult.error
    const routeIds = [...new Set([...(routes ?? []).map((route) => route.id), collectorResult.data?.route_id].filter((id): id is string => Boolean(id)))]
    query = routeIds.length
      ? query.or(`affiliate_id.eq.${filters.collectorId},route_id.in.(${routeIds.join(',')})`)
      : query.eq('affiliate_id', filters.collectorId)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ClientRecord[]
}

export async function createClient(profile: Profile, input: {
  name: string
  documentNumber?: string
  phone?: string
  whatsapp?: string
  address?: string
  neighborhood?: string
  city?: string
  notes?: string
  routeId?: string
  affiliateId?: string
}): Promise<void> {
  const name = input.name.trim()
  const phone = input.phone?.trim()
  if (!name) throw new Error('Informe o nome do cliente.')
  if (!phone) throw new Error('Informe o telefone do cliente.')
  const duplicateFilters = [
    `phone.eq.${phone}`,
    ...(input.documentNumber ? [`document_number.eq.${input.documentNumber}`] : []),
  ]
  const { data: duplicate, error: duplicateError } = await supabase.from('clients').select('id').or(duplicateFilters.join(',')).limit(1)
  if (duplicateError) throw duplicateError
  if (duplicate?.length) throw new Error('Cliente ja cadastrado com este telefone ou documento.')
  const { data, error } = await supabase.from('clients').insert({
    owner_id: profile.id,
    route_id: input.routeId || null,
    affiliate_id: input.affiliateId || null,
    name,
    document_number: input.documentNumber || null,
    phone,
    whatsapp: input.whatsapp || null,
    address: input.address || null,
    neighborhood: input.neighborhood || null,
    city: input.city || null,
    notes: input.notes || null,
  }).select('id').single()
  if (error) throw error
  await insertAuditLog(profile, 'clients', data.id, 'insert', null, { name: input.name, route_id: input.routeId || null })
  return data.id
}

export async function listClientsWithTotals(term = '', filters: { routeId?: string; status?: string; collectorId?: string } = {}): Promise<ClientWithTotals[]> {
  const clients = await searchClients(term, { routeId: filters.routeId, collectorId: filters.collectorId })
  if (!clients.length) return []
  const [routes, affiliates, loans] = await Promise.all([
    listRoutes(),
    listCollectors(),
    supabase.from('loans').select('*').in('client_id', clients.map((client) => client.id)),
  ])
  if (loans.error) throw loans.error
  const loanRows = (loans.data ?? []) as LoanRecord[]
  const installments = loanRows.length ? await supabase.from('installments').select('*').in('loan_id', loanRows.map((loan) => loan.id)) : { data: [], error: null }
  if (installments.error) throw installments.error
  const routeById = new Map(routes.map((route) => [route.id, route.name]))
  const affiliateById = new Map(affiliates.map((affiliate) => [affiliate.id, affiliate.full_name]))
  const allInstallments = (installments.data ?? []) as InstallmentRecord[]

  const rows = clients.map((client) => {
    const clientLoans = loanRows.filter((loan) => loan.client_id === client.id)
    const loanIds = new Set(clientLoans.map((loan) => loan.id))
    const clientInstallments = allInstallments.filter((installment) => loanIds.has(installment.loan_id))
    const totalToPay = sum(clientLoans.map((loan) => loan.total_amount))
    const totalPaid = sum(clientInstallments.map((installment) => installment.paid_amount))
    const computedStatus: ClientRecord['status'] = !client.is_active || client.status === 'inactive'
      ? 'inactive'
      : totalToPay > 0 && totalPaid >= totalToPay
        ? 'paid_off'
        : clientLoans.some((loan) => loan.status === 'overdue' || loan.status === 'defaulted')
          ? 'overdue'
          : 'active'
    return {
      ...client,
      route_name: client.route_id ? routeById.get(client.route_id) ?? null : null,
      affiliate_name: client.affiliate_id ? affiliateById.get(client.affiliate_id) ?? null : null,
      status: computedStatus,
      total_to_pay: totalToPay,
      total_paid: totalPaid,
      total_open: Math.max(totalToPay - totalPaid, 0),
    }
  })
  return filters.status && filters.status !== 'all' ? rows.filter((row) => row.status === filters.status) : rows
}

export async function createSale(profile: Profile, input: SaleFormInput): Promise<{ loanId: string; clientId: string }> {
  const calculation = calculateLoan({
    borrowedAmount: input.loan.borrowedAmount,
    interestRatePercent: input.loan.interestRatePercent,
    termDays: input.loan.termDays,
    paymentFrequency: input.loan.paymentFrequency,
    startDate: input.loan.startDate,
  })
  const firstDueDate = calculation.installments[0]?.dueDate
  const finalDueDate = calculation.installments.at(-1)?.dueDate
  const notes = `Frequencia: ${input.loan.paymentFrequency}; modalidade: ${input.loan.termDays} dias; taxa: ${calculation.interestRatePercent}%; vencimento final: ${finalDueDate}; rota: ${input.loan.routeId || '-'}; afiliado: ${input.loan.collectorId || '-'}`
  const { data: rpcSale, error: rpcError } = await supabase.rpc('create_credit_sale', {
    p_existing_client_id: input.mode === 'existing' ? input.existingClientId ?? null : null,
    p_client: { ...input.client, route_id: input.loan.routeId ?? null, affiliate_id: input.loan.collectorId ?? null },
    p_loan: {
      route_id: input.loan.routeId ?? null,
      collector_id: input.loan.collectorId ?? null,
      principal_amount: calculation.borrowedAmount,
      interest_amount: calculation.interestAmount,
      total_amount: calculation.totalReceivable,
      issued_at: input.loan.startDate,
      first_due_date: firstDueDate,
      final_due_date: finalDueDate,
      payment_frequency: input.loan.paymentFrequency,
      term_days: input.loan.termDays,
      interest_rate: calculation.interestRatePercent,
      notes,
    },
    p_installments: calculation.installments.map((installment) => ({ installment_number: installment.installmentNumber, due_date: installment.dueDate, amount: installment.amount })),
    p_cashbox_id: input.loan.cashboxId ?? null,
  })
  if (!rpcError) {
    const sale = rpcSale as { loan_id: string; client_id: string }
    return { loanId: sale.loan_id, clientId: sale.client_id }
  }
  if (!isMissingRpc(rpcError)) throw rpcError

  const clientId = input.mode === 'existing' && input.existingClientId ? input.existingClientId : await createClientForSale(profile.id, input.client, input.loan.routeId, input.loan.collectorId)
  const { data: loan, error: loanError } = await supabase
    .from('loans')
    .insert({
      owner_id: profile.id,
      client_id: clientId,
      route_id: input.loan.routeId || null,
      collector_id: input.loan.collectorId || null,
      principal_amount: calculation.borrowedAmount,
      interest_amount: calculation.interestAmount,
      total_amount: calculation.totalReceivable,
      paid_amount: 0,
      remaining_amount: calculation.totalReceivable,
      issued_at: input.loan.startDate,
      first_due_date: firstDueDate,
      final_due_date: finalDueDate,
      payment_frequency: input.loan.paymentFrequency,
      term_days: input.loan.termDays,
      interest_rate: calculation.interestRatePercent,
      status: 'active',
      notes,
    })
    .select('id')
    .single()
  if (loanError) throw loanError

  const { error: installmentError } = await supabase.from('installments').insert(
    calculation.installments.map((installment) => ({
      owner_id: profile.id,
      loan_id: loan.id,
      installment_number: installment.installmentNumber,
      due_date: installment.dueDate,
      amount: installment.amount,
      paid_amount: 0,
      status: 'pending',
    })),
  )
  if (installmentError) throw installmentError

  if (input.loan.cashboxId) {
    await applyCashMovement(profile, {
      cashboxId: input.loan.cashboxId,
      type: 'outflow',
      amount: calculation.borrowedAmount,
      description: `Saida de venda ${loan.id}`,
      relatedTable: 'loans',
      relatedId: loan.id,
    })
  }
  await insertAuditLog(profile, 'loans', loan.id, 'insert', null, { client_id: clientId, total_amount: calculation.totalReceivable })
  return { loanId: loan.id, clientId }
}

export async function listWalletRows(filters: { status?: string; routeId?: string; collectorId?: string; term?: string; page?: number; pageSize?: number } = {}): Promise<WalletRow[]> {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 25
  let query = supabase.from('loans').select('*').order('issued_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.routeId) query = query.eq('route_id', filters.routeId)
  if (filters.collectorId) query = query.eq('collector_id', filters.collectorId)
  const { data: loans, error } = await query
  if (error) throw error
  const loanRows = (loans ?? []) as LoanRecord[]
  const loanIds = loanRows.map((loan) => loan.id)
  const clientIds = [...new Set(loanRows.map((loan) => loan.client_id))]
  const [clients, installments] = await Promise.all([clientIds.length ? fetchClientsByIds(clientIds) : [], loanIds.length ? fetchInstallmentsByLoanIds(loanIds) : []])
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const rows = loanRows.map((loan) => {
    const loanInstallments = installments.filter((installment) => installment.loan_id === loan.id)
    const paidAmount = sum(loanInstallments.map((installment) => installment.paid_amount))
    return {
      loan: { ...loan, paid_amount: paidAmount, remaining_amount: Math.max(loan.total_amount - paidAmount, 0), final_due_date: loanInstallments.at(-1)?.due_date ?? loan.first_due_date },
      client: clientById.get(loan.client_id) ?? null,
      paidInstallments: loanInstallments.filter((installment) => installment.status === 'paid').length,
      pendingInstallments: loanInstallments.filter((installment) => installment.status !== 'paid').length,
    }
  })
  const term = filters.term?.trim().toLowerCase()
  return term ? rows.filter((row) => row.client?.name.toLowerCase().includes(term)) : rows
}

export async function fetchOpenInstallments(): Promise<Array<InstallmentRecord & { loan?: LoanRecord; client?: ClientRecord | null }>> {
  const { data, error } = await supabase.from('installments').select('*').not('status', 'in', '("paid","cancelled")').order('due_date').limit(100)
  if (error) throw error
  const installments = (data ?? []) as InstallmentRecord[]
  const loans = installments.length ? await fetchLoansByIds([...new Set(installments.map((installment) => installment.loan_id))]) : []
  const clients = loans.length ? await fetchClientsByIds([...new Set(loans.map((loan) => loan.client_id))]) : []
  const loanById = new Map(loans.map((loan) => [loan.id, loan]))
  const clientById = new Map(clients.map((client) => [client.id, client]))
  return installments.map((installment) => {
    const loan = loanById.get(installment.loan_id)
    return { ...installment, loan, client: loan ? clientById.get(loan.client_id) ?? null : null }
  })
}

export async function refreshOverdueAlerts(): Promise<void> {
  const { error } = await supabase.rpc('refresh_overdue_alerts')
  if (error && !isMissingRpc(error)) throw error
}

export async function registerPayment(profile: Profile, input: {
  installmentId: string
  amountPaid: number
  paymentDate: string
  paymentMethod: string
  cashboxId?: string
  notes?: string
  dailyLateFeePercent: number
}): Promise<string> {
  const { data: installment, error: installmentError } = await supabase.from('installments').select('*').eq('id', input.installmentId).single()
  if (installmentError) throw installmentError
  const currentInstallment = installment as InstallmentRecord
  const remainingInstallment = Math.max(currentInstallment.amount - currentInstallment.paid_amount, 0)
  const lateFee = calculateLateFee({ remainingInstallmentAmount: remainingInstallment, dailyLateFeePercent: input.dailyLateFeePercent, dueDate: currentInstallment.due_date, paymentDate: input.paymentDate })
  const { data: rpcPaymentId, error: rpcError } = await supabase.rpc('register_installment_payment', {
    p_installment_id: input.installmentId,
    p_amount_paid: input.amountPaid,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_cashbox_id: input.cashboxId ?? null,
    p_notes: input.notes ?? null,
    p_late_fee_amount: lateFee.lateFeeAmount,
  })
  if (!rpcError) return String(rpcPaymentId)
  if (!isMissingRpc(rpcError)) throw rpcError

  const nextPaidAmount = roundMoney(currentInstallment.paid_amount + input.amountPaid)
  const nextStatus = nextPaidAmount >= lateFee.updatedTotal ? 'paid' : 'partial'
  const { data: loan, error: loanError } = await supabase.from('loans').select('*').eq('id', currentInstallment.loan_id).single()
  if (loanError) throw loanError
  const currentLoan = loan as LoanRecord
  const { data: payment, error: paymentError } = await supabase.from('payments').insert({
    owner_id: profile.id,
    client_id: currentLoan.client_id,
    loan_id: currentLoan.id,
    installment_id: currentInstallment.id,
    cashbox_id: input.cashboxId || null,
    amount: input.amountPaid,
    late_fee_amount: lateFee.lateFeeAmount,
    paid_at: input.paymentDate,
    payment_method: input.paymentMethod,
    notes: input.notes || null,
  }).select('id').single()
  if (paymentError) throw paymentError
  const { error: updateInstallmentError } = await supabase.from('installments').update({ paid_amount: nextPaidAmount, status: nextStatus, paid_at: nextStatus === 'paid' ? input.paymentDate : null }).eq('id', currentInstallment.id)
  if (updateInstallmentError) throw updateInstallmentError
  const remainingInstallments = await fetchInstallmentsByLoanIds([currentLoan.id])
  const updatedInstallments = remainingInstallments.map((item) => item.id === currentInstallment.id ? { ...item, paid_amount: nextPaidAmount, status: nextStatus } : item)
  const totalPaid = roundMoney(sum(updatedInstallments.map((item) => item.paid_amount)))
  const remainingAmount = roundMoney(Math.max(currentLoan.total_amount - totalPaid, 0))
  const willBePaid = updatedInstallments.every((item) => item.status === 'paid')
  const { error: updateLoanError } = await supabase.from('loans').update({ paid_amount: totalPaid, remaining_amount: remainingAmount, status: willBePaid ? 'paid' : currentLoan.status }).eq('id', currentLoan.id)
  if (updateLoanError) throw updateLoanError
  if (nextStatus === 'paid') {
    await supabase.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('installment_id', currentInstallment.id).eq('status', 'open')
  }
  if (willBePaid) {
    const { data: activeLoans, error: activeLoansError } = await supabase.from('loans').select('id').eq('client_id', currentLoan.client_id).not('status', 'in', '("paid","cancelled")').limit(1)
    if (activeLoansError) throw activeLoansError
    if (!activeLoans?.length) {
      const { error: clientError } = await supabase.from('clients').update({ status: 'paid_off' }).eq('id', currentLoan.client_id)
      if (clientError) throw clientError
    }
  }
  if (input.cashboxId) {
    await applyCashMovement(profile, {
      cashboxId: input.cashboxId,
      type: 'inflow',
      amount: input.amountPaid,
      description: `Recebimento de parcela ${currentInstallment.installment_number}`,
      relatedTable: 'payments',
      relatedId: currentInstallment.id,
    })
  }
  await insertAuditLog(profile, 'payments', currentInstallment.id, 'insert', null, { amount: input.amountPaid, installment_id: currentInstallment.id })
  return payment.id
}

export async function listCashMovements(): Promise<Array<CashMovementRecord & { cashbox?: CashboxRecord | null }>> {
  const { data, error } = await supabase.from('cash_movements').select('*').order('occurred_at', { ascending: false }).limit(100)
  if (error) throw error
  const movements = (data ?? []) as CashMovementRecord[]
  const cashboxes = movements.length ? await fetchCashboxesByIds([...new Set(movements.map((movement) => movement.cashbox_id))]) : []
  const cashboxById = new Map(cashboxes.map((cashbox) => [cashbox.id, cashbox]))
  return movements.map((movement) => ({ ...movement, cashbox: cashboxById.get(movement.cashbox_id) ?? null }))
}

export async function createManualCashMovement(profile: Profile, input: {
  cashboxId: string
  type: 'inflow' | 'outflow' | 'adjustment'
  amount: number
  description: string
}): Promise<void> {
  const { error } = await supabase.rpc('create_manual_cash_movement', {
    p_cashbox_id: input.cashboxId,
    p_type: input.type,
    p_amount: input.amount,
    p_description: input.description,
  })
  if (error) throw error
}

export async function reverseCashMovement(profile: Profile, movementId: string): Promise<void> {
  const { error } = await supabase.rpc('reverse_cash_movement', { p_movement_id: movementId })
  if (error) throw error
}

export async function registerCollectionContact(profile: Profile, input: {
  clientId: string
  loanId: string
  installmentId: string
  contactType: 'call' | 'message' | 'visit' | 'email' | 'other'
  result: string
  notes?: string
  nextContactAt?: string | null
}): Promise<void> {
  const { data: client, error: clientError } = await supabase.from('clients').select('owner_id').eq('id', input.clientId).single()
  if (clientError) throw clientError
  const { data, error } = await supabase.from('collection_logs').insert({
    owner_id: client.owner_id,
    client_id: input.clientId,
    loan_id: input.loanId,
    installment_id: input.installmentId,
    collector_id: profile.id,
    contact_type: input.contactType,
    result: input.result,
    notes: input.notes ?? null,
    next_contact_at: input.nextContactAt || null,
  }).select('id').single()
  if (error) throw error
  await insertAuditLog(profile, 'collection_logs', data.id, 'insert', null, input)
}

export async function renegotiateLoan(loanId: string, input: { termDays: number; frequency: string; startDate: string }): Promise<number> {
  const { data, error } = await supabase.rpc('renegotiate_loan', {
    p_loan_id: loanId,
    p_term_days: input.termDays,
    p_frequency: input.frequency,
    p_start_date: input.startDate,
  })
  if (error) throw error
  return Number(data)
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  await refreshOverdueAlerts()
  const [walletRows, clients, cashboxes, expenses] = await Promise.all([
    listWalletRows(),
    listClientsWithTotals(),
    listCashboxes(),
    supabase.from('expenses').select('amount, expense_date').gte('expense_date', localIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))),
  ])
  if (expenses.error) throw expenses.error
  const loans = walletRows.map((row) => row.loan)
  return {
    totalInvested: sum(loans.map((loan) => loan.principal_amount)),
    totalReceivable: sum(loans.map((loan) => loan.total_amount)),
    expectedProfit: sum(loans.map((loan) => loan.interest_amount)),
    totalReceived: sum(loans.map((loan) => loan.paid_amount ?? 0)),
    realizedProfit: sum(loans.map((loan) => Math.max((loan.paid_amount ?? 0) - loan.principal_amount, 0))),
    openTotal: sum(loans.map((loan) => loan.remaining_amount ?? 0)),
    overdueTotal: sum(loans.filter((loan) => loan.status === 'overdue' || loan.status === 'defaulted').map((loan) => loan.remaining_amount ?? 0)),
    activeClients: clients.filter((client) => client.status !== 'paid_off').length,
    paidOffClients: clients.filter((client) => client.status === 'paid_off').length,
    overdueLoans: loans.filter((loan) => loan.status === 'overdue' || loan.status === 'defaulted').length,
    dueTodayCount: walletRows.filter((row) => row.loan.final_due_date === localIsoDate()).length,
    monthExpenses: sum(((expenses.data ?? []) as Array<{ amount: number }>).map((expense) => expense.amount)),
    majorCashBalance: sum(cashboxes.filter((cashbox) => cashbox.kind === 'major' || !cashbox.kind).map((cashbox) => cashbox.current_balance)),
    minorCashBalance: sum(cashboxes.filter((cashbox) => cashbox.kind === 'minor').map((cashbox) => cashbox.current_balance)),
    routePerformance: await buildPerformance(loans, 'route_id', 'routes'),
    collectorPerformance: await buildPerformance(loans, 'collector_id', 'profiles'),
  }
}

async function buildPerformance(loans: LoanRecord[], key: 'route_id' | 'collector_id', table: 'routes' | 'profiles'): Promise<Array<{ id: string; name: string; received: number; receivable: number; overdue: number }>> {
  const ids = [...new Set(loans.map((loan) => loan[key]).filter((id): id is string => Boolean(id)))]
  if (!ids.length) return []
  const columns = table === 'routes' ? 'id, name' : 'id, full_name'
  const { data, error } = await supabase.from(table).select(columns).in('id', ids)
  if (error) throw error
  const nameById = new Map((data ?? []).map((row: Record<string, unknown>) => [String(row.id), String(row.name ?? row.full_name ?? row.id)]))
  return ids.map((id) => {
    const rows = loans.filter((loan) => loan[key] === id)
    return {
      id,
      name: nameById.get(id) ?? id,
      received: sum(rows.map((loan) => loan.paid_amount ?? 0)),
      receivable: sum(rows.map((loan) => loan.total_amount)),
      overdue: sum(rows.filter((loan) => loan.status === 'overdue' || loan.status === 'defaulted').map((loan) => loan.remaining_amount ?? 0)),
    }
  })
}

export async function insertAuditLog(profile: Profile, tableName: string, recordId: string | null, action: string, oldData: unknown, newData: unknown): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({ owner_id: profile.id, actor_id: profile.id, table_name: tableName, record_id: recordId, action, old_data: oldData, new_data: newData })
  if (error) throw error
}

async function createClientForSale(ownerId: string, client: SaleFormInput['client'], routeId?: string, affiliateId?: string): Promise<string> {
  const notes = [client.notes, client.rg ? `RG: ${client.rg}` : '', client.whatsapp ? `WhatsApp: ${client.whatsapp}` : '', client.neighborhood ? `Bairro: ${client.neighborhood}` : '', client.reference_point ? `Referencia: ${client.reference_point}` : ''].filter(Boolean).join('\n')
  const { data, error } = await supabase.from('clients').insert({ owner_id: ownerId, route_id: routeId || null, affiliate_id: affiliateId || null, name: client.name, document_number: client.document_number || null, phone: client.phone || null, address: client.address || null, city: client.city || null, notes: notes || null }).select('id').single()
  if (error) throw error
  return data.id
}

async function applyCashMovement(profile: Profile, input: {
  cashboxId: string
  type: 'inflow' | 'outflow' | 'adjustment'
  amount: number
  description: string
  relatedTable: string
  relatedId: string
  reversedMovementId?: string
}): Promise<string> {
  const { data: cashbox, error: cashboxError } = await supabase.from('cashboxes').select('*').eq('id', input.cashboxId).single()
  if (cashboxError) throw cashboxError
  const currentCashbox = cashbox as CashboxRecord
  const nextBalance = input.type === 'inflow'
    ? roundMoney(currentCashbox.current_balance + input.amount)
    : input.type === 'outflow'
      ? roundMoney(currentCashbox.current_balance - input.amount)
      : roundMoney(currentCashbox.current_balance + input.amount)
  if (nextBalance < 0 && !currentCashbox.allow_negative && profile.role !== 'admin') {
    throw new Error('Saldo do caixa não pode ficar negativo sem permissão admin.')
  }
  const { data: movement, error: movementError } = await supabase.from('cash_movements').insert({
    owner_id: currentCashbox.owner_id,
    cashbox_id: input.cashboxId,
    type: input.type,
    amount: input.amount,
    description: input.description,
    reversed_movement_id: input.reversedMovementId ?? null,
  }).select('id').single()
  if (movementError) throw movementError
  const { error: updateError } = await supabase.from('cashboxes').update({ current_balance: nextBalance }).eq('id', input.cashboxId)
  if (updateError) throw updateError
  await insertAuditLog(profile, input.relatedTable, movement?.id ?? input.relatedId, 'update', { current_balance: currentCashbox.current_balance }, { current_balance: nextBalance, movement: input })
  return movement.id
}

async function fetchClientsByIds(ids: string[]): Promise<ClientRecord[]> {
  const { data, error } = await supabase.from('clients').select('id, owner_id, route_id, affiliate_id, name, document_number, phone, email, address, city, state, postal_code, notes, is_active').in('id', ids)
  if (error) throw error
  return (data ?? []) as ClientRecord[]
}

async function fetchLoansByIds(ids: string[]): Promise<LoanRecord[]> {
  const { data, error } = await supabase.from('loans').select('*').in('id', ids)
  if (error) throw error
  return (data ?? []) as LoanRecord[]
}

async function fetchInstallmentsByLoanIds(ids: string[]): Promise<InstallmentRecord[]> {
  const { data, error } = await supabase.from('installments').select('*').in('loan_id', ids)
  if (error) throw error
  return (data ?? []) as InstallmentRecord[]
}

async function fetchCashboxesByIds(ids: string[]): Promise<CashboxRecord[]> {
  const { data, error } = await supabase.from('cashboxes').select('id, owner_id, name, current_balance, status, kind, route_id, allow_negative').in('id', ids)
  if (error) throw error
  return (data ?? []) as CashboxRecord[]
}

function sum(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + (Number(value) || 0), 0))
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || Boolean(error.message?.includes('Could not find the function'))
}
