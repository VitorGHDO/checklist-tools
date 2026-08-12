// Schema do Designer de PDF — modela o runtime do checklist_construtor.html.
// O formato de projeto salvo em JSON é { pages: DesignerPage[] } (compatível com o standalone).

export type DesignerDocType = "roteiro" | "revisao" | "posvenda" | "manutencao";
export type PageKind = "checklist" | "header";

// ─── Marker ──────────────────────────────────────────────────────────────────
// Um único formato flexível (campos opcionais por docType), fiel ao objeto do HTML.
// O docType efetivo vem sempre do grupo que contém o marcador.
//  - roteiro:  usa fx + type ("check" | "x" | "na")
//  - posvenda: usa fx + type (valor da opção, ex: "1" | "3" | "0")
//  - revisao:  usa tipo ("opcoes" | "texto") + resposta ("1" | "2" | "0"); x vem das colunas do grupo
export interface Marker {
  id: string;
  label: string;
  fy: number;              // fração 0..1 da altura da página
  fx?: number;             // fração 0..1 da largura (roteiro/posvenda)
  type?: string;           // roteiro: "check"|"x"|"na" · posvenda: valor da opção
  tipo?: "opcoes" | "texto"; // revisao
  resposta?: string;       // revisao: "1"|"2"|"0"
  /** manutenção: ids das revisões (colunas) em que este item é impresso — a máscara
   *  da linha na tabela do plano. Ausente = nenhuma revisão marcada; cobrindo todas as
   *  colunas, o item sai sem `if` no PHP. O X não vem do marcador neste docType: é o da
   *  revisão selecionada em tempo de impressão. */
  revisoes?: string[];
  /** manutenção, legado: id da condição compartilhada. Convertido em `revisoes` ao
   *  abrir o projeto; as condições seguem existindo, mas como presets da grade. */
  condicaoId?: string;
  /** roteiro: marcação EXTRA na linha de um rótulo do PDF (ex.: "1. MÓDULO ADAS:",
   *  seguida de "a.", "b.", "c."). O rótulo não tem campo próprio no banco — esta
   *  posição imprime a marcação do item seguinte. Não é um campo da fila: ao inserir,
   *  o item seguinte e os de baixo descem um incremento (ver lib/designer/mirror.ts). */
  mirrorNext?: boolean;
}

export type RoteiroMarkType = "check" | "x" | "na";

// ─── Group ───────────────────────────────────────────────────────────────────
export interface PosvendaOption {
  valor: string;
  label: string;
}

export interface DesignerGroup {
  id: string;
  title: string;
  docType: DesignerDocType;
  xFixed: number;
  yStart: number;
  increment: number;
  queue: string;
  useQueueOnClick: boolean;
  markers: Marker[];
  /** Y ajustado manualmente → fica fora do encadeamento automático (chainY). */
  yManual?: boolean;
  /** Espaçamento INTERNO ajustado à mão (item empurrado). O encadeamento passa a
   *  deslocar as marcações em bloco em vez de reescrevê-las pelo incremento — sem
   *  isso, o próximo reflow desfaria o ajuste. Some ao regerar/reindexar o grupo. */
  markersManual?: boolean;

  // revisao
  colX1?: number;
  colX2?: number;
  colX3?: number;
  colW?: number;
  colH?: number;
  textX?: number;
  textW?: number;
  textH?: number;
  textYOffset?: number;
  dadosVar?: string;

  // posvenda
  posvendaOpts?: PosvendaOption[];
  posvendaXMode?: "same" | "diff";
  optX?: Record<string, number>;
  optW?: number;
  optH?: number;
  yFine?: number;
}

// ─── Plano de manutenção ───────────────────────────────────────────────────────
// A tabela do plano tem uma coluna por revisão (1ª..10ª). O item impresso não escolhe
// o X: ele é o da revisão que está sendo emitida (o `switch` da quilometragem no PHP).
// O que cada item define é o Y e em QUAIS revisões ele aparece — a condição.

/** Uma revisão do plano: a coluna "1ª", 15.000 km ou 12 meses. */
export interface ManutencaoColuna {
  id: string;
  /** Rótulo curto na UI ("1ª"). */
  label: string;
  /** km desta revisão ("15000"). Vazio = coluna só por tempo. */
  km: string;
  /** Meses desta revisão ("12") — sai como "12M" no switch. */
  meses: string;
  /** X (mm) da marcação quando esta é a revisão selecionada. */
  x: number;
}

