import { clearAuthCookies, getAccessToken, getRefreshToken, setAuthCookies } from "./auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

const buildHeaders = async (extra?: HeadersInit): Promise<HeadersInit> => {
  const token = await getAccessToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    ...extra,
  }
}

const tryRefresh = async (): Promise<boolean> => {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    await clearAuthCookies()
    return false
  }
  const json = await res.json() as { access_token: string; refresh_token: string }
  await setAuthCookies(json.access_token, json.refresh_token)
  return true
}

const fetchWithAuth = async (input: string, init: RequestInit, retry = true): Promise<Response> => {
  const headers = await buildHeaders(init.headers)
  const res = await fetch(`${API_BASE_URL}${input}`, { ...init, headers })
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh()
    if (refreshed) return fetchWithAuth(input, init, false)
  }
  return res
}

export const apiClient = {
  delete: async <T = unknown>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "DELETE" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  get: async <T>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "GET" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  patch: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "PATCH" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "POST" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "PUT" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
}
