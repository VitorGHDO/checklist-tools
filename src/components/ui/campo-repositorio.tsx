"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronUp, Folder, FolderSearch, Search, XCircle } from "lucide-react";
import { REPOSITORIOS, lembrarRepositorio, type ChaveRepositorio } from "@/lib/repositorio";

interface Props {
  chave: ChaveRepositorio;
  valor: string;
  onChange: (caminho: string) => void;
}

async function api<T>(corpo: object): Promise<T> {
  const r = await fetch("/api/repositorios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return r.json();
}

/**
 * Caminho de um repositório local, para cada dev apontar onde guarda os projetos: diz na
 * hora se a pasta é o repositório certo, navega pelas pastas da máquina e procura sozinho
 * pelo nome. O caminho escolhido fica guardado no navegador de quem escolheu.
 */
export function CampoRepositorio({ chave, valor, onChange }: Props) {
  const repo = REPOSITORIOS[chave];
  const [status, setStatus] = useState<{ valido: boolean; motivo: string } | null>(null);
  const [navegando, setNavegando] = useState(false);
  const [atual, setAtual] = useState<{ caminho: string; pai: string | null; pastas: string[] } | null>(null);
  const [procurando, setProcurando] = useState(false);

  // verificação com um respiro, para não bater no servidor a cada tecla
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await api<{ valido: boolean; motivo: string }>({ acao: "verificar", caminho: valor, exigir: repo.exigir });
      if (!vivo) return;
      setStatus(r);
      if (r.valido) lembrarRepositorio(chave, valor);
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [valor, chave, repo.exigir]);

  async function abrir(caminho: string) {
    const r = await api<{ caminho: string; pai: string | null; pastas: string[]; erro?: string }>({ acao: "listar", caminho });
    if (!r.erro) setAtual(r);
  }

  async function detectar() {
    setProcurando(true);
    try {
      const r = await api<{ achados: Record<string, string> }>({
        acao: "procurar",
        alvos: [{ chave, nome: repo.rotulo, exigir: repo.exigir }],
      });
      if (r.achados[chave]) onChange(r.achados[chave]);
      else setStatus({ valido: false, motivo: `não achei "${repo.rotulo}" — use procurar pasta` });
    } finally {
      setProcurando(false);
    }
  }

  const botao =
    "flex items-center gap-1 rounded border border-[#e0e0e0] bg-white px-2 py-1 text-[11px] text-[#464E5F] hover:bg-[#F9F9F9]";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`pasta do ${repo.rotulo}`}
          className="min-w-0 flex-1 rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 font-mono text-sm text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#8950FC]/30"
        />
        {status?.valido ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0BB783]" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-[#F64E60]" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setNavegando((v) => !v);
            if (!navegando) void abrir(valor);
          }}
          className={botao}
        >
          <FolderSearch className="h-3.5 w-3.5" /> procurar pasta
        </button>
        <button type="button" onClick={() => void detectar()} disabled={procurando} className={botao}>
          <Search className="h-3.5 w-3.5" /> {procurando ? "procurando…" : "detectar"}
        </button>
        {status && !status.valido && <span className="text-[11px] text-[#F64E60]">{status.motivo}</span>}
      </div>

      {navegando && atual && (
        <div className="rounded-lg border border-[#e0e0e0] bg-[#F9F9F9]">
          <div className="flex items-center gap-1.5 border-b border-[#e8e8e8] px-2 py-1.5">
            <button
              type="button"
              onClick={() => void abrir(atual.pai ?? "")}
              disabled={atual.pai === null}
              className="rounded p-0.5 text-[#80808F] hover:text-[#173872] disabled:opacity-30"
              title="subir"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <span className="flex-1 truncate font-mono text-[11px] text-[#464E5F]">{atual.caminho || "discos"}</span>
            {atual.caminho && (
              <button
                type="button"
                onClick={() => {
                  onChange(atual.caminho);
                  setNavegando(false);
                }}
                className="rounded bg-[#8950FC] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#7337e8]"
              >
                usar esta pasta
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {atual.pastas.length === 0 && <p className="px-3 py-1 text-[11px] text-[#b0b0bf]">sem subpastas</p>}
            {atual.pastas.map((nome) => (
              <button
                key={nome}
                type="button"
                onClick={() => void abrir(atual.caminho ? `${atual.caminho.replace(/\/$/, "")}/${nome}` : nome)}
                className={`flex w-full items-center gap-1.5 px-3 py-1 text-left font-mono text-[11.5px] hover:bg-white ${
                  nome.toLowerCase() === repo.rotulo.toLowerCase() ? "font-semibold text-[#8950FC]" : "text-[#464E5F]"
                }`}
              >
                <Folder className="h-3.5 w-3.5 shrink-0 text-[#FFB822]" />
                {nome}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
