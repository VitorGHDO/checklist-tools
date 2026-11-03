import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, FileText, PenTool, Terminal, FolderGit2, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Manual — Checklist Tools",
  description: "Passo a passo do Extrator e do Designer de PDF, da folha ao imprimir.php.",
};

// ─── blocos de layout ───────────────────────────────────────────────────────────

function Secao({ id, icone, titulo, resumo, children }: {
  id: string;
  icone: ReactNode;
  titulo: string;
  resumo: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 bg-white rounded-xl border border-[#e8e8e8] overflow-hidden"
      style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
    >
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e8e8e8]">
        <div className="w-8 h-8 bg-[#173872] rounded-lg flex items-center justify-center text-white shrink-0">{icone}</div>
        <div>
          <h2 className="text-base font-semibold text-[#173872]">{titulo}</h2>
          <p className="text-xs text-[#80808F]">{resumo}</p>
        </div>
      </div>
      <div className="p-6 space-y-6">{children}</div>
    </section>
  );
}

function Fluxo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[#464E5F]">{titulo}</h3>
      <ol className="space-y-3">{children}</ol>
    </div>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-7 h-7 rounded-full bg-[#ED3237] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </span>
      <div className="flex-1 min-w-0 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] px-4 py-3">
        <p className="text-sm font-semibold text-[#464E5F]">{titulo}</p>
        <div className="mt-1 text-[13px] leading-relaxed text-[#464E5F] space-y-1.5">{children}</div>
      </div>
    </li>
  );
}

