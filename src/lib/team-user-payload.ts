import { nullableText, toNumber } from './formatters'
import type { UserRole } from '../types/auth'

export type TeamUserProfilePayload = {
  full_name: string
  email: string
  phone: string | null
  cpf: string | null
  role: UserRole
  route_id: string | null
  commission_rate: number
  is_active: boolean
}

export type CreateTeamUserBody = {
  fullName: string
  email: string
  password: string
  phone: string | null
  cpf: string | null
  role: UserRole
  routeId: string | null
  commissionRate: number
}

export type UpdateTeamUserBody = Omit<CreateTeamUserBody, 'password'> & {
  userId: string
  isActive: boolean
}

export function buildTeamUserProfilePayload(formData: FormData): TeamUserProfilePayload {
  return {
    full_name: String(formData.get('fullName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    phone: nullableText(formData.get('phone')),
    cpf: nullableText(formData.get('cpf')),
    role: String(formData.get('role')) as UserRole,
    route_id: nullableText(formData.get('routeId')),
    commission_rate: toNumber(formData.get('commissionRate')),
    is_active: formData.get('status') !== 'inactive',
  }
}

export function buildCreateTeamUserBody(formData: FormData): CreateTeamUserBody {
  const payload = buildTeamUserProfilePayload(formData)
  return {
    fullName: payload.full_name,
    email: payload.email,
    password: String(formData.get('password') ?? ''),
    phone: payload.phone,
    cpf: payload.cpf,
    role: payload.role,
    routeId: payload.route_id,
    commissionRate: payload.commission_rate,
  }
}

export function buildUpdateTeamUserBody(userId: string, payload: TeamUserProfilePayload): UpdateTeamUserBody {
  return {
    userId,
    fullName: payload.full_name,
    email: payload.email,
    phone: payload.phone,
    cpf: payload.cpf,
    role: payload.role,
    routeId: payload.route_id,
    commissionRate: payload.commission_rate,
    isActive: payload.is_active,
  }
}
