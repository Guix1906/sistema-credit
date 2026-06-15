import { calculateLateFee } from '../lib/late-fee-calculator'
import { calculateLoan } from '../lib/loan-calculator'
import { localIsoDate } from '../lib/dates'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'
import type { CashboxRecord, ClientRecord, InstallmentRecord, LoanRecord, RouteRecord, SaleFormInput, SelectOptionRecord } from '../types/finance'

const activeCollectorRoles = ['admin', 'gerente', 'manager', 'afiliado', 'cobrador', 'collector']
const registeredAffiliateRoles = ['admin', 'gerente', 'manager', 'afiliado', 'cobrador', 'collector']
const profileOptionColumns = 'id, full_name, email, role, phone, cpf, route_id, commission_rate, permissions, is_active, created_at, updated_at'

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

export type WalletFilterOptions = {
  routes: RouteRecord[]
  collectors: Profile[]
  clients: Array<Pick<ClientRecord, 'id' | 'name' | 'document_number' | 'phone'>>
  statuses: LoanRecord['status'][]
}

export type WalletMetrics = {
  total: number
  open: number
  paid: number
  overdue: number
  clients: number
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

export type EnrichedInstallment = InstallmentRecord & {
  loan?: LoanRecord
  client?: ClientRecord | null
}

export type RecentPaymentRecord = {
  id: string
  installment_id: string
  loan_id: string
  client_id: string
  amount: number
  late_fee_amount: number
  paid_at: string
  payment_method: string
  notes: string | null
  client?: ClientRecord | null
  installment?: InstallmentRecord | null
}

export type BillingStatus = 'a_receber' | 'vence_hoje' | 'pago' | 'parcialmente_pago' | 'em_atraso' | 'cobranca_enviada' | 'negociado' | 'cancelado'
export type BillingChannel = 'whatsapp' | 'call' | 'in_person' | 'other'
export type BillingSource = 'installment' | 'receivable'

export type ReceivableRecord = {
  id: string
  owner_id: string
  client_id: string
  description: string
  amount: number
  paid_amount: number
  due_date: string
  payment_method: string
  status: BillingStatus
  notes: string | null
  responsible_id: string | null
  last_billing_at: string | null
  next_action: string | null
  recurrence: string | null
  paid_at: string | null
  created_at?: string
  updated_at?: string
}

export type BillingHistoryRecord = {
  id: string
  owner_id: string
  client_id: string
  loan_id: string | null
  installment_id: string | null
  receivable_id: string | null
  previous_status: BillingStatus | null
  new_status: BillingStatus
  note: string | null
  responsible_id: string | null
  channel: BillingChannel
  created_at: string
  responsible?: Profile | null
}

export type DailyBillingRow = {
  id: string
  source: BillingSource
  sourceId: string
  ownerId: string
  clientId: string
  loanId: string | null
  installmentId: string | null
  clientName: string
  description: string
  amount: number
  paidAmount: number
  dueDate: string
  paymentMethod: string
  status: BillingStatus
  phone: string | null
  notes: string | null
  responsibleId: string | null
  responsibleName: string | null
  lastBillingAt: string | null
  nextAction: string | null
  recurrence: string | null
  paidAt: string | null
  histories: BillingHistoryRecord[]
  manualReceivable?: ReceivableRecord
}

export type ReceivableInput = {
  clientId: string
  description: string
  amount: number
  dueDate: string
  paymentMethod: string
  notes?: string
  responsibleId?: string
  recurrence?: string
}

export async function getSelectOptions(): Promise<SelectOptionRecord> {
  const [routes, collectors, cashboxes] = await Promise.allSettled([listRoutes(), listCollectors(), listCashboxes()])
  if (collectors.status === 'rejected') throw collectors.reason

  return {
    routes: routes.status === 'fulfilled' ? routes.value.filter((route) => route.is_active) : [],
    collectors: collectors.value,
    cashboxes: cashboxes.status === 'fulfilled' ? cashboxes.value : [],
  }
}

export async function getActiveLoanSettings(ownerId?: string): Promise<LoanSettingsRecord | null> {
  const currentSettings = await supabase.rpc('get_current_loan_settings')
  if (!currentSettings.error) {
    const row = Array.isArray(currentSettings.data) ? currentSettings.data[0] : currentSettings.data
    return (row as LoanSettingsRecord | undefined) ?? null
  }

  if (!isMissingRpc(currentSettings.error)) throw currentSettings.error

  let query = supabase.from('loan_settings').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
  if (ownerId) query = query.eq('owner_id', ownerId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as LoanSettingsRecord | null
}

export async function listRoutes(): Promise<RouteRecord[]> {
  const { data, error } = await supabase.from('routes').select('*').order('name')
  if (error) throw error
  return (data ?? []) as RouteRecord[]
}

export async function listCollectors(): Promise<Profile[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('list_active_collectors')
  if (!rpcError) return (rpcData ?? []) as Profile[]
  if (!isMissingRpc(rpcError)) throw rpcError

  const { data, error } = await supabase.from('profiles').select(profileOptionColumns).in('role', activeCollectorRoles).eq('is_active', true).order('full_name')
  if (error) return listOwnCollectorProfile()
  return (data ?? []) as Profile[]
}

export async function listRegisteredAffiliates(): Promise<Profile[]> {
  const { data: rpcData, error: rpcError } = await supabase.rpc('list_registered_affiliates')
  if (!rpcError) return (rpcData ?? []) as Profile[]
  if (!isMissingRpc(rpcError)) throw rpcError

  const { data, error } = await supabase.from('profiles').select(profileOptionColumns).in('role', registeredAffiliateRoles).order('full_name')
  if (error) return listOwnCollectorProfile({ includeAdmin: true })
  return (data ?? []) as Profile[]
}

async function listOwnCollectorProfile(options: { includeAdmin?: boolean } = {}): Promise<Profile[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return []

  const { data, error } = await supabase.from('profiles').select(profileOptionColumns).eq('id', userData.user.id).maybeSingle()
  if (error || !data || !data.is_active) return []

  const allowedRoles = options.includeAdmin ? registeredAffiliateRoles : activeCollectorRoles
  return allowedRoles.includes(String(data.role)) ? [data as Profile] : []
}

export async function listCashboxes(): Promise<CashboxRecord[]> {
  const { data, error } = await supabase.from('cashboxes').select('id, owner_id, name, current_balance, status, kind, route_id, allow_negative').eq('status', 'open').order('name')
  if (error) throw error
  return (data ?? []) as CashboxRecord[]
}

export async function getWalletFilterOptions(): Promise<WalletFilterOptions> {
  const [routes, collectors, clients, loans] = await Promise.all([
    listRoutes(),
    listRegisteredAffiliates(),
    supabase.from('clients').select('id, name, document_number, phone').order('name').limit(1000),
    supabase.from('loans').select('status'),
  ])
  if (clients.error) throw clients.error
  if (loans.error) throw loans.error
  return {
    routes,
    collectors,
    clients: (clients.data ?? []) as WalletFilterOptions['clients'],
    statuses: [...new Set((loans.data ?? []).map((loan) => loan.status as LoanRecord['status']))].sort(),
  }
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
  validateSaleInput(input)
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

export async function listWalletRows(filters: { status?: string; routeId?: string; collectorId?: string; clientId?: string; term?: string; page?: number; pageSize?: number } = {}): Promise<WalletRow[]> {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 25
  const inheritedLinks = await resolveWalletInheritedLinks(filters)
  let query = supabase.from('loans').select('*').order('issued_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.routeId) query = inheritedLinks.routeClientIds.length
    ? query.or(`route_id.eq.${filters.routeId},client_id.in.(${inheritedLinks.routeClientIds.join(',')})`)
    : query.eq('route_id', filters.routeId)
  if (filters.collectorId) query = inheritedLinks.collectorRouteIds.length || inheritedLinks.collectorClientIds.length
    ? query.or([
      `collector_id.eq.${filters.collectorId}`,
      ...(inheritedLinks.collectorRouteIds.length ? [`route_id.in.(${inheritedLinks.collectorRouteIds.join(',')})`] : []),
      ...(inheritedLinks.collectorClientIds.length ? [`client_id.in.(${inheritedLinks.collectorClientIds.join(',')})`] : []),
    ].join(','))
    : query.eq('collector_id', filters.collectorId)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  const term = filters.term?.trim()
  if (term) {
    const matchingClientIds = await searchWalletClientIds(term)
    if (!matchingClientIds.length) return []
    query = query.in('client_id', matchingClientIds)
  }
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
  return rows
}

export async function getWalletMetrics(filters: { status?: string; routeId?: string; collectorId?: string; clientId?: string; term?: string } = {}): Promise<WalletMetrics> {
  const inheritedLinks = await resolveWalletInheritedLinks(filters)
  let query = supabase.from('loans').select('id, client_id, total_amount')
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.routeId) query = inheritedLinks.routeClientIds.length
    ? query.or(`route_id.eq.${filters.routeId},client_id.in.(${inheritedLinks.routeClientIds.join(',')})`)
    : query.eq('route_id', filters.routeId)
  if (filters.collectorId) query = inheritedLinks.collectorRouteIds.length || inheritedLinks.collectorClientIds.length
    ? query.or([
      `collector_id.eq.${filters.collectorId}`,
      ...(inheritedLinks.collectorRouteIds.length ? [`route_id.in.(${inheritedLinks.collectorRouteIds.join(',')})`] : []),
      ...(inheritedLinks.collectorClientIds.length ? [`client_id.in.(${inheritedLinks.collectorClientIds.join(',')})`] : []),
    ].join(','))
    : query.eq('collector_id', filters.collectorId)
  if (filters.clientId) query = query.eq('client_id', filters.clientId)
  const term = filters.term?.trim()
  if (term) {
    const matchingClientIds = await searchWalletClientIds(term)
    if (!matchingClientIds.length) return { total: 0, open: 0, paid: 0, overdue: 0, clients: 0 }
    query = query.in('client_id', matchingClientIds)
  }
  const { data: loans, error } = await query
  if (error) throw error
  const loanRows = loans ?? []
  if (!loanRows.length) return { total: 0, open: 0, paid: 0, overdue: 0, clients: 0 }
  const installments = await fetchInstallmentsByLoanIds(loanRows.map((loan) => loan.id))
  const paid = sum(installments.map((installment) => installment.paid_amount))
  const overdue = sum(installments
    .filter((installment) => installment.status !== 'paid' && installment.status !== 'cancelled' && (installment.status === 'overdue' || installment.due_date < localIsoDate()))
    .map((installment) => Math.max(installment.amount - installment.paid_amount, 0)))
  const total = sum(loanRows.map((loan) => loan.total_amount))
  return {
    total,
    open: Math.max(total - paid, 0),
    paid,
    overdue,
    clients: new Set(loanRows.map((loan) => loan.client_id)).size,
  }
}

async function searchWalletClientIds(term: string): Promise<string[]> {
  const safeTerm = term.trim().replace(/[,%()]/g, '')
  if (!safeTerm) return []
  const digits = safeTerm.replace(/\D/g, '')
  const terms = digits && digits !== safeTerm ? [safeTerm, digits] : [safeTerm]
  const filters = terms.flatMap((value) => [
    `name.ilike.%${value}%`,
    `document_number.ilike.%${value}%`,
    `phone.ilike.%${value}%`,
    `whatsapp.ilike.%${value}%`,
  ])
  const { data, error } = await supabase.from('clients').select('id').or(filters.join(',')).limit(1000)
  if (error) throw error
  return (data ?? []).map((client) => client.id)
}

async function resolveWalletInheritedLinks(filters: { routeId?: string; collectorId?: string }): Promise<{ routeClientIds: string[]; collectorRouteIds: string[]; collectorClientIds: string[] }> {
  const routeClients = filters.routeId ? await supabase.from('clients').select('id').eq('route_id', filters.routeId) : { data: [], error: null }
  if (routeClients.error) throw routeClients.error
  const collectorRoutes = filters.collectorId ? await supabase.from('routes').select('id').eq('collector_id', filters.collectorId) : { data: [], error: null }
  if (collectorRoutes.error) throw collectorRoutes.error
  const collectorRouteIds = (collectorRoutes.data ?? []).map((route) => route.id)
  const collectorClients = filters.collectorId
    ? await supabase.from('clients').select('id').or([
      `affiliate_id.eq.${filters.collectorId}`,
      ...(collectorRouteIds.length ? [`route_id.in.(${collectorRouteIds.join(',')})`] : []),
    ].join(','))
    : { data: [], error: null }
  if (collectorClients.error) throw collectorClients.error
  return {
    routeClientIds: (routeClients.data ?? []).map((client) => client.id),
    collectorRouteIds,
    collectorClientIds: (collectorClients.data ?? []).map((client) => client.id),
  }
}

function validateSaleInput(input: SaleFormInput): void {
  if (input.mode === 'existing' && !input.existingClientId) throw new Error('Selecione o cliente da venda.')
  if (!input.loan.routeId) throw new Error('Selecione a rota da venda.')
  if (!input.loan.collectorId) throw new Error('Selecione o afiliado responsavel pela venda.')
  if (!(input.loan.borrowedAmount > 0)) throw new Error('Informe um valor emprestado maior que zero.')
  if (!(input.loan.termDays > 0)) throw new Error('Informe a modalidade da venda.')
}

export async function fetchOpenInstallments(): Promise<EnrichedInstallment[]> {
  return fetchInstallmentsForQueue(false)
}

export async function fetchCollectionInstallments(): Promise<EnrichedInstallment[]> {
  return fetchInstallmentsForQueue(true)
}

async function fetchInstallmentsForQueue(includePaid: boolean): Promise<EnrichedInstallment[]> {
  let query = supabase.from('installments').select('*').neq('status', 'cancelled').order('due_date').limit(includePaid ? 1000 : 500)
  if (!includePaid) query = query.neq('status', 'paid')
  const { data, error } = await query
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

export async function listRecentPayments(): Promise<RecentPaymentRecord[]> {
  const { data, error } = await supabase.from('payments').select('*').order('paid_at', { ascending: false }).limit(30)
  if (error) throw error
  const payments = (data ?? []) as RecentPaymentRecord[]
  const clientIds = [...new Set(payments.map((payment) => payment.client_id))]
  const installmentIds = [...new Set(payments.map((payment) => payment.installment_id))]
  const [clients, installments] = await Promise.all([
    clientIds.length ? fetchClientsByIds(clientIds) : [],
    installmentIds.length ? fetchInstallmentsByIds(installmentIds) : [],
  ])
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const installmentById = new Map(installments.map((installment) => [installment.id, installment]))
  return payments.map((payment) => ({
    ...payment,
    client: clientById.get(payment.client_id) ?? null,
    installment: installmentById.get(payment.installment_id) ?? null,
  }))
}

export async function listDailyBillingRows(): Promise<DailyBillingRow[]> {
  await refreshOverdueAlerts()
  const [installments, receivables, collectors] = await Promise.all([
    fetchCollectionInstallments(),
    fetchReceivables(),
    listCollectors(),
  ])
  const histories = await fetchBillingHistory()
  const collectorById = new Map(collectors.map((collector) => [collector.id, collector.full_name]))

  const rowsFromInstallments: DailyBillingRow[] = installments
    .filter((installment) => installment.client)
    .map((installment) => {
      const historiesForItem = histories.filter((history) => history.installment_id === installment.id)
      const latestHistory = historiesForItem[0]
      const loan = installment.loan
      const client = installment.client!
      const baseStatus = resolveInstallmentBillingStatus(installment)
      const status = latestHistory && shouldUseHistoryStatus(baseStatus, latestHistory.new_status) ? latestHistory.new_status : baseStatus
      const responsibleId = loan?.collector_id ?? client.affiliate_id ?? null
      return {
        id: `installment:${installment.id}`,
        source: 'installment',
        sourceId: installment.id,
        ownerId: installment.owner_id,
        clientId: client.id,
        loanId: loan?.id ?? installment.loan_id,
        installmentId: installment.id,
        clientName: client.name,
        description: `Parcela ${installment.installment_number}${loan ? ` da venda ${loan.id.slice(0, 8)}` : ''}`,
        amount: installment.amount,
        paidAmount: installment.paid_amount,
        dueDate: installment.due_date,
        paymentMethod: 'cash',
        status,
        phone: client.whatsapp ?? client.phone,
        notes: latestHistory?.note ?? loan?.notes ?? null,
        responsibleId,
        responsibleName: responsibleId ? collectorById.get(responsibleId) ?? null : null,
        lastBillingAt: latestHistory?.created_at ?? null,
        nextAction: latestHistory?.note ?? null,
        recurrence: loan?.payment_frequency ?? null,
        paidAt: installment.paid_at,
        histories: historiesForItem,
      } satisfies DailyBillingRow
    })

  const clientIds = [...new Set(receivables.map((receivable) => receivable.client_id))]
  const clients = clientIds.length ? await fetchClientsByIds(clientIds) : []
  const clientById = new Map(clients.map((client) => [client.id, client]))
  const rowsFromReceivables: DailyBillingRow[] = receivables.map((receivable) => {
    const historiesForItem = histories.filter((history) => history.receivable_id === receivable.id)
    const client = clientById.get(receivable.client_id)
    return {
      id: `receivable:${receivable.id}`,
      source: 'receivable',
      sourceId: receivable.id,
      ownerId: receivable.owner_id,
      clientId: receivable.client_id,
      loanId: null,
      installmentId: null,
      clientName: client?.name ?? 'Cliente',
      description: receivable.description,
      amount: receivable.amount,
      paidAmount: receivable.paid_amount,
      dueDate: receivable.due_date,
      paymentMethod: receivable.payment_method,
      status: receivable.status,
      phone: client?.whatsapp ?? client?.phone ?? null,
      notes: receivable.notes,
      responsibleId: receivable.responsible_id,
      responsibleName: receivable.responsible_id ? collectorById.get(receivable.responsible_id) ?? null : null,
      lastBillingAt: receivable.last_billing_at ?? historiesForItem[0]?.created_at ?? null,
      nextAction: receivable.next_action,
      recurrence: receivable.recurrence,
      paidAt: receivable.paid_at,
      histories: historiesForItem,
      manualReceivable: receivable,
    }
  })

  return [...rowsFromInstallments, ...rowsFromReceivables].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.clientName.localeCompare(b.clientName))
}

export async function createReceivable(profile: Profile, input: ReceivableInput): Promise<string> {
  validateReceivableInput(input)
  const { data, error } = await supabase.from('receivables').insert({
    owner_id: profile.id,
    client_id: input.clientId,
    description: input.description.trim(),
    amount: input.amount,
    paid_amount: 0,
    due_date: input.dueDate,
    payment_method: input.paymentMethod,
    status: resolveDateBillingStatus(input.dueDate),
    notes: input.notes?.trim() || null,
    responsible_id: input.responsibleId || null,
    recurrence: input.recurrence || null,
  }).select('id').single()
  if (error) throw error
  await insertAuditLog(profile, 'receivables', data.id, 'insert', null, input)
  return data.id
}

export async function updateReceivable(profile: Profile, receivableId: string, input: ReceivableInput): Promise<void> {
  validateReceivableInput(input)
  const { data: current, error: currentError } = await supabase.from('receivables').select('*').eq('id', receivableId).single()
  if (currentError) throw currentError
  const currentReceivable = current as ReceivableRecord
  const nextStatus = currentReceivable.status === 'pago' || currentReceivable.status === 'cancelado' ? currentReceivable.status : resolveDateBillingStatus(input.dueDate)
  const payload = {
    client_id: input.clientId,
    description: input.description.trim(),
    amount: input.amount,
    due_date: input.dueDate,
    payment_method: input.paymentMethod,
    status: nextStatus,
    notes: input.notes?.trim() || null,
    responsible_id: input.responsibleId || null,
    recurrence: input.recurrence || null,
  }
  const { error } = await supabase.from('receivables').update(payload).eq('id', receivableId)
  if (error) throw error
  await insertAuditLog(profile, 'receivables', receivableId, 'update', currentReceivable, payload)
}

export async function deleteReceivable(profile: Profile, receivableId: string): Promise<void> {
  const { data: current, error: currentError } = await supabase.from('receivables').select('*').eq('id', receivableId).single()
  if (currentError) throw currentError
  const { error } = await supabase.from('receivables').delete().eq('id', receivableId)
  if (error) throw error
  await insertAuditLog(profile, 'receivables', receivableId, 'delete', current, null)
}

export async function updateDailyBillingStatus(profile: Profile, row: DailyBillingRow, input: {
  status: BillingStatus
  note?: string
  channel?: BillingChannel
  nextAction?: string
}): Promise<void> {
  const nextStatus = input.status
  if (row.source === 'installment') {
    if (nextStatus === 'pago') {
      const remaining = Math.max(row.amount - row.paidAmount, 0)
      if (remaining > 0 && row.installmentId) {
        await registerPayment(profile, {
          installmentId: row.installmentId,
          amountPaid: remaining,
          paymentDate: localIsoDate(),
          paymentMethod: normalizePaymentMethod(row.paymentMethod),
          notes: input.note || 'Pagamento marcado pela tela Cobrancas.',
          dailyLateFeePercent: 0,
          applyLateFee: false,
          lateFeeDays: 0,
        })
      }
    } else if (nextStatus === 'cancelado' && row.installmentId) {
      const { error } = await supabase.from('installments').update({ status: 'cancelled' }).eq('id', row.installmentId)
      if (error) throw error
    }
  } else {
    const payload: Partial<ReceivableRecord> = {
      status: nextStatus,
      notes: input.note?.trim() ? input.note.trim() : row.notes,
      next_action: input.nextAction?.trim() || row.nextAction,
    }
    if (nextStatus === 'pago') {
      payload.paid_amount = row.amount
      payload.paid_at = localIsoDate()
    }
    if (nextStatus === 'cobranca_enviada' || nextStatus === 'negociado') {
      payload.last_billing_at = new Date().toISOString()
    }
    const { error } = await supabase.from('receivables').update(payload).eq('id', row.sourceId)
    if (error) throw error
  }

  await createBillingHistory(profile, row, {
    previousStatus: row.status,
    newStatus: nextStatus,
    note: input.note,
    channel: input.channel ?? 'other',
  })
}

export async function addBillingObservation(profile: Profile, row: DailyBillingRow, note: string, channel: BillingChannel = 'other'): Promise<void> {
  await createBillingHistory(profile, row, {
    previousStatus: row.status,
    newStatus: row.status,
    note,
    channel,
  })
}

async function createBillingHistory(profile: Profile, row: DailyBillingRow, input: {
  previousStatus: BillingStatus | null
  newStatus: BillingStatus
  note?: string
  channel: BillingChannel
}): Promise<void> {
  const { data, error } = await supabase.from('billing_history').insert({
    owner_id: row.ownerId,
    client_id: row.clientId,
    loan_id: row.loanId,
    installment_id: row.installmentId,
    receivable_id: row.source === 'receivable' ? row.sourceId : null,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    note: input.note?.trim() || null,
    responsible_id: profile.id,
    channel: input.channel,
  }).select('id').single()
  if (error) throw error
  await insertAuditLog(profile, 'billing_history', data.id, 'insert', null, input)
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
  applyLateFee?: boolean
  lateFeeDays?: number
}): Promise<string> {
  const { data: installment, error: installmentError } = await supabase.from('installments').select('*').eq('id', input.installmentId).single()
  if (installmentError) throw installmentError
  const currentInstallment = installment as InstallmentRecord
  const remainingInstallment = Math.max(currentInstallment.amount - currentInstallment.paid_amount, 0)
  const lateFee = calculateLateFee({
    remainingInstallmentAmount: remainingInstallment,
    dailyLateFeePercent: input.applyLateFee === false ? 0 : input.dailyLateFeePercent,
    dueDate: currentInstallment.due_date,
    paymentDate: input.paymentDate,
    fixedDaysLate: input.applyLateFee === false ? 0 : Math.max(1, Math.floor(input.lateFeeDays ?? 1)),
  })
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
  const { data, error } = await supabase.from('clients').insert({
    owner_id: ownerId,
    route_id: routeId || null,
    affiliate_id: affiliateId || null,
    name: client.name,
    document_number: client.document_number || null,
    rg: client.rg || null,
    phone: client.phone || null,
    whatsapp: client.whatsapp || null,
    address: client.address || null,
    neighborhood: client.neighborhood || null,
    city: client.city || null,
    reference_point: client.reference_point || null,
    notes: client.notes || null,
  }).select('id').single()
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

async function fetchReceivables(): Promise<ReceivableRecord[]> {
  const { data, error } = await supabase.from('receivables').select('*').order('due_date', { ascending: true }).limit(1000)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as ReceivableRecord[]
}

async function fetchBillingHistory(): Promise<BillingHistoryRecord[]> {
  const { data, error } = await supabase.from('billing_history').select('*').order('created_at', { ascending: false }).limit(3000)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as BillingHistoryRecord[]
}

function resolveInstallmentBillingStatus(installment: InstallmentRecord): BillingStatus {
  if (installment.status === 'paid') return 'pago'
  if (installment.status === 'partial') return 'parcialmente_pago'
  if (installment.status === 'cancelled') return 'cancelado'
  return resolveDateBillingStatus(installment.due_date)
}

function resolveDateBillingStatus(dueDate: string): BillingStatus {
  const today = localIsoDate()
  if (dueDate < today) return 'em_atraso'
  if (dueDate === today) return 'vence_hoje'
  return 'a_receber'
}

function shouldUseHistoryStatus(baseStatus: BillingStatus, historyStatus: BillingStatus): boolean {
  if (baseStatus === 'pago' || baseStatus === 'parcialmente_pago' || baseStatus === 'cancelado') return false
  return historyStatus === 'cobranca_enviada' || historyStatus === 'negociado'
}

function validateReceivableInput(input: ReceivableInput): void {
  if (!input.clientId) throw new Error('Selecione o cliente do recebimento.')
  if (!input.description.trim()) throw new Error('Informe a descricao do pagamento.')
  if (!(input.amount > 0)) throw new Error('Informe um valor maior que zero.')
  if (!input.dueDate) throw new Error('Informe a data de vencimento.')
  if (!input.paymentMethod) throw new Error('Informe a forma de pagamento.')
}

function normalizePaymentMethod(paymentMethod: string): string {
  return ['cash', 'pix', 'bank_transfer', 'debit_card', 'credit_card', 'other'].includes(paymentMethod) ? paymentMethod : 'cash'
}

async function fetchClientsByIds(ids: string[]): Promise<ClientRecord[]> {
  const { data, error } = await supabase.from('clients').select('id, owner_id, route_id, affiliate_id, name, document_number, rg, phone, whatsapp, email, address, neighborhood, city, state, postal_code, reference_point, notes, status, is_active').in('id', ids)
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

async function fetchInstallmentsByIds(ids: string[]): Promise<InstallmentRecord[]> {
  const { data, error } = await supabase.from('installments').select('*').in('id', ids)
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

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || Boolean(error.message?.includes('Could not find the table'))
}
