export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }

  const isDateOnly = !value.includes('T')
  const isUtcMidnight = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?(?:Z|\+00:00)$/.test(value)
  const date = isDateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value)

  return new Intl.DateTimeFormat('pt-BR', { timeZone: isDateOnly || isUtcMidnight ? 'UTC' : undefined }).format(date)
}

export function toNumber(value: FormDataEntryValue | null): number {
  return Number(String(value ?? '0').replace(',', '.')) || 0
}

export function nullableText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text || null
}
