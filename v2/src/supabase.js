import { PostgrestClient } from '@supabase/postgrest-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const configurationError = !url || !key
  ? 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env, then restart Vite.'
  : !/^https?:\/\//i.test(url)
    ? 'VITE_SUPABASE_URL must start with https://. Copy the Project URL from Supabase → Connect, then restart Vite.'
    : ''

// Public, read-only REST client used by every public page. It always runs as
// the anonymous role (publishable key in the `apikey` header), so RLS applies
// exactly as before. It is ~18 kB versus ~200 kB for the full client.
export const db = configurationError
  ? null
  : new PostgrestClient(new URL('rest/v1', url.endsWith('/') ? url : `${url}/`).href, { headers: { apikey: key } })

// Full client with Supabase Auth, loaded on demand for admin sign-in and
// writes. The session is persisted in localStorage by supabase-js as before.
let clientPromise = null

export function getSupabase() {
  if (configurationError) return Promise.reject(new Error(configurationError))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url, key))
  return clientPromise
}
