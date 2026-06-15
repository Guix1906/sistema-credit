const positiveValues = new Set(['active', 'ativo', 'paid', 'paga', 'login', 'insert', 'access_allowed'])
const warningValues = new Set(['pending', 'pendente', 'partial', 'parcial', 'update', 'overdue', 'atrasada'])
const dangerValues = new Set(['delete', 'inactive', 'inativo', 'defaulted', 'cancelled', 'archived', 'access_blocked'])

type StatusBadgeProps = {
  value: string
  label?: string
}

export function StatusBadge({ value, label }: StatusBadgeProps) {
  const normalized = value.trim().toLowerCase()
  const tone = positiveValues.has(normalized)
    ? 'positive'
    : warningValues.has(normalized)
      ? 'warning'
      : dangerValues.has(normalized)
        ? 'danger'
        : 'neutral'

  return <span className={`status-badge status-badge-${tone}`}>{label ?? humanizeStatus(value)}</span>
}

function humanizeStatus(value: string) {
  const labels: Record<string, string> = {
    active: 'Ativo',
    inactive: 'Inativo',
    paid: 'Paga',
    pending: 'Pendente',
    partial: 'Parcial',
    overdue: 'Atrasada',
    defaulted: 'Inadimplente',
    cancelled: 'Cancelado',
    insert: 'Criado',
    update: 'Atualizado',
    delete: 'Excluido',
    login: 'Login',
    access_allowed: 'Acesso liberado',
    access_blocked: 'Acesso bloqueado',
  }
  return labels[value.trim().toLowerCase()] ?? value
}
