import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './components/app-layout'
import { ProtectedRoute } from './components/protected-route'

const AuditPage = lazy(() => import('./pages/audit-page').then((module) => ({ default: module.AuditPage })))
const CashboxesPage = lazy(() => import('./pages/cashboxes-page').then((module) => ({ default: module.CashboxesPage })))
const ClientDetailPage = lazy(() => import('./pages/client-detail-page').then((module) => ({ default: module.ClientDetailPage })))
const ClientsPage = lazy(() => import('./pages/clients-page').then((module) => ({ default: module.ClientsPage })))
const CollectionsPage = lazy(() => import('./pages/collections-page').then((module) => ({ default: module.CollectionsPage })))
const DashboardPage = lazy(() => import('./pages/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const ExpensesPage = lazy(() => import('./pages/expenses-page').then((module) => ({ default: module.ExpensesPage })))
const LoginPage = lazy(() => import('./pages/login-page').then((module) => ({ default: module.LoginPage })))
const MovementsPage = lazy(() => import('./pages/movements-page').then((module) => ({ default: module.MovementsPage })))
const PaymentsPage = lazy(() => import('./pages/payments-page').then((module) => ({ default: module.PaymentsPage })))
const ReportsPage = lazy(() => import('./pages/reports-page').then((module) => ({ default: module.ReportsPage })))
const ReceiptPage = lazy(() => import('./pages/receipt-page').then((module) => ({ default: module.ReceiptPage })))
const RouteDetailPage = lazy(() => import('./pages/route-detail-page').then((module) => ({ default: module.RouteDetailPage })))
const RoutesPage = lazy(() => import('./pages/routes-page').then((module) => ({ default: module.RoutesPage })))
const SaleDetailPage = lazy(() => import('./pages/sale-detail-page').then((module) => ({ default: module.SaleDetailPage })))
const SalesPage = lazy(() => import('./pages/sales-page').then((module) => ({ default: module.SalesPage })))
const SettingsPage = lazy(() => import('./pages/settings-page').then((module) => ({ default: module.SettingsPage })))
const SimulatorPage = lazy(() => import('./pages/simulator-page').then((module) => ({ default: module.SimulatorPage })))
const TeamPage = lazy(() => import('./pages/team-page').then((module) => ({ default: module.TeamPage })))
const WalletPage = lazy(() => import('./pages/wallet-page').then((module) => ({ default: module.WalletPage })))

export function App() {
  return (
    <Suspense fallback={<div className="page-shell"><div className="skeleton-card" /></div>}>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route element={<DashboardPage />} path="/" />
            <Route element={<SimulatorPage />} path="/simulador" />
            <Route element={<SalesPage />} path="/vendas" />
            <Route element={<SaleDetailPage />} path="/vendas/:id" />
            <Route element={<ClientsPage />} path="/clientes" />
            <Route element={<ClientDetailPage />} path="/clientes/:id" />
            <Route element={<WalletPage />} path="/carteira" />
            <Route element={<CollectionsPage />} path="/cobrancas" />
            <Route element={<PaymentsPage />} path="/pagamentos" />
            <Route element={<RoutesPage />} path="/rotas" />
            <Route element={<RouteDetailPage />} path="/rotas/:id" />
            <Route element={<TeamPage />} path="/equipes" />
            <Route element={<MovementsPage />} path="/movimentos" />
            <Route element={<CashboxesPage />} path="/caixas" />
            <Route element={<ExpensesPage />} path="/gastos" />
            <Route element={<ReportsPage />} path="/relatorios" />
            <Route element={<ReceiptPage />} path="/recibos/:id" />
            <Route element={<SettingsPage />} path="/configuracoes" />
            <Route element={<AuditPage />} path="/auditoria" />
          </Route>
        </Route>
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  )
}