/** Conjunto nomeado de revisões — vira um `$is_<slug>` no PHP gerado. */
export interface ManutencaoCondicao {
  id: string;
  /** Nome amigável ("ímpares", "substituir velas"). */
  nome: string;
  /** ids das colunas em que os itens desta condição são impressos. */
  colunas: string[];
}

/** Configuração do plano, guardada na 1ª folha do docType (como `paging`). */
export interface ManutencaoConfig {
  colunas: ManutencaoColuna[];
  condicoes: ManutencaoCondicao[];
  /** Sufixo das funções geradas: gerarDesenho<sufixo> / gerarImpressao<sufixo>. */
  sufixoFuncao: string;
  /** codFormulario usado na query de gerarImpressao. */
  codFormulario: string;
  /** Propriedade da resposta que diz qual revisão está sendo impressa. */
  campoRevisao: string;
  /** Caminho PHP dos fundos; `{n}` é trocado pelo número da folha. Vazio = não
   *  declara os $fundoBg no arquivo (eles chegam por parâmetro). */
  fundoPath: string;
  // A marcação é sempre glifo (✓/▲/X em dejavusans), como no modelo — a variante com
  // JPGs ($img_bola/$img_triangulo/$img_x) saiu porque nenhum plano a usa.
  /** O que o arquivo gerado contém:
   *  - "funcao": só gerarDesenho e gerarImpressao, como o modelo — quem declara os
   *    $fundoBg é a página do PDF;
   *  - "completo": mais as declarações de caminho dos fundos. */
  formatoArquivo?: "funcao" | "completo";
  /** Nome (sem $) do objeto com as respostas dentro da função de desenho. */
  varResposta?: string;
  /** gerarImpressao busca o nomeFantasia da concessionária antes de desenhar. */
  buscarNomeFantasia: boolean;
  /** Lado (mm) do quadrado que representa a marcação no canvas. Não vai para o PHP:
   *  o glifo é impresso por um writeHTMLCell de tamanho fixo. */
  iconMm: number;
  /** Já converteu o antigo "item sem máscara = impresso em todas" em máscara cheia?
   *  Depois disso, item sem máscara é item sem nenhuma revisão marcada. */
  mascarasMigradas?: boolean;
  /** Revisão usada só na prévia do canvas — não vai para o PHP. */
  previewColunaId?: string | null;
  /** Prévia com TODAS as revisões ao mesmo tempo: é o que mostra se o passo entre
   *  colunas está certo. A revisão de `previewColunaId` continua em destaque. */
  previewTodas?: boolean;
}

// ─── Header/Footer fields ──────────────────────────────────────────────────────
export type HeaderAlign = "L" | "C" | "R";

interface HeaderFieldBase {
  id: string;
  campo: string;
  /** manutenção: repete o campo em todas as folhas, não só na 1ª (ex.: o modelo). */
  todasFolhas?: boolean;
}

