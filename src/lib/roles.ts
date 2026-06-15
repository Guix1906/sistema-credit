import type { UserRole } from '../types/auth'

const roleAliases: Record<string, UserRole> = {
  admin: 'admin',
  administrador: 'admin',
  owner: 'admin',
  gerente: 'gerente',
  gestor: 'gerente',
  manager: 'gerente',
  afiliado: 'afiliado',
  affiliate: 'afiliado',
  cobrador: 'cobrador',
  collector: 'cobrador',
  atendente: 'atendente',
  operator: 'atendente',
}

export function normalizeUserRole(role: unknown): UserRole | null {
  if (typeof role !== 'string') return null
  return roleAliases[role.trim().toLowerCase()] ?? null
}

export function isAdminRole(role: unknown): boolean {
  return normalizeUserRole(role) === 'admin'
}

export function isRoleAllowed(allowedRoles: readonly UserRole[] | undefined, role: unknown): boolean {
  if (!allowedRoles?.length) return true
  const normalizedRole = normalizeUserRole(role)
  return Boolean(normalizedRole && allowedRoles.includes(normalizedRole))
}
