export type SummarizableCashMovement = {
  type: 'inflow' | 'outflow' | 'adjustment'
  amount: number
}

export function summarizeCashMovements(movements: SummarizableCashMovement[]) {
  return movements.reduce(
    (summary, movement) => {
      if (movement.type === 'outflow') {
        summary.outflows += movement.amount
        summary.balance -= movement.amount
      } else {
        summary.inflows += movement.amount
        summary.balance += movement.amount
      }

      return summary
    },
    { inflows: 0, outflows: 0, balance: 0 },
  )
}
