"use client";

import { useRef } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  Link2,
  Merge,
  X,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { POSVENDA_EXPORT_W, REVISAO_X_OFFSET, REVISAO_Y_OFFSET } from "@/lib/designer/constants";
import {
  applyGroupAutomation,
  clamp01,
  syncColumnsToAll,
  syncIncrementToAll,
} from "@/lib/designer/geometry";
import { appendMissingFromQueue, reflowFromSelected, regenerateGroup } from "@/lib/designer/actions";
import { mergeGroupIntoPrevious, moveGroupToAdjacentPage, moveGroupWithinPage } from "@/lib/designer/reflow";
import { countMirrored } from "@/lib/designer/mirror";
import { MarkerRow } from "./marker-row";
import type {
  CaptureMode,
  DesignerGroup,
  DesignerPage,
  EditorState,
  FormularioConfig,
  ManutencaoConfig,
} from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
  group: DesignerGroup;
  rerender: () => void;
  commit: () => void;
  /** Folhas do docType, para o seletor de folha. */
  sheets?: DesignerPage[];
  /** Move este grupo inteiro para a folha escolhida. */
  onMoveToSheet?: (group: DesignerGroup, sheet: number) => void;
  /** Parte o grupo: itens de `fromIndex` para baixo vão para a folha seguinte. */
  onSplitAt?: (page: DesignerPage, group: DesignerGroup, fromIndex: number) => void;
  /** manutenção: config do plano, para o seletor de condição das linhas. */
  manutencaoCfg?: ManutencaoConfig | null;
  /** formulário: colunas de resultado, para as teclas de resposta das linhas. */
  formularioCfg?: FormularioConfig | null;
  /** Move um item só para o fim do grupo anterior. */
  onMoveMarkerToPrev?: (page: DesignerPage, group: DesignerGroup, index: number) => void;
  /** manutenção: abre a grade de revisões no item clicado. */
  onAbrirGrade?: (markerId: string) => void;
}

