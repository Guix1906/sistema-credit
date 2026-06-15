import { describe, expect, it } from 'vitest'

import { createWhatsappUrl } from './contact-links'

describe('createWhatsappUrl', () => {
  it('remove formatacao antes de montar o link', () => {
    expect(createWhatsappUrl('(11) 99999-1234')).toBe('https://wa.me/11999991234')
  })

  it('retorna nulo quando nao ha telefone', () => {
    expect(createWhatsappUrl('')).toBeNull()
    expect(createWhatsappUrl(null)).toBeNull()
  })

  it('inclui mensagem codificada quando informada', () => {
    expect(createWhatsappUrl('(11) 99999-1234', 'Ola cliente')).toBe('https://wa.me/11999991234?text=Ola%20cliente')
  })
})
