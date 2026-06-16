import { describe, expect, it } from 'vitest'

import { resolveSettlementStatus } from './collection-settlement'
import type { CollectionSettlementInput } from './collection-settlement'

const today = '2026-06-15'

function row(input: Partial<CollectionSettlementInput>): CollectionSettlementInput {
  return {
    pendingInstallments: 8,
    loanStatus: 'active',
    status: 'a_receber',
    loanFinalDueDate: '2026-07-10',
    dueDate: '2026-06-16',
    loanNotes: null,
    notes: null,
    loanIssuedAt: '2026-06-01',
    ...input,
  }
}

describe('resolveSettlementStatus', () => {
  it('classifica contrato renovado recentemente', () => {
    expect(resolveSettlementStatus(row({
      loanNotes: 'Renegociado em 2026-06-12',
      pendingInstallments: 10,
    }), today)).toBe('renewed')
  })

  it('classifica cliente faltando poucas parcelas', () => {
    expect(resolveSettlementStatus(row({
      pendingInstallments: 3,
    }), today)).toBe('finishing')
  })

  it('prioriza quitacao em atraso quando o prazo final venceu e ainda falta parcela', () => {
    expect(resolveSettlementStatus(row({
      loanFinalDueDate: '2026-06-14',
      pendingInstallments: 2,
      loanNotes: 'Renegociado em 2026-06-12',
    }), today)).toBe('overdue')
  })

  it('classifica cliente regular como em dia', () => {
    expect(resolveSettlementStatus(row({
      pendingInstallments: 6,
      loanFinalDueDate: '2026-07-01',
    }), today)).toBe('current')
  })

  it('classifica cliente sem parcelas faltantes como pago', () => {
    expect(resolveSettlementStatus(row({
      pendingInstallments: 0,
      loanStatus: 'paid',
      status: 'pago',
    }), today)).toBe('paid')
  })
})