export interface HeaderFieldTexto extends HeaderFieldBase {
  tipo: "texto";
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: string | number;
  amostra: string;
  align: HeaderAlign;
}
export interface HeaderFieldAssinatura extends HeaderFieldBase {
  tipo: "assinatura";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HeaderFieldData extends HeaderFieldBase {
  tipo: "data";
  separador: string;
  formato: "ymd" | "dmy";
  anoDigitos: "2" | "4";
  x1: number;
  x2: number;
  x3: number;
  y: number;
  w: number;
  h: number;
  fontSizeDentro: string | number;
  fontSizeDepois: string | number;
}
export interface HeaderFieldHora extends HeaderFieldBase {
  tipo: "hora";
  separador: string;
  x1: number;
  x2: number;
  y: number;
  w: number;
  h: number;
}
export interface HeaderFieldOpcoes extends HeaderFieldBase {
  tipo: "opcoes";
  y: number;
  w: number;
  h: number;
  fontSize: string | number;
  opcoes: { valor: string; x: number }[];
}
export type HeaderField =
  | HeaderFieldTexto
  | HeaderFieldAssinatura
  | HeaderFieldData
  | HeaderFieldHora
  | HeaderFieldOpcoes;

export type HeaderFieldTipo = HeaderField["tipo"];

// ─── Page & Project ────────────────────────────────────────────────────────────
export interface DesignerPage {
  id: string;
  name: string;
  kind: PageKind;
  docType: DesignerDocType;
  widthMm: number;
  heightMm: number;
  offsetX: number;
  offsetY: number;
  cellW: number;
  cellH: number;
  markScale: number;
  typeOffsets: { check: number; x: number; na: number };
  imageSrc: string | null;
  naturalW: number;
  naturalH: number;
  groups: DesignerGroup[];
  activeGroupId: string | null;
  headerFields: HeaderField[];
  // automação entre grupos (grupo 1 é o "mestre")
  syncCols: boolean;
  pushCols: boolean;
  chainY: boolean;
  /** Incremento igual em todos os grupos do docType, em todas as folhas: mexer no de
   *  um grupo replica nos outros. A folha do grupo editado é quem manda. */
  syncIncrement?: boolean;
  /** Mover um item (campo Y ou arrasto) empurra os itens abaixo dele no mesmo grupo
   *  pelo mesmo deslocamento, preservando o espaçamento entre eles. */
  pushBelow?: boolean;
  footerLike?: boolean;
  /** Faixa útil (mm) desta folha no fluxo contínuo: onde a 1ª marcação começa e até
   *  onde a última pode ir. Calibrada por folha porque a 1ª tem o cabeçalho do
   *  documento e a última costuma ter assinatura. Ausente = usa o padrão global. */
  flowTop?: number;
  flowBottom?: number;
  /** Parâmetros da última distribuição em folhas, guardados na 1ª folha do docType.
   *  Persistir isso é o que evita reinferir os valores do estado (um grupo vazio
   *  parado no meio da página fazia o "y inicial" nascer errado). */
  paging?: { yTop: number; yTopNext: number; yLimit: number; groupGapMm: number };
  /** Plano de manutenção: colunas de revisão, condições e identificação do PHP.
   *  Vive na 1ª folha do docType — é configuração do plano inteiro, não da folha. */
  manutencao?: ManutencaoConfig;
}

/** Formato do arquivo JSON salvo/carregado (idêntico ao standalone). */
export interface DesignerProject {
  pages: DesignerPage[];
}

// ─── Persistência (localStorage) ────────────────────────────────────────────────
export interface DesignerProjectRecord {
  id: string;
  nome: string;
  descricao?: string;
  criado_em: string; // ISO
  atualizado_em: string; // ISO
  data: DesignerProject;
}

export type DesignerIndex = string[];

// ─── Estado da UI do editor (não persistido) ────────────────────────────────────
export type ViewMode = "folhas" | "cabecalho";

export type CaptureMode =
  | { kind: "groupStart"; groupId: string }
  | { kind: "flowTop"; pageId: string }
  | { kind: "flowBottom"; pageId: string }
  | { kind: "revisaoCol"; groupId: string; colKey: "colX1" | "colX2" | "colX3" }
  | { kind: "manutencaoColX"; colunaId: string }
  | { kind: "posvendaOptX"; groupId: string; valor: string }
  | { kind: "headerPoint"; fieldId: string; pointKey: string }
  | null;

export interface EditorState {
  pages: DesignerPage[];
  currentPageId: string | null;
  viewMode: ViewMode;
  docType: DesignerDocType;
  lastPageByContext: Record<string, string>;
  selectedMarkerId: string | null;
  selectedGroupId: string | null;
  selectedHeaderFieldId: string | null;
  captureMode: CaptureMode;
  /** Grupos recolhidos na sidebar (id → true). Ausente/false = expandido. Não persistido. */
  collapsedGroups: Record<string, boolean>;
  /** Grupos marcados para ação em lote ("→ folha N"). Não persistido. */
  checkedGroups: Record<string, boolean>;
  /** Folha para a qual o palco deve rolar; scrollTick dispara o efeito. */
  scrollToPageId: string | null;
  scrollTick: number;
  // Bump para forçar os inputs não controlados (geometria) a ressincronizarem seu
  // valor exibido após mudanças externas (captura, drag, gerar). Não muda ao digitar.
  geomTick: number;
}
