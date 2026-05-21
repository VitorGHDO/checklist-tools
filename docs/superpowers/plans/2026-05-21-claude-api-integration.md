# Claude API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar Anthropic Claude como terceiro provedor de IA, com chaves de API independentes por provedor no localStorage.

**Architecture:** Um novo módulo `src/lib/api-keys.ts` centraliza leitura/escrita/migração das chaves; o modal é redesenhado com três seções empilhadas; as rotas de API recebem `callClaude()` e `detectProvider()` atualizado; o seletor de modelos ganha um optgroup Claude.

**Tech Stack:** Next.js 15 App Router, `@anthropic-ai/sdk`, TypeScript, Tailwind CSS 4, localStorage

> **ATENÇÃO:** Nenhum commit. Não executar `git add`, `git commit` nem `git push` em nenhuma etapa.

---

## File Structure

| Ação | Arquivo | Responsabilidade |
|------|---------|------------------|
| **Criar** | `src/lib/api-keys.ts` | CRUD de chaves por provedor + migração da chave legada |
| **Modificar** | `src/lib/types.ts` | `AIProvider` + dois modelos Claude em `AI_MODELS` |
| **Modificar** | `src/app/extrator/components/api-key-modal.tsx` | Modal com três campos independentes |
| **Modificar** | `src/app/extrator/components/ai-correction-step.tsx` | `getApiKey` usa provedor; optgroup Claude |
| **Modificar** | `src/app/api/correct-text/route.ts` | `callClaude()` + `detectProvider` atualizado |
| **Modificar** | `src/app/api/generate-fields/route.ts` | idem |

---

## Task 1: Instalar `@anthropic-ai/sdk`

**Files:**
- Run: `npm install @anthropic-ai/sdk` na raiz do projeto

- [ ] **Step 1: Instalar o pacote**

```bash
npm install @anthropic-ai/sdk
```

Saída esperada: linha `added N packages` sem erros.

- [ ] **Step 2: Verificar instalação**

```bash
node -e "require('@anthropic-ai/sdk'); console.log('OK')"
```

Saída esperada: `OK`

---

## Task 2: Atualizar tipos em `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts` (linhas 14 e 23-29)

- [ ] **Step 1: Expandir `AIProvider` e adicionar modelos Claude**

Localizar e substituir:

```typescript
// ANTES
export type AIProvider = "gemini" | "openai";
```

```typescript
// DEPOIS
export type AIProvider = "gemini" | "openai" | "anthropic";
```

Localizar e substituir `AI_MODELS`:

```typescript
// ANTES
export const AI_MODELS: AIModel[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (recomendado)", provider: "gemini", free: true },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (mais preciso)", provider: "gemini", free: true },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", free: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", free: false },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", free: false },
];
```

```typescript
// DEPOIS
export const AI_MODELS: AIModel[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (recomendado)", provider: "gemini", free: true },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (mais preciso)", provider: "gemini", free: true },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", free: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", free: false },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", free: false },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (recomendado)", provider: "anthropic", free: false },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5 (rápido)", provider: "anthropic", free: false },
];
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: nenhuma saída (zero erros).

---

## Task 3: Criar `src/lib/api-keys.ts`

**Files:**
- Create: `src/lib/api-keys.ts`

Este módulo centraliza toda leitura/escrita de chaves no localStorage. É usado apenas no browser (modal + `ai-correction-step.tsx`).

- [ ] **Step 1: Criar o arquivo**

```typescript
import type { AIProvider } from "@/lib/types";

const KEY_MAP: Record<AIProvider, string> = {
  gemini: "checklist_tools_api_key_gemini",
  openai: "checklist_tools_api_key_openai",
  anthropic: "checklist_tools_api_key_anthropic",
};

const LEGACY_KEY = "checklist_tools_api_key";

function detectLegacyProvider(key: string): AIProvider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-")) return "openai";
  return "gemini";
}

/** Migra a chave legada (única) para a chave do provedor correto e remove a antiga. */
export function migrateLegacyKey(): void {
  if (typeof window === "undefined") return;
  const stored = localStorage.getItem(LEGACY_KEY);
  if (!stored) return;
  try {
    const decoded = atob(stored);
    const provider = detectLegacyProvider(decoded);
    if (!localStorage.getItem(KEY_MAP[provider])) {
      localStorage.setItem(KEY_MAP[provider], stored);
    }
  } catch {
    // chave legada corrompida — apenas remover
  }
  localStorage.removeItem(LEGACY_KEY);
}

/** Retorna a chave decodificada para o provedor, ou null se não estiver configurada. */
export function getApiKey(provider: AIProvider): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(KEY_MAP[provider]);
  if (!stored) return null;
  try {
    return atob(stored);
  } catch {
    return null;
  }
}

