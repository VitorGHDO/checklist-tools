# Checklist Name + Cache localStorage + Histórico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar nome de checklist, persistência automática via localStorage e tela de histórico ao fluxo do extrator, sem alterar lógica de SQL/campos/status.

**Architecture:** Um hook `useDraftStorage` abstrai todo acesso ao localStorage; o `page.tsx` do extrator passa um callback `onDataChange` para `AiCorrectionStep`, que replica o estado serializado de volta para o draft. Ao abrir a ferramenta, um banner oferece retomada do rascunho em progresso. Uma rota `/historico` lista todos os drafts lidos diretamente do localStorage.

**Tech Stack:** Next.js 15 App Router, React `useState`, TypeScript, Tailwind CSS 4, `crypto.randomUUID()` (nativo do browser)

> **ATENÇÃO:** Nenhum commit deve ser feito. Não execute `git add`, `git commit` nem `git push` em nenhuma etapa.

---

## Estado atual do código (descoberto na leitura)

- Estado principal em `src/app/extrator/page.tsx` (useState): `selectedProject`, `checklistType`, `pdfFile`, `images`
- Estado de processamento IA em `src/app/extrator/components/ai-correction-step.tsx` (useState): `extractedText`, `correctedText`, `migrationFields`, `workingGroups`, `migrationTableName`, `checklistId`, `statusSqlOutput`, `statusDbOutput`
- Estado de perguntas em `src/app/extrator/components/perguntas-status-tab.tsx` (useState interno): `perguntas`, `sqlOutput`, `dbOutput`
- localStorage **já usado**: apenas `checklist_tools_api_key` em `api-key-modal.tsx` (base64)
- Fluxo de passos: condicional por renderização — sem número de step explícito

## Estrutura dos arquivos

**Criar:**
- `src/hooks/useDraftStorage.ts` — Hook com todas as operações de leitura/escrita de drafts no localStorage
- `src/app/extrator/components/checklist-name-step.tsx` — Step 0: UI de nome + descrição + botão Iniciar
- `src/app/historico/page.tsx` — Página de histórico

**Modificar:**
- `src/lib/types.ts` — Adicionar tipos `ChecklistDraft`, `DraftDados`, `DraftsIndex`
- `src/app/extrator/page.tsx` — Integrar hook, novo step 0, banner de retomada, callbacks de auto-save
- `src/app/extrator/components/ai-correction-step.tsx` — Adicionar props `initialData` e `onDataChange`
- `src/app/extrator/components/perguntas-status-tab.tsx` — Adicionar prop `onPerguntasChange`
- `src/app/page.tsx` — Adicionar link "Histórico" na navegação

---

## Task 1: Tipos TypeScript

**Arquivo:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Adicionar tipos ao fim de `src/lib/types.ts`**

Acrescentar após as definições existentes:

```typescript
// ─── Draft / localStorage ──────────────────────────────────────────────────

export interface DraftDados {
  texto_extraido: string;
  texto_corrigido: string;
  campos_gerados: MigrationField[];
  working_groups: WorkingGroup[];
  migration_table_name: string;
  checklist_id: string;
  status_sql: string;
  status_db: string;
  perguntas: PerguntaAssociada[];
  perguntas_sql: string;
  perguntas_db: string;
  sql_gerado: string;
}

export interface ChecklistDraft {
  id: string;
  nome: string;
  descricao: string;
  tipo: ChecklistType | null;
  etapa_atual: number; // 1=projeto, 2=tipo, 3=upload, 4=IA
  criado_em: string;   // ISO string
  atualizado_em: string;
  finalizado: boolean;
  dados: DraftDados;
}

export type DraftsIndex = string[]; // lista de IDs
```

---

## Task 2: Hook `useDraftStorage`

**Arquivo:**
- Create: `src/hooks/useDraftStorage.ts`

- [ ] **Step 1: Criar o hook completo**

