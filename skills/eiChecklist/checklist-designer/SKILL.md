---
name: checklist-designer
description: Encaixa no imprimir.php de um checklist do Entrega Impecável (roteiro ou revisão) as posições que o Designer de PDF já mapeou, a partir do designer.json que ele grava na pasta da versão. Copia o imprimir.php da versão anterior e troca só fundos, campos e coordenadas — sem medir a arte. Use quando o usuário colar "/checklist-designer <pasta>/<versao>".
---

# imprimir.php a partir do pacote do Designer

Argumento: `<checklist>/<versao>` (ex.: `stellantis/ram/roteiro_entrega_tecnica_1500/v3`). O Designer gravou:

- `<checklist>/<versao>/designer.json` — `docType`, `folhas[].arquivo`, `grupos[]` (folha, título, `medido`,
  `itens[{campo, y}]` com **y = centro da linha em mm**, `colunas` = centro das colunas em mm)
  e `cabecalho` (campos de cabeçalho/rodapé como estão no Designer);
- `<checklist>/checklist_modelos/<prefixo>_N.jpg` — as artes.

Padrão de código, fórmula do Y e validação: skill `checklist-pdf-marcacoes` (ler só a seção que precisar).

## Economia de tokens — obrigatório

- As posições já vêm medidas: NÃO medir a arte, NÃO abrir as imagens das folhas.
- Do imprimir.php base, ler só o trecho das marcações (do 1º `$fundoBg` até `gerarListaDeObs`) e as funções de
  marcação — localizar com `grep -n` antes de ler (`sed -n`).
- Trocar valores por script (python) a partir do JSON, não redigitar coordenadas.
- Conferir o PDF de teste por recortes (só a coluna de marcação de um grupo por vez), nunca a página inteira.

## Fluxo

1. **Pacote** — `python -c "import json;d=json.load(open('<pasta>/designer.json',encoding='utf-8'));print(d['docType'],[f['arquivo'] for f in d['folhas']]);[print(g['folha'],g['titulo'],len(g['itens']),'medido' if g['medido'] else 'CHUTE',g['colunas']) for g in d['grupos']]"`
   Grupo `CHUTE` (não mapeado no Designer): avisar o usuário e não usar esses Y sem confirmação.
2. **Base** — `ls <checklist>/imprimir.php <checklist>/*/imprimir.php`. Se `<versao>/imprimir.php` já existe, editar
   ele; senão copiar a versão mais recente (mantendo UTF-8 + CRLF: `io.open(..., newline='')`) e ajustar os
   `require` (um `../` por nível) se a profundidade mudou.
3. **Fundos** — `$fundoBg_N = "../checklist_modelos/<arquivo>"`, um por folha do pacote, na ordem.
4. **Marcações** — manter as funções da base (`imprimirResposta`/`printChecklistMark`, `imprimirGrupo`) e
   reescrever só as listas `campo => centroY` de cada grupo e folha, na ordem do JSON (um bloco
   `imprimirGrupo` por grupo; grupo que continua na folha seguinte repete o comentário com a faixa).
   - O `y` do JSON é o **centro**: usar direto onde a base recebe `$centroY`; se a base usa outra âncora,
     aplicar a conversão dela (ex.: revisão `posY = centroY - 1.5`).
   - Colunas: se o centro do JSON diferir mais de 0,3 mm do X da base, atualizar o X da base
     (revisão: borda esquerda = centro − largura/2, com a largura da célula da base — o Designer não a mede).
   - Campo do JSON que não existe na base (ou o contrário): listar para o usuário; não inventar.
5. **Cabeçalho** — só mexer se `cabecalho` trouxer campos novos ou posições diferentes da base.
6. **Validar** — `php .claude/skills/checklist-pdf-marcacoes/scripts/teste_render.php imprimir.php <scratchpad>/teste.pdf`
   (rodar com o cwd na pasta da versão) e recortar cada grupo:
   `python -c "import fitz;d=fitz.open(r'<scratchpad>/teste.pdf');k=72/25.4;p=d[F-1];p.get_pixmap(dpi=140,clip=fitz.Rect(X0*k,Y0*k,X1*k,Y1*k)).save(r'<scratchpad>/g.png')"`.
   Depois `php -l imprimir.php`.
7. **Entregar** — resumo: folhas, grupos × itens, colunas alteradas, campos divergentes, pendências.

## Proibido

`git commit/push/pull` e migrations — só sugerir. Arquivos de teste no scratchpad, nunca no repositório.
