import { CalendarDays } from 'lucide-react'

import { NewActionDropdown } from './new-action-dropdown'

export function DashboardHeader({ date, onDateChange }: { date: string; onDateChange: (value: string) => void }) {
  return (
    <header className="dashboard-header">
      <div>
        <span className="dashboard-eyebrow">Visao financeira</span>
        <h1>Dashboard</h1>
        <p>Acompanhe carteira, recebimentos e cobrancas em um unico lugar.</p>
      </div>
      <div className="dashboard-header-actions">
        <label className="dashboard-date-control">
          <CalendarDays size={17} />
          <input aria-label="Data de referencia" onChange={(event) => onDateChange(event.target.value)} type="date" value={date} />
        </label>
        <NewActionDropdown />
      </div>
    </header>
  )
}
