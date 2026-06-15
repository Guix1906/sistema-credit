import { describe, expect, it } from 'vitest'

import { summarizeCashMovements } from './cash-movement-summary'

describe('summarizeCashMovements', () => {
  it('inclui ajustes positivos nas entradas', () => {
    expect(summarizeCashMovements([
      { type: 'inflow', amount: 12 },
      { type: 'outflow', amount: 200 },
      { type: 'adjustment', amount: 50 },
    ])).toEqual({ inflows: 62, outflows: 200, balance: -138 })
  })

  it('zera o impacto de um ajuste positivo estornado', () => {
    expect(summarizeCashMovements([
      { type: 'adjustment', amount: 50 },
      { type: 'outflow', amount: 50 },
    ])).toEqual({ inflows: 50, outflows: 50, balance: 0 })
  })
})
