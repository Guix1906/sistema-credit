import { localIsoDate } from './dates'

export type LateFeeInput = {
  remainingInstallmentAmount: number
  dailyLateFeePercent: number
  dueDate: string
  paymentDate?: string
}

export type LateFeeResult = {
  daysLate: number
  lateFeeAmount: number
  updatedTotal: number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function calculateLateFee(input: LateFeeInput): LateFeeResult {
  const paymentDate = normalizeDate(input.paymentDate ?? localIsoDate())
  const dueDate = normalizeDate(input.dueDate)
  const daysLate = Math.max(0, Math.floor((paymentDate.getTime() - dueDate.getTime()) / DAY_IN_MS))
  const lateFeeAmount = roundMoney((input.remainingInstallmentAmount * input.dailyLateFeePercent * daysLate) / 100)

  return {
    daysLate,
    lateFeeAmount,
    updatedTotal: roundMoney(input.remainingInstallmentAmount + lateFeeAmount),
  }
}

function normalizeDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
