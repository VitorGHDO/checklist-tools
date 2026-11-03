---
name: checklist-pos-venda
description: Monta o imprimir.php de um checklist de pós-venda (TCPDF sobre a arte) a partir do pacote que o Designer de PDF grava na pasta do checklist (pos_venda.json + checklist_modelos/). Mede a arte com tools/checklist, gera os arrays de layout, valida renderizando e entrega com php -l. Use quando o usuário colar o comando "/checklist-pos-venda <pasta>" ou pedir para montar/ajustar as marcações de um checklist de pós-venda.
---

# Checklist de pós-venda a partir do pacote do Designer

Argumento: a pasta do checklist, relativa à raiz (ex.: `parvi_frota/v2`). Nela foi gravado — pelo extrator
(o caminho normal) ou pelo Designer:

- `pos_venda.json` — etapas, grupos ("Entrada > DIANTEIRA"), campos na ordem do formulário, e:
  - `folha`: número da folha, ou `null` quando veio do extrator — localizar o bloco na arte pelo título da
    seção (um recorte em baixa resolução de cada folha basta para achar os rótulos);
  - `opcoes` + `opcoesConfirmadas`: só confiar nas opções quando `true`; senão ler na legenda da arte;
  - `posicoes` (só do Designer, grupo mapeado): X de cada opção e Y de cada item, em mm, centro da caixa;
- `checklist_modelos/folha_mod_1_N.(jpg|png)` — a arte de cada folha.

Referência implementada: `parvi_frota/v1` (`imprimir.php` + `functionsParviFrota/functionsParviFrota.php`,
funções `layout…()` com colunas/linhas/campos e `print…()` que desenham). Regras de posicionamento:
`CLAUDE.md` da raiz e `docs/novo-checklist-pos-venda.md` (ler só a seção que precisar).

## Economia de tokens — obrigatório

- O pacote é a fonte dos campos e da ordem. Não abrir o extrator, o banco nem a migration para descobrir campos.
- NUNCA abrir a arte inteira com Read. Medir com os scripts; para ver, gerar `overlay.py … --recorte x0,y0,x1,y1
  --zoom 2` só do bloco em questão e ler esse PNG.
- Saída de script vai para arquivo no scratchpad e entra no código por `posicoes.py --php`, sem redigitar números.
- Da referência, ler só as funções que for copiar (`grep -n "^function"` e `sed -n` no trecho), não o arquivo todo.
- Grupo com `posicoes` (já mapeado no Designer): partir delas. Medir de novo só o bloco cujo overlay mostrar erro.
- Um overlay por bloco, todos de uma vez no fim, em vez de conferir item a item.

## Fluxo

Ferramentas em `tools/checklist/` (todas com `--help`; rodar a partir dessa pasta). `$P` = pasta do checklist.

1. **Pacote** — `python -c "import json;d=json.load(open('../../$P/pos_venda.json',encoding='utf-8'));print(d['etapas']);[print(g['folha'],g['titulo'],len(g['campos']),[o['rotulo'] for o in g['opcoes']],'pos' in g) for g in d['grupos']]"`
   Anotar a contagem por grupo: é a conta que a arte tem de fechar.
2. **Esqueleto** — copiar o cabeçalho/consultas do `parvi_frota/v1/imprimir.php` e criar
   `$P/functions<Nome>/functions<Nome>.php` com uma função `layout…()` por folha e uma `print…()` que percorre
   o layout. Requires com `__DIR__`, um `../` por nível de pasta. `imprimir.php` é UTF-8 com CRLF.
3. **Colunas** (por tabela e etapa) — `python medir_colunas.py ARTE --em-mm --y0 .. --y1 .. --x0 .. --x1 ..`
   na linha de uma caixa (`--largura-max` para pegar só as caixas; `--invertido` em tarja escura).
4. **Linhas** (por bloco) — `python medir_linhas.py ARTE --em-mm --x0 .. --x1 .. --y0 .. --y1 .. --altura-min 2`,
   faixa X só das caixas. Lista explícita de Y, nunca incremento.
5. **Conferir contagem** — linhas medidas por bloco == campos do grupo no pacote. Não bateu: erro de faixa ou
   campo sem caixa; não mexer em coordenada.
6. **Gerar arrays** — `python posicoes.py --colunas .. --linhas .. --fonte 9 --php --nome <var>` e colar no `layout…()`.
7. **Validar** — `posicoes.py … --arte ARTE > bloco.json` por bloco e `php validar.php teste.pdf bloco1.json …
   --tcpdf=../../includes/class/pdf/tcpdf.php`; `python render.py teste.pdf rec.png --recorte .. --dpi 200` por
   bloco e olhar só os recortes. Procurar X fora da caixa, linha sem marca, marca sobrando.
8. **Entregar** — `php -l` nos arquivos; responder com a lista de blocos (campos × linhas) e o que ficou pendente.

## Pontos de atenção

- Respostas: `1` conforme, `3` não conforme, `0`/`2` variam. Com `opcoesConfirmadas: true`, usar os `valor` do
  pacote; com `false` são só o padrão do Designer (OK/N-OK/NA) — ler as opções na legenda da arte (recorte
  pequeno) e confirmar os valores com o usuário (SIM/NÃO costuma ser 1/3; B/M/R, 1/2/3).
- Pacote com grupos faltando (só uma etapa, seção da folha sem grupo) ou com `folha` errada: avisar o
  usuário e parar antes de montar — o pacote é a fonte da ordem dos campos.
- Seção sem etapa repetida (acessórios, pneus) costuma ser gravada alternando colunas lado a lado (linha a
  linha); a ordem dos `campos` no pacote é a ordem do formulário — seguir ela.
- Campos de texto (Km, Data, Hora, assinatura, observações) não estão no pacote: medir a célula na arte e
  usar as funções de texto da referência (`layoutTexto.php`).
- Arquivos de teste (PDF, PNG, JSON de medição) no scratchpad, nunca no repositório.
- Não executar `git commit/push/pull` nem migrations — só sugerir.
