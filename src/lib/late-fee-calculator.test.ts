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

  it('aplica um dia minimo de multa quando solicitado', () => {
    const result = calculateLateFee({
      remainingInstallmentAmount: 12,
      dailyLateFeePercent: 20,
      dueDate: '2026-06-15',
      paymentDate: '2026-06-14',
      minDaysLate: 1,
    })

    expect(result.daysLate).toBe(1)
    expect(result.lateFeeAmount).toBe(2.4)
    expect(result.updatedTotal).toBe(14.4)
  })

  it('usa a quantidade manual de dias de multa quando informada', () => {
    const result = calculateLateFee({
      remainingInstallmentAmount: 12,
      dailyLateFeePercent: 20,
      dueDate: '2026-06-15',
      paymentDate: '2026-06-14',
      fixedDaysLate: 3,
    })

    expect(result.daysLate).toBe(3)
    expect(result.lateFeeAmount).toBe(7.2)
    expect(result.updatedTotal).toBe(19.2)
  })
})
