"use client";

import { useRef, useState } from "react";
import { Crosshair, Eye, Grid3x3, Layers, Plus, Wand2, X } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { genId } from "@/lib/designer/model";
import {
  colunaLabel,
  contarUsos,
  gerarColunas,
  passoDaColuna,
  removerColuna,
  removerCondicao,
} from "@/lib/designer/manutencao";
import { nomeFuncao } from "@/lib/designer/export-manutencao";
import type { CaptureMode, EditorState, ManutencaoConfig } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  cfg: ManutencaoConfig;
  rerender: () => void;
  commit: () => void;
  /** Abre a grade "itens × revisões" (sem item em foco). */
  onAbrirGrade: () => void;
}

const num = "bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono";
const lbl = "text-[10px] uppercase tracking-wide text-[#80808F]";

export function ManutencaoPanel({ st, cfg, rerender, commit, onAbrirGrade }: Props) {
  const [aba, setAba] = useState<"colunas" | "condicoes" | "php">("colunas");
  const qtdRef = useRef<HTMLInputElement>(null);
  const kmRef = useRef<HTMLInputElement>(null);
  const mesRef = useRef<HTMLInputElement>(null);
  const x0Ref = useRef<HTMLInputElement>(null);
  const passoRef = useRef<HTMLInputElement>(null);

  function regenerar() {
    const quantidade = parseInt(qtdRef.current?.value || "10", 10) || 10;
    const kmBase = parseFloat(kmRef.current?.value || "0") || 0;
    const mesesBase = parseFloat(mesRef.current?.value || "0") || 0;
    const xInicial = parseFloat(x0Ref.current?.value || "0") || 0;
    const passoX = parseFloat(passoRef.current?.value || "0") || 0;
    if (quantidade < 1) {
      showToast("Informe ao menos 1 revisão.", "error");
      return;
    }
    // As condições guardam ids de coluna; recriar as colunas invalidaria todas elas.
    // Reassocia por posição, que é o que o usuário enxerga ("ímpares" continua ímpares).
    const antigas = cfg.colunas.map((c) => c.id);
    const novas = gerarColunas({ quantidade, kmBase, mesesBase, xInicial, passoX });
    cfg.condicoes.forEach((cond) => {
      cond.colunas = cond.colunas
        .map((id) => antigas.indexOf(id))
        .filter((i) => i >= 0 && i < novas.length)
        .map((i) => novas[i].id);
    });
    cfg.colunas = novas;
    cfg.previewColunaId = novas[0]?.id ?? null;
    commit();
    showToast(`${novas.length} colunas geradas — ajuste o X de cada uma na folha.`, "success");
  }

  /**
   * Redistribui o X das colunas EXISTENTES pela progressão digitada — sem recriar nada,
   * então ids, km, meses e condições ficam de pé. É o que permite mexer no x inicial e
   * no passo vendo a folha se ajustar a cada tecla; o preço é que o ajuste fino feito
   * coluna a coluna é sobrescrito, que é justamente o que se quer ao mexer no passo.
   */
  function aplicarProgressaoX() {
    const xInicial = parseFloat(x0Ref.current?.value || "");
    const passoX = parseFloat(passoRef.current?.value || "");
    if (isNaN(xInicial) || isNaN(passoX)) return;
    cfg.colunas.forEach((c, i) => {
      c.x = +(xInicial + i * passoX).toFixed(2);
    });
    rerender();
  }

  function addColuna() {
    const ultima = cfg.colunas[cfg.colunas.length - 1];
    cfg.colunas.push({
      id: genId("mc"),
      label: colunaLabel(cfg.colunas.length),
      km: "",
      meses: "",
      x: ultima ? +(ultima.x + 8).toFixed(2) : 112,
    });
    commit();
  }

  function addCondicao() {
    cfg.condicoes.push({ id: genId("cd"), nome: "nova condição", colunas: [] });
    commit();
  }

  /** Arquivo só com as funções: caminhos e query ficam na página do PDF do sistema. */
  const soFuncao = (cfg.formatoArquivo ?? "funcao") === "funcao";
  /** Assinatura que a página do PDF precisa chamar — um $fundoBg por folha, depois as imagens. */
  const nomeFuncaoDesenho = nomeFuncao("gerarDesenho", cfg);
  const folhasDoPlano = st.pages.filter(
    (p) => p.kind === "checklist" && p.docType === "manutencao",
  ).length;
  const varRespostaLabel = "$" + (cfg.varResposta || "resposta_formulario").replace(/^\$/, "");
  const assinaturaExtras = Array.from({ length: folhasDoPlano }, (_, i) =>
    i === 0 ? "$fundoBg" : `$fundoBg${i + 1}`,
  ).join(", ");

  function capturarX(colunaId: string) {
    st.captureMode = { kind: "manutencaoColX", colunaId } as CaptureMode;
    commit();
    showToast("Clique na folha, na coluna desta revisão.", "info");
  }

  /** Mediana dos passos entre colunas — a régua contra a qual cada Δ é comparado. */
  const passos = cfg.colunas
    .map((_, i) => passoDaColuna(cfg, i))
    .filter((p): p is number => p !== null);
  const passoDominante = passos.length
    ? [...passos].sort((a, b) => a - b)[Math.floor(passos.length / 2)]
    : null;

  return (
    <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
      <div className="flex border-b border-[#e0e0e0] bg-[#F9F9F9]">
        {([
          ["colunas", `Revisões (${cfg.colunas.length})`],
          ["condicoes", `Presets (${cfg.condicoes.length})`],
          ["php", "PHP"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex-1 px-2 py-2 text-[11px] font-medium transition-colors ${
              aba === id ? "bg-white text-[#173872] border-b-2 border-[#173872]" : "text-[#80808F] hover:text-[#464E5F]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "colunas" && (
        <div className="p-3 space-y-3">
          <div className="rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-[#173872]" />
              <span className="text-[11px] font-medium text-[#464E5F]">Gerar por progressão</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center gap-1.5">
                <span className={`${lbl} w-14`}>revisões</span>
                <input ref={qtdRef} type="number" min={1} defaultValue={cfg.colunas.length || 10} className={`${num} w-full`} />
              </label>
              <label className="flex items-center gap-1.5">
                <span className={`${lbl} w-14`}>km base</span>
                <input ref={kmRef} type="number" defaultValue={cfg.colunas[0]?.km || 15000} className={`${num} w-full`} />
              </label>
              <label className="flex items-center gap-1.5">
                <span className={`${lbl} w-14`}>meses</span>
                <input ref={mesRef} type="number" defaultValue={cfg.colunas[0]?.meses || 12} className={`${num} w-full`} />
              </label>
              <label className="flex items-center gap-1.5">
                <span className={`${lbl} w-14`}>x inicial</span>
                <input
                  ref={x0Ref}
                  type="number"
                  step="0.1"
                  key={"x0" + st.geomTick}
                  defaultValue={cfg.colunas[0]?.x ?? 112}
                  onChange={aplicarProgressaoX}
                  onBlur={commit}
                  title="X (mm) da 1ª coluna — as demais acompanham na hora, na folha"
                  className={`${num} w-full`}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className={`${lbl} w-14`}>passo x</span>
                <input
                  ref={passoRef}
                  type="number"
                  step="0.1"
                  key={"px" + st.geomTick}
                  defaultValue={
                    cfg.colunas.length > 1 ? +(cfg.colunas[1].x - cfg.colunas[0].x).toFixed(2) : 8.2
                  }
                  onChange={aplicarProgressaoX}
                  onBlur={commit}
                  title="Distância (mm) entre colunas — redistribui todas na hora, na folha"
                  className={`${num} w-full`}
                />
              </label>
              <button
                onClick={regenerar}
                className="px-2 py-1 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-[11px] font-medium transition-colors"
              >
                gerar colunas
              </button>
            </div>
            <p className="text-[10px] text-[#80808F] leading-snug">
              <b className="text-[#464E5F]">x inicial</b> e <b className="text-[#464E5F]">passo x</b>{" "}
              movem as colunas na folha enquanto você digita — ligue o &quot;ver todas&quot; para
              enxergar o conjunto. Revisões, km e meses só valem ao clicar em gerar colunas, que
              recria a tabela. A folha real quase nunca é equidistante: o que ficar torto se ajusta
              no campo da coluna ou capturando na folha.
            </p>
          </div>

          {/* prévia: uma revisão por vez ou todas de uma vez */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                cfg.previewTodas = !cfg.previewTodas;
                commit();
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                cfg.previewTodas
                  ? "bg-[#173872] text-white border-[#173872]"
                  : "bg-white text-[#80808F] border-[#e0e0e0] hover:text-[#173872] hover:border-[#173872]/40"
              }`}
              title="Desenhar todas as revisões na folha ao mesmo tempo — a coluna com o X torto salta à vista"
            >
              <Layers className="w-3 h-3" />
              ver todas
            </button>
            <span className="text-[9.5px] text-[#80808F] leading-tight">
              {cfg.previewTodas
                ? "todas desenhadas; o olho escolhe a que fica em destaque"
                : "só a revisão do olho aparece na folha"}
            </span>
          </div>

          <div className="space-y-1">
            {cfg.colunas.map((col, i) => {
              const atual = cfg.previewColunaId === col.id;
              const passo = passoDaColuna(cfg, i);
              // Fora do passo dominante = X provavelmente torto. O dominante é a mediana
              // dos passos, que aguenta uma ou outra coluna errada sem contaminar a régua.
              const torto = passo !== null && passoDominante !== null
                ? Math.abs(passo - passoDominante) > 0.35
                : false;
              return (
                <div
                  key={col.id}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border ${
                    atual ? "border-[#173872]/40 bg-[#173872]/5" : "border-transparent hover:bg-[#F9F9F9]"
                  }`}
                >
                  <button
                    onClick={() => {
                      cfg.previewColunaId = col.id;
                      commit();
                    }}
                    title="Ver a folha nesta revisão"
                    className={`shrink-0 p-1 rounded ${atual ? "text-[#173872]" : "text-[#c9c9d2] hover:text-[#173872]"}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <input
                    defaultValue={col.label}
                    key={col.id + "l" + st.geomTick}
                    onChange={(e) => {
                      col.label = e.target.value;
                    }}
                    onBlur={commit}
                    className={`${num} w-10 text-center`}
                    title="rótulo"
                  />
                  <input
                    defaultValue={col.km}
                    key={col.id + "k" + st.geomTick}
                    placeholder="km"
                    onChange={(e) => {
                      col.km = e.target.value;
                      rerender();
                    }}
                    onBlur={commit}
                    className={`${num} w-16`}
                    title="km desta revisão"
                  />
                  <input
                    defaultValue={col.meses}
                    key={col.id + "m" + st.geomTick}
                    placeholder="meses"
                    onChange={(e) => {
                      col.meses = e.target.value;
                      rerender();
                    }}
                    onBlur={commit}
                    className={`${num} w-12`}
                    title="meses desta revisão (sai como 12M)"
                  />
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={col.x}
                    key={col.id + "x" + st.geomTick}
                    onChange={(e) => {
                      col.x = parseFloat(e.target.value) || 0;
                      rerender();
                    }}
                    onBlur={commit}
                    className={`${num} w-14 text-right`}
                    title="x (mm) da marcação nesta revisão"
                  />
                  <span
                    className={`shrink-0 w-9 text-right text-[9px] font-mono ${
                      torto ? "text-[#F64E60] font-bold" : "text-[#b0b0bf]"
                    }`}
                    title={
                      passo === null
                        ? "primeira coluna — não tem passo"
                        : torto
                        ? `passo ${passo} mm, fora do dominante (${passoDominante} mm)`
                        : `passo desde a coluna anterior: ${passo} mm`
                    }
                  >
                    {passo === null ? "—" : `+${passo}`}
                  </span>
                  <button
                    onClick={() => capturarX(col.id)}
                    className="shrink-0 px-1.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]"
                    title="capturar clicando na folha"
                  >
                    <Crosshair className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      removerColuna(st.pages, cfg, col.id);
                      commit();
                    }}
                    className="shrink-0 text-[#b0b0bf] hover:text-[#F64E60]"
                    title={`Remover a coluna ${col.label || colunaLabel(i)}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={addColuna}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-[#d0d0d0] text-[#80808F] hover:border-[#173872]/40 hover:text-[#173872] text-[11px] transition-colors"
          >
            <Plus className="w-3 h-3" />
            revisão
          </button>
        </div>
      )}

      {aba === "condicoes" && (
        <div className="p-3 space-y-2">
          <button
            onClick={onAbrirGrade}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-[11px] font-medium transition-colors"
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            abrir a grade de revisões
          </button>
          <p className="text-[10px] text-[#80808F] leading-snug">
            Presets de revisões, para aplicar de uma vez na grade de um item. Quem decide onde
            cada item é impresso é a máscara dele — o preset é só um atalho, e mexer aqui não
            altera o que já foi marcado.
          </p>
          {cfg.condicoes.map((cond) => {
            const usos = contarUsos(st.pages, cfg, cond.id);
            return (
              <div key={cond.id} className="rounded-lg border border-[#e8e8e8] p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    defaultValue={cond.nome}
                    key={cond.id + "n" + st.geomTick}
                    onChange={(e) => {
                      cond.nome = e.target.value;
                      rerender();
                    }}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs font-semibold text-[#464E5F]"
                  />
                  <span className="text-[10px] text-[#80808F] shrink-0">{usos} item(ns)</span>
                  <button
                    onClick={() => {
                      removerCondicao(cfg, cond.id);
                      commit();
                      // O preset some da lista, mas nada muda no que é impresso: a máscara
                      // de cada item é dele, não um ponteiro para cá.
                      showToast("Preset removido — as marcações dos itens continuam como estão.", "success");
                    }}
                    className="shrink-0 text-[#b0b0bf] hover:text-[#F64E60]"
                    title="Remover preset"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cfg.colunas.map((col, i) => {
                    const on = cond.colunas.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        onClick={() => {
                          cond.colunas = on
                            ? cond.colunas.filter((c) => c !== col.id)
                            : [...cond.colunas, col.id];
                          rerender();
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          on
                            ? "bg-[#173872] text-white border-[#173872]"
                            : "bg-white text-[#b0b0bf] border-[#e0e0e0] hover:border-[#173872]/40"
                        }`}
                        title={[col.km && `${col.km} km`, col.meses && `${col.meses}M`].filter(Boolean).join(" · ")}
                      >
                        {col.label || colunaLabel(i)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button
            onClick={addCondicao}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-[#d0d0d0] text-[#80808F] hover:border-[#173872]/40 hover:text-[#173872] text-[11px] transition-colors"
          >
            <Plus className="w-3 h-3" />
            condição
          </button>
        </div>
      )}

      {aba === "php" && (
        <div className="p-3 space-y-2">
          <label className="block space-y-1">
            <span className={lbl}>arquivo</span>
            <select
              value={cfg.formatoArquivo ?? "funcao"}
              onChange={(e) => {
                cfg.formatoArquivo = e.target.value as "funcao" | "completo";
                commit();
              }}
              className={`${num} w-full`}
              title="O que o arquivo gerado traz dentro"
            >
              <option value="funcao">só as funções (como o modelo)</option>
              <option value="completo">funções + declaração dos caminhos</option>
            </select>
            <span className="block text-[10px] text-[#80808F] leading-snug">
              {soFuncao
                ? "gerarDesenho e gerarImpressao, nada mais: os $fundoBg (e $img_*) chegam por parâmetro, declarados pela página do PDF."
                : "As mesmas funções, mais os $fundoBg/$img_* declarados no topo do arquivo."}
            </span>
          </label>
          {(
            [
              ["sufixoFuncao", "sufixo", "gerarDesenho<sufixo> / gerarImpressao<sufixo>"],
              ["varResposta", "objeto da resposta", "nome (sem $) do objeto dentro da função: $resposta"],
              ["codFormulario", "codFormulario", "usado no WHERE da query"],
              ["campoRevisao", "campo da revisão", "propriedade que diz qual revisão imprimir"],
              ["fundoPath", "fundo ({n} = folha)", "caminho PHP do JPG de cada folha"],
            ] as const
          )
            // No formato "funcao" quem declara o caminho do fundo é a página do PDF — o
            // campo não sairia em lugar nenhum do arquivo.
            .filter(([key]) => (soFuncao ? key !== "fundoPath" : true))
            .map(([key, label, hint]) => (
            <label key={key} className="block space-y-1">
              <span className={lbl}>{label}</span>
              <input
                defaultValue={cfg[key]}
                key={key + st.geomTick}
                onChange={(e) => {
                  cfg[key] = e.target.value;
                  rerender();
                }}
                title={hint}
                className={`${num} w-full`}
              />
            </label>
          ))}
          <label className="flex items-center gap-2">
            <span className={lbl}>marca (mm)</span>
            <input
              type="number"
              step="0.1"
              defaultValue={cfg.iconMm}
              key={"icon" + st.geomTick}
              onChange={(e) => {
                cfg.iconMm = parseFloat(e.target.value) || 3;
                rerender();
              }}
              className={`${num} w-16`}
              title="Tamanho do quadrado que representa a marcação no canvas. O PHP imprime o glifo ✓/X, que não depende deste valor."
            />
          </label>

          <label className="flex items-start gap-2 text-[11px] text-[#464E5F] cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.buscarNomeFantasia}
              onChange={(e) => {
                cfg.buscarNomeFantasia = e.target.checked;
                commit();
              }}
              className="mt-0.5"
            />
            <span>
              buscar <code className="font-mono">nomeFantasia</code> da concessionária na função de
              impressão
            </span>
          </label>

          {/* A conferência que evita o fundo saindo no lugar da bola: a página do PDF tem
              de passar um $fundoBg por folha do plano, senão os argumentos escorregam. */}
          <p className="text-[10px] text-[#80808F] leading-snug border-t border-[#f0f0f0] pt-2">
            Chamada esperada — {folhasDoPlano} folha(s), logo {folhasDoPlano} fundo(s):
            <code className="block mt-1 font-mono text-[9.5px] text-[#464E5F] break-all">
              {`${nomeFuncaoDesenho}(${varRespostaLabel}, $pdf, ${assinaturaExtras});`}
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
