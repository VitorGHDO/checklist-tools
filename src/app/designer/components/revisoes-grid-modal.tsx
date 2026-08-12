"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { Grid3x3, ScanLine, Search, X } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { genId } from "@/lib/designer/model";
import {
  colunaLabel,
  definirMascara,
  itensDoPlano,
  mascaraDoItem,
  ordenarPorColuna,
} from "@/lib/designer/manutencao";
import {
  amostrasDaFolha,
  classificarAmostras,
  type AmostraCelula,
  type LeituraGrade,
} from "@/lib/designer/leitura-grade";
import type { DesignerPage, ManutencaoConfig, Marker } from "@/lib/designer/types";

interface Props {
  pages: DesignerPage[];
  cfg: ManutencaoConfig;
  /** Item que a grade deve destacar ao abrir (veio da linha do item). */
  focoMarkerId?: string | null;
  onClose: () => void;
  /** Grava o estado — a grade muta os markers direto, como o resto do editor. */
  commit: () => void;
}

/** Carrega a data URL do fundo — resolve antes de o bitmap ser amostrado. */
function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagem inválida"));
    img.src = src;
  });
}

/** Linha da grade: um item do plano, com a folha e o grupo a que pertence. */
interface Linha {
  marker: Marker;
  campo: string;
  folha: number;
  grupo: string;
}

