import { supabase } from '../lib/supabase'

export type DashboardPeriod = '12m' | 'month' | '30d'

export type DashboardChartPoint = {
  label: string
  expected: number
  received: number
}

export type DashboardAlert = {
  id: string
  title: string
  message: string
  severity: string
  createdAt: string
}

export type DashboardRiskClient = {
  clientId: string
  name: string
  daysLate: number
  overdueTotal: number
}

export type DashboardLatestSale = {
  id: string
  clientId: string
  clientName: string
  total: number
  date: string
  status: string
}

export type DashboardLatestPayment = {
  id: string
  clientId: string
  clientName: string
  total: number
  date: string
  method: string
}

export type PremiumDashboardData = {
  totalBorrowed: number
  totalPortfolio: number
  totalReceivable: number
  totalReceived: number
  receivedToday: number
  receivedMonth: number
  expectedProfit: number
  realizedProfit: number
  overdueTotal: number
  monthlyVariation: number | null
  dueTodayCount: number
  inCollectionCount: number
  overdueCount: number
  paidCount: number
  activeLoansCount: number
  activeClientsCount: number
  chart: DashboardChartPoint[]
  alerts: DashboardAlert[]
  riskClients: DashboardRiskClient[]
  latestSales: DashboardLatestSale[]
  latestPayments: DashboardLatestPayment[]
}

type LoanRow = {
  id: string
  client_id: string
  total_amount: number
  interest_amount: number
  paid_amount: number
  remaining_amount: number
  status: string
  issued_at: string
}

type InstallmentRow = {
  id: string
  loan_id: string
  due_date: string
  amount: number
  paid_amount: number
  status: string
}

type PaymentRow = {
  id: string
  client_id: string
  amount: number
  paid_at: string
  payment_method: string
}

const dashboardFallback: PremiumDashboardData = {
  totalBorrowed: 0,
  totalPortfolio: 0,
  totalReceivable: 0,
  totalReceived: 0,
  receivedToday: 0,
  receivedMonth: 0,
  expectedProfit: 0,
  realizedProfit: 0,
  overdueTotal: 0,
  monthlyVariation: null,
  dueTodayCount: 0,
  inCollectionCount: 0,
  overdueCount: 0,
  paidCount: 0,
  activeLoansCount: 0,
  activeClientsCount: 0,
  chart: [],
  alerts: [],
  riskClients: [],
  latestSales: [],
  latestPayments: [],
}

export function getDashboardFallback(): PremiumDashboardData {
  return dashboardFallback
}

