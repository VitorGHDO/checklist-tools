# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # start dev server (localhost:3000)
npm run build     # production build
npm run lint      # ESLint
npx prisma generate          # regenerate Prisma client after schema changes
npx prisma db push           # sync schema to database
npx prisma studio            # open Prisma GUI
```

Docker:
```bash
docker compose up --build    # build and run with MySQL via docker-compose
```

There are no tests configured.

## Architecture

**Next.js 15 App Router** with TypeScript and Tailwind CSS 4. The app is a tool for extracting and correcting automotive checklist PDFs using AI, then exporting database migration code (Laravel PHP).

### Source layout

```
src/
  app/
    api/
      correct-text/route.ts    # AI text correction (Gemini or OpenAI)
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
    utils.ts                   # cleanEntregaImpecavelText, diff helpers, etc.
    prisma.ts                  # Prisma singleton
prisma/schema.prisma           # MySQL schema
```

### Multi-step extractor flow

1. **Project selection** — "Entrega Impecável" (active) or "Pós Venda" (disabled)
2. **File upload** — PDF + optional reference images (used as AI correction hints)
3. **PDF extraction** — `/api/extract-pdf` returns per-page text via `pdf-parse`
4. **AI correction** — `/api/correct-text` calls Gemini or OpenAI; images are sent as vision context per page; retries handle 503/529
5. **Section editing** — parsed sections can be split/merged/reordered in the UI
6. **Field generation** — `/api/generate-fields` produces DB column names from section questions
7. **Export** — generates Laravel migration PHP and `checklist_status` DB format

### API key handling

API keys are stored **client-side only** (base64 in `localStorage`). They are sent from the browser to the Next.js API routes in the request body — they are never persisted server-side.

### Database

MySQL via Prisma. Key tables: `checklist`, `checklist_perguntas` (questions/fields per checklist), `consultor`, `mecanico`, `concessionaria`. `DATABASE_URL` must be set in `.env.local`.

### AI models

Defined in `src/lib/types.ts` (`AI_MODELS`). Gemini models (free): `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`. OpenAI (paid): `gpt-4o`, `gpt-4o-mini`. Model routing is handled in the API routes based on the `provider` field.

### Future: Designer

`DesignerElement` and `PageData` types exist in `types.ts` for a planned drag-and-drop canvas PDF designer — not yet implemented.
