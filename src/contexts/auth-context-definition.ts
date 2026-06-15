import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import type { AccessBlockDetails } from '../types/access-settings'
import type { Profile } from '../types/auth'

export type AuthContextValue = {
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

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
