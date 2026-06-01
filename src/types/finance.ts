import type { PaymentFrequency, LoanTermDays } from '../lib/loan-calculator'
import type { Profile } from './auth'

export type RouteRecord = {
  id: string
  owner_id: string
  name: string
  description: string | null
  collector_id: string | null
  city?: string | null
  neighborhood?: string | null
  goal_amount?: number
  is_active: boolean
}

export type ClientRecord = {
  id: string
  owner_id: string
  route_id: string | null
  name: string
  document_number: string | null
  rg?: string | null
  phone: string | null
  whatsapp?: string | null
  email: string | null
  address: string | null
  neighborhood?: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  reference_point?: string | null
  notes: string | null
  status?: 'active' | 'paid_off' | 'overdue' | 'inactive'
  is_active: boolean
}

export type LoanRecord = {
  id: string
  owner_id: string
  client_id: string
  route_id?: string | null
  collector_id?: string | null
  principal_amount: number
  interest_amount: number
  total_amount: number
  paid_amount?: number
  remaining_amount?: number
  issued_at: string
  first_due_date: string
  final_due_date?: string
  payment_frequency?: PaymentFrequency
  term_days?: LoanTermDays
  interest_rate?: number
  status: 'draft' | 'active' | 'paid' | 'overdue' | 'cancelled' | 'defaulted'
  notes: string | null
}

export type InstallmentRecord = {
  id: string
  owner_id: string
  loan_id: string
  installment_number: number
  due_date: string
  amount: number
  paid_amount: number
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  paid_at: string | null
}

export type CashboxRecord = {
  id: string
  owner_id: string
  route_id?: string | null
  name: string
  kind?: 'major' | 'minor' | 'route'
  current_balance: number
  allow_negative?: boolean
  status: 'open' | 'closed'
}

export type SaleFormInput = {
  mode: 'existing' | 'new'
  existingClientId?: string
  client: {
    name: string
    document_number?: string
    rg?: string
    phone?: string
    whatsapp?: string
    address?: string
    neighborhood?: string
    city?: string
    reference_point?: string
    notes?: string
  }
  loan: {
    borrowedAmount: number
    interestRatePercent: number
    termDays: LoanTermDays
    paymentFrequency: PaymentFrequency
    startDate: string
    routeId?: string
    collectorId?: string
    cashboxId?: string
  }
}

export type SelectOptionRecord = {
  routes: RouteRecord[]
  collectors: Profile[]
  cashboxes: CashboxRecord[]
}
