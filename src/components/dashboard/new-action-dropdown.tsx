import { BellRing, Calculator, ChevronDown, Plus, ShoppingBag, UserRoundPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const actions = [
  { label: 'Nova venda', path: '/vendas', icon: ShoppingBag },
  { label: 'Novo cliente', path: '/vendas', icon: UserRoundPlus },
  { label: 'Nova cobranca', path: '/cobrancas', icon: BellRing },
  { label: 'Abrir simulador', path: '/simulador', icon: Calculator },
]

export function NewActionDropdown() {
  const [open, setOpen] = useState(false)

  return (
    <div className="new-action-dropdown">
      <button className="dashboard-new-button" onClick={() => setOpen((current) => !current)} type="button" aria-expanded={open}>
        <Plus size={17} />
        Novo
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className="new-action-menu">
          {actions.map((action) => (
            <Link key={action.label} onClick={() => setOpen(false)} to={action.path}>
              <action.icon size={17} />
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
