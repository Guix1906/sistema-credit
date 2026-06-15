import { describe, expect, it } from 'vitest'

import { getUserDisplayName } from './user-display-name'
import type { Profile } from '../types/auth'

const baseProfile: Profile = {
  id: 'user-1',
  full_name: 'Guilherme Silva',
  email: 'guigos191@gmail.com',
  role: 'admin',
  is_active: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

describe('getUserDisplayName', () => {
  it('prioriza o nome do profile antes do e-mail do auth', () => {
    expect(getUserDisplayName(baseProfile, { email: 'guigos191@gmail.com', user_metadata: {} } as never)).toBe('Guilherme Silva')
  })

  it('usa metadata do auth quando o profile nao tem nome', () => {
    expect(getUserDisplayName({ ...baseProfile, full_name: '' }, { email: 'guigos191@gmail.com', user_metadata: { name: 'Nome Metadata' } } as never)).toBe('Nome Metadata')
  })

  it('usa e-mail como fallback seguro', () => {
    expect(getUserDisplayName(null, { email: 'guigos191@gmail.com', user_metadata: {} } as never)).toBe('guigos191@gmail.com')
  })
})