/** Salva a chave (base64) para o provedor. */
export function saveApiKey(provider: AIProvider, key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_MAP[provider], btoa(key.trim()));
}

/** Remove a chave do provedor. */
export function removeApiKey(provider: AIProvider): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_MAP[provider]);
}

/** Retorna true se o provedor tem chave configurada. */
export function hasApiKey(provider: AIProvider): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(KEY_MAP[provider]);
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

---

## Task 4: Redesenhar `src/app/extrator/components/api-key-modal.tsx`

**Files:**
- Modify: `src/app/extrator/components/api-key-modal.tsx`

Substituir completamente o conteúdo do arquivo pelo código abaixo. O modal passa de um único campo para três seções empilhadas, uma por provedor.

- [ ] **Step 1: Reescrever o modal**

```typescript
"use client";

import { useState, useEffect } from "react";
import { X, Eye, EyeOff, KeyRound, ExternalLink } from "lucide-react";
import type { AIProvider } from "@/lib/types";
import {
  getApiKey,
  saveApiKey,
  removeApiKey,
  hasApiKey,
  migrateLegacyKey,
} from "@/lib/api-keys";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderConfig {
  provider: AIProvider;
  label: string;
  placeholder: string;
  prefix: string;
  linkHref: string;
  linkLabel: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "gemini",
    label: "Google Gemini",
    placeholder: "AIza...",
    prefix: "AIza",
    linkHref: "https://aistudio.google.com/apikey",
    linkLabel: "Google AI Studio (gratuito)",
  },
  {
    provider: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    prefix: "sk-",
    linkHref: "https://platform.openai.com/api-keys",
    linkLabel: "OpenAI API Keys (pago)",
  },
  {
    provider: "anthropic",
    label: "Anthropic Claude",
    placeholder: "sk-ant-...",
    prefix: "sk-ant-",
    linkHref: "https://console.anthropic.com/settings/keys",
    linkLabel: "Anthropic Console (pago)",
  },
];

export function ApiKeyModal({ isOpen, onClose }: Props) {
  const [keys, setKeys] = useState<Record<AIProvider, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
  });
  const [show, setShow] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
  });
  const [configured, setConfigured] = useState<Record<AIProvider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    migrateLegacyKey();
    setKeys({
      gemini: getApiKey("gemini") ?? "",
      openai: getApiKey("openai") ?? "",
      anthropic: getApiKey("anthropic") ?? "",
    });
    setConfigured({
      gemini: hasApiKey("gemini"),
      openai: hasApiKey("openai"),
      anthropic: hasApiKey("anthropic"),
    });
  }, [isOpen]);

  function handleSave(provider: AIProvider) {
    const key = keys[provider].trim();
    if (!key) {
      removeApiKey(provider);
    } else {
      saveApiKey(provider, key);
    }
    setConfigured((prev) => ({ ...prev, [provider]: !!key }));
  }

  function handleRemove(provider: AIProvider) {
    removeApiKey(provider);
    setKeys((prev) => ({ ...prev, [provider]: "" }));
    setConfigured((prev) => ({ ...prev, [provider]: false }));
  }

  function toggleShow(provider: AIProvider) {
    setShow((prev) => ({ ...prev, [provider]: !prev[provider] }));
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#173872]/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl border border-[#e8e8e8] w-full max-w-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <h2 className="text-base font-semibold text-[#464E5F] flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#173872]" />
            Chaves de API
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="px-5 py-3 text-xs text-[#80808F] border-b border-[#e8e8e8] bg-[#F9F9F9]">
          Chaves salvas localmente no navegador — nunca enviadas para nosso servidor.
        </p>

        {/* Provider sections */}
        <div className="divide-y divide-[#e8e8e8]">
          {PROVIDERS.map(({ provider, label, placeholder, linkHref, linkLabel }) => (
            <div key={provider} className="px-5 py-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#464E5F]">{label}</span>
                {configured[provider] ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#0BB783]/10 text-[#0BB783] border border-[#0BB783]/30">
                    Configurada
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#F9F9F9] text-[#80808F] border border-[#e8e8e8]">
                    Não configurada
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type={show[provider] ? "text" : "password"}
                  value={keys[provider]}
                  onChange={(e) =>
                    setKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                  }
                  placeholder={placeholder}
                  className="w-full bg-white border border-[#d0d0d0] rounded-lg px-3 py-2 pr-10 text-sm font-mono text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#173872]/30 focus:border-[#173872]/50 transition-colors"
                />
                <button
                  onClick={() => toggleShow(provider)}
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#80808F] hover:text-[#464E5F] transition-colors"
                >
                  {show[provider] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSave(provider)}
                  className="px-3 py-1.5 rounded-lg bg-[#ED3237] hover:bg-[#A5232D] text-white text-xs font-medium transition-colors"
                >
                  Salvar
                </button>
                {configured[provider] && (
                  <button
                    onClick={() => handleRemove(provider)}
                    className="px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#80808F] text-xs transition-colors"
                  >
                    Remover
                  </button>
                )}
                <a
                  href={linkHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs text-[#173872] hover:text-[#ED3237] transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {linkLabel}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e8e8e8] bg-[#F9F9F9] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

---

## Task 5: Atualizar `ai-correction-step.tsx` — seletor de modelos e `getApiKey`

**Files:**
- Modify: `src/app/extrator/components/ai-correction-step.tsx`

Duas mudanças: (1) `getApiKey` passa a ler a chave do provedor correto via `api-keys.ts`; (2) adicionar optgroup Claude no seletor.

- [ ] **Step 1: Adicionar import de `api-keys.ts`**

Localizar os imports no topo do arquivo. Adicionar:

```typescript
import { getApiKey as getProviderApiKey } from "@/lib/api-keys";
```

- [ ] **Step 2: Atualizar o callback `getApiKey`**

Localizar o `useCallback` chamado `getApiKey` que lê `localStorage.getItem("checklist_tools_api_key")`. Substituí-lo por:

```typescript
const getApiKey = useCallback((): string | null => {
  if (typeof window === "undefined") return null;
  const provider = AI_MODELS.find((m) => m.id === model)?.provider ?? "gemini";
  return getProviderApiKey(provider);
}, [model]);
```

`AI_MODELS` já é importado de `@/lib/types` — verifique se o import existe, caso contrário adicione-o.

- [ ] **Step 3: Adicionar optgroup Claude no seletor de modelos**

Localizar a seção do `<select>` que renderiza os modelos (há `optgroup` para Gemini e OpenAI). Após o `optgroup` do OpenAI, adicionar:

```typescript
const anthropicModels = AI_MODELS.filter((m) => m.provider === "anthropic");
```

(Esta linha deve ficar junto com as outras filtragens, ex: `const geminiModels = ...`)

E no JSX, após o `</optgroup>` do OpenAI:

```tsx
<optgroup label="Anthropic Claude (pago)">
  {anthropicModels.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name}
    </option>
  ))}
