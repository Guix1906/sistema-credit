import { describe, expect, it } from 'vitest'

import { calculateLateFee } from './late-fee-calculator'

describe('calculateLateFee', () => {
  it('calcula multa apenas sobre a parcela vencida', () => {
    const result = calculateLateFee({
      remainingInstallmentAmount: 12,
      dailyLateFeePercent: 20,
      dueDate: '2026-05-27',
      paymentDate: '2026-05-29',
    })

    expect(result.daysLate).toBe(2)
    expect(result.lateFeeAmount).toBe(4.8)
    expect(result.updatedTotal).toBe(16.8)
  })
})
