import {
  BadgeDollarSign,
  Banknote,
  Bell,
  Boxes,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CreditCard,
  FileClock,
  Gauge,
  Map,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '../types/auth'

export type NavigationItem = {
  label: string
  path: string
  icon: LucideIcon
  roles?: UserRole[]
}

export type NavigationGroup = {
  label: string
  items: NavigationItem[]
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: 'Visao geral',
    items: [
      { label: 'Dashboard', path: '/', icon: Gauge },
      { label: 'Relatorios', path: '/relatorios', icon: ChartNoAxesCombined },
    ],
  },
  {
    label: 'Operacoes',
    items: [
      { label: 'Simulador', path: '/simulador', icon: BadgeDollarSign },
      { label: 'Vendas', path: '/vendas', icon: BriefcaseBusiness },
      { label: 'Clientes', path: '/clientes', icon: Users },
      { label: 'Carteira', path: '/carteira', icon: WalletCards },
      { label: 'Cobrancas', path: '/cobrancas', icon: Bell },
      { label: 'Pagamentos', path: '/pagamentos', icon: CreditCard },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Caixas', path: '/caixas', icon: Banknote, roles: ['admin', 'gerente'] },
      { label: 'Movimentos', path: '/movimentos', icon: Boxes, roles: ['admin', 'gerente'] },
      { label: 'Gastos', path: '/gastos', icon: ReceiptText, roles: ['admin', 'gerente', 'afiliado', 'cobrador'] },
    ],
  },
  {
    label: 'Configuracoes',
    items: [
      { label: 'Afiliados / Cobradores', path: '/equipes', icon: ShieldCheck, roles: ['admin'] },
      { label: 'Rotas', path: '/rotas', icon: Map, roles: ['admin', 'gerente'] },
      { label: 'Configuracoes', path: '/configuracoes', icon: Settings, roles: ['admin', 'gerente'] },
      { label: 'Auditoria', path: '/auditoria', icon: FileClock, roles: ['admin', 'gerente'] },
    ],
  },
]

export const navigationItems = navigationGroups.flatMap((group) => group.items)