</optgroup>
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

---

## Task 6: Atualizar `src/app/api/correct-text/route.ts`

**Files:**
- Modify: `src/app/api/correct-text/route.ts`

Adicionar `callClaude()`, atualizar `detectProvider()` e a validação de chave, e ramificar no `provider === "anthropic"`.

- [ ] **Step 1: Adicionar import do SDK Anthropic e lista de modelos**

Localizar os imports no topo do arquivo. Adicionar:

```typescript
import Anthropic from "@anthropic-ai/sdk";
```

Localizar as constantes de modelos e adicionar:

```typescript
const ANTHROPIC_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
```

- [ ] **Step 2: Atualizar `detectProvider`**

```typescript
function detectProvider(model: string): AIProvider {
  if (GEMINI_MODELS.includes(model)) return "gemini";
  if (OPENAI_MODELS.includes(model)) return "openai";
  if (ANTHROPIC_MODELS.includes(model)) return "anthropic";
  return "gemini";
}
```

- [ ] **Step 3: Adicionar `callClaude` após `callOpenAI`**

```typescript
async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  images: { mimeType: string; base64: string }[]
) {
  const anthropic = new Anthropic({ apiKey });

  const contentParts: Anthropic.MessageParam["content"] = [
    { type: "text", text: userPrompt },
  ];

  for (const img of images) {
    contentParts.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    });
  }

  const response = await anthropic.messages.create({
    model,
    max_tokens: 16000,
    temperature: 0.1,
    system: systemPrompt,
    messages: [{ role: "user", content: contentParts }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}
```

- [ ] **Step 4: Atualizar validação de chave no `POST`**

Localizar o bloco que valida a chave OpenAI:

```typescript
if (provider === "openai" && !apiKey.startsWith("sk-")) {
```

Substituir por:

```typescript
if (provider === "openai" && !apiKey.startsWith("sk-")) {
  return NextResponse.json(
    { success: false, error: "Formato de API Key OpenAI inválido (deve começar com sk-)" },
    { status: 400 }
  );
}
if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
  return NextResponse.json(
    { success: false, error: "Formato de API Key Anthropic inválido (deve começar com sk-ant-)" },
    { status: 400 }
  );
}
```

- [ ] **Step 5: Adicionar ramificação Anthropic no bloco de chamada**

Localizar:

