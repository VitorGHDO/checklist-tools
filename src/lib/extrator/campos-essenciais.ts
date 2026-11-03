// Campos essenciais (status 0) da migration: o bloco fixo que toda tabela de checklist tem
// antes dos itens da folha — chave, concessionária, consultor, dados do veículo e do
// cliente, datas de entrada/saída. Não vêm do extrator porque não estão impressos na folha.
//
// Copiados das migrations reais mais recentes de cada tipo, linha a linha:
//   revisão  — stellantis-ei-api: create_checklist_stellantis_ram_1500_revisao_entrega_mod2
//   roteiro  — stellantis-ei-api: create_checklist_stellantis_ram_1500_roteiro_entrega_tecnica_mod3
//   pós-venda — acampa-api-lumen: create_table_checklist_parvi_frota (só a parte comum)
// Quando um modelo novo mudar o bloco, atualizar aqui a partir da migration nova.
//
// As PERGUNTAS do status 0 (checklist_perguntas) entram quando houver o export de referência
// do banco — elas não existem em arquivo nenhum.

import type { ChecklistType } from "@/lib/types";

/** Bloco fixo por tipo, já indentado como linhas de `$table->…`. */
const BLOCOS: Partial<Record<ChecklistType, string>> = {
  "revisao-entrega": `
  $table->id('codCheckList');
  $table->integer('checklist')->nullable();
  $table->integer('codConcessionaria');
  $table->integer('codConsultor');
  $table->string('agendamento', 20)->nullable();
  $table->string('chassi', 50)->nullable();
  $table->string('marca', 50)->nullable();
  $table->string('versao', 50)->nullable();
  $table->string('cor', 20)->nullable();
  $table->string('modelo', 255)->nullable();
  $table->string('e_data', 20)->nullable();
  $table->string('e_hora', 20)->nullable();
  $table->string('cliente', 50)->nullable();
  $table->string('cpf', 30)->nullable();
  $table->string('email', 50)->nullable();
  $table->string('telefone', 50)->nullable();
  $table->string('itens_inclusos', 30)->nullable();
  $table->string('placa', 10)->nullable();
  $table->string('ano', 10)->nullable();
  $table->integer('tipo_checklist')->nullable();
  $table->integer('utilizacao')->nullable();
  $table->integer('codMecanico')->nullable();
  $table->integer('status');
  $table->string('video_inspecao', 255)->nullable();
  $table->string('s_data', 20)->nullable();
  $table->string('s_hora', 20)->nullable();
  $table->string('os', 50)->nullable();
  $table->string('data_entrega_programada', 20)->nullable();
  $table->string('hora_entrega_programada', 20)->nullable();
  $table->timestamp('data_entrada')->useCurrent();
  /** Iníco do Atendimento (opcionais) */
  $table->string('km_inicial', 50)->nullable();
  $table->string('km_final', 50)->nullable();
`,
  "roteiro-entrega-tecnica": `
  $table->id('codCheckList');
  $table->integer('checklist')->nullable();
  $table->integer('codConcessionaria');
  $table->integer('codConsultor');
  $table->string('agendamento', 20)->nullable();
  $table->string('cliente', 50)->nullable();
  $table->string('cpf', 30)->nullable();
  $table->string('email', 50)->nullable();
  $table->string('telefone', 50)->nullable();
  $table->string('celular', 50)->nullable();
  $table->string('itens_inclusos', 30)->nullable();
  $table->string('marca', 50)->nullable();
  $table->string('placa', 10)->nullable();
  $table->string('cor', 20)->nullable();
  $table->string('modelo', 255)->nullable();
  $table->string('ano', 10)->nullable();
  $table->string('chassi', 50)->nullable();
  $table->integer('tipo_checklist')->nullable();
  $table->integer('utilizacao')->nullable();
  $table->integer('codMecanico')->nullable();
  $table->integer('status');
  $table->string('video_inspecao', 255)->nullable();
  $table->string('e_data', 20)->nullable();
  $table->string('e_hora', 20)->nullable();
  $table->string('s_data', 20)->nullable();
  $table->string('s_hora', 20)->nullable();
  $table->string('os', 50)->nullable();
  $table->string('programada_data', 20)->nullable();
  $table->string('programada_hora', 20)->nullable();
  $table->string('preenchimento_data', 20)->nullable();
  $table->string('preenchimento_hora', 20)->nullable();
  $table->integer('nf')->nullable();
  $table->integer('local_entrega')->nullable();
  $table->string('versao', 50)->nullable();
  $table->string('data_nascimento', 20)->nullable();
  $table->string('telefone_residencial', 50)->nullable();
  $table->string('cep', 20)->nullable();
  $table->string('endereco', 255)->nullable();
  $table->string('cidade', 100)->nullable();
  $table->string('uf', 5)->nullable();
  $table->integer('uso_veiculo')->nullable();
  $table->string('entrega_realizada_data', 20)->nullable();
  $table->string('entrega_realizada_hora', 20)->nullable();
  $table->string('datahora_inicio_checklist_entrada', 20)->nullable();
  $table->string('datahora_fim_checklist_entrada', 20)->nullable();
  $table->string('datahora_inicio_checklist_saida', 20)->nullable();
  $table->string('datahora_fim_checklist_saida', 20)->nullable();
`,
  "pos-venda-inspecao": `
  $table->id('codCheckList');
  $table->integer('codConcessionaria');
  $table->integer('checklist')->nullable();
  $table->integer('status');
  $table->string('video_inspecao', 255)->nullable();
  $table->integer('codConsultor');
  $table->integer('codMecanico')->nullable();
  $table->string('agendamento', 20)->nullable();
  $table->integer('bloqueioInterno')->nullable();
  $table->timestamp('data_entrada')->useCurrent();
  $table->string('cliente', 100)->nullable();
  $table->string('email', 100)->nullable();
  $table->string('telefone', 60)->nullable();
  $table->string('cpfcnpj', 30)->nullable();
  $table->string('placa', 10)->nullable();
  $table->string('marca', 50)->nullable();
  $table->string('cor', 20)->nullable();
  $table->string('os', 50)->nullable();
  $table->string('modelo', 255)->nullable();
  $table->string('codigo_radio', 255)->nullable();
  $table->string('quilometragem', 10)->nullable();
  $table->string('ano', 5)->nullable();
  $table->string('chassi', 18)->nullable();
  $table->string('familia', 250)->nullable();
  $table->string('prisma', 20)->nullable();
  $table->binary('aspectos_externos')->nullable();
  $table->integer('combustivel')->nullable();
  $table->integer('combustivel_entrada')->nullable();
  $table->integer('combustivel_saida')->nullable();
  $table->text('observacoes')->nullable();
  $table->integer('utilizacao')->nullable();
  $table->string('e_data', 20)->nullable();
  $table->string('e_hora', 20)->nullable();
  $table->string('s_data', 20)->nullable();
  $table->string('s_hora', 20)->nullable();
  $table->string('km', 10)->nullable();
  $table->string('datahora_inicio_checklist_entrada', 50)->nullable();
  $table->string('datahora_fim_checklist_entrada', 50)->nullable();
  $table->string('datahora_inicio_checklist_saida', 50)->nullable();
  $table->string('datahora_fim_checklist_saida', 50)->nullable();
  $table->binary('assinatura_orcamento_adicional')->nullable();
`,
};

