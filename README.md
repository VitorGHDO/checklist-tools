# Checklist Tools

Ferramentas internas da Camp Tecnologia para transformar checklists automotivos em PDF em código pronto para o banco de dados, usando IA.

O **Extrator** recebe um PDF de checklist, extrai o texto, corrige/organiza com IA (comparando com imagens de referência do documento) e gera:

- os **campos** (colunas `snake_case`) de cada pergunta;
- a **migration** do Laravel (`Schema::create(...)`);
- os **INSERTs** de `checklist_status` e `checklist_perguntas` (e o formato "DB" em TSV).

Os rascunhos ficam salvos no navegador e podem ser retomados em **/historico**.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- Fonte **Poppins** (via `next/font`)
- IA: **Anthropic (Claude)**
- Extração de PDF: **pdf-parse**

## Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
```

Outros comandos:

```bash
npm run build      # build de produção
npm run start      # roda o build de produção
npm run lint       # ESLint
```

Não há testes configurados.

## Chaves de API

A chave da Anthropic é configurada na própria interface (botão **API Key**) e fica **somente no navegador** (`localStorage`). Ela é enviada às rotas internas (`/api/*`) apenas no momento da requisição e **nunca é persistida no servidor** — cada pessoa usa a sua própria chave.

- Anthropic / Claude: <https://console.anthropic.com/settings/keys>

## Estrutura

```
src/
  app/
    api/               # rotas: extract-pdf, correct-text, generate-fields
    extrator/          # fluxo principal (wizard) + componentes de etapa
    historico/         # rascunhos salvos
  components/ui/       # primitivos de UI (drop-zone, toast, etc.)
  hooks/               # useDraftStorage (rascunhos em localStorage)
  lib/                 # tipos, utilitários e chaves de API
```

Persistência é 100% no cliente — o app **não usa banco de dados**.