```typescript
if (provider === "gemini") {
  correctedText = await withRetry(() =>
    callGemini(apiKey, model, systemPrompt, userPrompt, images)
  );
} else {
  correctedText = await withRetry(() =>
    callOpenAI(apiKey, model, systemPrompt, userPrompt, images)
  );
}
```

Substituir por:

```typescript
if (provider === "gemini") {
  correctedText = await withRetry(() =>
    callGemini(apiKey, model, systemPrompt, userPrompt, images)
  );
} else if (provider === "anthropic") {
  correctedText = await withRetry(() =>
    callClaude(apiKey, model, systemPrompt, userPrompt, images)
  );
} else {
  correctedText = await withRetry(() =>
    callOpenAI(apiKey, model, systemPrompt, userPrompt, images)
  );
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

---

## Task 7: Atualizar `src/app/api/generate-fields/route.ts`

**Files:**
- Modify: `src/app/api/generate-fields/route.ts`

Mesmas adições do Task 6, adaptadas para a rota de geração de campos (sem imagens).

- [ ] **Step 1: Adicionar import e lista de modelos Anthropic**

```typescript
import Anthropic from "@anthropic-ai/sdk";
```

```typescript
const ANTHROPIC_MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
```

- [ ] **Step 2: Atualizar `detectProvider`**

```typescript
function detectProvider(model: string): AIProvider {
  if (GEMINI_MODELS.includes(model)) return "gemini";
  if (OPENAI_MODELS.includes(model)) return "openai";
  if (ANTHROPIC_MODELS.includes(model)) return "anthropic";
  return "gemini";
}
```

- [ ] **Step 3: Adicionar `callClaude` após `callOpenAI`**

```typescript
async function callClaude(
  apiKey: string,
  model: string,
  text: string,
  checklistType?: string,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    temperature: 0.1,
    system: buildSystemPrompt(checklistType),
    messages: [
      {
        role: "user",
        content: `Texto do checklist corrigido:\n\n${text}\n\nRetorne o JSON agora:`,
      },
    ],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}
```

- [ ] **Step 4: Atualizar validação de chave no `POST`**

Após a validação OpenAI existente, adicionar:

```typescript
if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
  return NextResponse.json(
    { success: false, error: "Formato de API Key Anthropic inválido (deve começar com sk-ant-)" },
    { status: 400 }
  );
}
```

- [ ] **Step 5: Adicionar ramificação Anthropic no bloco de chamada**

Localizar:

```typescript
if (provider === "gemini") {
  raw = await withRetry(() => callGemini(apiKey, model, text, checklistType));
} else {
  raw = await withRetry(() => callOpenAI(apiKey, model, text, checklistType));
}
```

Substituir por:

```typescript
if (provider === "gemini") {
  raw = await withRetry(() => callGemini(apiKey, model, text, checklistType));
} else if (provider === "anthropic") {
  raw = await withRetry(() => callClaude(apiKey, model, text, checklistType));
} else {
  raw = await withRetry(() => callOpenAI(apiKey, model, text, checklistType));
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Saída esperada: zero erros.

---

## Self-Review

### Spec coverage

| Requisito | Task |
|-----------|------|
| Instalar `@anthropic-ai/sdk` | Task 1 |
| `AIProvider` inclui `"anthropic"` | Task 2 |
| `claude-sonnet-4-6` e `claude-haiku-4-5-20251001` em `AI_MODELS` | Task 2 |
| `src/lib/api-keys.ts` com `getApiKey`, `saveApiKey`, `removeApiKey`, `hasApiKey`, `migrateLegacyKey` | Task 3 |
| Modal com três campos independentes | Task 4 |
| Badge "Configurada / Não configurada" por provedor | Task 4 |
| Link externo Anthropic Console | Task 4 |
| Migração da chave legada ao abrir modal | Task 4 |
| `getApiKey` em `ai-correction-step` usa provedor do modelo | Task 5 |
| Optgroup Claude no seletor de modelos | Task 5 |
| `callClaude` em `correct-text` com suporte a imagens | Task 6 |
| `detectProvider` retorna `"anthropic"` | Tasks 6, 7 |
| Validação de prefixo `sk-ant-` | Tasks 6, 7 |
| `callClaude` em `generate-fields` | Task 7 |
| Nenhum commit | Todas as tasks |

### Placeholder scan: nenhum encontrado.

### Type consistency
- `AIProvider` definido em Task 2, usado em Tasks 3, 4, 5, 6, 7 — consistente.
- `getProviderApiKey(provider)` (alias de `getApiKey` de `api-keys.ts`) — nomeado explicitamente no import para evitar colisão com o `getApiKey` local em `ai-correction-step.tsx`.
- `Anthropic.MessageParam["content"]` usado em Task 6 para tipagem dos `contentParts`.
