import { describe, expect, it } from 'vitest'

import { maskDocument, maskPhone } from './masks'

describe('masks', () => {
  it('formata CPF e CNPJ', () => {
    expect(maskDocument('12345678901')).toBe('123.456.789-01')
    expect(maskDocument('12345678000199')).toBe('12.345.678/0001-99')
  })

  it('formata telefone fixo e celular', () => {
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
    expect(maskPhone('11999998888')).toBe('(11) 99999-8888')
  })
})