export async function getPremiumDashboardData(period: DashboardPeriod, referenceDate: string): Promise<PremiumDashboardData> {
  const { error: refreshError } = await supabase.rpc('refresh_overdue_alerts')
  if (refreshError) throw refreshError
  const [loansResult, installmentsResult, paymentsResult, alertsResult] = await Promise.all([
    supabase.from('loans').select('id, client_id, total_amount, interest_amount, paid_amount, remaining_amount, status, issued_at').order('issued_at', { ascending: false }).limit(1000),
    supabase.from('installments').select('id, loan_id, due_date, amount, paid_amount, status').neq('status', 'cancelled').order('due_date', { ascending: true }).limit(1000),
    supabase.from('payments').select('id, client_id, amount, paid_at, payment_method').order('paid_at', { ascending: false }).limit(1000),
    supabase.from('alerts').select('id, title, message, severity, created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(3),
  ])

  const firstError = loansResult.error ?? installmentsResult.error ?? paymentsResult.error ?? alertsResult.error
  if (firstError) throw firstError

  const loans = (loansResult.data ?? []) as LoanRow[]
  const installments = (installmentsResult.data ?? []) as InstallmentRow[]
  const payments = (paymentsResult.data ?? []) as PaymentRow[]
  const loanMap = new Map(loans.map((loan) => [loan.id, loan]))
  const today = startOfDay(referenceDate)

  const overdueInstallments = installments.filter((installment) => {
    return installment.status !== 'paid' && startOfDay(installment.due_date) < today
  })

  const riskByClient = new Map<string, { daysLate: number; overdueTotal: number }>()
  overdueInstallments.forEach((installment) => {
    const loan = loanMap.get(installment.loan_id)
    if (!loan) return
    const previous = riskByClient.get(loan.client_id) ?? { daysLate: 0, overdueTotal: 0 }
    riskByClient.set(loan.client_id, {
      daysLate: Math.max(previous.daysLate, daysBetween(startOfDay(installment.due_date), today)),
      overdueTotal: previous.overdueTotal + remainingInstallmentValue(installment),
    })
  })

  const latestLoans = loans.slice(0, 5)
  const latestPayments = payments.slice(0, 5)
  const clientIds = Array.from(new Set([
    ...latestLoans.map((loan) => loan.client_id),
    ...latestPayments.map((payment) => payment.client_id),
    ...riskByClient.keys(),
  ]))
  const clientsResult = clientIds.length
    ? await supabase.from('clients').select('id, name').in('id', clientIds)
    : { data: [], error: null }
  if (clientsResult.error) throw clientsResult.error
  const clientNames = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]))
  const activeLoans = loans.filter((loan) => loan.status !== 'paid' && loan.status !== 'cancelled' && loan.remaining_amount > 0)

  return {
    totalBorrowed: sum(loans, (loan) => loan.total_amount - loan.interest_amount),
    totalPortfolio: sum(loans, (loan) => loan.total_amount),
    totalReceivable: sum(loans, (loan) => loan.remaining_amount),
    totalReceived: sum(payments, (payment) => payment.amount),
    receivedToday: sum(payments.filter((payment) => dayKey(startOfDay(payment.paid_at)) === dayKey(today)), (payment) => payment.amount),
    receivedMonth: sum(payments.filter((payment) => monthKey(startOfDay(payment.paid_at)) === monthKey(today)), (payment) => payment.amount),
    expectedProfit: sum(loans, (loan) => loan.interest_amount),
    realizedProfit: sum(loans, (loan) => Math.min(loan.interest_amount, Math.max(loan.paid_amount - (loan.total_amount - loan.interest_amount), 0))),
    overdueTotal: sum(overdueInstallments, remainingInstallmentValue),
    monthlyVariation: getMonthlyVariation(payments, today),
    dueTodayCount: installments.filter((installment) => installment.status !== 'paid' && installment.due_date === referenceDate).length,
    inCollectionCount: riskByClient.size,
    overdueCount: overdueInstallments.length,
    paidCount: installments.filter((installment) => installment.status === 'paid').length,
    activeLoansCount: activeLoans.length,
    activeClientsCount: new Set(activeLoans.map((loan) => loan.client_id)).size,
    chart: createChart(period, today, installments, payments),
    alerts: (alertsResult.data ?? []).map((alert) => ({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      severity: alert.severity,
      createdAt: alert.created_at,
    })),
    riskClients: Array.from(riskByClient.entries())
      .map(([clientId, risk]) => ({ clientId, name: clientNames.get(clientId) ?? 'Cliente', ...risk }))
      .sort((a, b) => b.daysLate - a.daysLate || b.overdueTotal - a.overdueTotal)
      .slice(0, 5),
    latestSales: latestLoans.map((loan) => ({
      id: loan.id,
      clientId: loan.client_id,
      clientName: clientNames.get(loan.client_id) ?? 'Cliente',
      total: loan.total_amount,
      date: loan.issued_at,
      status: loan.status,
    })),
    latestPayments: latestPayments.map((payment) => ({
      id: payment.id,
      clientId: payment.client_id,
      clientName: clientNames.get(payment.client_id) ?? 'Cliente',
      total: payment.amount,
      date: payment.paid_at,
      method: payment.payment_method,
    })),
  }
}

function createChart(period: DashboardPeriod, referenceDate: Date, installments: InstallmentRow[], payments: PaymentRow[]): DashboardChartPoint[] {
  const buckets = period === '12m' ? createMonthBuckets(referenceDate) : createDayBuckets(referenceDate, period === 'month' ? referenceDate.getDate() : 30)
  const pointMap = new Map(buckets.map((bucket) => [bucket.key, bucket]))

  installments.forEach((installment) => {
    const point = pointMap.get(bucketKey(period, startOfDay(installment.due_date)))
    if (point) point.expected += installment.amount
  })
  payments.forEach((payment) => {
    const point = pointMap.get(bucketKey(period, startOfDay(payment.paid_at)))
    if (point) point.received += payment.amount
  })
  return buckets.map(({ label, expected, received }) => ({ label, expected, received }))
}

function createMonthBuckets(referenceDate: Date) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 11 + index, 1)
    return { key: monthKey(date), label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), expected: 0, received: 0 }
  })
}

function createDayBuckets(referenceDate: Date, quantity: number) {
  return Array.from({ length: quantity }, (_, index) => {
    const date = new Date(referenceDate)
    date.setDate(referenceDate.getDate() - quantity + index + 1)
    return { key: dayKey(date), label: String(date.getDate()).padStart(2, '0'), expected: 0, received: 0 }
  })
}

function getMonthlyVariation(payments: PaymentRow[], referenceDate: Date): number | null {
  const currentMonth = monthKey(referenceDate)
  const previous = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1)
  const previousMonth = monthKey(previous)
  const currentTotal = sum(payments.filter((payment) => monthKey(startOfDay(payment.paid_at)) === currentMonth), (payment) => payment.amount)
  const previousTotal = sum(payments.filter((payment) => monthKey(startOfDay(payment.paid_at)) === previousMonth), (payment) => payment.amount)
  return previousTotal ? ((currentTotal - previousTotal) / previousTotal) * 100 : null
}

function bucketKey(period: DashboardPeriod, date: Date) {
  return period === '12m' ? monthKey(date) : dayKey(date)
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfDay(value: string | Date) {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00`) : new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000)
}

function remainingInstallmentValue(installment: InstallmentRow) {
  return Math.max(installment.amount - installment.paid_amount, 0)
}

function sum<T>(rows: T[], selector: (row: T) => number) {
  return rows.reduce((total, row) => total + Number(selector(row) || 0), 0)
}
