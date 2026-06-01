import { localIsoDate } from './dates'

export type LoanTermDays = 20 | 24 | 30
export type PaymentFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export type LoanCalculationInput = {
  borrowedAmount: number
  termDays: LoanTermDays
  paymentFrequency: PaymentFrequency
  interestRatePercent?: number
  startDate?: Date | string
}

export type CalculatedInstallment = {
  installmentNumber: number
  dueDate: string
  amount: number
}

export type LoanCalculationResult = {
  borrowedAmount: number
  interestRatePercent: number
  interestAmount: number
  totalReceivable: number
  expectedProfit: number
  termDays: LoanTermDays
  paymentFrequency: PaymentFrequency
  installmentCount: number
  installmentAmount: number
  installments: CalculatedInstallment[]
}

const DEFAULT_INTEREST_RATE_PERCENT = 20
export function calculateLoan(input: LoanCalculationInput): LoanCalculationResult {
  const borrowedAmountInCents = toCents(input.borrowedAmount)
  const interestRatePercent = input.interestRatePercent ?? DEFAULT_INTEREST_RATE_PERCENT

  if (borrowedAmountInCents <= 0) {
    throw new Error('O valor emprestado deve ser maior que zero.')
  }

  if (interestRatePercent < 0) {
    throw new Error('A taxa de juros não pode ser negativa.')
  }

  const dueDays = getInstallmentDueDays(input.termDays, input.paymentFrequency)
  const interestAmountInCents = Math.round((borrowedAmountInCents * interestRatePercent) / 100)
  const totalReceivableInCents = borrowedAmountInCents + interestAmountInCents
  const installmentAmounts = splitAmountInCents(totalReceivableInCents, dueDays.length)
  const startDate = normalizeDate(input.startDate ?? new Date())

  const installments = dueDays.map((dueDay, index) => ({
    installmentNumber: index + 1,
    dueDate: addDays(startDate, dueDay),
    amount: fromCents(installmentAmounts[index]),
  }))

  return {
    borrowedAmount: fromCents(borrowedAmountInCents),
    interestRatePercent,
    interestAmount: fromCents(interestAmountInCents),
    totalReceivable: fromCents(totalReceivableInCents),
    expectedProfit: fromCents(interestAmountInCents),
    termDays: input.termDays,
    paymentFrequency: input.paymentFrequency,
    installmentCount: dueDays.length,
    installmentAmount: fromCents(installmentAmounts[0]),
    installments,
  }
}

function getInstallmentDueDays(termDays: LoanTermDays, frequency: PaymentFrequency): number[] {
  if (frequency === 'daily') {
    return Array.from({ length: termDays }, (_, index) => index + 1)
  }

  if (frequency === 'monthly') {
    return [termDays]
  }

  const interval = frequency === 'weekly' ? 7 : 15
  const days: number[] = []

  for (let dueDay = interval; dueDay < termDays; dueDay += interval) {
    days.push(dueDay)
  }

  days.push(termDays)
  return days
}

function splitAmountInCents(totalInCents: number, parts: number): number[] {
  const baseAmount = Math.floor(totalInCents / parts)
  const remainder = totalInCents % parts

  return Array.from({ length: parts }, (_, index) => baseAmount + (index < remainder ? 1 : 0))
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

function fromCents(value: number): number {
  return value / 100
}

function normalizeDate(value: Date | string): Date {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): string {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return localIsoDate(result)
}
