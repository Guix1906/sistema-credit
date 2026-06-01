import { describe, expect, it } from 'vitest'

import { evaluateAccessWindow } from './access-window'

const config = {
  openingTime: '08:00',
  closingTime: '18:00',
  allowedDays: [1, 2, 3, 4, 5],
  timezone: 'America/Sao_Paulo',
  allowAdminOutsideHours: true,
}

describe('evaluateAccessWindow', () => {
  it('permite acesso dentro do horario configurado', () => {
    const decision = evaluateAccessWindow(config, 'atendente', new Date('2026-05-29T15:00:00Z'))

    expect(decision.allowed).toBe(true)
    expect(decision.currentTime).toBe('2026-05-29 12:00')
  })

  it('bloqueia acesso fora do horario e informa o proximo acesso', () => {
    const decision = evaluateAccessWindow(config, 'cobrador', new Date('2026-05-29T23:00:00Z'))

    expect(decision.allowed).toBe(false)

    if (!decision.allowed) {
      expect(decision.currentTime).toBe('2026-05-29 20:00')
      expect(decision.openingTime).toBe('08:00')
      expect(decision.closingTime).toBe('18:00')
      expect(decision.nextAllowedAt).toBe('2026-06-01 08:00')
    }
  })

  it('permite admin fora do horario quando configurado', () => {
    const decision = evaluateAccessWindow(config, 'admin', new Date('2026-05-29T23:00:00Z'))

    expect(decision.allowed).toBe(true)
  })
})