// ─── perguntas do status 0 ────────────────────────────────────────────────────
// A tela "Dados do Veículo e Cliente" de cada modelo, como está no banco: campo, tipo,
// pergunta, opções e valor (export passado pelo usuário em 03/11/2026, colado como veio —
// `NULL` é nulo no banco). O que o export não trouxe — se é obrigatório — segue a regra
// do tipo: `hidden` não é preenchido pelo usuário, então não pode ser obrigatório.

export interface PerguntaStatus0 {
  campo: string;
  tipo: string;
  pergunta: string;
  opcoes: string | null;
  valor: string | null;
}

/** Lê as linhas no formato do export: 'campo', 'tipo', 'pergunta', 'opcoes', 'valor'. */
function doExport(texto: string): PerguntaStatus0[] {
  return texto
    .trim()
    .split("\n")
    .map((linha) => {
      const v = [...linha.matchAll(/'((?:[^']|'')*)'|NULL/g)].map((m) =>
        m[0] === "NULL" ? null : m[1].replace(/''/g, "'"),
      );
      return { campo: v[0] ?? "", tipo: v[1] ?? "", pergunta: v[2] ?? "", opcoes: v[3] ?? null, valor: v[4] ?? null };
    });
}

const PERGUNTAS: Partial<Record<ChecklistType, PerguntaStatus0[]>> = {
  "pos-venda-inspecao": doExport(`
'codConcessionaria', 'hidden', 'Concessionaria', '', ''
'codConsultor', 'select', 'Consultor ', 'consultor.nome', 'consultor.codigo'
'agendamento', 'hidden', 'Agendamento', NULL, NULL
'cliente', 'text', 'Nome do Cliente/Empresa', '', ''
'telefone', 'tel', 'Telefone', '', ''
'email', 'email', 'Email', '', ''
'placa', 'placa', 'Placa', '', ''
'marca', 'hidden', 'Marca', '', ''
'modelo', 'text', 'Modelo', '', ''
'ano', 'number', 'Ano', '', ''
'cor', 'hidden', 'Cor', 'Amarelo;Azul;Branco;Bege;Cinza;Laranja;Marrom;Prata;Preto;Verde;Vermelho', 'Amarelo;Azul;Branco;Bege;Cinza;Laranja;Marrom;Prata;Preto;Verde;Vermelho'
'chassi', 'text', 'Chassi', '', ''
'prisma', 'prisma', 'Prisma', '', ''
'utilizacao', 'hidden', 'Utilizacao', NULL, NULL
'e_hora', 'hidden', 'Hora Entrada', '', ''
'e_data', 'hidden', 'Data Entrada', '', ''
'cpfcnpj', 'hidden', 'CPF', '', ''
'dataagendamento', 'hidden', 'Data Recepção', '', ''
'horaagendada', 'hidden', 'Hora Recepção', '', ''`),
  "plano-manutencao": doExport(`
'os', 'text', 'OS', NULL, NULL
'placa', 'placa', 'Placa', NULL, NULL
'chassi', 'text', 'Chassi', NULL, NULL
'km', 'number', 'KM', NULL, NULL`),
  "revisao-entrega": doExport(`
'codConcessionaria', 'hidden', 'Concessionaria', 'Sim;Não', ''
'codConsultor', 'select', 'Responsável pelo Preenchimento', 'consultor.nome', 'consultor.codigo'
'marca', 'text', 'Marca', '', ''
'agendamento', 'hidden', 'Agendamento', '', ''
'modelo', 'select', 'Modelo', 'Commander;Compass;Gladiator;Renegade;Wrangler;Grand Cherokee;Avenger', 'Commander;Compass;Gladiator;Renegade;Wrangler;GrandCherokee;Avenger'
'versao', 'text', 'Versão', '', ''
'cor', 'select', 'Cor', 'Amarelo;Azul;Branco;Cinza;Laranja;Marrom;Prata;Preto;Verde;Vermelho', 'Amarelo;Azul;Branco;Cinza;Laranja;Marrom;Prata;Preto;Verde;Vermelho'
'chassi', 'text', 'V.I.N', '', ''
'km_inicial', 'number', 'KM Inicial ', '', ''
'e_data', 'hidden', 'Data Entrada', '', ''
'e_hora', 'hidden', 'Hora Entrada', '', ''`),
  "roteiro-entrega-tecnica": doExport(`
'codConcessionaria', 'hidden', 'Concessionaria', 'Sim;Não', ''
'chassi', 'text', 'VIN', '', ''
'codConsultor', 'select', 'Preparador Entrega ', 'consultor.nome', 'consultor.codigo'
'cliente', 'text', 'Nome do Cliente/Empresa', '', ''
'modelo', 'select', 'Modelo', 'Commander;Compass;Gladiator;Renegade;Wrangler;Grand Cherokee;Avenger', 'Commander;Compass;Gladiator;Renegade;Wrangler;GrandCherokee;Avenger'
'nf', 'text', 'NF', '', ''
'local_entrega', 'radio', 'Local Entrega', 'Concessionária;Home Delivery', '1;2'
'programada_data', 'data', 'Data Programada', NULL, NULL
'ano', 'text', 'Ano/Modelo', '', ''
'data_nascimento', 'data', 'Data de Nascimento', '', ''
'cpf', 'number', 'CPF/CNPJ', '', ''
'programada_hora', 'hora', 'Hora Programada', NULL, NULL
'versao', 'text', 'Versão', NULL, NULL
'cor', 'select', 'Cor', 'Amarelo;Azul;Branco;Cinza;Laranja;Marrom;Prata;Preto;Verde;Vermelho;Dourada', 'Amarelo;Azul;Branco;Cinza;Laranja;Marrom;Prata;Preto;Verde;Vermelho;Dourada'
'telefone_residencial', 'tel', 'Telefone Residencial', '', ''
'telefone', 'tel', 'Telefone', '', ''
'celular', 'tel', 'Celular', '', ''
'tipo_checklist', 'select', 'Escolha a opção que deseja', 'Checklist Completo;Checklist Compacto;Sem Entrega Padrão', '1;2;0'
'email', 'email', 'Email', '', ''
'cep', 'number', 'CEP', '', ''
'endereco', 'text', 'Endereço', '', ''
'e_data', 'hidden', 'Data Entrada', '', ''
'cidade', 'text', 'Cidade', '', ''
'e_hora', 'hidden', 'Hora Entrada', '', ''
'uf', 'select', 'UF', 'AC;AL;AP;AM;BA;CE;DF;ES;GO;MA;MT;MS;MG;PA;PB;PR;PE;PI;RJ;RN;RS;RO;RR;SC;SP;SE;TO', 'AC;AL;AP;AM;BA;CE;DF;ES;GO;MA;MT;MS;MG;PA;PB;PR;PE;PI;RJ;RN;RS;RO;RR;SC;SP;SE;TO'
'datahora_inicio_checklist_entrada', 'datahora_inicio_status', 'Data Hora Inicio Checklist Entrada', '', ''
'uso_veiculo', 'radio', 'Uso do veículo', 'Uso Pessoal;Uso Comercial', '0;1'
'datahora_fim_checklist_entrada', 'datahora_fim_status', 'Data Hora Fim Checklist Entrada', '', ''`),
};

