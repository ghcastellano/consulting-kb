# Consulting KB

Base de conhecimento para projetos de consultoria com Claude Vision.
Busca semântica e chat sobre PPTs, Excels, PDFs e transcrições.

## Como funciona

1. **Upload** — você sobe um arquivo
2. **Ingest visual** — Claude Haiku lê cada slide/página como imagem (ou texto) e gera uma descrição semântica rica
3. **Indexação** — a descrição é convertida em vetor e armazenada no Neon (pgvector)
4. **Busca / Chat** — Claude Sonnet consulta os vetores mais próximos e responde com citação de fonte

O ingest acontece **uma vez por arquivo** — depois fica no banco para sempre.

## Stack

- **Frontend**: Next.js 14
- **Backend**: FastAPI (Python)
- **Banco**: Neon PostgreSQL + pgvector
- **AI Ingest**: Claude Haiku 4.5 (visão — barato)
- **AI Chat**: Claude Sonnet 4.6 (raciocínio — melhor qualidade)

## Custo estimado

| Operação | Custo |
|---|---|
| Ingest visual (por slide/página) | ~$0.002 |
| 50 arquivos × 20 slides | **~$2 total, uma vez** |
| Chat (por conversa) | ~$0.02 |
| 100 conversas/mês | ~$2/mês |

---

## Setup

### 1. Pré-requisitos

- Python 3.11+
- Node.js 18+
- Conta Neon (reutilize o projeto Avangrid)
- Anthropic API Key → https://console.anthropic.com

### 2. Backend

```bash
cd backend

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Edite o .env:
#   DATABASE_URL = string de conexão do Neon (pooled)
#   ANTHROPIC_API_KEY = sua chave Anthropic

uvicorn main:app --reload --port 8000
```

**Onde pegar o DATABASE_URL:**
1. console.neon.tech → seu projeto
2. "Connection Details" → copie a "Pooled connection" string

As tabelas são criadas automaticamente na primeira execução.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse: **http://localhost:3000**

---

## Uso

### Criar cliente
Sidebar esquerda → "Novo cliente" → nome (ex: Avangrid, Santander) → cor → Criar

### Upload
Selecione o cliente → aba "Documentos" → arraste os arquivos
- O ingest pode levar 5–30s por arquivo (Claude processa cada slide/página)
- Você verá "indexado" quando terminar

### Chat
Aba "Chat" → pergunte em português ou inglês
- As respostas citam o documento e a página/slide de origem
- O ícone 👁 indica que o trecho foi analisado visualmente (não só texto)

### Busca semântica
Aba "Busca" → digita o conceito
- Encontra por significado, não palavra exata
- Ex: "compromissos com o cliente" encontra "entregáveis prometidos"

---

## Schema do banco (criado automaticamente)

```sql
consulting_kb.clients     -- clientes/projetos
consulting_kb.documents   -- arquivos indexados
consulting_kb.chunks      -- trechos com embeddings (pgvector 1536d)
```

## Próximos passos possíveis

- [ ] Histórico de chat persistido no banco
- [ ] Export de respostas para PPT via consulting-ppt skill
- [ ] Upload direto do SharePoint via Microsoft Graph API
- [ ] Suporte a LibreOffice para renderização visual de PPTX
