"use client";

import { useRef } from "react";
import { Crosshair, X } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { POSVENDA_EXPORT_W, REVISAO_X_OFFSET, REVISAO_Y_OFFSET } from "@/lib/designer/constants";
import { applyGroupAutomation, clamp01, syncColumnsToAll } from "@/lib/designer/geometry";
import { appendMissingFromQueue, reflowFromSelected, regenerateGroup } from "@/lib/designer/actions";
import { MarkerRow } from "./marker-row";
import type { CaptureMode, DesignerGroup, DesignerPage, EditorState } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
  group: DesignerGroup;
  rerender: () => void;
  commit: () => void;
}

export function GroupCard({ st, page, group, rerender, commit }: Props) {
  const posyRef = useRef<HTMLInputElement>(null);
  const isActive = group.id === page.activeGroupId;
  const dt = group.docType;

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

  function setActive() {
    if (page.activeGroupId !== group.id) {
      page.activeGroupId = group.id;
      rerender();
    }
  }
  function startCapture(mode: CaptureMode) {
    st.captureMode = mode;
    page.activeGroupId = group.id;
    commit();
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
      <div onClick={setActive} className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isActive ? "bg-[#173872]/5" : "bg-[#F9F9F9]"}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-[#173872]" : "bg-[#d0d0d0]"}`} />
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
        <span className="text-[10px] text-[#80808F] shrink-0">{group.markers.length} itens</span>
        <button onClick={(e) => { e.stopPropagation(); removeGroup(); }} className="text-[#b0b0bf] hover:text-[#F64E60] shrink-0" title="Remover grupo">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* body */}
      <div className="p-3 space-y-2.5">
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
            onChange={(e) => { group.increment = parseFloat(e.target.value) || 0; geomChanged(); }}
            onBlur={commit} className={`w-16 ${num}`} />
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
              <MarkerRow key={m.id} st={st} page={page} group={group} marker={m} index={i} rerender={rerender} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