```typescript
"use client";

import { useCallback } from "react";
import type { ChecklistDraft, DraftDados, DraftsIndex, ChecklistType } from "@/lib/types";

const INDEX_KEY = "checklist_drafts_index";
const draftKey = (id: string) => `checklist_draft:${id}`;

function getIndex(): DraftsIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as DraftsIndex) : [];
  } catch {
    return [];
  }
}

function setIndex(ids: DraftsIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

function readDraft(id: string): ChecklistDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as ChecklistDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: ChecklistDraft): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(draftKey(draft.id), JSON.stringify(draft));
    const idx = getIndex();
    if (!idx.includes(draft.id)) {
      setIndex([...idx, draft.id]);
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      return { ok: false, error: "quota" };
    }
    return { ok: false, error: String(e) };
  }
}

export function createEmptyDados(): DraftDados {
  return {
    texto_extraido: "",
    texto_corrigido: "",
    campos_gerados: [],
    working_groups: [],
    migration_table_name: "tabela_generica",
    checklist_id: "217",
    status_sql: "",
    status_db: "",
    perguntas: [],
    perguntas_sql: "",
    perguntas_db: "",
    sql_gerado: "",
  };
}

export function useDraftStorage() {
  const createDraft = useCallback(
    (nome: string, descricao: string, tipo: ChecklistType | null): ChecklistDraft => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const draft: ChecklistDraft = {
        id,
        nome,
        descricao,
        tipo,
        etapa_atual: 1,
        criado_em: now,
        atualizado_em: now,
        finalizado: false,
        dados: createEmptyDados(),
      };
      writeDraft(draft);
      return draft;
    },
    []
  );

  const updateDraft = useCallback(
    (
      id: string,
      partial: Partial<Omit<ChecklistDraft, "id" | "criado_em">>
    ): { ok: boolean; error?: string } => {
      const existing = readDraft(id);
      if (!existing) return { ok: false, error: "not_found" };
      const updated: ChecklistDraft = {
        ...existing,
        ...partial,
        id,
        criado_em: existing.criado_em,
        atualizado_em: new Date().toISOString(),
        dados: partial.dados ? { ...existing.dados, ...partial.dados } : existing.dados,
      };
      return writeDraft(updated);
    },
    []
  );

  const getDraft = useCallback((id: string): ChecklistDraft | null => {
    return readDraft(id);
  }, []);

  const listDrafts = useCallback((): ChecklistDraft[] => {
    const ids = getIndex();
    return ids
      .map(readDraft)
      .filter((d): d is ChecklistDraft => d !== null)
      .sort(
        (a, b) =>
          new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime()
      );
  }, []);

  const deleteDraft = useCallback((id: string): void => {
    localStorage.removeItem(draftKey(id));
    setIndex(getIndex().filter((i) => i !== id));
  }, []);

  const getInProgressDrafts = useCallback((): ChecklistDraft[] => {
    return listDrafts().filter((d) => !d.finalizado);
  }, [listDrafts]);

  return {
    createDraft,
    updateDraft,
    getDraft,
    listDrafts,
    deleteDraft,
    getInProgressDrafts,
  };
}
```

---

## Task 3: Step 0 — ChecklistNameStep

