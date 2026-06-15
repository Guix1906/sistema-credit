import { describe, expect, it } from 'vitest'

import { buildCreateTeamUserBody, buildTeamUserProfilePayload, buildUpdateTeamUserBody } from './team-user-payload'

function makeFormData(entries: Record<string, string>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value)
  }
  return formData
}

describe('team user payloads', () => {
  it('monta todos os campos para criar afiliado/cobrador', () => {
    const body = buildCreateTeamUserBody(makeFormData({
      fullName: ' Maria Afiliada ',
      email: ' MARIA@EXEMPLO.COM ',
      password: '123456',
      phone: '(11) 99999-1111',
      cpf: '123.456.789-00',
      role: 'afiliado',
      routeId: 'route-1',
      commissionRate: '12,5',
    }))

    expect(body).toEqual({
      fullName: 'Maria Afiliada',
      email: 'maria@exemplo.com',
      password: '123456',
      phone: '(11) 99999-1111',
      cpf: '123.456.789-00',
      role: 'afiliado',
      routeId: 'route-1',
      commissionRate: 12.5,
    })
  })

  it('monta payload de edicao com status e campos opcionais nulos', () => {
    const payload = buildTeamUserProfilePayload(makeFormData({
      fullName: 'Joao Cobrador',
      email: 'joao@exemplo.com',
      phone: '',
      cpf: '',
      role: 'cobrador',
      routeId: '',
      commissionRate: '',
      status: 'inactive',
    }))

    expect(payload).toEqual({
      full_name: 'Joao Cobrador',
      email: 'joao@exemplo.com',
      phone: null,
      cpf: null,
      role: 'cobrador',
      route_id: null,
      commission_rate: 0,
      is_active: false,
    })
    expect(buildUpdateTeamUserBody('user-1', payload)).toEqual({
      userId: 'user-1',
      fullName: 'Joao Cobrador',
      email: 'joao@exemplo.com',
      phone: null,
      cpf: null,
      role: 'cobrador',
      routeId: null,
      commissionRate: 0,
      isActive: false,
    })
  })
})
