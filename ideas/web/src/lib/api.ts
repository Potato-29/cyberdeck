export type Status = 'spark' | 'brewing' | 'building' | 'shipped' | 'parked' | 'dropped'

export const STATUSES: Status[] = [
  'spark',
  'brewing',
  'building',
  'shipped',
  'parked',
  'dropped',
]

export interface Idea {
  id: number
  title: string
  body: string
  status: Status
  impact: number | null
  effort: number | null
  public_slug: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  tags: string[]
  heat: number
}

export interface User {
  id: number
  email: string
  display_name: string
  api_token: string
}

export interface Tag {
  name: string
  count: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// The server requires this header on every mutation; SameSite=Lax plus a header
// a cross-origin form cannot set is what stands in for CSRF tokens here.
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'ideas',
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: HEADERS,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Can't reach the server.")
  }

  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // A non-JSON body means we hit the SPA fallback or a proxy error page.
    if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status}).`)
  }

  if (!res.ok) {
    throw new ApiError(res.status, (data.error as string) || `Request failed (${res.status}).`)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: User | null; signup_mode: string }>('/api/auth/me'),

  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', 'POST', { email, password }),

  register: (email: string, password: string, display_name: string, invite?: string) =>
    request<{ user: User }>('/api/auth/register', 'POST', {
      email,
      password,
      display_name,
      invite,
    }),

  logout: () => request<{ ok: true }>('/api/auth/logout', 'POST', {}),

  changePassword: (current: string, next: string) =>
    request<{ ok: true }>('/api/auth/password', 'POST', { current, new: next }),

  listIdeas: (params: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    ).toString()
    return request<{ ideas: Idea[] }>(`/api/ideas${qs ? `?${qs}` : ''}`)
  },

  createIdea: (payload: { title: string; body?: string; tags?: string[] }) =>
    request<{ idea: Idea }>('/api/ideas', 'POST', payload),

  getIdea: (id: number) => request<{ idea: Idea }>(`/api/ideas/${id}`),

  updateIdea: (id: number, patch: Partial<Record<string, unknown>>) =>
    request<{ idea: Idea }>(`/api/ideas/${id}`, 'PATCH', patch),

  deleteIdea: (id: number) => request<{ ok: true }>(`/api/ideas/${id}`, 'DELETE', {}),

  share: (id: number, isPublic: boolean) =>
    request<{ public_slug: string | null }>(`/api/ideas/${id}/share`, 'POST', {
      public: isPublic,
    }),

  tags: () => request<{ tags: Tag[] }>('/api/tags'),

  publicIdea: (slug: string) =>
    request<{
      idea: {
        title: string
        body: string
        status: Status
        created_at: string
        updated_at: string
        tags: string[]
      }
      author: string
    }>(`/api/public/${encodeURIComponent(slug)}`),
}