**Arquivo:**
- Create: `src/app/extrator/components/checklist-name-step.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
"use client";

import { useState } from "react";

interface Props {
  onIniciar: (nome: string, descricao: string) => void;
}

export function ChecklistNameStep({ onIniciar }: Props) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    onIniciar(nome.trim(), descricao.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Novo Checklist</h1>
          <p className="text-gray-400 text-sm">
            Dê um nome para identificar este trabalho no histórico.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Nome do checklist <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Ram 1500 — Stellantis — Mai/2025"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Descrição / observação{" "}
              <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: versão com 85 perguntas, sem seção de recall"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!nome.trim()}
            className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white"
          >
            Iniciar
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Task 4: Modificar `ai-correction-step.tsx` — props `initialData` e `onDataChange`

**Arquivo:**
- Modify: `src/app/extrator/components/ai-correction-step.tsx`

O objetivo é:
1. Receber `initialData?: DraftDados` como prop — inicializar state a partir dele quando fornecido
2. Receber `onDataChange?: (data: Partial<DraftDados>) => void` — chamar sempre que estado serializável mudar
3. Passar `onPerguntasChange` para `PerguntasStatusTab`

- [ ] **Step 1: Ler o arquivo para confirmar assinatura atual da interface Props**

Verificar a interface `Props` em `ai-correction-step.tsx` (procurar `interface.*Props` ou `type.*Props`). Confirmar campos existentes antes de adicionar.

- [ ] **Step 2: Expandir a interface Props**

Localizar a definição de Props do componente (tipicamente `interface AiCorrectionStepProps` ou similar) e adicionar os novos campos:

```typescript
initialData?: import("@/lib/types").DraftDados;
onDataChange?: (data: Partial<import("@/lib/types").DraftDados>) => void;
```

- [ ] **Step 3: Inicializar estado a partir de `initialData`**

Nos `useState` de `extractedText`, `correctedText`, `migrationFields`, `workingGroups`, `migrationTableName`, `checklistId`, `statusSqlOutput`, `statusDbOutput`, alterar o valor inicial para usar `initialData` quando presente:

```typescript
const [extractedText, setExtractedText] = useState(initialData?.texto_extraido ?? "");
const [correctedText, setCorrectedText] = useState(initialData?.texto_corrigido ?? "");
const [migrationFields, setMigrationFields] = useState<MigrationField[]>(
  initialData?.campos_gerados ?? []
);
const [workingGroups, setWorkingGroups] = useState<WorkingGroup[]>(
  initialData?.working_groups ?? []
);
const [migrationTableName, setMigrationTableName] = useState(
  initialData?.migration_table_name ?? "tabela_generica"
);
const [checklistId, setChecklistId] = useState(initialData?.checklist_id ?? "217");
const [statusSqlOutput, setStatusSqlOutput] = useState(initialData?.status_sql ?? "");
const [statusDbOutput, setStatusDbOutput] = useState(initialData?.status_db ?? "");
```

- [ ] **Step 4: Adicionar `useEffect` para chamar `onDataChange` quando estado muda**

Adicionar após as declarações de estado existentes. O effect roda sempre que um dos campos serializáveis muda e notifica o pai:

```typescript
useEffect(() => {
  onDataChange?.({
    texto_extraido: extractedText,
    texto_corrigido: correctedText,
    campos_gerados: migrationFields,
    working_groups: workingGroups,
    migration_table_name: migrationTableName,
    checklist_id: checklistId,
    status_sql: statusSqlOutput,
    status_db: statusDbOutput,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [extractedText, correctedText, migrationFields, workingGroups, migrationTableName, checklistId, statusSqlOutput, statusDbOutput]);
```

- [ ] **Step 5: Criar handler `handlePerguntasChange` e passar para `PerguntasStatusTab`**

Adicionar callback para receber dados de perguntas do tab e repassar para `onDataChange`:

```typescript
const handlePerguntasChange = useCallback(
  (perguntasData: {
    perguntas: import("@/lib/types").PerguntaAssociada[];
    sqlOutput: string;
    dbOutput: string;
  }) => {
    onDataChange?.({
      perguntas: perguntasData.perguntas,
      perguntas_sql: perguntasData.sqlOutput,
      perguntas_db: perguntasData.dbOutput,
    });
  },
  [onDataChange]
);
```

Localizar onde `PerguntasStatusTab` é renderizado e adicionar a prop:

```typescript
<PerguntasStatusTab
  // ...props existentes...
  initialPerguntas={initialData?.perguntas}
  onPerguntasChange={handlePerguntasChange}
/>
```

---

## Task 5: Modificar `perguntas-status-tab.tsx` — props `initialPerguntas` e `onPerguntasChange`

**Arquivo:**
- Modify: `src/app/extrator/components/perguntas-status-tab.tsx`

- [ ] **Step 1: Expandir interface Props**

Localizar a interface/type de Props de `PerguntasStatusTab` e adicionar:

```typescript
initialPerguntas?: import("@/lib/types").PerguntaAssociada[];
onPerguntasChange?: (data: {
  perguntas: import("@/lib/types").PerguntaAssociada[];
  sqlOutput: string;
  dbOutput: string;
}) => void;
```

- [ ] **Step 2: Inicializar `perguntas` e `initialized` a partir de `initialPerguntas`**

Localizar os `useState` de `perguntas` e `initialized` e modificar:

```typescript
const [perguntas, setPerguntas] = useState<PerguntaAssociada[]>(
  initialPerguntas && initialPerguntas.length > 0 ? initialPerguntas : []
);
const [initialized, setInitialized] = useState(
  !!(initialPerguntas && initialPerguntas.length > 0)
);
```

- [ ] **Step 3: Adicionar `useEffect` para chamar `onPerguntasChange` ao mudar perguntas**

Adicionar após as declarações de estado:

```typescript
useEffect(() => {
  if (!initialized) return;
  onPerguntasChange?.({ perguntas, sqlOutput, dbOutput });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [perguntas, sqlOutput, dbOutput, initialized]);
```

---

## Task 6: Modificar `page.tsx` do extrator — integrar tudo

**Arquivo:**
- Modify: `src/app/extrator/page.tsx`

Esta é a tarefa mais complexa. Engloba: step 0, gerenciamento de draft, banner de retomada, auto-save via callbacks.

- [ ] **Step 1: Adicionar imports necessários**

No topo do arquivo, adicionar:

```typescript
import { useDraftStorage, createEmptyDados } from "@/hooks/useDraftStorage";
import { ChecklistNameStep } from "./components/checklist-name-step";
import type { ChecklistDraft, DraftDados } from "@/lib/types";
```

- [ ] **Step 2: Adicionar estados de draft e UI**

Após os `useState` existentes, adicionar:

```typescript
const [draftId, setDraftId] = useState<string | null>(null);
const [showNameStep, setShowNameStep] = useState(true);
const [inProgressDraft, setInProgressDraft] = useState<ChecklistDraft | null>(null);
const [saveStatus, setSaveStatus] = useState<"saved" | "idle">("idle");
const [quotaError, setQuotaError] = useState(false);
const [currentDraftData, setCurrentDraftData] = useState<DraftDados>(createEmptyDados());
const { createDraft, updateDraft, getInProgressDrafts, getDraft, deleteDraft } = useDraftStorage();
```

- [ ] **Step 3: Adicionar `useEffect` de inicialização — detectar draft em progresso**

```typescript
useEffect(() => {
  const inProgress = getInProgressDrafts();
  if (inProgress.length > 0) {
    setInProgressDraft(inProgress[0]);
  }
}, [getInProgressDrafts]);
```

- [ ] **Step 4: Adicionar `useEffect` de auto-save — salvar ao mudar etapa ou dados**

```typescript
const etapaAtual = !selectedProject
  ? 1
  : !checklistType
  ? 2
  : !pdfFile
  ? 3
  : 4;

useEffect(() => {
  if (!draftId) return;
  const result = updateDraft(draftId, {
    tipo: checklistType,
    etapa_atual: etapaAtual,
    dados: currentDraftData,
  });
  if (!result.ok && result.error === "quota") {
    setQuotaError(true);
    return;
  }
  setSaveStatus("saved");
  const timer = setTimeout(() => setSaveStatus("idle"), 2000);
  return () => clearTimeout(timer);
}, [draftId, selectedProject, checklistType, pdfFile, etapaAtual, currentDraftData, updateDraft]);
```

- [ ] **Step 5: Adicionar handler `handleIniciar` (callback do ChecklistNameStep)**

```typescript
const handleIniciar = useCallback(
  (nome: string, descricao: string) => {
    const draft = createDraft(nome, descricao, null);
    setDraftId(draft.id);
    setShowNameStep(false);
    setInProgressDraft(null);
  },
  [createDraft]
);
```

- [ ] **Step 6: Adicionar handler `handleRetomar`**

```typescript
const handleRetomar = useCallback(
  (draft: ChecklistDraft) => {
    setDraftId(draft.id);
    setInProgressDraft(null);
    setShowNameStep(false);
    if (draft.dados.working_groups?.length > 0) {
      // Dados de IA disponíveis — restaurar estado
      setCurrentDraftData(draft.dados);
    }
    if (draft.tipo) setChecklistType(draft.tipo);
    if (draft.dados.texto_extraido) {
      // etapa 4 — precisa re-upload de PDF
    }
  },
  []
);
```

- [ ] **Step 7: Adicionar handler `handleDataChange` (callback do AiCorrectionStep)**

```typescript
const handleDataChange = useCallback(
  (data: Partial<DraftDados>) => {
    setCurrentDraftData((prev) => ({ ...prev, ...data }));
  },
  []
);
```

- [ ] **Step 8: Renderizar Step 0 quando `showNameStep === true`**

Localizar o `return` principal do componente. Adicionar **antes** de qualquer outro conteúdo:

```typescript
// Banner draft em progresso (mostrar apenas no step 0)
if (showNameStep) {
  return (
    <>
      {inProgressDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-900/90 border-b border-yellow-700 px-6 py-3 flex items-center gap-4">
          <span className="text-yellow-200 text-sm flex-1">
            Checklist em progresso:{" "}
            <strong className="text-white">{inProgressDraft.nome}</strong>
            {" — "}Etapa {inProgressDraft.etapa_atual} de 4
          </span>
          <button
            onClick={() => handleRetomar(inProgressDraft)}
            className="px-4 py-1.5 rounded-md bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium transition-colors"
          >
            Continuar
          </button>
          <a
            href="/historico"
            className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
          >
            Ver histórico
          </a>
          <button
            onClick={() => setInProgressDraft(null)}
            className="px-4 py-1.5 rounded-md bg-transparent border border-gray-600 hover:bg-gray-800 text-gray-300 text-sm transition-colors"
          >
            Começar novo
          </button>
        </div>
      )}
      <div className={inProgressDraft ? "pt-14" : ""}>
        <ChecklistNameStep onIniciar={handleIniciar} />
      </div>
    </>
  );
}
```

- [ ] **Step 9: Adicionar indicador "Salvo" e alerta de quota no layout principal**

Após o `return` principal (fora do bloco de step 0), adicionar no topo do JSX existente:

```typescript
// Indicador de save e alerta de quota
{draftId && saveStatus === "saved" && (
  <div className="fixed bottom-4 right-4 z-50 bg-green-900/90 text-green-300 text-xs px-3 py-1.5 rounded-full border border-green-700 pointer-events-none select-none">
    Salvo
  </div>
)}
{quotaError && (
  <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-red-950 border border-red-700 text-red-300 text-sm px-4 py-3 rounded-lg">
    <strong className="text-red-200">Limite de armazenamento atingido.</strong>
    {" "}Acesse o{" "}
    <a href="/historico" className="underline text-red-300 hover:text-white">
      histórico
    </a>{" "}
    e apague rascunhos antigos para liberar espaço.
    <button
      onClick={() => setQuotaError(false)}
      className="ml-3 text-red-400 hover:text-white"
    >
      ✕
    </button>
  </div>
)}
```

- [ ] **Step 10: Passar props `initialData` e `onDataChange` para `AiCorrectionStep`**

Localizar onde `<AiCorrectionStep` é renderizado e adicionar:

```typescript
<AiCorrectionStep
  // ...props existentes...
  initialData={currentDraftData}
  onDataChange={handleDataChange}
/>
```

- [ ] **Step 11: Adicionar aviso de re-upload de PDF ao retomar etapa ≥ 3**

Adicionar estado e JSX para o aviso. Adicionar estado:

```typescript
const [showReuploadWarning, setShowReuploadWarning] = useState(false);
```

No `handleRetomar`, após restaurar o estado, checar se etapa requer PDF:

```typescript
if (draft.etapa_atual >= 3 && draft.dados.texto_extraido) {
  setShowReuploadWarning(true);
}
```

Adicionar JSX do aviso (condicional, dentro do fluxo principal após o banner de quota):

```typescript
{showReuploadWarning && (
  <div className="fixed top-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
    <div className="bg-orange-950 border border-orange-700 text-orange-200 text-sm px-5 py-3 rounded-lg shadow-lg pointer-events-auto max-w-md text-center">
      Esta etapa requer o upload do PDF novamente. Os dados anteriores foram restaurados.
      <button
        onClick={() => setShowReuploadWarning(false)}
        className="ml-3 text-orange-400 hover:text-white"
      >
        ✕
      </button>
    </div>
  </div>
)}
```

---

## Task 7: Página de Histórico

**Arquivo:**
- Create: `src/app/historico/page.tsx`

- [ ] **Step 1: Criar a página de histórico completa**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistDraft } from "@/lib/types";
import { useDraftStorage } from "@/hooks/useDraftStorage";

const STEP_LABELS: Record<number, string> = {
  1: "Seleção de projeto",
  2: "Tipo de checklist",
  3: "Upload de arquivos",
  4: "Processamento / edição IA",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoricoPage() {
  const router = useRouter();
  const { listDrafts, deleteDraft } = useDraftStorage();
  const [drafts, setDrafts] = useState<ChecklistDraft[]>([]);
  const [sqlModal, setSqlModal] = useState<{ nome: string; sql: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(listDrafts());
  }, [listDrafts]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteDraft(id);
      setDrafts(listDrafts());
      setDeleteConfirm(null);
    },
    [deleteDraft, listDrafts]
  );

  const handleContinuar = useCallback(
    (draft: ChecklistDraft) => {
      // Armazenar o ID do draft para retomada na página do extrator
      sessionStorage.setItem("checklist_resume_id", draft.id);
      router.push("/extrator");
    },
    [router]
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/extrator")}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold">Histórico de Checklists</h1>
        </div>

        {drafts.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">Nenhum checklist salvo ainda.</p>
            <p className="text-sm">Os rascunhos aparecem aqui automaticamente ao criar um novo checklist.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-white truncate">{draft.nome}</span>
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${
                        draft.finalizado
                          ? "bg-green-950 border-green-700 text-green-400"
                          : "bg-yellow-950 border-yellow-700 text-yellow-400"
                      }`}
                    >
                      {draft.finalizado ? "Finalizado" : "Em progresso"}
                    </span>
                  </div>
                  {draft.descricao && (
                    <p className="text-gray-400 text-sm mb-1 truncate">{draft.descricao}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {draft.tipo && (
                      <span>
                        Tipo: <span className="text-gray-400">{draft.tipo}</span>
                      </span>
                    )}
                    <span>
                      Etapa:{" "}
                      <span className="text-gray-400">
                        {STEP_LABELS[draft.etapa_atual] ?? `${draft.etapa_atual} de 4`}
                      </span>
                    </span>
                    <span>Criado: {formatDate(draft.criado_em)}</span>
                    <span>Atualizado: {formatDate(draft.atualizado_em)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!draft.finalizado && (
                    <button
                      onClick={() => handleContinuar(draft)}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                    >
                      Continuar
                    </button>
                  )}
                  {(draft.dados.status_sql || draft.dados.perguntas_sql) && (
                    <button
                      onClick={() =>
                        setSqlModal({
                          nome: draft.nome,
                          sql: draft.dados.perguntas_sql || draft.dados.status_sql,
                        })
                      }
                      className="px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
                    >
                      Ver SQL
                    </button>
                  )}
                  {deleteConfirm === draft.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(draft.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(draft.id)}
                      className="px-3 py-1.5 rounded-lg bg-transparent border border-gray-700 hover:bg-gray-800 text-gray-400 hover:text-red-400 text-sm transition-colors"
                    >
                      Apagar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Ver SQL */}
      {sqlModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6"
          onClick={() => setSqlModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white text-sm truncate">{sqlModal.nome}</h2>
              <button
                onClick={() => setSqlModal(null)}
                className="text-gray-400 hover:text-white ml-4"
              >
                ✕
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-xs text-green-300 font-mono whitespace-pre-wrap">
              {sqlModal.sql}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Task 8: Atualizar `page.tsx` do extrator — suporte a retomada via sessionStorage

**Arquivo:**
- Modify: `src/app/extrator/page.tsx`

A página de histórico salva o ID do draft em `sessionStorage` antes de navegar. O extrator deve ler isso na montagem.

- [ ] **Step 1: Adicionar leitura de `checklist_resume_id` do sessionStorage no useEffect de inicialização**

Modificar o `useEffect` de inicialização (Task 6 Step 3) para também checar sessionStorage:

```typescript
useEffect(() => {
  const resumeId = sessionStorage.getItem("checklist_resume_id");
  if (resumeId) {
    sessionStorage.removeItem("checklist_resume_id");
    const draft = getDraft(resumeId);
    if (draft) {
      handleRetomar(draft);
      return;
    }
  }
  const inProgress = getInProgressDrafts();
  if (inProgress.length > 0) {
    setInProgressDraft(inProgress[0]);
  }
}, [getInProgressDrafts, getDraft]);
```

Isso requer adicionar `getDraft` ao destructuring do `useDraftStorage()`.

---

## Task 9: Atualizar página principal — link para Histórico

**Arquivo:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Ler o arquivo para identificar onde adicionar o link**

Verificar a estrutura da landing page e onde existe um menu ou área de navegação.

- [ ] **Step 2: Adicionar link "Histórico" na navegação**

Localizar o header ou a seção de navegação (geralmente contém o link para `/extrator`) e adicionar ao lado:

```typescript
<a
  href="/historico"
  className="text-sm text-gray-400 hover:text-white transition-colors"
>
  Histórico
</a>
```

A posição exata depende do layout atual — ajustar classes conforme o padrão existente.

---

## Task 10: Verificação manual das funcionalidades

- [ ] **Step 1: Iniciar o servidor de dev**

```
npm run dev
```

- [ ] **Step 2: Verificar Step 0 — nome do checklist**

- Abrir `http://localhost:3000/extrator`
- Confirmar que a tela de nome aparece primeiro
- Verificar que o botão Iniciar fica desabilitado com nome vazio
- Clicar Iniciar → confirmar que o fluxo normal abre

- [ ] **Step 3: Verificar auto-save**

- Preencher nome → Iniciar → selecionar projeto → selecionar tipo
- Abrir DevTools → Application → Local Storage → confirmar chave `checklist_draft:<id>`
- Confirmar que `etapa_atual` avança conforme o fluxo progride
- Confirmar que o indicador "Salvo" aparece por ~2s

- [ ] **Step 4: Verificar banner de retomada**

- Fechar e reabrir `http://localhost:3000/extrator`
- Confirmar que o banner amarelo aparece com o nome do draft
- Clicar "Continuar" → confirmar que o estado é restaurado

- [ ] **Step 5: Verificar histórico**

- Abrir `http://localhost:3000/historico`
- Confirmar que o draft criado aparece na lista
- Confirmar que "Continuar" redireciona para o extrator e retoma o draft
- Confirmar que "Apagar" pede confirmação e remove o item

- [ ] **Step 6: Verificar aviso de re-upload de PDF**

- Avançar até a etapa de upload e inserir um PDF
- Fechar e reabrir → retomar via banner
- Confirmar que o aviso de re-upload aparece na tela

---

## Self-Review

### Cobertura do spec:

| Requisito | Task |
|-----------|------|
| Campo Nome + Descrição + botão Iniciar | Task 3 |
| Gerar ID único no Iniciar | Task 6 Step 5 |
| Criar registro inicial no localStorage | Tasks 1+2 |
| Chave `checklist_draft:{id}` | Task 2 |
| Chave `checklist_drafts_index` | Task 2 |
| Auto-save ao avançar de step | Task 6 Steps 4, 7 |
| Indicador "Salvo" por 2s | Task 6 Steps 4, 9 |
| Nunca salvar PDF/imagens | Não há campos File no DraftDados |
| Banner ao abrir com draft em progresso | Task 6 Steps 3, 8 |
| Opções Continuar / Ver histórico / Começar novo | Task 6 Step 8 |
| Tela de histórico com lista e ações | Task 7 |
| Retomada com aviso de re-upload | Task 6 Step 11 |
| Ver SQL (modal) | Task 7 |
| Apagar com confirmação | Task 7 |
| QuotaExceededError handling | Task 2 (writeDraft), Task 6 Step 9 |
| Estimativa de tamanho — sem PDF/imagens | Apenas texto e arrays de objetos pequenos |
| Nenhum commit | Explicitado em todas as tasks |

### Checklist de placeholders: nenhum encontrado — todos os steps têm código completo.

### Consistência de tipos:
- `DraftDados.working_groups` usado em Task 2, 4, 5, 6 — consistente
- `DraftDados.campos_gerados` → `MigrationField[]` — consistente com `ai-correction-step.tsx`
- `PerguntaAssociada[]` em `DraftDados.perguntas` — tipo importado de `types.ts`
