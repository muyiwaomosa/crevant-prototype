import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './client'

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'unavailable'

export type AuthState = {
  status: AuthStatus
  session: Session | null
  client: SupabaseClient | null
}

const AuthContext = createContext<AuthState>({ status: 'unavailable', session: null, client: null })

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

/**
 * Tracks the signed-in session. Reads only what Supabase keeps in this
 * browser; it makes no network request for visitors who are not signed in.
 * `client` can be passed in tests.
 */
export function AuthProvider({ children, client: given }: { children: ReactNode; client?: SupabaseClient | null }) {
  const client = given === undefined ? getSupabase() : given
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!client) return
    let active = true
    client.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setStatus(data.session ? 'signed-in' : 'signed-out')
    })
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      setStatus(next ? 'signed-in' : 'signed-out')
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])

  const value = useMemo(() => ({ status, session, client }), [status, session, client])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
