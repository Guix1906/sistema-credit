import type { BillingStatus } from '../services/finance-service'
import type { LoanRecord } from '../types/finance'

export type CollectionSettlementStatus = 'renewed' | 'finishing' | 'overdue' | 'current' | 'paid' | 'inactive'

export type CollectionSettlementInput = {
  pendingInstallments: number
  loanStatus: LoanRecord['status'] | null
  status: BillingStatus
  loanFinalDueDate: string | null
  dueDate: string
  loanNotes: string | null
  notes: string | null
  loanIssuedAt: string | null
}

export const settlementBadgeLabels: Record<CollectionSettlementStatus, string> = {
  renewed: 'Renovado recentemente',
  finishing: 'Terminando de quitar',
  overdue: 'Quitacao em atraso',
  current: 'Em dia',
  paid: 'Pago',
  inactive: 'Finalizado',
}

export const settlementClassNames: Record<CollectionSettlementStatus, string> = {
  renewed: 'settlement-renewed',
  finishing: 'settlement-finishing',
  overdue: 'settlement-overdue',
  current: 'settlement-current',
  paid: 'settlement-paid',
  inactive: 'settlement-inactive',
}

export function resolveSettlementStatus(row: CollectionSettlementInput, today: string): CollectionSettlementStatus {
  if (row.status === 'cancelado' || row.loanStatus === 'cancelled') return 'inactive'
  if (row.pendingInstallments <= 0 || row.loanStatus === 'paid' || row.status === 'pago') return 'paid'
  if (isPastSettlementDeadline(row, today)) return 'overdue'
  if (isRecentlyRenewed(row, today)) return 'renewed'
  if (row.pendingInstallments <= 3) return 'finishing'
  return 'current'
}

export function isPastSettlementDeadline(row: CollectionSettlementInput, today: string): boolean {
  const deadline = row.loanFinalDueDate ?? row.dueDate
  return row.pendingInstallments > 0 && deadline < today
}

export function isRecentlyRenewed(row: CollectionSettlementInput, today: string): boolean {
  const notes = normalizeText(row.loanNotes ?? row.notes ?? '')
  const hasRenewalMarker = notes.includes('renegociado') || notes.includes('renovado') || notes.includes('renovacao')
  if (!hasRenewalMarker) return false
  const noteDate = extractFirstIsoDate(notes)
  const referenceDate = noteDate ?? row.loanIssuedAt
  return Boolean(referenceDate && daysBetween(referenceDate, today) <= 7)
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function extractFirstIsoDate(value: string): string | null {
  return value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso.slice(0, 10)}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000))
}
