"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  PenTool,
  Plus,
  X,
  Truck,
  ClipboardCheck,
  ShoppingBag,
  FileImage,
  FileText,
  ImageIcon,
  FolderInput,
  Type,
  Calendar,
  Clock,
  PenLine,
  ListChecks,
  Unlink,
  Save,
  Upload,
} from "lucide-react";
import { parseProjectJson, serializeProject } from "@/lib/designer/project-io";
import { ToastContainer, showToast } from "@/components/ui/toast";
import { newHeaderField, newPage } from "@/lib/designer/model";
import {
  contextKey,
  ensureChecklistPage,
  ensureHeaderFooterPages,
  resolveBackgroundPage,
  syncColumnsFromMaster,
} from "@/lib/designer/geometry";
import { addNewGroup, importMigrationGroups } from "@/lib/designer/actions";
import { CanvasStage } from "./canvas-stage";
import { GroupCard } from "./group-card";
import { HeaderFieldCard } from "./header-field-card";
import { CalibrationPanel } from "./calibration-panel";
import { ExportPanel } from "./export-panel";
import { MigrationImportModal } from "./migration-import-modal";
import { ImportFromExtractorModal } from "./import-from-extractor-modal";
import type {
  DesignerDocType,
  DesignerGroup,
  DesignerPage,
  EditorState,
  HeaderFieldTipo,
  ViewMode,
} from "@/lib/designer/types";
import type { ChecklistDraft } from "@/lib/types";

const HEADER_FIELD_BTNS: { tipo: HeaderFieldTipo; label: string; icon: React.ElementType }[] = [
  { tipo: "texto", label: "texto", icon: Type },
  { tipo: "data", label: "data", icon: Calendar },
  { tipo: "hora", label: "hora", icon: Clock },
  { tipo: "assinatura", label: "assinatura", icon: PenLine },
  { tipo: "opcoes", label: "opções", icon: ListChecks },
];

const DOCTYPES: { id: DesignerDocType; label: string; icon: React.ElementType }[] = [
  { id: "roteiro", label: "Roteiro de Entrega Técnica", icon: Truck },
  { id: "revisao", label: "Revisão de Entrega", icon: ClipboardCheck },
  { id: "posvenda", label: "Pós-Venda", icon: ShoppingBag },
];

const MODES: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: "folhas", label: "Folhas (checklist)", icon: FileText },
  { id: "cabecalho", label: "Cabeçalho / Footer", icon: FileImage },
];

function createInitialState(): EditorState {
  const pages: DesignerPage[] = [newPage("Folha 1", "checklist", "roteiro")];
  ensureHeaderFooterPages(pages, "roteiro");
  return {
    pages,
    currentPageId: pages[0].id,
    viewMode: "folhas",
    docType: "roteiro",
    lastPageByContext: {},
    selectedMarkerId: null,
    selectedGroupId: null,
    selectedHeaderFieldId: null,
    captureMode: null,
    collapsedGroups: {},
    geomTick: 0,
  };
}

const STORAGE_KEY = "checklist_designer_current";

function loadInitialState(): EditorState {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const pages = parseProjectJson(raw);
        if (pages && pages.length) {
          const first = pages.find((p) => p.kind === "checklist" && p.docType === "roteiro") || pages[0];
          return {
            pages,
            currentPageId: first.id,
            viewMode: "folhas",
            docType: first.docType,
            lastPageByContext: {},
            selectedMarkerId: null,
            selectedGroupId: null,
            selectedHeaderFieldId: null,
            captureMode: null,
            collapsedGroups: {},
            geomTick: 0,
          };
        }
      }
    } catch {
      /* ignora restauração inválida */
    }
  }
  return createInitialState();
}

