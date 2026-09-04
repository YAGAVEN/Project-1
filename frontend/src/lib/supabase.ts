import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy frontend/.env.example to frontend/.env and fill them in',
  )
}

/** Auth-only client (frontend.md §4): login/refresh here, everything else via the Spring API. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
