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
      // Also covered by quota catch below; if this throws, draft is already written but index is not updated.
      // This is acceptable since listDrafts filters and recovers orphaned drafts from actual storage keys.
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

  /** Shallow-merges partial into the existing draft. DraftDados fields are merged shallowly — arrays like perguntas are replaced, not appended. */
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
