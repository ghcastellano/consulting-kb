const BASE = "/api"

export interface Client {
  id: string; name: string; description?: string; color: string
  doc_count: number; chunk_count: number; created_at: string
}
export interface Document {
  id: string; client_id: string; filename: string; filetype: string
  size_bytes: number; chunk_count: number; created_at: string
}
export interface SearchResult {
  content: string; filename: string; filetype: string
  client_name: string; color: string; similarity: number
  page_or_slide?: number; has_visual: boolean
}
export interface Source {
  filename: string; client: string; page_or_slide?: number
  similarity: number; has_visual: boolean
}
export interface ChatResponse { answer: string; sources: Source[] }

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return res.json()
}

export const api = {
  listClients: () => req<Client[]>("/clients"),
  createClient: (d: { name: string; description?: string; color?: string }) =>
    req<Client>("/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }),
  deleteClient: (id: string) => req<{ ok: boolean }>(`/clients/${id}`, { method: "DELETE" }),

  listDocuments: (cid: string) => req<Document[]>(`/clients/${cid}/documents`),
  uploadDocument: (cid: string, file: File) => {
    const fd = new FormData(); fd.append("file", file)
    return req<Document>(`/clients/${cid}/upload`, { method: "POST", body: fd })
  },
  deleteDocument: (id: string) => req<{ ok: boolean }>(`/documents/${id}`, { method: "DELETE" }),

  search: (query: string, clientId?: string, topK = 8) =>
    req<SearchResult[]>("/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, client_id: clientId, top_k: topK })
    }),

  chat: (messages: { role: string; content: string }[], clientId?: string) =>
    req<ChatResponse>("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, client_id: clientId })
    }),
}