export interface PerguntaEssencial extends PerguntaStatus0 {
  /** O export não trouxe: `hidden` não é preenchido pelo usuário, o resto é obrigatório. */
  obrigatorio: 0 | 1;
}

export function perguntasStatus0(tipo: ChecklistType | null | undefined): PerguntaEssencial[] {
  return (tipo ? PERGUNTAS[tipo] ?? [] : []).map((p) => ({ ...p, obrigatorio: p.tipo === "hidden" ? 0 : 1 }));
}

/** O tipo tem bloco essencial conhecido? */
export function temCamposEssenciais(tipo: ChecklistType | null | undefined): boolean {
  return !!tipo && (!!BLOCOS[tipo] || !!PERGUNTAS[tipo]);
}

/**
 * Linhas do bloco essencial, sem indentação (quem monta a migration indenta). Pergunta do
 * status 0 que o bloco copiado não tem (ex.: dataagendamento no pós-venda) entra no fim,
 * como string — senão o formulário gravaria num campo sem coluna.
 */
export function camposEssenciais(tipo: ChecklistType | null | undefined): string[] {
  const bloco = tipo ? BLOCOS[tipo] : undefined;
  if (!bloco) return [];
  const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
  const tem = new Set(linhas.flatMap((l) => /\$table->\w+\(\s*'([^']+)'/.exec(l)?.[1] ?? []));
  const faltam = perguntasStatus0(tipo).filter((p) => !tem.has(p.campo));
  return [...linhas, ...faltam.map((p) => `$table->string('${p.campo}', 50)->nullable();`)];
}

/** Nomes das colunas do bloco — para não duplicar um campo que o extrator também gerou. */
export function colunasEssenciais(tipo: ChecklistType | null | undefined): Set<string> {
  const nomes = camposEssenciais(tipo).flatMap((l) => {
    const m = /\$table->\w+\(\s*'([^']+)'/.exec(l);
    return m ? [m[1]] : [];
  });
  return new Set(nomes);
}
