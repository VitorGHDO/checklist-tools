// Schema do Designer de PDF — modela o runtime do checklist_construtor.html.
// O formato de projeto salvo em JSON é { pages: DesignerPage[] } (compatível com o standalone).

export type DesignerDocType = "roteiro" | "revisao" | "posvenda";
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

// ─── Header/Footer fields ──────────────────────────────────────────────────────
export type HeaderAlign = "L" | "C" | "R";

export interface HeaderFieldTexto {
  id: string;
  tipo: "texto";
  campo: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: string | number;
  amostra: string;
  align: HeaderAlign;
}
export interface HeaderFieldAssinatura {
  id: string;
  tipo: "assinatura";
  campo: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HeaderFieldData {
  id: string;
  tipo: "data";
  campo: string;
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
export interface HeaderFieldHora {
  id: string;
  tipo: "hora";
  campo: string;
  separador: string;
  x1: number;
  x2: number;
  y: number;
  w: number;
  h: number;
}
export interface HeaderFieldOpcoes {
  id: string;
  tipo: "opcoes";
  campo: string;
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
  footerLike?: boolean;
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
  | { kind: "revisaoCol"; groupId: string; colKey: "colX1" | "colX2" | "colX3" }
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
  // Bump para forçar os inputs não controlados (geometria) a ressincronizarem seu
  // valor exibido após mudanças externas (captura, drag, gerar). Não muda ao digitar.
  geomTick: number;
}
