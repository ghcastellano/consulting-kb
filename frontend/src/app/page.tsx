"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Plus, Trash2, Upload, Search, MessageSquare, FileText,
  ChevronRight, X, Loader2, Database, Sparkles,
  AlertCircle, Check, BookOpen, Eye, BarChart2
} from "lucide-react"
import { api, Client, Document, SearchResult, Source } from "@/lib/api"

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLORS = ["#c9993a","#7a9a74","#7a90aa","#aa7a8f","#9a7aaa","#aa997a"]

const FILE_ICONS: Record<string,string> = {
  pptx:"📊", xlsx:"📈", xls:"📈", pdf:"📄", docx:"📝", txt:"📋", md:"📋"
}

function fmtSize(b: number) {
  if (b < 1024) return `${b}B`
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`
  return `${(b/1048576).toFixed(1)}MB`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})
}

function simLabel(s: number): { label: string; color: string } {
  if (s > 0.82) return { label: "Muito relevante", color: "var(--sage)" }
  if (s > 0.68) return { label: "Relevante",       color: "var(--gold)" }
  return               { label: "Relacionado",      color: "var(--muted)" }
}

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h4 style='color:var(--gold-l);font-family:var(--font-display,serif);margin:0.8em 0 0.3em'>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3 style='color:var(--gold-l);font-family:var(--font-display,serif);margin:1em 0 0.4em'>$1</h3>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul style='padding-left:1.2em;margin:0.4em 0'>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ clients, selected, onSelect, onCreate, onDelete, loading }: {
  clients: Client[]; selected: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string, desc: string, color: string) => void
  onDelete: (id: string) => void; loading: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState(""); const [desc, setDesc] = useState("")
  const [color, setColor] = useState(COLORS[0])

  function submit() {
    if (!name.trim()) return
    onCreate(name.trim(), desc.trim(), color)
    setName(""); setDesc(""); setColor(COLORS[0]); setCreating(false)
  }

  return (
    <aside style={{ background:"var(--surface)", borderRight:"1px solid var(--border)", width:240 }}
      className="flex-shrink-0 flex flex-col h-full">

      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom:"1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background:"var(--gold-dim)", border:"1px solid rgba(201,153,58,0.25)" }}>
            <BookOpen size={13} style={{ color:"var(--gold)" }} />
          </div>
          <div>
            <p className="font-display text-base leading-tight" style={{ color:"var(--text)" }}>
              Consulting KB
            </p>
            <p className="text-xs" style={{ color:"var(--muted)", fontSize:11 }}>
              Knowledge Base
            </p>
          </div>
        </div>
      </div>

      {/* All */}
      <div className="px-3 pt-3">
        <button onClick={() => onSelect(null)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
          style={{
            background: selected===null ? "var(--s2)" : "transparent",
            color: selected===null ? "var(--text)" : "var(--muted)",
            border: selected===null ? "1px solid var(--border2)" : "1px solid transparent"
          }}>
          <Database size={13} style={{ color:"var(--gold)" }} />
          <span>Todos os clientes</span>
        </button>
      </div>

      {/* Clients */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={15} className="animate-spin" style={{ color:"var(--dim)" }} />
          </div>
        ) : clients.map(c => (
          <div key={c.id} className="group relative">
            <button onClick={() => onSelect(c.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
              style={{
                background: selected===c.id ? "var(--s2)" : "transparent",
                color: selected===c.id ? "var(--text)" : "var(--muted)",
                border: selected===c.id ? "1px solid var(--border2)" : "1px solid transparent"
              }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:c.color }} />
              <span className="flex-1 text-left truncate">{c.name}</span>
              <span className="font-mono text-xs" style={{ color:"var(--dim)", fontSize:11 }}>
                {c.doc_count}
              </span>
            </button>
            <button onClick={() => onDelete(c.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
              style={{ color:"var(--dim)" }}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* New client */}
      <div className="p-3" style={{ borderTop:"1px solid var(--border)" }}>
        {!creating ? (
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
            style={{ color:"var(--muted)", border:"1px dashed var(--border2)" }}>
            <Plus size={13} /> Novo cliente
          </button>
        ) : (
          <div className="space-y-2 animate-fade-up">
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key==="Enter" && submit()}
              placeholder="Nome do cliente"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--text)" }} />
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Descrição (opcional)"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--text)" }} />
            <div className="flex gap-1.5 px-0.5">
              {COLORS.map(cl => (
                <button key={cl} onClick={() => setColor(cl)}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                  style={{ background:cl, outline:color===cl?`2px solid ${cl}`:"none", outlineOffset:2 }} />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={submit}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                style={{ background:"var(--gold)", color:"#0a0908" }}>
                Criar
              </button>
              <button onClick={() => setCreating(false)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background:"var(--s2)", color:"var(--muted)" }}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ── Upload ────────────────────────────────────────────────────────────────────

function UploadZone({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<{name:string;done:boolean;error?:string}[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files) return
    const arr = Array.from(files)
    setUploading(arr.map(f => ({ name:f.name, done:false })))
    for (const file of arr) {
      try {
        await api.uploadDocument(clientId, file)
        setUploading(prev => prev.map(u => u.name===file.name ? {...u, done:true} : u))
        onDone()
      } catch(e:any) {
        setUploading(prev => prev.map(u => u.name===file.name ? {...u, done:true, error:e.message} : u))
      }
    }
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-xl p-6 text-center transition-all"
        style={{
          border:`1.5px dashed ${dragging ? "var(--gold)" : "var(--border2)"}`,
          background: dragging ? "var(--gold-dim)" : "var(--s2)"
        }}>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".pptx,.xlsx,.xls,.pdf,.docx,.txt,.md"
          onChange={e => handleFiles(e.target.files)} />
        <Upload size={20} className="mx-auto mb-2"
          style={{ color: dragging ? "var(--gold)" : "var(--dim)" }} />
        <p className="text-sm" style={{ color:"var(--muted)" }}>
          Arraste ou clique para selecionar
        </p>
        <p style={{ color:"var(--dim)", fontSize:11, marginTop:4 }}>
          PPT · Excel · PDF · Word · TXT
        </p>
      </div>

      {uploading.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {uploading.map((u,i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
              style={{ background:"var(--s2)", border:"1px solid var(--border)" }}>
              {u.done
                ? u.error
                  ? <AlertCircle size={13} style={{ color:"var(--red)" }} />
                  : <Check size={13} style={{ color:"var(--sage)" }} />
                : <Loader2 size={13} className="animate-spin" style={{ color:"var(--gold)" }} />
              }
              <span className="flex-1 text-xs truncate" style={{ color:"var(--muted)" }}>{u.name}</span>
              {u.done && !u.error && (
                <span className="text-xs" style={{ color:"var(--sage)" }}>indexado</span>
              )}
              {u.error && (
                <span className="text-xs" style={{ color:"var(--red)" }}>erro</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Documents Panel ──────────────────────────────────────────────────────────

function DocumentsPanel({ client, onRefresh }: { client: Client; onRefresh: () => void }) {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setLoading(true)
    api.listDocuments(client.id).then(setDocs).finally(() => setLoading(false))
  }, [client.id, tick])

  async function del(id: string) {
    await api.deleteDocument(id)
    setTick(t => t+1); onRefresh()
  }

  return (
    <div className="flex flex-col h-full scroll-area">
      <div className="p-6" style={{ borderBottom:"1px solid var(--border)" }}>
        <UploadZone clientId={client.id} onDone={() => { setTick(t=>t+1); onRefresh() }} />
      </div>

      <div className="flex-1 p-6 scroll-area">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={18} className="animate-spin" style={{ color:"var(--dim)" }} />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText size={24} className="mb-3" style={{ color:"var(--dim)" }} />
            <p className="text-sm" style={{ color:"var(--muted)" }}>Nenhum documento ainda</p>
            <p style={{ color:"var(--dim)", fontSize:12, marginTop:4 }}>
              Faça upload acima para começar
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map(d => (
              <div key={d.id}
                className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{ background:"var(--s2)", border:"1px solid var(--border)" }}>
                <span className="text-lg leading-none">{FILE_ICONS[d.filetype] || "📄"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color:"var(--text)" }}>{d.filename}</p>
                  <p className="font-mono mt-0.5" style={{ color:"var(--muted)", fontSize:11 }}>
                    {d.chunk_count} trechos · {fmtSize(d.size_bytes)} · {fmtDate(d.created_at)}
                  </p>
                </div>
                <button onClick={() => del(d.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
                  style={{ color:"var(--dim)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Search Panel ─────────────────────────────────────────────────────────────

function SearchPanel({ clientId }: { clientId?: string }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true); setSearched(true)
    try { setResults(await api.search(query, clientId, 8)) }
    catch { setResults([]) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6" style={{ borderBottom:"1px solid var(--border)" }}>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color:"var(--dim)" }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key==="Enter" && doSearch()}
              placeholder="Buscar por conceito, número, entregável…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--text)" }} />
          </div>
          <button onClick={doSearch} disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-40 transition-opacity"
            style={{ background:"var(--gold)", color:"#0a0908" }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Buscar
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-3 scroll-area">
        {!searched && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <BarChart2 size={28} className="mb-4" style={{ color:"var(--dim)" }} />
            <p className="text-sm" style={{ color:"var(--muted)" }}>Busca semântica por significado</p>
            <p style={{ color:"var(--dim)", fontSize:12, marginTop:4 }}>
              Encontra entregáveis, dados, decisões — mesmo com palavras diferentes
            </p>
          </div>
        )}

        {searched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle size={22} className="mb-3" style={{ color:"var(--dim)" }} />
            <p className="text-sm" style={{ color:"var(--muted)" }}>Nenhum resultado</p>
          </div>
        )}

        {results.map((r, i) => {
          const sim = simLabel(r.similarity)
          return (
            <div key={i} className="rounded-xl p-5 animate-fade-up"
              style={{ animationDelay:`${i*0.05}s`, opacity:0,
                background:"var(--s2)", border:"1px solid var(--border)" }}>
              <div className="flex items-start gap-3 mb-3">
                <span className="text-lg leading-none mt-0.5">{FILE_ICONS[r.filetype]||"📄"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate" style={{ color:"var(--text)" }}>
                      {r.filename}
                    </span>
                    {r.page_or_slide && (
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                        style={{ background:"var(--s3)", color:"var(--muted)", fontSize:10 }}>
                        p.{r.page_or_slide}
                      </span>
                    )}
                    {r.has_visual && (
                      <Eye size={11} style={{ color:"var(--gold)", flexShrink:0 }} />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background:r.color }} />
                    <span style={{ color:"var(--muted)", fontSize:11 }}>{r.client_name}</span>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color:sim.color, background:`${sim.color}18`, border:`1px solid ${sim.color}30` }}>
                  {sim.label}
                </span>
              </div>

              <p className="text-sm leading-relaxed" style={{ color:"var(--muted)" }}>
                {r.content.length > 300 ? r.content.slice(0,300)+"…" : r.content}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-0.5 rounded-full" style={{ background:"var(--border)" }}>
                  <div className="h-full rounded-full"
                    style={{ width:`${r.similarity*100}%`, background:sim.color }} />
                </div>
                <span className="font-mono" style={{ color:"var(--dim)", fontSize:10 }}>
                  {(r.similarity*100).toFixed(0)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chat Panel ───────────────────────────────────────────────────────────────

interface Msg { role:"user"|"assistant"; content:string; sources?:Source[] }

const SUGGESTIONS = [
  "Quais entregáveis prometemos nesse projeto?",
  "Quais foram os principais pain points identificados?",
  "Resuma as decisões da última reunião",
  "Quais são os próximos passos definidos?",
]

function ChatPanel({ clientId }: { clientId?: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  }, [messages, loading])

  async function send(text?: string) {
    const q = text || input
    if (!q.trim() || loading) return
    const userMsg: Msg = { role:"user", content:q }
    const next = [...messages, userMsg]
    setMessages(next); setInput(""); setLoading(true)
    try {
      const res = await api.chat(next.map(m => ({ role:m.role, content:m.content })), clientId)
      setMessages(prev => [...prev, { role:"assistant", content:res.answer, sources:res.sources }])
    } catch(e:any) {
      setMessages(prev => [...prev, { role:"assistant", content:`Erro: ${e.message}` }])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 p-6 space-y-5 scroll-area">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
              style={{ background:"var(--gold-dim)", border:"1px solid rgba(201,153,58,0.2)" }}>
              <Sparkles size={18} style={{ color:"var(--gold)" }} />
            </div>
            <p className="font-display text-2xl italic mb-1" style={{ color:"var(--text)" }}>
              Pergunte sobre seus projetos
            </p>
            <p className="text-sm mb-8" style={{ color:"var(--muted)" }}>
              Respostas baseadas nos documentos indexados, com citação de fonte
            </p>
            <div className="space-y-2 w-full max-w-md">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all hover:border-opacity-60"
                  style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--muted)" }}>
                  <ChevronRight size={11} className="inline mr-2" style={{ color:"var(--gold)" }} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex animate-fade-up ${m.role==="user"?"justify-end":"justify-start"}`}
            style={{ animationDelay:`${i*0.02}s`, opacity:0 }}>
            <div className={m.role==="user" ? "max-w-xl" : "w-full max-w-3xl"}>
              {m.role === "user" ? (
                <div className="px-4 py-3 rounded-2xl rounded-br-sm text-sm"
                  style={{ background:"var(--gold-dim)", border:"1px solid rgba(201,153,58,0.2)", color:"var(--text)" }}>
                  {m.content}
                </div>
              ) : (
                <div>
                  <div className="px-5 py-4 rounded-2xl rounded-bl-sm text-sm prose"
                    style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--text)" }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.sources.slice(0,4).map((s, si) => (
                        <span key={si} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                          style={{ background:"var(--surface)", border:"1px solid var(--border2)", color:"var(--muted)" }}>
                          {s.has_visual && <Eye size={10} style={{ color:"var(--gold)" }} />}
                          {FILE_ICONS[s.filename.split(".").pop()||""]||"📄"}
                          {s.filename}
                          {s.page_or_slide && <span style={{ color:"var(--dim)" }}>p.{s.page_or_slide}</span>}
                          <span className="font-mono" style={{ color:"var(--dim)", fontSize:10 }}>
                            {(s.similarity*100).toFixed(0)}%
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-bl-sm"
              style={{ background:"var(--s2)", border:"1px solid var(--border2)" }}>
              <span className="text-xs" style={{ color:"var(--muted)" }}>Consultando a base</span>
              <div className="flex gap-1">
                {[0,1,2].map(j => (
                  <div key={j} className="w-1.5 h-1.5 rounded-full animate-pulse2"
                    style={{ background:"var(--gold)", animationDelay:`${j*0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-5" style={{ borderTop:"1px solid var(--border)" }}>
        <div className="flex gap-3">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send() }}}
            placeholder="Pergunte sobre entregáveis, dados, decisões… (Enter para enviar)"
            rows={2}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--text)" }} />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="px-5 rounded-xl font-medium self-end py-3 flex items-center gap-2 disabled:opacity-40 transition-opacity"
            style={{ background:"var(--gold)", color:"#0a0908" }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

type Tab = "chat" | "search" | "docs"

export default function Home() {
  const [clients, setClients] = useState<Client[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("chat")

  const client = clients.find(c => c.id === selected) ?? null

  const loadClients = useCallback(() => {
    api.listClients().then(setClients).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadClients() }, [loadClients])

  async function createClient(name: string, description: string, color: string) {
    const c = await api.createClient({ name, description, color })
    setClients(prev => [c, ...prev]); setSelected(c.id); setTab("docs")
  }

  async function deleteClient(id: string) {
    await api.deleteClient(id)
    setClients(prev => prev.filter(c => c.id !== id))
    if (selected === id) setSelected(null)
  }

  const TABS: { id: Tab; icon: any; label: string }[] = [
    { id:"chat",   icon:MessageSquare, label:"Chat"       },
    { id:"search", icon:Search,        label:"Busca"      },
    ...(client ? [{ id:"docs" as Tab, icon:FileText, label:"Documentos" }] : []),
  ]

  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden" }}>
      <Sidebar clients={clients} selected={selected} onSelect={setSelected}
        onCreate={createClient} onDelete={deleteClient} loading={loading} />

      <main style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        {/* Header */}
        <header style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 24px", borderBottom:"1px solid var(--border)",
          background:"var(--surface)", flexShrink:0
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {client ? (
              <>
                <div style={{ width:8, height:8, borderRadius:"50%", background:client.color }} />
                <span className="font-display" style={{ fontSize:18, color:"var(--text)", fontStyle:"italic" }}>
                  {client.name}
                </span>
                <span className="font-mono" style={{
                  fontSize:11, color:"var(--muted)", background:"var(--s2)",
                  border:"1px solid var(--border2)", padding:"2px 8px", borderRadius:20
                }}>
                  {client.doc_count} docs · {client.chunk_count} trechos
                </span>
              </>
            ) : (
              <span className="font-display" style={{ fontSize:18, color:"var(--text)", fontStyle:"italic" }}>
                Todos os clientes
              </span>
            )}
          </div>

          {/* Tabs */}
          <div style={{
            display:"flex", gap:4, padding:4, borderRadius:12,
            background:"var(--s2)", border:"1px solid var(--border)"
          }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"6px 14px", borderRadius:8, fontSize:13,
                  background: tab===t.id ? "var(--surface)" : "transparent",
                  color: tab===t.id ? "var(--text)" : "var(--muted)",
                  border: tab===t.id ? "1px solid var(--border2)" : "1px solid transparent",
                  cursor:"pointer", transition:"all 0.15s"
                }}>
                <t.icon size={13} />
                {t.label}
              </button>
            ))}
          </div>
        </header>

        {/* Content */}
        <div style={{ flex:1, minHeight:0 }}>
          {tab==="chat"   && <ChatPanel clientId={selected ?? undefined} />}
          {tab==="search" && <SearchPanel clientId={selected ?? undefined} />}
          {tab==="docs"   && client && <DocumentsPanel client={client} onRefresh={loadClients} />}
          {tab==="docs"   && !client && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
              <p style={{ color:"var(--muted)" }}>Selecione um cliente para ver os documentos</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
