"use client";

import { Crosshair, X } from "lucide-react";
import { tipoLabel } from "@/lib/designer/model";
import type { CaptureMode, DesignerPage, EditorState, HeaderField } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
  field: HeaderField;
  rerender: () => void;
  commit: () => void;
}

export function HeaderFieldCard({ st, page, field, rerender, commit }: Props) {
  const isActive = field.id === st.selectedHeaderFieldId;
  const gk = (f: string) => `${field.id}-${f}-${st.geomTick}`;
  const num = "bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono";

  function capture(pointKey: string) {
    st.selectedHeaderFieldId = field.id;
    st.captureMode = { kind: "headerPoint", fieldId: field.id, pointKey } as CaptureMode;
    commit();
  }
  function remove() {
    page.headerFields = page.headerFields.filter((f) => f.id !== field.id);
    if (st.selectedHeaderFieldId === field.id) st.selectedHeaderFieldId = null;
    commit();
  }
  const capBtn = (pointKey: string) => (
    <button onClick={() => capture(pointKey)} className="px-1.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]" title="capturar no canvas">
      <Crosshair className="w-3 h-3" />
    </button>
  );

  return (
    <div className={`border rounded-xl overflow-hidden ${isActive ? "border-[#173872]/40" : "border-[#e0e0e0]"}`}>
      <div
        onClick={() => {
          st.selectedHeaderFieldId = field.id;
          rerender();
        }}
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isActive ? "bg-[#173872]/5" : "bg-[#F9F9F9]"}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? "bg-[#173872]" : "bg-[#d0d0d0]"}`} />
        <input
          key={field.id + "-campo"}
          defaultValue={field.campo}
          placeholder="chave em $dadosChecklist['...']"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            field.campo = e.target.value;
            rerender();
          }}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs font-semibold text-[#464E5F]"
        />
        <span className="text-[10px] text-[#80808F] shrink-0">{tipoLabel(field.tipo)}</span>
        <button onClick={(e) => { e.stopPropagation(); remove(); }} className="text-[#b0b0bf] hover:text-[#F64E60] shrink-0" title="Remover campo">
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="p-3 space-y-2 text-xs">
        {field.tipo === "texto" && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[#80808F]">fonte</label>
              <input type="number" step="0.5" key={field.id + "-fs"} defaultValue={field.fontSize} placeholder="—"
                onChange={(e) => { field.fontSize = e.target.value; }} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">w</label>
              <input type="number" step="0.5" key={gk("w")} defaultValue={field.w} onChange={(e) => { field.w = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">h</label>
              <input type="number" step="0.5" key={gk("h")} defaultValue={field.h} onChange={(e) => { field.h = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">alinh.</label>
              <select defaultValue={field.align} key={field.id + "-al"} onChange={(e) => { field.align = e.target.value as "L" | "C" | "R"; rerender(); }} className={num}>
                <option value="L">Esq.</option>
                <option value="C">Centro</option>
                <option value="R">Dir.</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[#80808F]">amostra</label>
              <input key={field.id + "-am"} defaultValue={field.amostra} placeholder="texto de exemplo" onChange={(e) => { field.amostra = e.target.value; rerender(); }} className={`flex-1 ${num}`} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[#80808F]">x</label>
              <input type="number" step="0.1" key={gk("x")} defaultValue={field.x} onChange={(e) => { field.x = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-16 ${num}`} />
              <label className="text-[#80808F]">y</label>
              <input type="number" step="0.1" key={gk("y")} defaultValue={field.y} onChange={(e) => { field.y = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-16 ${num}`} />
              {capBtn("main")}
            </div>
          </>
        )}

        {field.tipo === "assinatura" && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[#80808F]">w</label>
            <input type="number" step="0.5" key={gk("w")} defaultValue={field.w} onChange={(e) => { field.w = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            <label className="text-[#80808F]">h</label>
            <input type="number" step="0.5" key={gk("h")} defaultValue={field.h} onChange={(e) => { field.h = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            <label className="text-[#80808F]">x</label>
            <input type="number" step="0.1" key={gk("x")} defaultValue={field.x} onChange={(e) => { field.x = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-16 ${num}`} />
            <label className="text-[#80808F]">y</label>
            <input type="number" step="0.1" key={gk("y")} defaultValue={field.y} onChange={(e) => { field.y = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-16 ${num}`} />
            {capBtn("main")}
          </div>
        )}

        {field.tipo === "data" && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[#80808F]">sep.</label>
              <input maxLength={1} key={field.id + "-sep"} defaultValue={field.separador} onChange={(e) => { field.separador = e.target.value; rerender(); }} className={`w-10 text-center ${num}`} />
              <label className="text-[#80808F]">formato</label>
              <select defaultValue={field.formato} key={field.id + "-fmt"} onChange={(e) => { field.formato = e.target.value as "ymd" | "dmy"; }} className={num}>
                <option value="ymd">Ano-Mês-Dia</option>
                <option value="dmy">Dia-Mês-Ano</option>
              </select>
              <label className="text-[#80808F]">ano</label>
              <select defaultValue={field.anoDigitos} key={field.id + "-ad"} onChange={(e) => { field.anoDigitos = e.target.value as "2" | "4"; rerender(); }} className={num}>
                <option value="2">2 díg.</option>
                <option value="4">4 díg.</option>
              </select>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[#80808F]">w</label>
              <input type="number" step="0.5" key={gk("w")} defaultValue={field.w} onChange={(e) => { field.w = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">h</label>
              <input type="number" step="0.5" key={gk("h")} defaultValue={field.h} onChange={(e) => { field.h = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">y</label>
              <input type="number" step="0.1" key={gk("y")} defaultValue={field.y} onChange={(e) => { field.y = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            </div>
            {(["x1", "x2", "x3"] as const).map((k, i) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[#80808F] w-8">{["dia", "mês", "ano"][i]}</span>
                <input type="number" step="0.1" key={gk(k)} defaultValue={field[k]} onChange={(e) => { field[k] = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-16 ${num}`} />
                {capBtn(k)}
              </div>
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[#80808F]">fonte antes</label>
              <input type="number" step="0.5" key={field.id + "-fd"} defaultValue={field.fontSizeDentro} placeholder="—" onChange={(e) => { field.fontSizeDentro = e.target.value; }} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">fonte depois</label>
              <input type="number" step="0.5" key={field.id + "-fp"} defaultValue={field.fontSizeDepois} placeholder="—" onChange={(e) => { field.fontSizeDepois = e.target.value; }} className={`w-12 ${num}`} />
            </div>
          </>
        )}

        {field.tipo === "hora" && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[#80808F]">sep.</label>
              <input maxLength={1} key={field.id + "-sep"} defaultValue={field.separador} onChange={(e) => { field.separador = e.target.value; rerender(); }} className={`w-10 text-center ${num}`} />
              <label className="text-[#80808F]">w</label>
              <input type="number" step="0.5" key={gk("w")} defaultValue={field.w} onChange={(e) => { field.w = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">h</label>
              <input type="number" step="0.5" key={gk("h")} defaultValue={field.h} onChange={(e) => { field.h = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">y</label>
              <input type="number" step="0.1" key={gk("y")} defaultValue={field.y} onChange={(e) => { field.y = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
            </div>
            {(["x1", "x2"] as const).map((k, i) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[#80808F] w-8">{["hora", "min"][i]}</span>
                <input type="number" step="0.1" key={gk(k)} defaultValue={field[k]} onChange={(e) => { field[k] = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-16 ${num}`} />
                {capBtn(k)}
              </div>
            ))}
          </>
        )}

        {field.tipo === "opcoes" && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[#80808F]">w</label>
              <input type="number" step="0.5" key={gk("w")} defaultValue={field.w} onChange={(e) => { field.w = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">h</label>
              <input type="number" step="0.5" key={gk("h")} defaultValue={field.h} onChange={(e) => { field.h = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-12 ${num}`} />
              <label className="text-[#80808F]">y</label>
              <input type="number" step="0.1" key={gk("y")} defaultValue={field.y} onChange={(e) => { field.y = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
              <label className="text-[#80808F]">fonte</label>
              <input type="number" step="0.5" key={field.id + "-fs"} defaultValue={field.fontSize} placeholder="—" onChange={(e) => { field.fontSize = e.target.value; }} className={`w-12 ${num}`} />
            </div>
            {field.opcoes.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[#80808F] w-4">{i + 1}</span>
                <input key={field.id + "-ov" + i} defaultValue={o.valor} placeholder="valor" onChange={(e) => { o.valor = e.target.value; rerender(); }} className={`w-14 ${num}`} />
                <label className="text-[#80808F]">x</label>
                <input type="number" step="0.1" key={gk("ox" + i)} defaultValue={o.x} onChange={(e) => { o.x = parseFloat(e.target.value) || 0; rerender(); }} onBlur={commit} className={`w-14 ${num}`} />
                {capBtn("opt" + i)}
                <button onClick={() => { field.opcoes = field.opcoes.filter((_, idx) => idx !== i); commit(); }} className="text-[#b0b0bf] hover:text-[#F64E60]" title="remover opção">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button onClick={() => { field.opcoes.push({ valor: String(field.opcoes.length + 1), x: 20 }); commit(); }} className="px-2 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-[11px]">
              + opção
            </button>
          </>
        )}
      </div>
    </div>
  );
}
