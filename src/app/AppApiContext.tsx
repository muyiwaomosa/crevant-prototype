import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { createSupabaseApi, type AppApi, type OwnProfile } from './api'

const ApiContext = createContext<AppApi | null>(null)

/**
 * Provides the members area's data layer. Built from the signed-in session;
 * tests pass their own `api`.
 */
export function AppApiProvider({ children, api: given }: { children: ReactNode; api?: AppApi }) {
  const { client, session } = useAuth()
  const userId = session?.user.id
  const api = useMemo(() => given ?? (client && userId ? createSupabaseApi(client, userId) : null), [given, client, userId])
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useAppApi(): AppApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useAppApi must be used inside AppApiProvider with a signed-in member')
  return api
}

/** The signed-in member's own profile, once it is complete. */
type ProfileState = { profile: OwnProfile & { username: string; displayName: string }; refresh: () => Promise<void> }
const ProfileContext = createContext<ProfileState | null>(null)

export function useMyProfile(): ProfileState {
  const p = useContext(ProfileContext)
  if (!p) throw new Error('useMyProfile must be used inside ProfileGate')
  return p
}

export type GateStatus =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'incomplete'; profile: OwnProfile }
  | { kind: 'ready'; profile: OwnProfile & { username: string; displayName: string } }

/** Loads the member's own profile row and decides whether setup is needed. */
export function useProfileGate(): { status: GateStatus; reload: () => Promise<void> } {
  const api = useContext(ApiContext)
  const [status, setStatus] = useState<GateStatus>({ kind: 'loading' })
  const reload = useCallback(async () => {
    if (!api) return
    try {
      const p = await api.ownProfile()
      if (!p) setStatus({ kind: 'missing' })
      else if (p.username && p.displayName) setStatus({ kind: 'ready', profile: { ...p, username: p.username, displayName: p.displayName } })
      else setStatus({ kind: 'incomplete', profile: p })
    } catch {
      setStatus({ kind: 'error' })
    }
  }, [api])
  useEffect(() => {
    void reload()
  }, [reload])
  return { status, reload }
}

export function ProfileProvider({ value, children }: { value: ProfileState; children: ReactNode }) {
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