export function GroupCard({
  st,
  page,
  group,
  rerender,
  commit,
  sheets,
  onMoveToSheet,
  onSplitAt,
  manutencaoCfg,
  formularioCfg,
  onMoveMarkerToPrev,
  onAbrirGrade,
}: Props) {
  const posyRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLInputElement>(null);
  /** Grupos alcançados pela última replicação do incremento — avisados só no blur,
   *  senão cada dígito digitado viraria um toast. */
  const syncedRef = useRef(0);
  const isActive = group.id === page.activeGroupId;
  const collapsed = !!st.collapsedGroups[group.id];
  const dt = group.docType;
  const mirroredCount = countMirrored(group);

  function liveReflow() {
    group.markers.forEach((m, i) => {
      if (dt !== "revisao") m.fx = clamp01(group.xFixed / page.widthMm);
      m.fy = clamp01((group.yStart + i * group.increment) / page.heightMm);
    });
  }
  function geomChanged() {
    liveReflow();
    applyGroupAutomation(page);
    rerender();
  }

  function setCollapsed(v: boolean) {
    if (v) st.collapsedGroups[group.id] = true;
    else delete st.collapsedGroups[group.id];
  }
  function toggleCollapsed() {
    setCollapsed(!collapsed);
    rerender();
  }
  /** Clique no header: ativa o grupo e, se estiver recolhido, expande. */
  function onHeaderClick() {
    const changed = page.activeGroupId !== group.id || collapsed;
    page.activeGroupId = group.id;
    setCollapsed(false);
    if (changed) rerender();
  }
  function startCapture(mode: CaptureMode) {
    st.captureMode = mode;
    page.activeGroupId = group.id;
    commit();
  }

  // ─── reagrupamento manual ───────────────────────────────────────────────────
  function moveOrder(dir: -1 | 1) {
    if (!moveGroupWithinPage(page, group, dir)) {
      showToast(dir < 0 ? "Já é o primeiro grupo da folha." : "Já é o último grupo da folha.", "info");
      return;
    }
    commit();
  }
  function moveSheet(dir: -1 | 1) {
    const target = moveGroupToAdjacentPage(st.pages, page, group, dir);
    if (!target) {
      showToast("Não existe folha antes desta.", "info");
      return;
    }
    commit();
    showToast(`"${group.title}" movido para "${target.name}".`, "success");
  }
  function mergeUp() {
    const prevPage = mergeGroupIntoPrevious(st.pages, page, group);
    if (!prevPage) {
      showToast("Não há grupo anterior para juntar.", "info");
      return;
    }
    commit();
    const crossed = prevPage !== page;
    showToast(
      crossed
        ? `Juntado ao grupo anterior em "${prevPage.name}". Rode "reagrupar folhas" para reacomodar.`
        : "Juntado ao grupo acima.",
      crossed ? "info" : "success"
    );
  }

  function removeGroup() {
    if (page.groups.length === 1) {
      showToast("A página precisa de pelo menos 1 grupo.", "error");
      return;
    }
    if (!confirm(`Remover o grupo "${group.title}" e suas ${group.markers.length} marcações?`)) return;
    page.groups = page.groups.filter((g) => g.id !== group.id);
    if (page.activeGroupId === group.id) page.activeGroupId = page.groups[0].id;
    if (st.selectedGroupId === group.id) {
      st.selectedGroupId = null;
      st.selectedMarkerId = null;
    }
    commit();
  }
  function gerar() {
    if (group.markers.length > 0 && !confirm(`Isso substitui as ${group.markers.length} marcações atuais deste grupo. Continuar?`)) return;
    if (regenerateGroup(group, page) === 0) {
      showToast("Cole ao menos um nome de campo na fila antes de gerar.", "error");
      return;
    }
    commit();
  }
  function restantes() {
    if (appendMissingFromQueue(group, page) === 0) {
      showToast("Não há nomes novos na fila (todos já estão nas marcações).", "error");
      return;
    }
    commit();
  }
  function reindexar() {
    if (!reflowFromSelected(group, page, st.selectedMarkerId)) {
      showToast("Selecione (clique) uma marcação deste grupo primeiro.", "error");
      return;
    }
    commit();
  }
  function aplicarPosYReal() {
    const known = parseFloat(posyRef.current?.value || "");
    if (isNaN(known)) return;
    const offY = page.offsetY || 0;
    if (dt === "revisao") {
      group.yStart = +(known + group.increment + (group.colH || 6.3) / 2 - offY - REVISAO_Y_OFFSET).toFixed(2);
    } else if (dt === "posvenda") {
      group.yStart = +(known + group.increment + (group.optH || 5) / 2 - offY - (group.yFine || 0)).toFixed(2);
    } else {
      group.yStart = +(known + group.increment + (page.cellH || 5) / 2).toFixed(2);
    }
    group.yManual = true;
    geomChanged();
    commit();
  }

  const geomKey = (f: string) => `${group.id}-${f}-${st.geomTick}`;
  const num = "bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono";
  const actBtn =
    "p-1 rounded border border-[#e0e0e0] bg-white text-[#80808F] hover:text-[#173872] hover:border-[#173872]/40 transition-colors";

  // posvenda opções
  function setPosCount(n: number) {
    const all = [
      { valor: "1", label: "OK" },
      { valor: "3", label: "N/OK" },
      { valor: "0", label: "NA" },
    ];
    let opts = group.posvendaOpts || [];
    if (n === 2) {
      opts = opts.slice(0, 2);
      if (opts.length < 2) opts = all.slice(0, 2);
    } else if (opts.length < 3) {
      const existing = opts.map((o) => o.valor);
      const missing = all.filter((o) => !existing.includes(o.valor));
      opts = opts.concat(missing.slice(0, 3 - opts.length));
    }
    group.posvendaOpts = opts;
    const validos = opts.map((o) => o.valor);
    group.markers.forEach((m) => {
      if (!validos.includes(m.type || "")) m.type = opts[0].valor;
    });
    commit();
  }

  return (
    <div className={`border rounded-xl overflow-hidden ${isActive ? "border-[#173872]/40" : "border-[#e0e0e0]"}`}>
      {/* header */}
      <div onClick={onHeaderClick} className={`flex items-center gap-1.5 px-2 py-2 cursor-pointer ${isActive ? "bg-[#173872]/5" : "bg-[#F9F9F9]"}`}>
        <input
          type="checkbox"
          checked={!!st.checkedGroups[group.id]}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.checked) st.checkedGroups[group.id] = true;
            else delete st.checkedGroups[group.id];
            rerender();
          }}
          className="shrink-0"
          title="Marcar para mover em lote"
        />
        <button
          onClick={(e) => { e.stopPropagation(); toggleCollapsed(); }}
          className="shrink-0 text-[#80808F] hover:text-[#173872]"
          title={collapsed ? "Expandir grupo" : "Recolher grupo"}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-[#173872]" : "bg-[#d0d0d0]"}`} />
        {collapsed ? (
          // recolhido: texto puro, para que o clique em qualquer ponto do header expanda
          <span className="flex-1 min-w-0 truncate text-xs font-semibold text-[#464E5F]" title={group.title}>
            {group.title}
          </span>
        ) : (
          <input
            key={group.id + "-title"}
            defaultValue={group.title}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              group.title = e.target.value;
              rerender();
            }}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs font-semibold text-[#464E5F]"
            title="título do grupo"
          />
        )}
        {collapsed && (
          <span className="text-[9.5px] font-mono text-[#b0b0bf] shrink-0" title="y inicial (mm)">
            y{group.yStart}
          </span>
        )}
        <span className="text-[10px] text-[#80808F] shrink-0">{group.markers.length} itens</span>
        {mirroredCount > 0 && (
          <span
            className="shrink-0 flex items-center gap-0.5 px-1 rounded bg-[#8950FC]/10 text-[#8950FC] text-[9.5px] font-medium"
            title={`${mirroredCount} linha(s) de referência: imprimem a marcação do item seguinte`}
          >
            <Link2 className="w-2.5 h-2.5" />
            {mirroredCount}
          </span>
        )}
        {sheets && onMoveToSheet && (
          <select
            value={sheets.indexOf(page) + 1}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMoveToSheet(group, parseInt(e.target.value, 10))}
            className="shrink-0 text-[9.5px] font-mono rounded border border-[#e0e0e0] bg-white px-1 py-0.5 text-[#464E5F]"
            title="Folha deste grupo — trocar move o grupo inteiro para lá"
          >
            {sheets.map((sh, i) => (
              <option key={sh.id} value={i + 1}>
                f{i + 1}
              </option>
            ))}
          </select>
        )}
        <button onClick={(e) => { e.stopPropagation(); removeGroup(); }} className="text-[#b0b0bf] hover:text-[#F64E60] shrink-0" title="Remover grupo">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* body — desmontado quando recolhido (evita centenas de MarkerRow no DOM) */}
      {!collapsed && (
      <div className="p-3 space-y-2.5">
        {/* reagrupamento: ordem na folha, troca de folha e junção */}
        <div className="flex items-center gap-1 border-b border-[#f0f0f0] pb-2">
          <span className="text-[9.5px] uppercase tracking-wide text-[#b0b0bf] mr-auto">reagrupar</span>
          <button onClick={() => moveOrder(-1)} className={actBtn} title="Subir na ordem da folha">
            <ChevronsUp className="w-3 h-3" />
          </button>
          <button onClick={() => moveOrder(1)} className={actBtn} title="Descer na ordem da folha">
            <ChevronsDown className="w-3 h-3" />
          </button>
          <span className="w-px h-4 bg-[#e8e8e8] mx-0.5" />
          <button onClick={() => moveSheet(-1)} className={actBtn} title="Mover para a folha anterior (entra no fim)">
            <ArrowUpToLine className="w-3 h-3" />
          </button>
          <button onClick={() => moveSheet(1)} className={actBtn} title="Mover para a folha seguinte (entra no topo)">
            <ArrowDownToLine className="w-3 h-3" />
          </button>
          <span className="w-px h-4 bg-[#e8e8e8] mx-0.5" />
          <button onClick={mergeUp} className={actBtn} title="Juntar com o grupo anterior (desfaz uma partição)">
            <Merge className="w-3 h-3" />
          </button>
        </div>

        {/* corte explícito: os últimos N campos continuam na folha seguinte */}
        {onSplitAt && group.markers.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs border-b border-[#f0f0f0] pb-2">
            <span className="text-[9.5px] uppercase tracking-wide text-[#b0b0bf]">continua na folha seguinte</span>
            <input
              ref={splitRef}
              type="number"
              min={1}
              max={group.markers.length - 1}
              placeholder="nº"
              className={`w-12 ml-auto ${num}`}
              title="Quantos campos do FIM deste grupo continuam na folha seguinte"
            />
            <button
              onClick={() => {
                const n = parseInt(splitRef.current?.value || "", 10);
                if (!n || n < 1 || n >= group.markers.length) {
                  showToast(`Informe de 1 a ${group.markers.length - 1} campos.`, "error");
                  return;
                }
                onSplitAt(page, group, group.markers.length - n);
                if (splitRef.current) splitRef.current.value = "";
              }}
              className="px-2 py-1 rounded bg-[#173872]/10 hover:bg-[#173872]/20 text-[#173872] text-[11px] font-medium"
              title="Move os últimos N campos para o topo da folha seguinte, com o mesmo nome + (cont.)"
            >
              últimos N →
            </button>
          </div>
        )}

        {/* geometria comum */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {(dt === "roteiro" || (dt === "posvenda" && group.posvendaXMode !== "diff")) && (
            <>
              <label className="text-[#80808F]">x fixo</label>
              <input type="number" step="0.1" key={geomKey("xf")} defaultValue={group.xFixed}
                onChange={(e) => { group.xFixed = parseFloat(e.target.value) || 0; if (page.syncCols) syncColumnsToAll(page, group); geomChanged(); }}
                onBlur={commit} className={`w-16 ${num}`} />
            </>
          )}
          <label className="text-[#80808F]">y inicial</label>
          <input type="number" step="0.1" key={geomKey("ys")} defaultValue={group.yStart}
            onChange={(e) => { group.yStart = parseFloat(e.target.value) || 0; group.yManual = true; geomChanged(); }}
            onBlur={commit} className={`w-16 ${num}`} />
          <label className="text-[#80808F]">incremento</label>
          <input type="number" step="0.01" key={geomKey("inc")} defaultValue={group.increment}
            onChange={(e) => {
              group.increment = parseFloat(e.target.value) || 0;
              // O espaçamento é da folha, não do grupo: por padrão o valor digitado aqui
              // vale para os outros grupos e folhas do mesmo documento.
              if (page.syncIncrement !== false) syncedRef.current = syncIncrementToAll(st.pages, group);
              geomChanged();
            }}
            onBlur={() => {
              commit();
              if (syncedRef.current > 0) {
                showToast(
                  `Incremento ${group.increment} replicado em mais ${syncedRef.current} grupo(s).`,
                  "info",
                );
                syncedRef.current = 0;
              }
            }}
            title={
              page.syncIncrement !== false
                ? "Espaçamento entre linhas. Replica nos outros grupos de todas as folhas — desligue em Automação entre grupos para ajustar só este."
                : "Espaçamento entre linhas deste grupo (replicação desligada)"
            }
            className={`w-16 ${num}`} />
          <button onClick={() => startCapture({ kind: "groupStart", groupId: group.id })}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]"
            title="clique e depois clique no canvas">
            <Crosshair className="w-3 h-3" /> capturar
          </button>
        </div>

        {/* $posY real conhecido (todos) */}
        <div className="flex items-center gap-2 text-xs">
          <label className="text-[#80808F] whitespace-nowrap">$posY real</label>
          <input ref={posyRef} type="number" step="0.01" placeholder="ex: 47" className={`w-20 ${num}`} />
          <button onClick={aplicarPosYReal} className="px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]">
            usar
          </button>
        </div>

        {/* roteiro: hints */}
        {dt === "roteiro" && (
          <p className="text-[10px] text-[#0BB783] leading-snug">
            X real: <b>{(group.xFixed - (page.cellW || 14.5) / 2).toFixed(2)}</b> mm · Y real (1º item):{" "}
            {(group.yStart - (page.cellH || 5) / 2).toFixed(2)} mm · $posY exportado:{" "}
            {(group.yStart - (page.cellH || 5) / 2 - group.increment).toFixed(2)} mm
          </p>
        )}

        {/* revisão: colunas + campo texto */}
        {dt === "revisao" && (
          <div className="space-y-2 border-t border-[#f0f0f0] pt-2">
            <div className="flex items-center gap-2 text-xs">
              <label className="text-[#80808F]">caixa W</label>
              <input type="number" step="0.1" key={geomKey("cw")} defaultValue={group.colW ?? 7}
                onChange={(e) => { group.colW = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">caixa H</label>
              <input type="number" step="0.1" key={geomKey("ch")} defaultValue={group.colH ?? 6.3}
                onChange={(e) => { group.colH = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            </div>
            {(
              [
                ["colX1", "col.1 (✓)", "#33d17a"],
                ["colX2", "col.2 (✗)", "#ff5252"],
                ["colX3", "col.0 (NA)", "#4d9eff"],
              ] as ["colX1" | "colX2" | "colX3", string, string][]
            ).map(([key, label, color]) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span style={{ color }} className="w-16 text-[10.5px]">{label}</span>
                <input type="number" step="0.05" key={geomKey(key)} defaultValue={group[key] ?? 0}
                  onChange={(e) => {
                    const nv = parseFloat(e.target.value) || 0;
                    if (page.pushCols && key === "colX1") {
                      const d = nv - (group.colX1 || 0);
                      group.colX2 = +((group.colX2 || 0) + d).toFixed(2);
                      group.colX3 = +((group.colX3 || 0) + d).toFixed(2);
                    }
                    group[key] = nv;
                    if (page.syncCols) syncColumnsToAll(page, group);
                    rerender();
                  }}
                  onBlur={commit} className={`w-16 ${num}`} />
                <button onClick={() => startCapture({ kind: "revisaoCol", groupId: group.id, colKey: key })}
                  className="px-1.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]" title="capturar no canvas">
                  <Crosshair className="w-3 h-3" />
                </button>
                <span className="text-[9px] text-[#b0b0bf]">real {((group[key] || 0) - (group.colW || 7) / 2 + REVISAO_X_OFFSET).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-[10px] text-[#80808F] w-full">campo texto (valor numérico):</span>
              <label className="text-[#80808F]">x</label>
              <input type="number" step="0.1" key={geomKey("tx")} defaultValue={group.textX ?? 184}
                onChange={(e) => { group.textX = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">w</label>
              <input type="number" step="0.1" key={geomKey("tw")} defaultValue={group.textW ?? 19}
                onChange={(e) => { group.textW = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">h</label>
              <input type="number" step="0.1" key={geomKey("th")} defaultValue={group.textH ?? 5}
                onChange={(e) => { group.textH = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">y off</label>
              <input type="number" step="0.05" key={geomKey("tyo")} defaultValue={group.textYOffset ?? -0.9}
                onChange={(e) => { group.textYOffset = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            </div>
          </div>
        )}

        {/* pós-venda: opções + posição */}
        {dt === "posvenda" && (
          <div className="space-y-2 border-t border-[#f0f0f0] pt-2">
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <label className="text-[#80808F]">opções</label>
              <select defaultValue={String((group.posvendaOpts || []).length)} key={geomKey("pc")}
                onChange={(e) => setPosCount(parseInt(e.target.value, 10))} className={num}>
                <option value="2">2 (OK / N-OK)</option>
                <option value="3">3 (OK / N-OK / NA)</option>
              </select>
              <label className="text-[#80808F]">posição X</label>
              <select defaultValue={group.posvendaXMode || "same"} key={geomKey("xm")}
                onChange={(e) => { group.posvendaXMode = e.target.value as "same" | "diff"; commit(); }} className={num}>
                <option value="same">igual p/ todas</option>
                <option value="diff">diferente por opção</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="text-[#80808F]">caixa W</label>
              <input type="number" step="0.1" key={geomKey("ow")} defaultValue={group.optW ?? 4.3}
                onChange={(e) => { group.optW = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">caixa H</label>
              <input type="number" step="0.1" key={geomKey("oh")} defaultValue={group.optH ?? 5}
                onChange={(e) => { group.optH = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">ajuste Y</label>
              <input type="number" step="0.1" key={geomKey("yf")} defaultValue={group.yFine ?? 0}
                onChange={(e) => { group.yFine = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            </div>
            {(group.posvendaOpts || []).map((o, i) => (
              <div key={o.valor} className="flex items-center gap-1.5 text-xs">
                <span className="text-[9px] text-[#80808F] w-12">valor &quot;{o.valor}&quot;</span>
                <input defaultValue={o.label} key={geomKey("ol" + i)} placeholder="rótulo"
                  onChange={(e) => { o.label = e.target.value; rerender(); }} className={`w-16 ${num}`} />
                {group.posvendaXMode === "diff" && (
                  <>
                    <input type="number" step="0.05" key={geomKey("ox" + o.valor)} defaultValue={(group.optX && group.optX[o.valor]) ?? 160}
                      onChange={(e) => {
                        if (!group.optX) group.optX = {};
                        const nv = parseFloat(e.target.value) || 0;
                        const opts = group.posvendaOpts || [];
                        if (page.pushCols && opts.length && o.valor === opts[0].valor) {
                          const d = nv - (group.optX[o.valor] || 0);
                          opts.forEach((oo) => { if (oo.valor !== o.valor) group.optX![oo.valor] = +((group.optX![oo.valor] || 0) + d).toFixed(2); });
                        }
                        group.optX[o.valor] = nv;
                        if (page.syncCols) syncColumnsToAll(page, group);
                        rerender();
                      }}
                      onBlur={commit} className={`w-16 ${num}`} />
                    <button onClick={() => startCapture({ kind: "posvendaOptX", groupId: group.id, valor: o.valor })}
                      className="px-1.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]" title="capturar no canvas">
                      <Crosshair className="w-3 h-3" />
                    </button>
                    <span className="text-[9px] text-[#b0b0bf]">real {(((group.optX && group.optX[o.valor]) || 0) - POSVENDA_EXPORT_W / 2).toFixed(2)}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* fila */}
        <textarea key={group.id + "-queue"} defaultValue={group.queue}
          onChange={(e) => { group.queue = e.target.value; rerender(); }} rows={3}
          placeholder={"Cole os nomes dos campos, um por linha. Aceita direto da migration:\n$table->integer('nome_campo')->nullable();\nou apenas: nome_campo"}
          className="w-full bg-[#F9F9F9] border border-[#e0e0e0] rounded px-2 py-1.5 text-[10.5px] font-mono resize-y focus:outline-none focus:ring-1 focus:ring-[#173872]/30" />
        <label className="flex items-center gap-1.5 text-[10.5px] text-[#80808F] cursor-pointer">
          <input type="checkbox" defaultChecked={group.useQueueOnClick} key={group.id + "-uq"}
            onChange={(e) => { group.useQueueOnClick = e.target.checked; }} />
          usar a fila ao clicar no canvas (preenche o nome sozinho)
        </label>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={gerar} className="px-2.5 py-1 rounded bg-[#173872] hover:bg-[#122d5e] text-white text-[11px] font-medium">gerar sequência</button>
          <button onClick={restantes} className="px-2.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]">+ restantes</button>
          <button onClick={reindexar} className="px-2.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]">reindexar</button>
        </div>

        {group.markers.length > 0 && (
          <div className="space-y-0.5 pt-1">
            {group.markers.map((m, i) => (
              <MarkerRow
                key={m.id}
                st={st}
                page={page}
                group={group}
                marker={m}
                index={i}
                rerender={rerender}
                commit={commit}
                manutencaoCfg={manutencaoCfg}
                formularioCfg={formularioCfg}
                canSplit={i > 0 && !!onSplitAt}
                onSplitHere={onSplitAt ? () => onSplitAt(page, group, i) : undefined}
                onMoveToPrevGroup={
                  onMoveMarkerToPrev ? () => onMoveMarkerToPrev(page, group, i) : undefined
                }
                onAbrirGrade={onAbrirGrade ? () => onAbrirGrade(m.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
