"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import {
  AlignVerticalSpaceAround,
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Crosshair,
  Eraser,
  Layers,
  PenTool,
  SlidersHorizontal,
  TriangleAlert,
  Plus,
  X,
  Truck,
  ClipboardCheck,
  ShoppingBag,
  CalendarCheck,
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
  syncIncrementToAll,
} from "@/lib/designer/geometry";
import {
  addNewGroup,
  draftFieldsToMigrationRaw,
  importMigrationGroups,
  importMigrationGroupsPaged,
} from "@/lib/designer/actions";
import { CanvasStage } from "./canvas-stage";
import { GroupCard } from "./group-card";
import { HeaderFieldCard } from "./header-field-card";
import { CalibrationPanel } from "./calibration-panel";
import { ExportPanel } from "./export-panel";
import { MigrationImportModal } from "./migration-import-modal";
import { ImportFromExtractorModal } from "./import-from-extractor-modal";
import { ManutencaoPanel } from "./manutencao-panel";
import {
  aplicarRevisoesDoExtrator,
  ensureManutencaoConfig,
  getManutencaoConfig,
} from "@/lib/designer/manutencao";
import { ReflowModal } from "./reflow-modal";
import { ResetModal, type ResetScope } from "./reset-modal";
import { RevisoesGridModal } from "./revisoes-grid-modal";
import type { PagingValue } from "./paging-controls";
import {
  clearGroups,
  moveMarkerToPreviousGroup,
  resetToSingleSheet,
  restackPage,
} from "@/lib/designer/reflow";
import {
  moveGroupsToSheet,
  rangeOf,
  restackSheets,
  splitGroupToNextSheet,
  type StackOptions,
} from "@/lib/designer/flow";
import { renumberSheets } from "@/lib/designer/paging";
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
  { id: "manutencao", label: "Plano de Manutenção", icon: CalendarCheck },
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
    checkedGroups: {},
    scrollToPageId: null,
    scrollTick: 0,
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
            checkedGroups: {},
            scrollToPageId: null,
            scrollTick: 0,
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
  const [reflowOpen, setReflowOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  /** Item destacado ao abrir a grade de revisões; "" abre sem foco, null = fechada. */
  const [gradeFoco, setGradeFoco] = useState<string | null>(null);

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

  /**
   * Executa a importação de grupos com ou sem quebra em folhas e devolve os grupos
   * criados + o sufixo de status para o toast. null = nada reconhecido.
   */
  /** Guarda os parâmetros na 1ª folha do docType para o próximo modal reabrir com eles. */
  function rememberPaging(paging: PagingValue) {
    const first = st.pages.find((p) => p.kind === "checklist" && p.docType === st.docType);
    if (first) first.paging = { ...paging };
  }

  function runGroupImport(
    p: DesignerPage,
    raw: string,
    generate: boolean,
    paging: PagingValue | null,
    replaceExisting: boolean,
    targetSheets?: number
  ): { created: DesignerGroup[]; suffix: string } | null {
    if (!paging) {
      const created = importMigrationGroups(p, raw, generate);
      return created ? { created, suffix: "" } : null;
    }
    rememberPaging(paging);
    const r = importMigrationGroupsPaged(st.pages, p, raw, {
      ...paging,
      targetSheets,
      generateMarkers: generate,
      replaceExisting,
      neverSplit: true, // grupos entram inteiros; partir é sempre ação sua
    });
    if (!r) return null;
    let suffix = ` em ${r.pagesUsed} folha(s)`;
    if (targetSheets && r.pagesUsed !== targetSheets)
      suffix += ` — o extrator indicava ${targetSheets}; ajuste o gap ou a área útil`;
    if (r.pagesCreated.length) suffix += ` (${r.pagesCreated.length} nova(s), sem imagem)`;
    if (r.pagesEmptied.length) suffix += ` · ${r.pagesEmptied.length} folha(s) ficaram vazias`;
    return { created: r.created, suffix };
  }

  /** Revisões do rascunho aplicadas ao plano desta folha. 0 quando não há o que herdar. */
  function importarRevisoesDoDraft(p: DesignerPage, draft: ChecklistDraft): number {
    if (p.docType !== "manutencao") return 0;
    const plano = draft.dados.plano_manutencao;
    if (!plano) return 0;
    const cfg = ensureManutencaoConfig(st.pages);
    if (!cfg) return 0;
    return aplicarRevisoesDoExtrator(st.pages, cfg, {
      revisoes: plano.revisoes,
      kmBase: plano.kmBase,
      mesesBase: plano.mesesBase,
    });
  }

  function importFromDraft(
    draft: ChecklistDraft,
    paging: PagingValue | null,
    replaceExisting: boolean,
    targetSheets?: number
  ) {
    const p = currentPage();
    if (!p || p.kind !== "checklist") {
      showToast("Selecione uma folha de checklist para importar.", "error");
      return;
    }
    const raw = draftFieldsToMigrationRaw(draft.dados.campos_gerados);
    const r = runGroupImport(p, raw, true, paging, replaceExisting, targetSheets);
    if (!r) {
      showToast("Rascunho sem campos utilizáveis.", "error");
      return;
    }
    collapseImported(r.created);
    // empilha dentro das folhas; nada é movido entre elas automaticamente
    const f = restack(true);
    // As revisões já foram definidas no Extrator (o seletor de quilometragem do
    // formulário): o plano do Designer herda a mesma progressão em vez de o usuário
    // redigitar quantidade, km e meses aqui.
    const revisoes = importarRevisoesDoDraft(p, draft);
    commit();
    showToast(`${r.created.length} grupo(s) importado(s) do Extrator${r.suffix}.`, "success");
    if (revisoes > 0) {
      showToast(
        `${revisoes} revisões vieram do Extrator — confira o x inicial e o passo x na folha.`,
        "info",
      );
    }
    if (f.overflowSheets.length) {
      showToast(
        `Passa da faixa útil: ${f.overflowSheets.join(", ")}. Distribua os grupos pelas folhas na lista à direita.`,
        "info"
      );
    }
  }

  /** Faixa útil padrão, a partir dos parâmetros salvos na 1ª folha do docType. */
  function stackOptions(): StackOptions {
    const first = st.pages.find((p) => p.kind === "checklist" && p.docType === st.docType);
    const saved = first?.paging;
    return {
      yTop: saved?.yTop ?? 60,
      yTopNext: saved?.yTopNext ?? saved?.yTop ?? 60,
      yLimit: saved?.yLimit ?? (first?.heightMm ?? 297) - 17,
      groupGapMm: saved?.groupGapMm,
    };
  }

  /**
   * Empilha os grupos dentro de cada folha e avisa o que passou da faixa útil.
   * NUNCA move grupo entre folhas — isso é sempre uma ação sua.
   */
  function restack(silent = false) {
    const r = restackSheets(st.pages, st.docType, stackOptions());
    if (!silent) {
      commit();
      if (r.overflowSheets.length) {
        showToast(
          `Passa da faixa útil: ${r.overflowSheets.join(", ")}. Mova grupos ou parta um deles para a folha seguinte.`,
          "info"
        );
      } else {
        showToast(`Alinhado · ${r.totalMarkers} marcação(ões) dentro da faixa útil.`, "success");
      }
    }
    return r;
  }

  /**
   * Grupo arrastado e solto: fica na posição onde caiu. Soltando em outra folha, ele
   * migra para lá — mas só porque VOCÊ arrastou; nada se move sozinho.
   */
  function handleGroupDrop(groupId: string, fromPageId: string, toPageId: string, yMm: number) {
    const from = st.pages.find((p) => p.id === fromPageId);
    const group = from?.groups.find((g) => g.id === groupId);
    if (!from || !group) return;
    if (yMm >= 0) {
      group.yStart = yMm;
      group.yManual = true; // posição travada onde foi solto
      if (toPageId !== fromPageId) {
        const to = st.pages.find((p) => p.id === toPageId);
        if (to && to.kind === "checklist") {
          from.groups = from.groups.filter((g) => g !== group);
          if (from.activeGroupId === group.id) from.activeGroupId = from.groups[0]?.id ?? null;
          // entra na ordem do y, para a leitura da folha ficar coerente
          const idx = to.groups.findIndex((g) => g.yStart > group.yStart);
          if (idx < 0) to.groups.push(group);
          else to.groups.splice(idx, 0, group);
          to.activeGroupId = group.id;
        }
      }
    }
    restack(true);
    commit();
  }

  /** Move um grupo inteiro para a folha escolhida (ação direta, sem automação). */
  function moveGroupToSheet(group: DesignerGroup, sheet: number) {
    const r = moveGroupsToSheet(st.pages, st.docType, [group.id], sheet);
    if (!r.target) return;
    restack(true);
    commit();
    showToast(`"${group.title}" movido para ${r.target.name}.`, "success");
  }

  /** Move todos os grupos marcados para a folha escolhida, preservando a ordem. */
  function moveCheckedToSheet(sheet: number) {
    const ids = Object.keys(st.checkedGroups).filter((id) => st.checkedGroups[id]);
    if (!ids.length) return;
    const r = moveGroupsToSheet(st.pages, st.docType, ids, sheet);
    if (!r.target) return;
    st.checkedGroups = {};
    const after = restack(true);
    commit();
    showToast(`${r.moved} grupo(s) movido(s) para ${r.target.name}.`, "success");
    if (after.overflowSheets.length) {
      showToast(`Passa da faixa útil: ${after.overflowSheets.join(", ")}.`, "info");
    }
  }

  /**
   * Parte um grupo no ponto escolhido: os itens de `fromIndex` para baixo vão para o
   * topo da folha seguinte, com o mesmo nome + "(cont.)".
   */
  function splitGroupAt(page: DesignerPage, group: DesignerGroup, fromIndex: number) {
    const r = splitGroupToNextSheet(st.pages, page, group, fromIndex);
    if (!r) {
      showToast("Escolha um ponto de corte dentro do grupo.", "error");
      return;
    }
    restack(true);
    commit();
    showToast(
      `${r.movedCount} campo(s) movido(s) para ${r.target.name} como "${r.created.title}"` +
        (r.sheetCreated ? " (folha nova, sem imagem)" : "") +
        ".",
      "success"
    );
  }

  function moveMarkerToPrev(page: DesignerPage, group: DesignerGroup, index: number) {
    const r = moveMarkerToPreviousGroup(st.pages, page, group, index);
    if (!r) {
      showToast("Não há grupo anterior para receber este item.", "info");
      return;
    }
    commit();
    const extra = r.movidos > 1 ? ` (com ${r.movidos - 1} rótulo(s) de referência)` : "";
    showToast(`Item movido para "${r.destino.title}" em ${r.destinoPage.name}${extra}.`, "success");
  }

  function toggleCheckSheet(sheet: DesignerPage) {
    const all = sheet.groups.every((g) => st.checkedGroups[g.id]);
    sheet.groups.forEach((g) => {
      if (all) delete st.checkedGroups[g.id];
      else st.checkedGroups[g.id] = true;
    });
    rerender();
  }

  /** Muda a faixa útil de uma folha e reacomoda o conteúdo na hora. */
  function setFlowRange(p: DesignerPage, key: "flowTop" | "flowBottom", value: number | undefined) {
    if (value === undefined) delete p[key];
    else p[key] = value;
    restack(true);
    commit();
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
  /** A folha destino é explícita: no palco empilhado cada folha tem a sua drop zone. */
  function handleImageFile(file: File, target?: DesignerPage) {
    const page = target ?? currentPage();
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
    // O plano nasce com as 10 revisões e as condições padrão na 1ª folha.
    if (dt === "manutencao") ensureManutencaoConfig(st.pages);
    switchMode(st.viewMode);
  }

  /** Torna a folha a "atual" (a que a sidebar edita). `scroll` pede o scroll do palco. */
  function selectPage(id: string, scroll = false) {
    st.currentPageId = id;
    st.lastPageByContext[contextKey(st.docType, st.viewMode)] = id;
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
    st.selectedHeaderFieldId = null;
    st.captureMode = null;
    if (scroll) {
      st.scrollToPageId = id;
      st.scrollTick += 1;
    }
    commit();
  }

  function applyReset(scope: ResetScope, keepImage: boolean) {
    if (scope === "all") {
      Object.assign(st, createInitialState());
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* localStorage indisponível: o estado em memória já foi zerado */
      }
      commit();
      showToast("Projeto recomeçado do zero.", "success");
      return;
    }
    const r = scope === "sheets" ? resetToSingleSheet(st.pages, st.docType, keepImage) : clearGroups(st.pages, st.docType);
    // a folha atual pode ter sido descartada
    const sheets = st.pages.filter((p) => p.kind === "checklist" && p.docType === st.docType);
    if (!st.pages.find((p) => p.id === st.currentPageId)) st.currentPageId = sheets[0]?.id ?? st.pages[0]?.id ?? null;
    st.collapsedGroups = {};
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
    st.captureMode = null;
    commit();
    const parts = [`${r.groups} grupo(s) e ${r.markers} marcação(ões) removidos`];
    if (r.sheetsRemoved) parts.push(`${r.sheetsRemoved} folha(s) descartada(s)`);
    showToast(parts.join(" · ") + ".", "success");
  }

  /** Salva os padrões do modal e reacomoda com eles. */
  function applyFlowDefaults(paging: PagingValue) {
    rememberPaging(paging);
    restack();
  }

  function restackCurrentPage(p: DesignerPage) {
    restackPage(p);
    commit();
    showToast("Y dos grupos reempilhado a partir do primeiro.", "success");
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
    if (p.kind === "checklist") renumberSheets(st.pages, st.docType);
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
    // renumera para a folha restante não continuar chamada de "Folha 2"
    if (kind === "checklist") renumberSheets(st.pages, st.docType);
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
    commit();
  }

  const page = currentPage();
  const kindFilter = st.viewMode === "cabecalho" ? "header" : "checklist";
  const visiblePages = st.pages.filter((p) => p.kind === kindFilter && p.docType === st.docType);
  const manutencaoCfg = st.docType === "manutencao" ? getManutencaoConfig(st.pages) : null;

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
  const checkedCount = Object.keys(st.checkedGroups).filter((id) => st.checkedGroups[id]).length;
  // faixa útil x conteúdo real de cada folha — o aviso substitui o antigo empurrão
  // automático: nada se move sozinho, mas o excesso fica visível.
  const sheetStatus = visiblePages.map((sh, i) => {
    const range = rangeOf(sh, i, stackOptions());
    let endY = range.top;
    sh.groups.forEach((g) => {
      if (!g.markers.length) return;
      const inc = g.increment || 6.13;
      endY = Math.max(endY, g.yStart + (g.markers.length - 1) * inc);
    });
    return { endY: +endY.toFixed(1), bottom: range.bottom, over: endY > range.bottom + 0.01 };
  });

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
            <button
              onClick={() => setResetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#F64E60]/30 hover:border-[#F64E60] text-[#F64E60] hover:bg-[#F64E60]/5 transition-all text-sm font-medium"
              title="Limpar grupos, voltar a uma folha ou recomeçar o projeto do zero"
            >
              <Eraser className="w-4 h-4" />
              Limpar
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
                onClick={() => selectPage(p.id, true)}
                title="Ir para esta folha"
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

          {visiblePages.length > 0 && (
            <CanvasStage
              st={st}
              pages={visiblePages}
              tick={tick}
              rerender={rerender}
              commit={commit}
              nextLabel={nextLabel}
              onImageFile={handleImageFile}
              onSelectPage={selectPage}
              onGroupDrop={handleGroupDrop}
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

                {page.kind === "checklist" && (
                  <div className="border border-[#e0e0e0] rounded-lg p-2.5 space-y-2 bg-[#F9F9F9]">
                    <div className="text-[10px] uppercase tracking-wide text-[#80808F] font-semibold">
                      Faixa útil desta folha
                    </div>
                    <p className="text-[10px] text-[#80808F] leading-snug">
                      Onde a 1ª marcação começa e até onde a última pode ir. O conteúdo flui dentro dela e transborda
                      para a folha seguinte.
                    </p>
                    {(["flowTop", "flowBottom"] as const).map((key) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs">
                        <label className="text-[#80808F] w-10">{key === "flowTop" ? "início" : "fim"}</label>
                        <input
                          type="number"
                          step="0.1"
                          key={page.id + key + st.geomTick}
                          defaultValue={page[key] ?? ""}
                          placeholder="padrão"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            setFlowRange(page, key, v === "" ? undefined : parseFloat(v) || 0);
                          }}
                          className="w-16 bg-white border border-[#d0d0d0] rounded px-2 py-1 font-mono"
                        />
                        <button
                          onClick={() => {
                            st.captureMode = { kind: key, pageId: page.id };
                            commit();
                          }}
                          className="flex items-center gap-1 px-1.5 py-1 rounded bg-white hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[10px]"
                          title="Clique aqui e depois clique no canvas, na altura desejada"
                        >
                          <Crosshair className="w-3 h-3" />
                          capturar
                        </button>
                        {page[key] !== undefined && (
                          <button
                            onClick={() => setFlowRange(page, key, undefined)}
                            className="text-[#b0b0bf] hover:text-[#F64E60]"
                            title="Voltar ao padrão"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => restack()}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#173872]/10 hover:bg-[#173872]/20 text-[#173872] text-[11px] font-medium"
                  title="Alinhar os grupos dentro de cada folha e conferir a faixa útil (não move nada entre folhas)"
                >
                  <Layers className="w-3 h-3" />
                  alinhar folhas
                </button>
                <button
                  onClick={() => setReflowOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]"
                  title="Ajustar a faixa útil padrão e o espaço entre seções"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  padrões
                </button>
                <button
                  onClick={() => restackCurrentPage(page)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]"
                  title="Recalcular o Y de todos os grupos desta folha em sequência"
                >
                  <AlignVerticalSpaceAround className="w-3 h-3" />
                  reempilhar folha
                </button>
              </div>

              {manutencaoCfg && (
                <ManutencaoPanel
                  st={st}
                  cfg={manutencaoCfg}
                  rerender={rerender}
                  commit={commit}
                  onAbrirGrade={() => setGradeFoco("")}
                />
              )}

              {page?.kind === "checklist" && (
                <label className="flex items-center gap-2 text-[11px] text-[#464E5F] cursor-pointer border border-[#e0e0e0] rounded-lg p-2.5 bg-[#F9F9F9]">
                  <input
                    type="checkbox"
                    defaultChecked={!page.hideMarkBox}
                    key={page.id + "mb" + st.geomTick}
                    onChange={(e) => {
                      // Vale para todas as folhas do tipo: conferir o símbolo contra o
                      // fundo folha a folha não teria graça.
                      const esconder = !e.target.checked;
                      st.pages.forEach((p) => {
                        if (p.kind === "checklist" && p.docType === st.docType) p.hideMarkBox = esconder;
                      });
                      commit();
                    }}
                  />
                  contorno em volta das marcações (todas as folhas deste tipo)
                </label>
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
                  <label className="flex items-center gap-2 text-[11px] text-[#464E5F] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={page.syncIncrement !== false}
                      key={page.id + "si" + st.geomTick}
                      onChange={(e) => {
                        page.syncIncrement = e.target.checked;
                        if (page.syncIncrement) {
                          // Manda o incremento do grupo em foco (ou o do 1º) para o resto.
                          const master =
                            page.groups.find((g) => g.id === page.activeGroupId) ?? page.groups[0];
                          const n = syncIncrementToAll(st.pages, master);
                          if (n > 0) showToast(`Incremento replicado em ${n} grupo(s).`, "info");
                        }
                        commit();
                      }}
                    />
                    mesmo incremento em todos os grupos (todas as folhas)
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-[#464E5F] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={page.pushBelow !== false}
                      key={page.id + "pb" + st.geomTick}
                      onChange={(e) => {
                        page.pushBelow = e.target.checked;
                        commit();
                      }}
                    />
                    mover um item empurra os de baixo (mesmo grupo)
                  </label>
                </div>
              )}

              {/* barra de ação em lote — aparece quando há grupos marcados */}
              {checkedCount > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-1.5 flex-wrap border border-[#173872]/30 bg-[#173872]/5 rounded-lg p-2">
                  <span className="text-[11px] font-semibold text-[#173872]">{checkedCount} selecionado(s)</span>
                  <span className="text-[11px] text-[#80808F]">→ folha</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) moveCheckedToSheet(parseInt(v, 10));
                    }}
                    className="text-[11px] font-mono bg-white border border-[#d0d0d0] rounded px-1.5 py-1"
                  >
                    <option value="">escolher…</option>
                    {visiblePages.map((_, i) => (
                      <option key={i} value={i + 1}>
                        folha {i + 1}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      st.checkedGroups = {};
                      rerender();
                    }}
                    className="ml-auto text-[10.5px] text-[#80808F] hover:text-[#464E5F]"
                  >
                    limpar seleção
                  </button>
                </div>
              )}

              {/* todos os grupos de todas as folhas, agrupados por folha */}
              {visiblePages.map((sheet, si) => (
                <div key={sheet.id} className="space-y-2">
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => selectPage(sheet.id, true)}
                      className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                        sheet.id === st.currentPageId ? "bg-[#173872] text-white" : "text-[#80808F] hover:text-[#464E5F]"
                      }`}
                      title="Ir para esta folha no palco"
                    >
                      {sheet.name}
                    </button>
                    <span className="text-[10px] text-[#b0b0bf]">
                      {sheet.groups.length}g · {sheet.groups.reduce((a, g) => a + g.markers.length, 0)}m
                    </span>
                    {sheetStatus[si]?.over && (
                      <span
                        className="flex items-center gap-1 text-[9.5px] font-semibold text-[#F64E60] bg-[#F64E60]/10 border border-[#F64E60]/30 rounded px-1.5 py-0.5"
                        title={`O conteúdo termina em ${sheetStatus[si].endY}mm, além do fim da faixa útil (${sheetStatus[si].bottom}mm). Mova um grupo para outra folha ou use "continua na folha seguinte" no grupo que estoura.`}
                      >
                        <TriangleAlert className="w-3 h-3" />
                        passa {(sheetStatus[si].endY - sheetStatus[si].bottom).toFixed(0)}mm
                      </span>
                    )}
                    {sheet.groups.length > 0 && (
                      <button
                        onClick={() => toggleCheckSheet(sheet)}
                        className="ml-auto text-[10px] text-[#80808F] hover:text-[#173872]"
                        title="Marcar/desmarcar todos os grupos desta folha"
                      >
                        {sheet.groups.every((g) => st.checkedGroups[g.id]) ? "desmarcar" : "marcar"} folha
                      </button>
                    )}
                    <span className="flex-1 h-px bg-[#e8e8e8]" />
                  </div>
                  {sheet.groups.length === 0 ? (
                    <p className="text-[10.5px] text-[#b0b0bf] pl-1">Nenhum grupo nesta folha.</p>
                  ) : (
                    sheet.groups.map((g) => (
                      <GroupCard
                        key={g.id}
                        st={st}
                        page={sheet}
                        group={g}
                        rerender={rerender}
                        commit={commit}
                        sheets={visiblePages}
                        onMoveToSheet={moveGroupToSheet}
                        onSplitAt={splitGroupAt}
                        manutencaoCfg={manutencaoCfg}
                        onMoveMarkerToPrev={moveMarkerToPrev}
                        onAbrirGrade={manutencaoCfg ? (markerId) => setGradeFoco(markerId) : undefined}
                      />
                    ))
                  )}
                  {si < visiblePages.length - 1 && <div className="h-1" />}
                </div>
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

      {gradeFoco !== null && manutencaoCfg && (
        <RevisoesGridModal
          pages={st.pages}
          cfg={manutencaoCfg}
          focoMarkerId={gradeFoco || null}
          onClose={() => setGradeFoco(null)}
          commit={commit}
        />
      )}

      {resetOpen && (
        <ResetModal
          pages={st.pages}
          docType={st.docType}
          docTypeLabel={DOCTYPES.find((d) => d.id === st.docType)?.label ?? st.docType}
          onClose={() => setResetOpen(false)}
          onApply={applyReset}
        />
      )}

      {reflowOpen && page?.kind === "checklist" && (
        <ReflowModal
          pages={st.pages}
          page={page}
          onClose={() => setReflowOpen(false)}
          onApply={applyFlowDefaults}
        />
      )}

      {extrOpen && page?.kind === "checklist" && (
        <ImportFromExtractorModal
          pages={st.pages}
          page={page}
          onClose={() => setExtrOpen(false)}
          onPick={importFromDraft}
        />
      )}

      {migOpen && page?.kind === "checklist" && (
        <MigrationImportModal
          pages={st.pages}
          page={page}
          onClose={() => setMigOpen(false)}
          onImport={(raw, gen, paging, replaceExisting) => {
            const p = currentPage();
            if (!p || p.kind !== "checklist") {
              showToast("Selecione uma folha de checklist para importar.", "error");
              return false;
            }
            const r = runGroupImport(p, raw, gen, paging, replaceExisting);
            if (!r) {
              showToast("Nada reconhecido. Use //TÍTULO // seguido das linhas de migration.", "error");
              return false;
            }
            collapseImported(r.created);
            commit();
            showToast(`${r.created.length} grupo(s) importado(s)${r.suffix}.`, "success");
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
