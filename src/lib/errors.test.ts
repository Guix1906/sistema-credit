import { describe, expect, it } from 'vitest'

import { getOperationErrorMessage } from './errors'

describe('getOperationErrorMessage', () => {
  it('traduz falhas de rede para uma orientacao clara', () => {
    expect(getOperationErrorMessage(new TypeError('Failed to fetch'), 'cadastrar a rota')).toBe(
      'Nao foi possivel cadastrar a rota. Verifique sua conexao e tente novamente.',
    )
  })

  it('preserva mensagens retornadas pelo Supabase', () => {
    expect(getOperationErrorMessage(new Error('Permissao negada'), 'cadastrar a rota')).toBe('Permissao negada')
  })
})
