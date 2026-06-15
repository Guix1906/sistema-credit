import { Bell, ChevronDown, LogOut, Menu, Search, UserRound, X } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { navigationGroups, navigationItems } from '../config/navigation'
import { useAuth } from '../hooks/use-auth'
import { useAsyncData } from '../hooks/use-async-data'
import { isRoleAllowed } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { getUserDisplayName } from '../lib/user-display-name'

const mobilePrimaryPaths = new Set(['/', '/simulador', '/clientes', '/cobrancas', '/pagamentos'])

export function AppLayout() {
  const { profile, user, signOut } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const currentRoute = useMemo(
    () => navigationItems.find((item) => item.path === location.pathname || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`))) ?? navigationItems[0],
    [location.pathname],
  )
  const visibleGroups = useMemo(() => navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => isRoleAllowed(item.roles, profile?.role)) }))
    .filter((group) => group.items.length), [profile?.role])
  const visibleItems = useMemo(() => visibleGroups.flatMap((group) => group.items), [visibleGroups])
  const mobilePrimaryItems = visibleItems.filter((item) => mobilePrimaryPaths.has(item.path))
  const userName = getUserDisplayName(profile, user)
  const alerts = useAsyncData(listOpenAlerts, [] as AlertSummary[])
  const appSettingsLoader = useCallback(() => getLayoutSettings(profile?.id), [profile?.id])
  const appSettings = useAsyncData(appSettingsLoader, null)
  const canViewCurrentRoute = isRoleAllowed(currentRoute.roles, profile?.role)

  useEffect(() => {
    function closeProfileMenu(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', closeProfileMenu)
    return () => document.removeEventListener('mousedown', closeProfileMenu)
  }, [])

  useEffect(() => {
    setDrawerOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }, [location.pathname])

  async function resolveAlert(id: string) {
    const { error } = await supabase.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    if (!error) alerts.reload()
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchTerm.trim()
    navigate(query ? `/clientes?search=${encodeURIComponent(query)}` : '/clientes')
  }

  if (profile && !canViewCurrentRoute) {
    return <Navigate replace to="/" />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Menu principal">
        <Brand logo={appSettings.data?.logo_path} name={appSettings.data?.system_name} />
        <nav className="sidebar-nav">
          {visibleGroups.map((group) => <NavigationGroup key={group.label} label={group.label} items={group.items} />)}
        </nav>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setDrawerOpen(true)} type="button" aria-label="Abrir menu"><Menu size={20} /></button>
          <div className="route-heading"><span>Rota atual</span><strong>{currentRoute.label}</strong></div>
          <form className="topbar-search" onSubmit={submitSearch}><Search aria-hidden="true" size={18} /><input onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar cliente, CPF ou telefone" type="search" value={searchTerm} /></form>
          <div className="topbar-actions">
            <button className="icon-button" aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => { setProfileOpen(false); setNotificationsOpen((open) => !open) }} type="button" aria-label="Notificacoes">
              <Bell size={19} />
              {alerts.data.length ? <span className="notification-dot" /> : null}
            </button>
            {notificationsOpen ? (
              <section className="notification-panel" aria-label="Notificacoes abertas">
                <strong>Notificacoes</strong>
                {alerts.data.map((alert) => (
                  <article key={alert.id}>
                    <b>{alert.title}</b>
                    <span>{alert.message}</span>
                    <button className="secondary-button" onClick={() => resolveAlert(alert.id)} type="button">Resolver</button>
                  </article>
                ))}
                {!alerts.data.length ? <small>Nenhum alerta aberto.</small> : null}
              </section>
            ) : null}
            <div className="profile-menu" ref={profileMenuRef}>
              <button className="user-pill" aria-expanded={profileOpen} onClick={() => { setNotificationsOpen(false); setProfileOpen((open) => !open) }} type="button">
                <span>{userName.slice(0, 1).toUpperCase()}</span>
                <div><strong>{userName}</strong><small>{profile?.role ?? 'sem perfil'}</small></div>
                <ChevronDown aria-hidden="true" className={profileOpen ? 'profile-chevron-open' : ''} size={16} />
              </button>
              {profileOpen ? (
                <section className="profile-panel">
                  <div className="profile-panel-heading"><UserRound size={18} /><div><strong>{userName}</strong><small>{profile?.email ?? user?.email ?? '-'}</small></div></div>
                  <div className="profile-panel-meta"><span>Perfil de acesso</span><b>{profile?.role ?? 'sem perfil'}</b></div>
                  <button className="profile-logout-button" onClick={signOut} type="button"><LogOut size={17} />Sair do sistema</button>
                </section>
              ) : null}
            </div>
            <button className="icon-button" onClick={signOut} type="button" aria-label="Sair"><LogOut size={19} /></button>
          </div>
        </header>
        <main className="page-shell"><Outlet /></main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Menu inferior">
        {mobilePrimaryItems.map((item) => <NavLink className="mobile-nav-item" end={item.path === '/'} key={item.path} to={item.path}><item.icon aria-hidden="true" size={20} /><span>{item.label}</span></NavLink>)}
      </nav>

      {drawerOpen ? (
        <div className="drawer-layer">
          <button className="drawer-backdrop" onClick={() => setDrawerOpen(false)} type="button" aria-label="Fechar menu" />
          <aside className="drawer-panel" aria-label="Menu mobile">
            <div className="drawer-header"><Brand logo={appSettings.data?.logo_path} name={appSettings.data?.system_name} /><button className="icon-button" onClick={() => setDrawerOpen(false)} type="button" aria-label="Fechar"><X size={20} /></button></div>
            <nav className="drawer-nav">
              {visibleGroups.map((group) => <NavigationGroup key={group.label} label={group.label} items={group.items} onNavigate={() => setDrawerOpen(false)} />)}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  )
}

type AlertSummary = { id: string; title: string; message: string; severity: string; created_at: string }

async function listOpenAlerts(): Promise<AlertSummary[]> {
  const { error: refreshError } = await supabase.rpc('refresh_overdue_alerts')
  if (refreshError) throw refreshError
  const { data, error } = await supabase.from('alerts').select('id, title, message, severity, created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(5)
  if (error) throw error
  return data ?? []
}

async function getLayoutSettings(ownerId?: string): Promise<{ system_name: string; logo_path: string | null } | null> {
  if (!ownerId) return null
  const currentSettings = await supabase.rpc('get_current_app_settings')
  if (!currentSettings.error) {
    const row = Array.isArray(currentSettings.data) ? currentSettings.data[0] : currentSettings.data
    return (row as { system_name: string; logo_path: string | null } | undefined) ?? null
  }

  const { data } = await supabase.from('app_settings').select('system_name, logo_path').eq('owner_id', ownerId).maybeSingle()
  return data as { system_name: string; logo_path: string | null } | null
}

function NavigationGroup({ label, items, onNavigate }: { label: string; items: typeof navigationItems; onNavigate?: () => void }) {
  return (
    <section className="nav-group">
      <span className="nav-group-title">{label}</span>
      {items.map((item) => <NavLink className="nav-item" end={item.path === '/'} key={item.path} onClick={onNavigate} to={item.path}><item.icon aria-hidden="true" size={18} /><span>{item.label}</span></NavLink>)}
    </section>
  )
}

function Brand({ logo, name }: { logo?: string | null; name?: string }) {
  return <div className="brand-block">{logo ? <img className="brand-logo" src={logo} alt="" /> : <span className="brand-mark">SC</span>}<div><strong>{name ?? 'Sistema de Credito'}</strong><span>Recebiveis</span></div></div>
}
