import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { evaluateAccessWindow } from '../lib/access-window'
import { supabase } from '../lib/supabase'
import { getAccessSettings } from '../services/access-settings-service'
import { registerAccessBlocked } from '../services/audit-service'
import { insertAuditLog } from '../services/finance-service'
import { ensureCurrentProfile, getCurrentProfile } from '../services/profile-service'
import type { AccessBlockDetails } from '../types/access-settings'
import type { Profile } from '../types/auth'

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  accessBlock: AccessBlockDetails | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  clearAccessBlock: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessBlock, setAccessBlock] = useState<AccessBlockDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const enforceAccessWindow = useCallback(async (currentProfile: Profile) => {
    const settings = await getAccessSettings(currentProfile.id)

    if (!settings) {
      return
    }

    const decision = evaluateAccessWindow(
      {
        openingTime: settings.opening_time,
        closingTime: settings.closing_time,
        allowedDays: settings.allowed_days,
        timezone: settings.timezone,
        allowAdminOutsideHours: settings.allow_admin_outside_hours,
      },
      currentProfile.role,
    )

    if (decision.allowed) {
      setAccessBlock(null)
      return
    }

    const blockDetails: AccessBlockDetails = decision
    setAccessBlock(blockDetails)

    try {
      await registerAccessBlocked(currentProfile, blockDetails)
    } finally {
      await supabase.auth.signOut()
      setSession(null)
      setProfile(null)
    }

    throw new Error('Sistema indisponível no momento')
  }, [])

  const loadProfile = useCallback(async (user: User | undefined) => {
    if (!user) {
      setProfile(null)
      return
    }

    const currentProfile = await ensureCurrentProfileFromUser(user)
    if (currentProfile) {
      await enforceAccessWindow(currentProfile)
      insertAuditLog(currentProfile, 'auth', currentProfile.id, 'login', null, { email: user.email }).catch(console.error)
    }

    setProfile(currentProfile)
  }, [enforceAccessWindow])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user)
  }, [loadProfile, session?.user])

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      const confirmationCode = new URLSearchParams(window.location.search).get('code')

      if (confirmationCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(confirmationCode)

        if (exchangeError) {
          throw exchangeError
        }

        window.history.replaceState({}, document.title, window.location.pathname)
      }

      const { data, error } = await supabase.auth.getSession()

      if (error) {
        throw error
      }

      if (!isMounted) {
        return
      }

      setSession(data.session)
      try {
        await loadProfile(data.session?.user)
      } catch (error) {
        console.error('Erro ao carregar perfil:', error)
      }
      setLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      loadProfile(nextSession?.user)
        .catch((error) => console.error('Erro ao carregar perfil:', error))
        .finally(() => setLoading(false))
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    setAccessBlock(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      throw error
    }

    const currentProfile = data.user ? await ensureCurrentProfileFromUser(data.user, email) : null

    if (currentProfile) {
      await enforceAccessWindow(currentProfile)
    }

    setProfile(currentProfile)
  }, [enforceAccessWindow])

  const signUp = useCallback(async (input: { fullName: string; email: string; password: string }) => {
    const emailRedirectTo = `${window.location.origin}/login`
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: input.fullName,
        },
      },
    })

    if (error) {
      throw error
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const redirectTo = `${window.location.origin}/login`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    const currentProfile = profile
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }

    if (currentProfile) {
      insertAuditLog(currentProfile, 'auth', currentProfile.id, 'logout', null, { email: currentProfile.email }).catch(console.error)
    }

    setProfile(null)
  }, [profile])

  const clearAccessBlock = useCallback(() => {
    setAccessBlock(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      accessBlock,
      loading,
      signIn,
      signUp,
      resetPassword,
      signOut,
      refreshProfile,
      clearAccessBlock,
    }),
    [accessBlock, clearAccessBlock, loading, profile, refreshProfile, resetPassword, session, signIn, signOut, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function ensureCurrentProfileFromUser(user: User, fallbackEmail = '') {
  return ensureCurrentProfile({
    id: user.id,
    email: user.email ?? fallbackEmail,
    fullName: typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : undefined,
  })
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  }

  return context
}