export default function DesignerEditor() {
  const storeRef = useRef<EditorState | null>(null);
  if (storeRef.current === null) storeRef.current = loadInitialState();
  const st = storeRef.current;
  const [tick, rerender] = useReducer((c: number) => c + 1, 0);
  const uid = useRef(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFileRef = useRef<HTMLInputElement | null>(null);
  const [migOpen, setMigOpen] = useState(false);
  const [extrOpen, setExtrOpen] = useState(false);

  const commit = () => {
    st.geomTick += 1;
    rerender();
  };
  const nextLabel = () => "campo_" + uid.current++;
  const currentPage = (): DesignerPage | undefined => st.pages.find((p) => p.id === st.currentPageId);

  // autosave (localStorage) — sem imagens, que estouram a cota; o projeto completo vai no "Salvar arquivo".
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const light = st.pages.map((p) => (p.imageSrc ? { ...p, imageSrc: null, naturalW: 0, naturalH: 0 } : p));
        localStorage.setItem(STORAGE_KEY, serializeProject(light));
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError")
          showToast("Autosave falhou (localStorage cheio). Use “Salvar arquivo”.", "error");
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  function saveProjectFile() {
    const blob = new Blob([serializeProject(st.pages)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projeto_designer.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function loadProjectFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const pages = parseProjectJson(reader.result as string);
      if (!pages) {
        showToast("Arquivo de projeto inválido.", "error");
        return;
      }
      st.pages = pages;
      st.docType = "roteiro";
      st.viewMode = "folhas";
      st.lastPageByContext = {};
      const first = pages.find((p) => p.kind === "checklist" && p.docType === "roteiro") || pages[0];
      st.currentPageId = first.id;
      st.selectedMarkerId = null;
      st.selectedGroupId = null;
      st.selectedHeaderFieldId = null;
      st.captureMode = null;
      commit();
      showToast("Projeto carregado.", "success");
    };
    reader.readAsText(file);
  }

  function importFromDraft(draft: ChecklistDraft) {
    const p = currentPage();
    if (!p || p.kind !== "checklist") {
      showToast("Selecione uma folha de checklist para importar.", "error");
      return;
    }
    const fields = draft.dados.campos_gerados;
    const lines: string[] = [];
    let lastSecao: string | null = null;
    for (const f of fields) {
      const s = (f.secao || "").trim();
      if (s !== lastSecao) {
        if (s) lines.push(`//${s} //`);
        lastSecao = s;
      }
      lines.push(f.campo);
    }
    const created = importMigrationGroups(p, lines.join("\n"), true);
    if (!created) {
      showToast("Rascunho sem campos utilizáveis.", "error");
      return;
    }
    collapseImported(created);
    commit();
    showToast(`${created.length} grupo(s) importado(s) do Extrator.`, "success");
  }

  function loadImageToPage(page: DesignerPage, dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      page.imageSrc = dataUrl;
      page.naturalW = img.naturalWidth;
      page.naturalH = img.naturalHeight;
      rerender();
    };
    img.src = dataUrl;
  }
  function handleImageFile(file: File) {
    const page = currentPage();
    if (!page) return;
    const reader = new FileReader();
    reader.onload = () => loadImageToPage(page, reader.result as string);
    reader.readAsDataURL(file);
  }

  function addHeaderField(tipo: HeaderFieldTipo) {
    const p = currentPage();
    if (!p) return;
    const f = newHeaderField(tipo);
    p.headerFields.push(f);
    st.selectedHeaderFieldId = f.id;
    commit();
  }
  function unlinkBg() {
    const p = currentPage();
    if (!p) return;
    p.imageSrc = null;
    commit();
  }

  function switchMode(mode: ViewMode) {
    st.viewMode = mode;
    const kind = mode === "cabecalho" ? "header" : "checklist";
    const key = contextKey(st.docType, mode);
    let target =
      st.lastPageByContext[key] &&
      st.pages.find((p) => p.id === st.lastPageByContext[key] && p.kind === kind && p.docType === st.docType);
    if (!target) target = st.pages.find((p) => p.kind === kind && p.docType === st.docType);
    if (target) {
      st.currentPageId = target.id;
      st.lastPageByContext[key] = target.id;
    }
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
    st.selectedHeaderFieldId = null;
    st.captureMode = null;
    commit();
  }

  function switchDocType(dt: DesignerDocType) {
    st.docType = dt;
    ensureChecklistPage(st.pages, dt);
    ensureHeaderFooterPages(st.pages, dt);
    switchMode(st.viewMode);
  }

  function selectPage(id: string) {
    st.currentPageId = id;
    st.lastPageByContext[contextKey(st.docType, st.viewMode)] = id;
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
    st.selectedHeaderFieldId = null;
    st.captureMode = null;
    commit();
  }

  /** Recolhe/expande todos os grupos da página de uma vez. */
  function setAllGroupsCollapsed(p: DesignerPage, collapse: boolean) {
    p.groups.forEach((g) => {
      if (collapse) st.collapsedGroups[g.id] = true;
      else delete st.collapsedGroups[g.id];
    });
    rerender();
  }

  /** Grupos importados em lote entram recolhidos — só o nome aparece na lista. */
  function collapseImported(created: DesignerGroup[]) {
    if (created.length > 1) created.forEach((g) => (st.collapsedGroups[g.id] = true));
  }

  function addPage() {
    let p: DesignerPage;
    if (st.viewMode === "cabecalho") {
      const count = st.pages.filter((pp) => pp.kind === "header" && pp.docType === st.docType).length;
      p = newPage("Seção " + (count + 1), "header", st.docType);
    } else {
      const count = st.pages.filter((pp) => pp.kind === "checklist" && pp.docType === st.docType).length;
      p = newPage("Folha " + (count + 1), "checklist", st.docType);
    }
    st.pages.push(p);
    selectPage(p.id);
  }

  function removePage(p: DesignerPage) {
    const kind = st.viewMode === "cabecalho" ? "header" : "checklist";
    const visible = st.pages.filter((pp) => pp.kind === kind && pp.docType === st.docType);
    if (visible.length === 1) return;
    st.pages = st.pages.filter((pp) => pp.id !== p.id);
    if (st.currentPageId === p.id) {
      const remaining = st.pages.filter((pp) => pp.kind === kind && pp.docType === st.docType);
      st.currentPageId = remaining.length ? remaining[0].id : st.pages[0]?.id ?? null;
      st.lastPageByContext[contextKey(st.docType, st.viewMode)] = st.currentPageId ?? "";
    }
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
    commit();
  }

  const page = currentPage();
  const kindFilter = st.viewMode === "cabecalho" ? "header" : "checklist";
  const visiblePages = st.pages.filter((p) => p.kind === kindFilter && p.docType === st.docType);

  // status
  let leftStatus = "nenhuma imagem";
  if (page) {
    const bg = resolveBackgroundPage(st.pages, page);
    if (bg.imageSrc) {
      const borrowed = bg.id !== page.id;
      leftStatus = `${bg.naturalW}×${bg.naturalH}px → ${page.widthMm}×${page.heightMm}mm${
        borrowed ? `  ·  imagem de "${bg.name}"` : ""
      }`;
    }
  }
  let selStatus = "—";
  if (page && st.captureMode) {
    const cap = st.captureMode;
    if (cap.kind === "groupStart") {
      const g = page.groups.find((x) => x.id === cap.groupId);
      selStatus = `clique no canvas p/ definir x/y inicial de "${g?.title ?? ""}"`;
    } else if (cap.kind === "revisaoCol") {
      selStatus = "clique no canvas na posição X da coluna";
    } else if (cap.kind === "posvendaOptX") {
      selStatus = "clique no canvas na posição X da opção";
    } else if (cap.kind === "headerPoint") {
      selStatus = "clique no canvas para posicionar o campo";
    }
  } else if (page && st.selectedMarkerId) {
    for (const g of page.groups) {
      const m = g.markers.find((x) => x.id === st.selectedMarkerId);
      if (m) {
        selStatus = `${m.label} — ${g.title} (${((m.fx ?? 0) * page.widthMm).toFixed(2)}, ${(m.fy * page.heightMm).toFixed(2)})mm`;
        break;
      }
    }
  }

  const showAutomation = page?.kind === "checklist" && page.groups.length > 1;

  // contadores de recolhimento (para o botão "recolher/expandir todos")
  const collapsedCount = page ? page.groups.filter((g) => st.collapsedGroups[g.id]).length : 0;
  const expandedCount = page ? page.groups.length - collapsedCount : 0;
  const allGroupsCollapsed = !!page && page.groups.length > 0 && expandedCount === 0;

  return (
    // altura travada na viewport: o palco e a sidebar rolam de forma independente,
    // sem que a rolagem dos grupos arraste a folha do canvas.
    <div className="h-screen overflow-hidden bg-[#e6e6e6] text-[#464E5F] flex flex-col">
      {/* Header */}
      <header
        className="shrink-0 z-40 bg-white border-b border-[#e8e8e8]"
        style={{ boxShadow: "0px 10px 30px 0px rgba(82,63,105,0.05)" }}
      >
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F] hover:text-[#464E5F]">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-7 h-7 bg-[#173872] rounded-lg flex items-center justify-center">
              <PenTool className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-semibold text-[#173872]">Designer de PDF</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveProjectFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#173872]/30 hover:border-[#173872] text-[#173872] hover:bg-[#173872]/5 transition-all text-sm font-medium"
            >
              <Save className="w-4 h-4" />
              Salvar arquivo
            </button>
            <button
              onClick={() => projectFileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e8e8e8] hover:border-[#173872]/40 text-[#464E5F] hover:bg-[#F9F9F9] transition-all text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              Carregar
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar: docType + modo */}
      <div className="shrink-0 bg-white border-b border-[#e8e8e8]">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {DOCTYPES.map((d) => {
              const Icon = d.icon;
              const active = st.docType === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => switchDocType(d.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active
                      ? "bg-[#173872] border-[#173872] text-white"
                      : "bg-white border-[#e8e8e8] text-[#80808F] hover:border-[#173872]/40 hover:text-[#464E5F]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {d.label}
                </button>
              );
            })}
          </div>
          <span className="mx-1 w-px h-5 bg-[#e8e8e8]" />
          <div className="flex gap-1.5">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = st.viewMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => switchMode(m.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    active
                      ? "bg-[#ED3237] border-[#ED3237] text-white"
                      : "bg-[#F9F9F9] border-[#e8e8e8] text-[#80808F] hover:text-[#464E5F]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Corpo: palco + sidebar */}
      <div className="flex-1 flex min-h-0 max-w-[1600px] w-full mx-auto">
        {/* Palco */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="shrink-0 flex items-center gap-1 px-3 pt-3 overflow-x-auto">
            {visiblePages.map((p) => (
              <div
                key={p.id}
                onClick={() => selectPage(p.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border border-b-0 cursor-pointer text-sm whitespace-nowrap ${
                  p.id === st.currentPageId
                    ? "bg-white border-[#e8e8e8] text-[#464E5F]"
                    : "bg-[#F9F9F9] border-[#e8e8e8] text-[#80808F] hover:text-[#464E5F]"
                }`}
              >
                <input
                  key={p.id + p.name}
                  defaultValue={p.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    p.name = e.target.value;
                  }}
                  className="bg-transparent border-none outline-none w-24 text-inherit"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePage(p);
                  }}
                  className="text-[#b0b0bf] hover:text-[#ED3237] transition-colors"
                  title="Remover"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={addPage}
              className="px-3 py-2 text-[#80808F] hover:text-[#173872] transition-colors"
              title={st.viewMode === "cabecalho" ? "Nova aba de cabeçalho" : "Nova folha"}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {page && (
            <CanvasStage
              st={st}
              page={page}
              tick={tick}
              rerender={rerender}
              commit={commit}
              nextLabel={nextLabel}
              onImageFile={handleImageFile}
            />
          )}

          <div className="shrink-0 border-t border-[#e8e8e8] bg-white px-4 py-2 text-xs font-mono text-[#80808F] flex justify-between gap-3">
            <span className="truncate">
              {leftStatus} · {st.docType}/{st.viewMode}
            </span>
            <span className="truncate">
              sel: <b className="text-[#173872]">{selStatus}</b>
            </span>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-[400px] shrink-0 min-h-0 bg-white border-l border-[#e8e8e8] overflow-y-auto overscroll-contain">
          {/* Página */}
          <div className="p-4 border-b border-[#e8e8e8] space-y-3">
            <h2 className="text-[10.5px] uppercase tracking-wider text-[#80808F] font-semibold">Página</h2>
            {page && (
              <>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <label className="text-[#80808F]">largura mm</label>
                  <input
                    type="number"
                    key={page.id + "w"}
                    defaultValue={page.widthMm}
                    step="0.1"
                    onChange={(e) => {
                      page.widthMm = parseFloat(e.target.value) || 210;
                      rerender();
                    }}
                    className="w-16 bg-white border border-[#d0d0d0] rounded px-2 py-1 font-mono"
                  />
                  <label className="text-[#80808F]">altura mm</label>
                  <input
                    type="number"
                    key={page.id + "h"}
                    defaultValue={page.heightMm}
                    step="0.1"
                    onChange={(e) => {
                      page.heightMm = parseFloat(e.target.value) || 297;
                      rerender();
                    }}
                    className="w-16 bg-white border border-[#d0d0d0] rounded px-2 py-1 font-mono"
                  />
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-xs transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {page.imageSrc ? "Trocar imagem" : "Carregar imagem"}
                </button>
              </>
            )}
          </div>

          {/* Calibração (checklist) */}
          {page?.kind === "checklist" && <CalibrationPanel page={page} rerender={rerender} />}

          {/* Grupos (checklist) */}
          {page?.kind === "checklist" && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[10.5px] uppercase tracking-wider text-[#80808F] font-semibold whitespace-nowrap">
                  Grupos <span className="text-[#b0b0bf]">({page.groups.length})</span>
                </h2>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setExtrOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]"
                    title="Importar campos de um checklist do Extrator"
                  >
                    <FileText className="w-3 h-3" />
                    extrator
                  </button>
                  <button
                    onClick={() => setMigOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]"
                    title="Importar migration com grupos"
                  >
                    <FolderInput className="w-3 h-3" />
                    migration
                  </button>
                  <button
                    onClick={() => {
                      addNewGroup(page);
                      commit();
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#173872]/10 hover:bg-[#173872]/20 text-[#173872] text-[11px]"
                  >
                    <Plus className="w-3 h-3" />
                    grupo
                  </button>
                </div>
              </div>

              {page.groups.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAllGroupsCollapsed(page, !allGroupsCollapsed)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]"
                    title={
                      allGroupsCollapsed
                        ? "Expandir todos os grupos"
                        : "Recolher todos os grupos — mostra só os nomes na lista"
                    }
                  >
                    {allGroupsCollapsed ? <ChevronsUpDown className="w-3 h-3" /> : <ChevronsDownUp className="w-3 h-3" />}
                    {allGroupsCollapsed ? "expandir todos" : "recolher todos"}
                  </button>
                  <span className="text-[10px] text-[#80808F]">
                    {expandedCount} de {page.groups.length} expandido{expandedCount === 1 ? "" : "s"}
                  </span>
                </div>
              )}

              {showAutomation && (
                <div className="border border-[#e0e0e0] rounded-lg p-2.5 space-y-1.5 bg-[#F9F9F9]">
                  <div className="text-[10px] uppercase tracking-wide text-[#80808F] font-semibold">Automação entre grupos</div>
                  <label className="flex items-center gap-2 text-[11px] text-[#464E5F] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={page.syncCols}
                      key={page.id + "sc" + st.geomTick}
                      onChange={(e) => {
                        page.syncCols = e.target.checked;
                        if (page.syncCols) syncColumnsFromMaster(page);
                        commit();
                      }}
                    />
                    colunas X iguais em todos os grupos (grupo 1 manda)
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-[#464E5F] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={page.pushCols}
                      key={page.id + "pc" + st.geomTick}
                      onChange={(e) => {
                        page.pushCols = e.target.checked;
                      }}
                    />
                    empurrar a col. 1 arrasta as outras colunas junto
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-[#464E5F] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={page.chainY}
                      key={page.id + "cy" + st.geomTick}
                      onChange={(e) => {
                        page.chainY = e.target.checked;
                        if (page.chainY) page.groups.forEach((g) => (g.yManual = false));
                        commit();
                      }}
                    />
                    Y de cada grupo encadeado (último item + 2× incremento)
                  </label>
                </div>
              )}

              {page.groups.map((g) => (
                <GroupCard key={g.id} st={st} page={page} group={g} rerender={rerender} commit={commit} />
              ))}
            </div>
          )}

          {page?.kind === "header" && (
            <div className="p-4 space-y-3">
              <h2 className="text-[10.5px] uppercase tracking-wider text-[#80808F] font-semibold">Campos de cabeçalho / footer</h2>
              {page.imageSrc && (
                <button
                  onClick={unlinkBg}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-xs"
                  title="voltar a usar a imagem compartilhada da folha de checklist"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  usar imagem da folha
                </button>
              )}
              <div className="flex flex-wrap gap-1.5">
                {HEADER_FIELD_BTNS.map((b) => {
                  const Icon = b.icon;
                  return (
                    <button
                      key={b.tipo}
                      onClick={() => addHeaderField(b.tipo)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[#173872]/10 hover:bg-[#173872]/20 text-[#173872] text-[11px]"
                    >
                      <Icon className="w-3 h-3" />
                      {b.label}
                    </button>
                  );
                })}
              </div>
              {page.headerFields.length === 0 ? (
                <p className="text-xs text-[#80808F] py-2 leading-relaxed">
                  Nenhum campo ainda. Use os botões acima para adicionar (texto, data, hora, assinatura ou opções) e
                  arraste os pontos no canvas para posicionar.
                </p>
              ) : (
                <div className="space-y-3">
                  {page.headerFields.map((f) => (
                    <HeaderFieldCard key={f.id} st={st} page={page} field={f} rerender={rerender} commit={commit} />
                  ))}
                </div>
              )}
            </div>
          )}

          {page && <ExportPanel st={st} page={page} />}
        </aside>
      </div>

      {extrOpen && <ImportFromExtractorModal onClose={() => setExtrOpen(false)} onPick={importFromDraft} />}

      {migOpen && (
        <MigrationImportModal
          onClose={() => setMigOpen(false)}
          onImport={(raw, gen) => {
            const p = currentPage();
            if (!p || p.kind !== "checklist") {
              showToast("Selecione uma folha de checklist para importar.", "error");
              return false;
            }
            const created = importMigrationGroups(p, raw, gen);
            if (!created) {
              showToast("Nada reconhecido. Use //TÍTULO // seguido das linhas de migration.", "error");
              return false;
            }
            collapseImported(created);
            commit();
            showToast(`${created.length} grupo(s) importado(s).`, "success");
            return true;
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={projectFileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) loadProjectFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <ToastContainer />
    </div>
  );
}