export function RevisoesGridModal({ pages, cfg, focoMarkerId, onClose, commit }: Props) {
  const [busca, setBusca] = useState("");
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  /** Pintura em curso: o valor aplicado é decidido na primeira célula do arrasto. */
  const pintando = useRef<boolean | null>(null);
  /** Proposta vinda da leitura do fundo — fica na tela até você aplicar ou descartar. */
  const [leitura, setLeitura] = useState<LeituraGrade | null>(null);
  const [lendo, setLendo] = useState(false);

  const linhas = useMemo<Linha[]>(() => {
    const sheets = pages.filter((p) => p.kind === "checklist" && p.docType === "manutencao");
    return itensDoPlano(pages).map(({ page, group, marker }) => ({
      marker,
      campo: marker.label.trim() || "(sem campo)",
      folha: sheets.indexOf(page) + 1,
      grupo: group.title,
    }));
  }, [pages]);

  const filtro = busca.trim().toLowerCase();
  const visiveis = filtro
    ? linhas.filter((l) => l.campo.toLowerCase().includes(filtro) || l.grupo.toLowerCase().includes(filtro))
    : linhas;

  /** Revisões marcadas da linha. Vazio = o item não sai em revisão nenhuma. */
  function marcadas(marker: Marker): Set<string> {
    return new Set(mascaraDoItem(cfg, marker));
  }

  function aplicar(marker: Marker, ids: string[] | null) {
    definirMascara(cfg, marker, ids);
    rerender();
  }

  function alternarCelula(marker: Marker, colunaId: string, ligar: boolean) {
    const base = marcadas(marker);
    if (ligar) base.add(colunaId);
    else base.delete(colunaId);
    aplicar(marker, [...base]);
  }

  function alternarColuna(colunaId: string) {
    // Se todas as linhas visíveis já têm esta revisão, o clique desmarca; senão marca.
    const todasTem = visiveis.every((l) => marcadas(l.marker).has(colunaId));
    visiveis.forEach((l) => alternarCelula(l.marker, colunaId, !todasTem));
    commit();
  }

  /** Marca (ou limpa) todas as revisões das linhas que estão à vista. */
  function aplicarEmLote(ligar: boolean) {
    const todas = cfg.colunas.map((c) => c.id);
    visiveis.forEach((l) => aplicar(l.marker, ligar ? todas : null));
    commit();
    showToast(
      ligar
        ? `${visiveis.length} item(ns) passam a sair em todas as revisões.`
        : `${visiveis.length} item(ns) ficaram sem revisão marcada.`,
      "success",
    );
  }

  function aplicarPreset(marker: Marker, escolha: string) {
    if (escolha === "__todas") {
      aplicar(marker, cfg.colunas.map((c) => c.id));
    } else if (escolha === "__nenhuma") {
      aplicar(marker, null);
    } else if (escolha === "__inverter") {
      const atual = marcadas(marker);
      aplicar(
        marker,
        cfg.colunas.filter((c) => !atual.has(c.id)).map((c) => c.id),
      );
    } else {
      const cond = cfg.condicoes.find((c) => c.id === escolha);
      if (!cond) return;
      aplicar(marker, ordenarPorColuna(cfg, cond.colunas));
    }
    commit();
  }

  /** Guarda a máscara desta linha como preset reaproveitável. */
  function salvarPreset(linha: Linha) {
    const mascara = mascaraDoItem(cfg, linha.marker);
    if (mascara.length === 0) {
      showToast("Esta linha não tem nenhuma revisão marcada — não há preset a salvar.", "info");
      return;
    }
    const nome = prompt("Nome do preset (ex.: a cada 24 meses):", linha.campo);
    if (!nome?.trim()) return;
    cfg.condicoes.push({ id: genId("cd"), nome: nome.trim(), colunas: [...mascara] });
    commit();
    showToast(`Preset "${nome.trim()}" salvo.`, "success");
  }

  /**
   * Lê a hachura das folhas: desenha cada fundo num canvas fora da tela, amostra o miolo
   * de cada cruzamento item × revisão e propõe a máscara. Nada é gravado aqui — a
   * proposta aparece na grade para você conferir antes de aplicar.
   */
  async function lerDaFolha() {
    const sheets = pages.filter((p) => p.kind === "checklist" && p.docType === "manutencao");
    const comImagem = sheets.filter((p) => p.imageSrc);
    if (comImagem.length === 0) {
      showToast("Nenhuma folha tem imagem de fundo carregada.", "error");
      return;
    }
    setLendo(true);
    try {
      const amostras: AmostraCelula[] = [];
      for (const page of comImagem) {
        const img = await carregarImagem(page.imageSrc!);
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0);
        const bitmap = ctx.getImageData(0, 0, cv.width, cv.height);
        const itens = page.groups.flatMap((group) =>
          group.markers.map((marker) => ({ group, marker })),
        );
        amostras.push(...amostrasDaFolha(bitmap, page, cfg, itens));
      }
      const markerPorId = new Map(linhas.map((l) => [l.marker.id, l.marker]));
      const resultado = classificarAmostras(amostras, cfg, markerPorId);
      if (resultado.semContraste) {
        showToast(
          "Não achei dois tons na tabela — confira se o X das revisões está calibrado e se o fundo é a folha certa.",
          "error",
        );
        setLeitura(null);
        return;
      }
      setLeitura(resultado);
      showToast(
        `${resultado.total} células lidas · ${resultado.itensDiferentes} item(ns) mudariam · ${resultado.duvidosas} duvidosa(s).`,
        "info",
      );
    } catch {
      showToast("Não consegui ler a imagem de fundo desta folha.", "error");
    } finally {
      setLendo(false);
    }
  }

  /** Grava a proposta da leitura em todos os itens que ela cobre. */
  function aplicarLeitura() {
    if (!leitura) return;
    let n = 0;
    linhas.forEach((l) => {
      const proposta = leitura.porItem.get(l.marker.id);
      if (!proposta || !proposta.diferente) return;
      definirMascara(cfg, l.marker, proposta.claras);
      n += 1;
    });
    setLeitura(null);
    commit();
    showToast(`Leitura aplicada em ${n} item(ns).`, "success");
  }

  // A grade nasce toda cinza — nenhuma revisão marcada. O clique abre a célula e põe o
  // ✓, que é o mesmo sinal que o mecânico vê no papel: onde tem ✓, a marcação sai.
  const cel =
    "w-7 h-7 shrink-0 border-r border-b cursor-pointer transition-colors text-center align-middle select-none";
  const celOn = "bg-white border-[#c4cad5] hover:bg-[#eef1f6] text-[#173872]";
  const celOff = "bg-[#8b93a3] border-[#5f6878] hover:bg-[#767f92]";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white border border-[#e8e8e8] rounded-xl w-full max-w-5xl max-h-[88vh] flex flex-col"
        style={{ boxShadow: "0px 20px 60px 0px rgba(76,87,125,0.15)" }}
        onClick={(e) => e.stopPropagation()}
        onMouseUp={() => {
          if (pintando.current !== null) {
            pintando.current = null;
            commit();
          }
        }}
        onMouseLeave={() => {
          pintando.current = null;
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <div>
            <h2 className="font-semibold text-[#464E5F] text-sm flex items-center gap-2">
              <Grid3x3 className="w-4 h-4 text-[#173872]" />
              Grade de revisões
            </h2>
            <p className="mt-1.5 text-xs text-[#80808F] leading-relaxed max-w-xl">
              A mesma tabela da folha: cada linha é um item, cada coluna uma revisão. A grade
              começa cinza — clique para pôr o ✓ nas revisões em que a marcação é impressa.
              Arraste para marcar várias; clique no cabeçalho para ligar/desligar a revisão
              inteira nas linhas à vista.
            </p>
          </div>
          <button onClick={onClose} className="text-[#80808F] hover:text-[#464E5F] ml-4 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-2.5 border-b border-[#e8e8e8] flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-[#b0b0bf]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="filtrar por campo ou grupo"
            className="flex-1 bg-transparent border-none outline-none text-xs text-[#464E5F]"
          />
          <span className="text-[10px] text-[#80808F]">
            {visiveis.length} de {linhas.length} itens · {cfg.colunas.length} revisões
          </span>
          <button
            onClick={lerDaFolha}
            disabled={lendo}
            className="flex items-center gap-1 px-2 py-1 rounded border border-[#173872]/30 bg-[#173872]/5 text-[10px] text-[#173872] hover:bg-[#173872]/10 disabled:opacity-50 transition-colors"
            title="Lê a hachura do fundo das folhas e propõe a marcação de cada item"
          >
            <ScanLine className="w-3 h-3" />
            {lendo ? "lendo…" : "ler da folha"}
          </button>
          <button
            onClick={() => aplicarEmLote(true)}
            className="px-2 py-1 rounded border border-[#e0e0e0] bg-white text-[10px] text-[#80808F] hover:text-[#173872] hover:border-[#173872]/40 transition-colors"
            title="Marca todas as revisões das linhas à vista — o atalho para os itens que saem sempre"
          >
            ✓ todas
          </button>
          <button
            onClick={() => aplicarEmLote(false)}
            className="px-2 py-1 rounded border border-[#e0e0e0] bg-white text-[10px] text-[#80808F] hover:text-[#F64E60] hover:border-[#F64E60]/40 transition-colors"
            title="Limpa as revisões das linhas à vista"
          >
            limpar
          </button>
        </div>

        {leitura && (
          <div className="px-5 py-2.5 border-b border-[#1f2430]/25 bg-[#1f2430]/5 flex items-center gap-3">
            <span className="text-[11px] text-[#464E5F] leading-snug flex-1">
              <b>Proposta da folha:</b> {leitura.total} células lidas ·{" "}
              <b>{leitura.itensDiferentes}</b> item(ns) mudariam ·{" "}
              {leitura.duvidosas > 0 ? (
                <b className="text-[#F64E60]">{leitura.duvidosas} célula(s) duvidosa(s)</b>
              ) : (
                "nenhuma célula duvidosa"
              )}. As células que mudariam já aparecem como ficarão, contornadas de escuro.
            </span>
            <button
              onClick={aplicarLeitura}
              disabled={leitura.itensDiferentes === 0}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] disabled:opacity-40 text-white text-[11px] font-medium transition-colors"
            >
              aplicar
            </button>
            <button
              onClick={() => setLeitura(null)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-[#e0e0e0] bg-white text-[#80808F] text-[11px] hover:text-[#464E5F] transition-colors"
            >
              descartar
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {linhas.length === 0 ? (
            <p className="text-sm text-[#80808F] py-10 text-center">
              Nenhum item no plano ainda. Gere as marcações nas folhas primeiro.
            </p>
          ) : (
            <table className="text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="sticky left-0 z-20 bg-white text-left font-medium text-[#80808F] px-3 py-2 border-b border-[#e8e8e8] min-w-[16rem]">
                    campo
                  </th>
                  {cfg.colunas.map((col, i) => (
                    <th
                      key={col.id}
                      onClick={() => alternarColuna(col.id)}
                      title={[col.km && `${col.km} km`, col.meses && `${col.meses} meses`]
                        .filter(Boolean)
                        .join(" · ")}
                      className="w-7 bg-white text-[9.5px] font-mono text-[#173872] border-b border-r border-[#e8e8e8] cursor-pointer hover:bg-[#173872]/10 px-0"
                    >
                      {col.label || colunaLabel(i)}
                    </th>
                  ))}
                  <th className="bg-white border-b border-[#e8e8e8] px-2 py-2 text-left font-medium text-[#80808F]">
                    aplicar
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((linha, idx) => {
                  const set = marcadas(linha.marker);
                  const total = set.size;
                  const foco = linha.marker.id === focoMarkerId;
                  const novoGrupo = idx === 0 || visiveis[idx - 1].grupo !== linha.grupo;
                  return (
                    <Fragment key={linha.marker.id}>
                      {novoGrupo && (
                        <tr>
                          <td
                            colSpan={cfg.colunas.length + 2}
                            className="sticky left-0 bg-[#173872]/5 text-[10px] font-bold uppercase tracking-wide text-[#173872] px-3 py-1 border-b border-[#e8e8e8]"
                          >
                            f{linha.folha} · {linha.grupo}
                          </td>
                        </tr>
                      )}
                      <tr className={foco ? "bg-[#FFB822]/10" : undefined}>
                        <td
                          className={`sticky left-0 z-10 px-3 py-1 border-b border-[#eceff5] font-mono text-[#0BB783] whitespace-nowrap ${
                            foco ? "bg-[#FFF6E5]" : "bg-white"
                          }`}
                          title={linha.campo}
                        >
                          {linha.campo}
                          <span
                            className={`ml-2 text-[9.5px] font-sans ${
                              total === 0 ? "text-[#F64E60]" : "text-[#b0b0bf]"
                            }`}
                          >
                            {total}/{cfg.colunas.length}
                          </span>
                        </td>
                        {cfg.colunas.map((col) => {
                          const on = set.has(col.id);
                          const proposta = leitura?.porItem.get(linha.marker.id);
                          // Só destaca o que a leitura mudaria — e marca à parte as
                          // células em que ela mesma ficou na dúvida.
                          const propostaOn = proposta?.claras.includes(col.id);
                          const mudaria = proposta ? propostaOn !== on : false;
                          const duvidosa = proposta?.duvidosas.includes(col.id) ?? false;
                          return (
                            <td
                              key={col.id}
                              onMouseDown={() => {
                                pintando.current = !on;
                                alternarCelula(linha.marker, col.id, !on);
                              }}
                              onMouseEnter={() => {
                                if (pintando.current === null) return;
                                alternarCelula(linha.marker, col.id, pintando.current);
                              }}
                              title={
                                mudaria
                                  ? `${linha.campo} · ${col.label} — a folha diz ${
                                      propostaOn ? "que imprime" : "que não imprime"
                                    }${duvidosa ? " (tom duvidoso)" : ""}`
                                  : `${linha.campo} · ${col.label}`
                              }
                              className={`${cel} ${
                                // Na prévia a célula já aparece como ficaria depois de
                                // aplicar; o contorno escuro é que diz "ainda é proposta".
                                mudaria ? (propostaOn ? celOn : celOff) : on ? celOn : celOff
                              } ${
                                mudaria
                                  ? duvidosa
                                    ? "outline outline-2 -outline-offset-2 outline-[#F64E60]"
                                    : "outline outline-2 -outline-offset-2 outline-[#1f2430]"
                                  : ""
                              }`}
                            >
                              {(mudaria ? propostaOn : on) && (
                                <span className="text-[13px] leading-none font-bold">✓</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-b border-[#eceff5] px-2 py-1 whitespace-nowrap">
                          <select
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              aplicarPreset(linha.marker, e.target.value);
                              e.target.value = "";
                            }}
                            className="bg-white border border-[#e0e0e0] rounded px-1 py-0.5 text-[10px] text-[#80808F]"
                          >
                            <option value="">preset…</option>
                            <option value="__todas">todas</option>
                            <option value="__nenhuma">nenhuma</option>
                            <option value="__inverter">inverter</option>
                            {cfg.condicoes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => salvarPreset(linha)}
                            className="ml-1 px-1.5 py-0.5 rounded border border-[#e0e0e0] text-[10px] text-[#80808F] hover:text-[#173872] hover:border-[#173872]/40"
                            title="Salvar esta máscara como preset reaproveitável"
                          >
                            salvar
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#e8e8e8] flex items-center justify-between">
          <span className="text-[10px] text-[#80808F] leading-snug max-w-xl">
            Linha com ✓ em todas as revisões = item impresso sempre, e sai sem{" "}
            <code className="font-mono">if</code> no PHP. Linha sem nenhum ✓ nunca é impressa — o
            contador fica vermelho e o export avisa. Itens com a mesma combinação compartilham uma
            variável só no arquivo gerado.
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-[#173872] hover:bg-[#122d5e] text-white text-xs font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
