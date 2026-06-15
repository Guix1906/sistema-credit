import { describe, expect, it } from 'vitest'

import { isAdminRole, isRoleAllowed, normalizeUserRole } from './roles'

describe('role helpers', () => {
  it('normaliza papeis legados para os papeis usados no menu', () => {
    expect(normalizeUserRole('owner')).toBe('admin')
    expect(normalizeUserRole('administrador')).toBe('admin')
    expect(normalizeUserRole('manager')).toBe('gerente')
    expect(normalizeUserRole('collector')).toBe('cobrador')
    expect(normalizeUserRole('operator')).toBe('atendente')
  })

  it('libera rotas de gerente para perfis legados de manager', () => {
    expect(isRoleAllowed(['admin', 'gerente'], 'manager')).toBe(true)
    expect(isRoleAllowed(['admin'], 'manager')).toBe(false)
  })

  it('reconhece aliases administrativos', () => {
    expect(isAdminRole('Administrador')).toBe(true)
    expect(isAdminRole('gerente')).toBe(false)
  })
})