function Botao({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded border border-[#173872]/30 bg-white px-1.5 py-px text-[12px] font-medium text-[#173872] whitespace-nowrap">
      {children}
    </span>
  );
}

function Cod({ children }: { children: ReactNode }) {
  return <code className="rounded bg-[#173872]/5 px-1 py-px text-[12px] text-[#173872] break-all">{children}</code>;
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-[#FFB822]/40 bg-[#FFB822]/5 px-4 py-3 text-[13px] text-[#464E5F]">
      <AlertTriangle className="w-4 h-4 text-[#FFB822] shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#e8e8e8]">
      <table className="w-full text-[13px]">
        <thead className="bg-[#F9F9F9] text-left text-[#80808F]">
          <tr>{cab.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-[#e8e8e8] align-top">
              {l.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INDICE = [
  { href: "#repositorios", rotulo: "Antes de começar" },
  { href: "#extrator", rotulo: "Extrator" },
  { href: "#pos-venda", rotulo: "Pós-venda com skill" },
  { href: "#designer", rotulo: "Designer de PDF" },
  { href: "#skills", rotulo: "Skills" },
  { href: "#problemas", rotulo: "Problemas comuns" },
];

// ─── página ─────────────────────────────────────────────────────────────────────

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-[#e6e6e6] text-[#464E5F]">
      <header
        className="sticky top-0 z-40 bg-white border-b border-[#e8e8e8]"
        style={{ boxShadow: "0px 10px 30px 0px rgba(82,63,105,0.05)" }}
      >
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="p-2 rounded-lg hover:bg-[#F9F9F9] transition-colors text-[#80808F] hover:text-[#464E5F]">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-7 h-7 bg-[#173872] rounded-lg flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-semibold text-[#173872] truncate">Manual do Checklist Tools</h1>
          </div>
          <div className="flex items-center gap-4 text-sm shrink-0">
            <Link href="/extrator" className="text-[#80808F] hover:text-[#173872] transition-colors">Extrator</Link>
            <Link href="/designer" className="text-[#80808F] hover:text-[#173872] transition-colors">Designer</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div
          className="bg-white rounded-xl border border-[#e8e8e8] px-6 py-5 space-y-3"
          style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
        >
          <p className="text-sm leading-relaxed">
            A ferramenta faz a parte determinística (ler a folha, medir, montar o banco e gravar os arquivos nos
            repositórios). O Claude Code faz só o que exige juízo, com as skills que a própria ferramenta instala.
            Nada aqui roda <Cod>migrate</Cod>, commit ou push: isso fica com o dev.
          </p>
          <nav className="flex flex-wrap gap-2">
            {INDICE.map((i) => (
              <a
                key={i.href}
                href={i.href}
                className="px-3 py-1.5 rounded-lg border border-[#e8e8e8] bg-[#F9F9F9] hover:border-[#173872]/40 hover:text-[#173872] text-xs font-medium transition-colors"
              >
                {i.rotulo}
              </a>
            ))}
          </nav>
        </div>

        {/* ─── repositórios ─── */}
        <Secao
          id="repositorios"
          icone={<FolderGit2 className="w-4 h-4" />}
          titulo="Antes de começar: apontar os repositórios"
          resumo="Uma vez por dev; cada um guarda os projetos numa pasta diferente."
        >
          <Tabela
            cab={["Repositório", "Recebe", "Usado por"]}
            linhas={[
              ["stellantis-ei-api", "Migrations do Entrega Impecável", "Extrator"],
              ["acampa-api-lumen", "Migrations do pós-venda", "Extrator"],
              ["stellantis-ei-checklist", "Artes + designer.json + skill checklist-designer", "Designer (EI)"],
              ["acampa-checklist", "Artes + pos_venda.json + skill checklist-pos-venda", "Extrator / Designer (pós-venda)"],
            ]}
          />
          <Fluxo titulo="Configurar o caminho">
            <Passo n={1} titulo="Abra qualquer campo de repositório">
              Ele aparece ao gravar a migration no extrator e nos modais de <Botao>Enviar para o Claude Code</Botao>.
            </Passo>
            <Passo n={2} titulo="Clique em detectar">
              <Botao>detectar</Botao> procura o repositório nas pastas comuns da máquina.
            </Passo>
            <Passo n={3} titulo="Se não achar, procure a pasta">
              <Botao>procurar pasta</Botao> abre um navegador de pastas; vá até a raiz do repositório.
            </Passo>
            <Passo n={4} titulo="Confira o ✓">
              ✓ verde = é o repositório certo (marcadores: <Cod>database/migrations</Cod> nas APIs, <Cod>stellantis</Cod> /{" "}
              <Cod>tools/checklist</Cod> nos checklists). ✗ = pasta errada. O caminho fica guardado neste navegador.
            </Passo>
          </Fluxo>
          <p className="text-[13px] text-[#80808F]">
            Para as skills rodarem: Python instalado (scripts de medição) e <Cod>php</Cod> no PATH (lint e PDF de teste).
          </p>
        </Secao>

        {/* ─── extrator ─── */}
        <Secao
          id="extrator"
          icone={<FileText className="w-4 h-4" />}
          titulo="Extrator"
          resumo="Da folha em PDF aos campos, ao banco e à migration."
        >
          <Fluxo titulo="Gerar e conferir os campos">
            <Passo n={1} titulo="Projeto, tipo e arquivo">
              Escolha o projeto e o tipo de checklist, envie o PDF (ou as imagens) e gere os campos.
            </Passo>
            <Passo n={2} titulo="Plano de manutenção: confira os blocos">
              SOLO, MEIA ALTURA e ALTURA MÁXIMA viram grupos próprios; cabeçalho e notas da folha são ignorados.
              Cada item vem marcado como [por km], [por tempo] ou [por km e por tempo].
            </Passo>
            <Passo n={3} titulo="Plano de manutenção: escolha o status inicial">
              No menu do plano, defina o <Botao>status inicial</Botao>; a numeração das páginas parte dele.
            </Passo>
            <Passo n={4} titulo="Arraste o que caiu na seção errada">
              Na aba Campos, clique no campo e arraste até a seção certa. Vale para todos os tipos.
            </Passo>
          </Fluxo>

          <Fluxo titulo="Banco de dados">
            <Passo n={1} titulo="Campos essenciais (status 0), se o modelo precisar">
              Marque <Botao>campos essenciais (N)</Botao> na aba de perguntas/status. Entra a tela “Dados do Veículo e
              Cliente” com campo, tipo, pergunta, opções e valor do export real do banco.
              <Tabela
                cab={["Tipo", "Perguntas no status 0", "Tabela"]}
                linhas={[
                  ["Pós-venda (inspeção)", "19", "checklist_perguntas"],
                  ["Revisão de entrega", "11", "checklist_perguntas"],
                  ["Roteiro de entrega técnica", "28", "checklist_perguntas"],
                  ["Plano de manutenção", "4 (os, placa, chassi, km)", "formulario_perguntas"],
                ]}
              />
              Só o <Cod>obrigatorio</Cod> é inferido (<Cod>hidden</Cod> = 0, o resto = 1); o SQL traz um comentário
              lembrando de conferir.
            </Passo>
            <Passo n={2} titulo="Copie checklist_status e checklist_perguntas em formato MySQL">
              Use <Botao>Formato MySQL</Botao>. Cada linha começa com <Cod>{"''"}</Cod> (id vazio, auto-incremento):{" "}
              <Cod>{"('', 217, ...)"}</Cod>.
            </Passo>
            <Passo n={3} titulo="Grave a migration no repositório">
              Na migration, marque “Incluir os campos essenciais (status 0)” se for o caso, aponte o repositório da API e
              clique em <Botao>Gravar no repositório</Botao>. O arquivo vai para <Cod>database/migrations</Cod>:
              <ul className="list-disc pl-5">
                <li>EI (stellantis-ei-api): <Cod>{"<data>_create_<tabela>_table.php"}</Cod></li>
                <li>Pós-venda (acampa-api-lumen): <Cod>{"<data>_create_table_<tabela>.php"}</Cod></li>
              </ul>
              Se o arquivo já existe, a ferramenta pede confirmação antes de sobrescrever.
            </Passo>
            <Passo n={4} titulo="Rode o migrate você mesmo">
              Confira o arquivo gravado e execute <Cod>php artisan migrate</Cod> manualmente. A ferramenta nunca roda.
            </Passo>
          </Fluxo>
        </Secao>

        {/* ─── pós-venda ─── */}
        <Secao
          id="pos-venda"
          icone={<Terminal className="w-4 h-4" />}
          titulo="Pós-venda: do extrator direto para a skill"
          resumo="Caminho principal. O extrator resolve campos e ordem; a skill resolve a geometria da arte."
        >
          <p className="text-[13px] leading-relaxed">
            A folha de pós-venda não tem padrão de layout. Por isso os campos saem do extrator (nomes, ordem e
            “Etapa &gt; SEÇÃO” já certos) e a skill <Cod>checklist-pos-venda</Cod> localiza e mapeia na arte. Gerar o
            pacote pelo Designer continua possível, mas tende a vir com grupos faltando, folha errada ou opções padrão.
          </p>
          <Fluxo titulo="Passo a passo">
            <Passo n={1} titulo="Extrator: Pós Venda → Checklist de Inspeção">
              Envie o PDF ou as imagens e gere os campos.
            </Passo>
            <Passo n={2} titulo="Confira a aba Campos">
              Etapas e seções na ordem da folha, sem nomes repetidos, sem campos do cabeçalho. Arraste o que estiver fora
              do lugar: o pacote sai exatamente daqui.
            </Passo>
            <Passo n={3} titulo="Banco e migration">
              Gere o status e as perguntas (com o status 0, se for o caso) e grave a migration no acampa-api-lumen,
              como na seção Extrator.
            </Passo>
            <Passo n={4} titulo="Clique em Enviar para o Claude Code">
              Na aba Campos, <Botao>Enviar para o Claude Code</Botao>. No modal: aponte o acampa-checklist, escolha a
              pasta e a versão e clique em <Botao>gravar pacote</Botao>. A ferramenta:
              <ul className="list-disc pl-5">
                <li>pega as artes das imagens enviadas ou renderiza o PDF;</li>
                <li>monta o <Cod>pos_venda.json</Cod> com os campos do extrator;</li>
                <li>grava tudo na pasta escolhida e instala/atualiza a skill;</li>
                <li>mostra o comando <Cod>{"/checklist-pos-venda <pasta>"}</Cod>.</li>
              </ul>
              Leia os avisos do modal (grupo sem campo, opções só no padrão) antes de seguir.
            </Passo>
            <Passo n={5} titulo="Abra uma sessão nova do Claude Code no acampa-checklist">
              Na raiz do repositório, cole o comando mostrado no modal.
            </Passo>
            <Passo n={6} titulo="A skill trabalha">
              Descobre a folha de cada grupo (no pacote vem <Cod>folha: null</Cod>), mede as caixas, confirma as opções
              (<Cod>opcoesConfirmadas: false</Cod>) e escreve o imprimir.php. Pacote incompleto: ela para e avisa.
            </Passo>
            <Passo n={7} titulo="Valide">
              Confira o resumo da skill, o <Cod>php -l</Cod>, o PDF de teste e um PDF real. Commit e push ficam com você.
            </Passo>
          </Fluxo>
        </Secao>

        {/* ─── designer ─── */}
        <Secao
          id="designer"
          icone={<PenTool className="w-4 h-4" />}
          titulo="Designer de PDF"
          resumo="Medir e mapear na própria arte, sem gastar tokens."
        >
          <Tabela
            cab={["Botão", "Onde", "O que faz"]}
            linhas={[
              [<Botao key="b">medir linhas</Botao>, "Card do grupo", "Dois cliques na arte (início e fim da faixa); acha o centro de cada linha e aplica nos itens"],
              [<Botao key="b">medir colunas</Botao>, "Card do grupo", "Dois cliques; acha o centro de cada coluna de marcação (ordem invertida é detectada)"],
              [<Botao key="b">mapear folha</Botao>, "Título da folha, na lateral", "Lê a folha inteira e distribui os grupos nas células; mostra a prévia antes de aplicar"],
              [<Botao key="b">mapear tudo</Botao>, "Topo da lateral", "O mesmo em todas as folhas com imagem, na ordem dos grupos"],
            ]}
          />

          <Fluxo titulo="Entrega Impecável (revisão e roteiro)">
            <Passo n={1} titulo="Carregue as artes e os grupos">
              Uma imagem por folha; os grupos vêm do extrator ou do projeto salvo.
            </Passo>
            <Passo n={2} titulo="Mapear tudo">
              <Botao>mapear tudo</Botao> lê as tarjas e as células e coloca cada campo no centro da linha. Confira a
              prévia e aplique.
            </Passo>
            <Passo n={3} titulo="Ajuste o que sobrou">
              Grupo que não cabe continua na próxima folha como “título (cont.)”, sempre no topo. Arraste um grupo pela
              alça do card para outra folha ou posição; na fila da distribuição, <Cod>-</Cod> pula uma célula. Folha
              difícil: <Botao>mapear folha</Botao> só nela, ou <Botao>medir linhas</Botao> / <Botao>medir colunas</Botao>{" "}
              no grupo. Grupo medido à mão anda em bloco e não é resetado.
            </Passo>
            <Passo n={4} titulo="Enviar para o Claude Code">
              <Botao>enviar para o Claude Code</Botao>: aponte o stellantis-ei-checklist, escolha a pasta do checklist e
              a versão (v2, v3…) e grave. Vão as artes e <Cod>{"<checklist>/<vN>/designer.json"}</Cod> (Y do centro de
              cada item, centros das colunas e cabeçalho).
            </Passo>
            <Passo n={5} titulo="Rode a skill">
              Sessão nova do Claude Code no stellantis-ei-checklist: <Cod>{"/checklist-designer <checklist>/<vN>"}</Cod>.
              A skill copia o imprimir.php da versão anterior e troca só fundos, campos e coordenadas.
            </Passo>
          </Fluxo>

          <Fluxo titulo="Plano de manutenção">
            <Passo n={1} titulo="Mapear">
              Os grupos do extrator mandam: <Botao>mapear tudo</Botao> lê as linhas (inclusive com hachura cinza) e o X
              das revisões pelas colunas.
            </Passo>
            <Passo n={2} titulo="Marcações antigas, se a folha usar">
              Ligue <Botao>bola / triângulo / X (imagens antigas)</Botao> para bola verde, triângulo amarelo e X
              vermelho. Aparece no canvas, no preview e nos botões; o PHP chama as imagens com <Cod>Image</Cod>.
            </Passo>
            <Passo n={3} titulo="Local e data">
              Opção <Botao>local e data</Botao> no painel do plano (ligada por padrão), numa célula só do
              cabeçalho/rodapé. Sai como <Cod>{"$local . '(' . $data_formatada . ')'"}</Cod>, data em{" "}
              <Cod>d/m/y H:i</Cod>.
            </Passo>
            <Passo n={4} titulo="Exportar o PHP">
              Gere o código no Designer e valide com <Cod>php -l</Cod> e um PDF de teste.
            </Passo>
          </Fluxo>

          <Nota>
            Pós-venda no Designer: o <Botao>mapear tudo</Botao> lê as caixas, mas o layout varia muito de folha para
            folha. Para gerar o checklist, prefira o fluxo <a href="#pos-venda" className="underline text-[#173872]">extrator → skill</a>.
          </Nota>
        </Secao>

        {/* ─── skills ─── */}
        <Secao
          id="skills"
          icone={<Terminal className="w-4 h-4" />}
          titulo="Skills acopladas à ferramenta"
          resumo="Instaladas no repositório a cada envio; nenhum dev precisa copiar à mão."
        >
          <Tabela
            cab={["Skill", "Repositório", "Comando"]}
            linhas={[
              ["checklist-pos-venda", "acampa-checklist", <Cod key="c">{"/checklist-pos-venda <pasta>"}</Cod>],
              ["checklist-designer", "stellantis-ei-checklist", <Cod key="c">{"/checklist-designer <checklist>/<vN>"}</Cod>],
              ["checklist-pdf-marcacoes", "stellantis-ei-checklist", "Usada pela checklist-designer"],
            ]}
          />
          <ul className="list-disc pl-5 text-[13px] space-y-1">
            <li>A fonte oficial é <Cod>{"checklist-tools/skills/<repositório>/"}</Cod>, versionada com a ferramenta.</li>
            <li>No envio, a skill é copiada para <Cod>{"<repo>/.claude/skills/"}</Cod>; o modal mostra instalada, atualizada ou igual.</li>
            <li>Para mudar uma skill, edite em <Cod>checklist-tools/skills</Cod>, nunca no destino: o próximo envio sobrescreve.</li>
          </ul>
        </Secao>

        {/* ─── problemas ─── */}
        <Secao
          id="problemas"
          icone={<AlertTriangle className="w-4 h-4" />}
          titulo="Problemas comuns"
          resumo="Sintoma, causa provável e o que fazer."
        >
          <Tabela
            cab={["Sintoma", "Causa provável", "O que fazer"]}
            linhas={[
              ["Tela com ChunkLoadError", "Cache antigo do Next após atualizar", <>Ctrl+Shift+R ou reiniciar o <Cod>npm run dev</Cod></>],
              ["✗ no campo do repositório", "Pasta acima ou abaixo da raiz", "procurar pasta até a raiz do repositório"],
              ["Aviso de arquivo existente", "Migration ou versão já gravada", "Confirmar a sobrescrita ou trocar a versão (v3 → v4)"],
              ["Mapear não acha células", "Arte clara, cortada ou com bordas falhas", "medir linhas / medir colunas no card do grupo"],
              ["Grupo na folha errada", "Ordem dos grupos diferente da folha", <>Arrastar o grupo pela alça ou usar <Cod>-</Cod> na fila</>],
              ["Skill do pós-venda para no início", "Pacote incompleto", "Corrigir a aba Campos no extrator e enviar de novo"],
              ["Skill desatualizada no repositório", "Edição feita no destino", "Editar em checklist-tools/skills e enviar de novo"],
            ]}
          />
        </Secao>
      </main>
    </div>
  );
}
