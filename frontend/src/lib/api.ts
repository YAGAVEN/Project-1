import axios from 'axios'
import { supabase } from './supabase'

/**
 * The single Spring API client (backend.md §2.1): the frontend never touches
 * the database — every call goes through here with the Supabase JWT attached.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1',
})

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// A 401 from the API means the token is invalid beyond repair — end the session
// so the auth guard routes back to login (supabase-js refreshes transparently
// while a valid refresh token exists).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut()
    }
    return Promise.reject(error)
  },
)
