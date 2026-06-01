import { describe, expect, it } from 'vitest'

import { calculateLoan } from './loan-calculator'

describe('calculateLoan', () => {
  it('calcula R$ 200 em 20 dias com 20 parcelas diarias de R$ 12', () => {
    const result = calculateLoan({
      borrowedAmount: 200,
      termDays: 20,
      paymentFrequency: 'daily',
      startDate: '2026-05-29',
    })

    expect(result.interestRatePercent).toBe(20)
    expect(result.interestAmount).toBe(40)
    expect(result.totalReceivable).toBe(240)
    expect(result.expectedProfit).toBe(40)
    expect(result.installmentCount).toBe(20)
    expect(result.installmentAmount).toBe(12)
    expect(result.installments).toHaveLength(20)
    expect(result.installments.every((installment) => installment.amount === 12)).toBe(true)
    expect(result.installments[0]?.dueDate).toBe('2026-05-30')
    expect(result.installments[19]?.dueDate).toBe('2026-06-18')
  })

  it('gera parcelas semanais a cada 7 dias ate o vencimento final', () => {
    const result = calculateLoan({
      borrowedAmount: 200,
      termDays: 20,
      paymentFrequency: 'weekly',
      startDate: '2026-05-29',
    })

    expect(result.installments.map((installment) => installment.dueDate)).toEqual([
      '2026-06-05',
      '2026-06-12',
      '2026-06-18',
    ])
  })
})
