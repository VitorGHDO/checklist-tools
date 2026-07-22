# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # start dev server (localhost:3000)
npm run build     # production build
npm run start     # run the production build
npm run lint      # ESLint
```

There are no tests configured.

## Architecture

**Next.js 16 App Router** with TypeScript and Tailwind CSS 4. The app is a tool for extracting and correcting automotive checklist PDFs using AI, then exporting database migration code (Laravel PHP).

### Source layout

```
src/
  app/
    api/
      correct-text/route.ts    # AI text correction via Anthropic (Claude)
      extract-pdf/route.ts     # PDF text extraction via pdf-parse
      generate-fields/route.ts # AI field generation for DB schema
    extrator/
      page.tsx                 # Main feature page (multi-step wizard)
      components/              # Step components (upload, correction, sections)
    layout.tsx
    page.tsx                   # Landing / project selector
  components/ui/               # Shared UI primitives (drop-zone, toast)
  lib/
    types.ts                   # All shared TypeScript types and constants
    utils.ts                   # cn (classnames) + formatFileSize
```

### Multi-step extractor flow

1. **Project selection** — "Entrega Impecável" (active) or "Pós Venda" (disabled)
2. **File upload** — PDF + optional reference images (used as AI correction hints)
3. **PDF extraction** — `/api/extract-pdf` returns per-page text via `pdf-parse`
4. **AI correction** — `/api/correct-text` calls Anthropic (Claude); images are sent as vision context per page; retries handle 503/529
5. **Section editing** — parsed sections can be split/merged/reordered in the UI
6. **Field generation** — `/api/generate-fields` produces DB column names from section questions
7. **Export** — generates Laravel migration PHP and `checklist_status` DB format

### API key handling

API keys are stored **client-side only** (base64 in `localStorage`). They are sent from the browser to the Next.js API routes in the request body — they are never persisted server-side.

### Persistence

There is no server-side database. Work-in-progress checklists are saved as **drafts in the browser** (`localStorage`, see `src/hooks/useDraftStorage.ts`) and listed under `/historico`. The tool's output is generated **code/text** (Laravel migration PHP and `checklist_status` / `checklist_perguntas` SQL) copied out and applied elsewhere.

### AI models

Defined in `src/lib/types.ts` (`AI_MODELS`) — all Anthropic (Claude): `claude-sonnet-4-6` (default) and `claude-haiku-4-5-20251001`. Both API routes validate the `sk-ant-` key and call the Anthropic SDK; shared helpers (retry, key validation, friendly error messages) live in `src/lib/ai.ts`.
