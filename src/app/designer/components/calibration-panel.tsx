"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DEFAULT_TYPE_OFFSETS } from "@/lib/designer/constants";
import type { DesignerPage } from "@/lib/designer/types";

interface Props {
  page: DesignerPage;
  rerender: () => void;
}

export function CalibrationPanel({ page, rerender }: Props) {
  const [open, setOpen] = useState(false);
  if (!page.typeOffsets) page.typeOffsets = { ...DEFAULT_TYPE_OFFSETS };

  const numInput = (value: number, step: string, onChange: (v: number) => void, key: string, w = "w-16") => (
    <input
      type="number"
      step={step}
      defaultValue={value}
      key={page.id + key + value}
      onChange={(e) => {
        onChange(parseFloat(e.target.value) || 0);
        rerender();
      }}
      className={`${w} bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono`}
    />
  );

  return (
    <div className="border-b border-[#e8e8e8]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-[10.5px] uppercase tracking-wider text-[#80808F] font-semibold"
      >
        Calibração de fonte (offset)
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[#80808F]">offset x</label>
            {numInput(page.offsetX || 0, "0.05", (v) => (page.offsetX = v), "ox")}
            <label className="text-[#80808F]">offset y</label>
            {numInput(page.offsetY || 0, "0.05", (v) => (page.offsetY = v), "oy")}
            <span className="text-[#b0b0bf]">mm (aplicado só no export)</span>
          </div>

          <div className="border-t border-[#f0f0f0] pt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[#0BB783] font-mono w-4">✓</span>
            {numInput(page.typeOffsets.check, "0.01", (v) => (page.typeOffsets.check = v), "tc", "w-14")}
            <span className="text-[#F64E60] font-mono w-4">✗</span>
            {numInput(page.typeOffsets.x, "0.01", (v) => (page.typeOffsets.x = v), "tx", "w-14")}
            <span className="text-[#80808F] font-mono">NA</span>
            {numInput(page.typeOffsets.na, "0.01", (v) => (page.typeOffsets.na = v), "tn", "w-14")}
            <span className="text-[#b0b0bf] w-full">ajuste relativo (mm, eixo Y) de cada símbolo em relação ao ✓</span>
          </div>

          <div className="border-t border-[#f0f0f0] pt-3 flex items-center gap-2 flex-wrap">
            <label className="text-[#80808F]">caixa W</label>
            {numInput(page.cellW, "0.1", (v) => (page.cellW = v), "cw", "w-16")}
            <label className="text-[#80808F]">caixa H</label>
            {numInput(page.cellH, "0.1", (v) => (page.cellH = v), "ch", "w-16")}
            <span className="text-[#b0b0bf]">mm (célula do writeHTMLCell)</span>
          </div>

          <div className="border-t border-[#f0f0f0] pt-3 flex items-center gap-2">
            <label className="text-[#80808F] whitespace-nowrap">tamanho do símbolo</label>
            <input
              type="range"
              min="0.4"
              max="2.2"
              step="0.05"
              defaultValue={page.markScale ?? 1}
              key={page.id + "ms"}
              onChange={(e) => {
                page.markScale = parseFloat(e.target.value) || 1;
                rerender();
              }}
              className="flex-1 min-w-0"
            />
            <span className="text-[#80808F] w-10 text-right">{Math.round((page.markScale ?? 1) * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
