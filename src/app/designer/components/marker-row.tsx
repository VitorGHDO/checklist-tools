"use client";

import { X } from "lucide-react";
import { clamp01, syncGroupStartIfFirst } from "@/lib/designer/geometry";
import type { DesignerGroup, DesignerPage, EditorState, Marker } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
  group: DesignerGroup;
  marker: Marker;
  index: number;
  rerender: () => void;
}

function toggleColor(active: boolean, kind: "ok" | "no" | "na"): string {
  if (!active) return "bg-white text-[#b0b0bf] border-[#e0e0e0] hover:text-[#80808F]";
  if (kind === "ok") return "bg-[#0BB783] text-white border-[#0BB783]";
  if (kind === "no") return "bg-[#F64E60] text-white border-[#F64E60]";
  return "bg-[#22B9FF] text-white border-[#22B9FF]";
}

export function MarkerRow({ st, page, group, marker: m, index, rerender }: Props) {
  const selected = m.id === st.selectedMarkerId;
  const isRevisao = group.docType === "revisao";
  const isPosvenda = group.docType === "posvenda";
  const showX = !isRevisao && !(isPosvenda && group.posvendaXMode === "diff");

  function select() {
    st.selectedGroupId = group.id;
    st.selectedMarkerId = m.id;
    rerender();
  }

  function del() {
    group.markers = group.markers.filter((x) => x.id !== m.id);
    if (st.selectedMarkerId === m.id) {
      st.selectedMarkerId = null;
      st.selectedGroupId = null;
    }
    rerender();
  }

  const opts = group.posvendaOpts || [];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) select();
      }}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border ${
        selected ? "bg-[#173872]/5 border-[#173872]/30" : "border-transparent hover:bg-[#F9F9F9]"
      }`}
    >
      <span className="shrink-0 w-4 h-4 rounded-full bg-[#173872] text-white text-[10px] flex items-center justify-center font-mono">
        {index + 1}
      </span>

      {/* type toggle */}
      <div className="flex shrink-0 border border-[#e0e0e0] rounded overflow-hidden">
        {isRevisao ? (
          (
            [
              ["1", "✓", "ok"],
              ["2", "✗", "no"],
              ["0", "NA", "na"],
            ] as [string, string, "ok" | "no" | "na"][]
          ).map(([val, glyph, kind]) => {
            const active = m.tipo !== "texto" && (m.resposta || "1") === val;
            return (
              <button
                key={val}
                onClick={() => {
                  m.tipo = "opcoes";
                  m.resposta = val;
                  select();
                }}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${toggleColor(active, kind)}`}
              >
                {glyph}
              </button>
            );
          })
        ) : isPosvenda ? (
          opts.map((o) => {
            const active = (m.type || opts[0]?.valor) === o.valor;
            const kind = o.valor === "1" ? "ok" : o.valor === "0" ? "na" : "no";
            return (
              <button
                key={o.valor}
                onClick={() => {
                  m.type = o.valor;
                  select();
                }}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${toggleColor(active, kind)}`}
              >
                {o.label}
              </button>
            );
          })
        ) : (
          (
            [
              ["check", "✓", "ok"],
              ["x", "✗", "no"],
              ["na", "NA", "na"],
            ] as [string, string, "ok" | "no" | "na"][]
          ).map(([val, glyph, kind]) => {
            const active = (m.type || "check") === val;
            return (
              <button
                key={val}
                onClick={() => {
                  m.type = val;
                  select();
                }}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${toggleColor(active, kind)}`}
              >
                {glyph}
              </button>
            );
          })
        )}
      </div>

      <input
        defaultValue={m.label}
        key={m.id}
        onFocus={select}
        onChange={(e) => {
          m.label = e.target.value;
        }}
        className="flex-1 min-w-0 bg-white border border-[#d0d0d0] rounded px-1.5 py-1 text-xs font-mono text-[#0BB783] focus:outline-none focus:ring-1 focus:ring-[#0BB783]/40"
        placeholder="nome_do_campo"
      />

      {showX && (
        <input
          type="number"
          step="0.01"
          defaultValue={((m.fx ?? 0) * page.widthMm).toFixed(2)}
          key={m.id + "x" + ((m.fx ?? 0) * page.widthMm).toFixed(2)}
          title="x (mm)"
          onChange={(e) => {
            m.fx = clamp01((parseFloat(e.target.value) || 0) / page.widthMm);
            syncGroupStartIfFirst(group, page, m);
            rerender();
          }}
          className="w-12 bg-white border border-[#d0d0d0] rounded px-1 py-1 text-[10px] font-mono text-right text-[#80808F] focus:outline-none"
        />
      )}
      <input
        type="number"
        step="0.01"
        defaultValue={(m.fy * page.heightMm).toFixed(2)}
        key={m.id + "y" + (m.fy * page.heightMm).toFixed(2)}
        title="y (mm)"
        onChange={(e) => {
          m.fy = clamp01((parseFloat(e.target.value) || 0) / page.heightMm);
          syncGroupStartIfFirst(group, page, m);
          rerender();
        }}
        className="w-12 bg-white border border-[#d0d0d0] rounded px-1 py-1 text-[10px] font-mono text-right text-[#80808F] focus:outline-none"
      />

      <button onClick={del} className="shrink-0 p-1 text-[#b0b0bf] hover:text-[#F64E60] transition-colors" title="Remover">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
