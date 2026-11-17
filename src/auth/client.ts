import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readAuthConfig } from './config'

let client: SupabaseClient | null | undefined

/**
 * The browser's Supabase client, created once, or null when this build has
 * no (valid) public Supabase configuration. Production builds never have
 * one: the variables are set for Vercel Preview only.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  // Read one by one, so no other VITE_ variable is copied into the bundle.
  const config = readAuthConfig({ VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY })
  client = config
    ? createClient(config.url, config.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Links from emails are handled only by /auth/confirm, and only
          // after the person presses Continue.
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null
  return client
}
