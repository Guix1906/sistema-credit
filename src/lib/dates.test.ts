import { describe, expect, it } from 'vitest'

import { localIsoDate } from './dates'
import { formatDate } from './formatters'

describe('date helpers', () => {
  it('keeps a local calendar day for form fields', () => {
    expect(localIsoDate(new Date(2026, 4, 31, 23, 30))).toBe('2026-05-31')
  })

  it('does not move a UTC midnight payment to the previous day', () => {
    expect(formatDate('2026-05-31T00:00:00+00:00')).toBe('31/05/2026')
  })
})
