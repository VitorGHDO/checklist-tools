# Claude API Integration — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

## Goal

Add Anthropic Claude as a third AI provider alongside Gemini and OpenAI, with per-provider API key storage.

## Models to Add

| Model ID | Display Name | Provider | Free |
|---|---|---|---|
| `claude-sonnet-4-6` | Claude Sonnet 4.6 (recomendado) | anthropic | false |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 (rápido) | anthropic | false |

## API Key Storage

**Per-provider localStorage keys:**
- `checklist_tools_api_key_gemini`
- `checklist_tools_api_key_openai`
- `checklist_tools_api_key_anthropic`

**Legacy migration:** On first modal open, if `checklist_tools_api_key` (old single key) exists, detect its provider by prefix (`AIza→gemini`, `sk-ant-→anthropic`, `sk-→openai`), migrate to the correct new key, delete the old key.

**Key validation prefixes:**
- Gemini: starts with `AIza`
- OpenAI: starts with `sk-` (but not `sk-ant-`)
- Anthropic: starts with `sk-ant-`

## Files Changed

### New
- `src/lib/api-keys.ts` — `getApiKey(provider)`, `saveApiKey(provider, key)`, `removeApiKey(provider)`, `migrateLegacyKey()`. Used by modal and API routes.

### Modified
- `src/lib/types.ts` — add `"anthropic"` to `AIProvider`; add 2 Claude models to `AI_MODELS`
- `src/app/extrator/components/api-key-modal.tsx` — three stacked fields (one per provider); badge showing which keys are configured; per-field save/clear; use `api-keys.ts`
- `src/app/extrator/components/ai-correction-step.tsx` — `getApiKey` reads from `api-keys.ts` using detected provider; add Claude `optgroup` in model selector
- `src/app/api/correct-text/route.ts` — add `"anthropic"` to `ANTHROPIC_MODELS` array and `detectProvider()`; add `callClaude()` using `@anthropic-ai/sdk`; branch on provider
- `src/app/api/generate-fields/route.ts` — same changes as correct-text route

### Install
- `@anthropic-ai/sdk` npm package

## Claude API Shape

**correct-text (with vision):**
```typescript
const anthropic = new Anthropic({ apiKey });
const response = await anthropic.messages.create({
  model,
  max_tokens: 16000,
  temperature: 0.1,
  system: systemPrompt,
  messages: [{
    role: "user",
    content: [
      { type: "text", text: userPrompt },
      ...images.map(img => ({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.base64 }
      }))
    ]
  }]
});
return response.content[0].type === "text" ? response.content[0].text : "";
```

**generate-fields (text only):**
```typescript
const response = await anthropic.messages.create({
  model,
  max_tokens: 8000,
  temperature: 0.1,
  system: systemPrompt,
  messages: [{ role: "user", content: userPrompt }]
});
return response.content[0].type === "text" ? response.content[0].text : "";
```

## API Key Modal UX

Three stacked sections, each with:
- Provider label + badge "Configurada" / "Não configurada"
- Password input with show/hide toggle
- Botão "Salvar" (validates prefix, saves to localStorage)
- Botão "Remover" (only when key is set)

No tabs — all visible at once. Minimal, same style as the current modal.

## Retry / Error Handling

Reuse the existing `withRetry()` wrapper. Anthropic HTTP 529 (overloaded) is already covered. Add 529 to the retry condition if not present.
