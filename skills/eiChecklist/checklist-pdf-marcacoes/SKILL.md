---
name: checklist-pdf-marcacoes
description: Monta ou ajusta o imprimir.php (TCPDF) de um checklist Stellantis a partir das folhas-modelo em imagem (checklist_modelos/*.jpg) e dos campos da migration - mede as linhas da folha, mapeia cada campo para a coordenada da linha, imprime cabeçalho, marcações ✔/✖/N.A., campos anotados e grade de anomalias, e gera um PDF de conferência sem banco. Use quando o usuário pedir para "fazer as marcações", "mapear os campos na folha", "montar o imprimir" ou trocar as folhas de fundo de um checklist.
---

# Marcações de checklist em PDF (imprimir.php)

Referência implementada: `stellantis/ram/revisao_entrega_1500/v3/imprimir.php` (RAM 1500, 4 folhas, 84 campos).

## Entradas esperadas
- Folhas-modelo: `<checklist>/checklist_modelos/<nome>_N.jpg` (A4 retrato; geralmente 1225x1732 px a 150 dpi).
- Lista de campos da migration, em ordem e agrupada por `//GRUPO N ...`.
- Pasta do `imprimir.php` (raiz do checklist ou subpasta de versão `v2/`, `v3/`...).

## Fluxo

1. **Ler as folhas** (Read nas imagens) e anotar, por folha: blocos de cabeçalho, grupos, número dos itens, itens com 2 linhas de texto, campos em branco no texto (ex.: "tensão da bateria ____V") e a grade de anomalias.
2. **Medir a grade** com o script (escala = 210 mm / largura px):
   ```bash
   python .claude/skills/checklist-pdf-marcacoes/scripts/medir_folha.py <folha.jpg>
   python .claude/skills/checklist-pdf-marcacoes/scripts/medir_folha.py <folha.jpg> --colunas-y <px de uma linha de item>
   ```
   - A saída lista `topo/base/centro` de cada linha em mm e marca `CABECALHO` (faixa escura).
   - O **centro** da linha é o valor usado no código. Linhas com ~8,5 mm são itens de 2 linhas de texto; "bloco/gap - conferir" indica borda fraca não detectada (dividir manualmente ou baixar/subir `--limiar`).
   - `--colunas-y` dá as bordas verticais: colunas ✔ / ✖ / N.A. e as células do cabeçalho.
   - Para campos fora da tabela (traço "____", "/ / | :" da data), medir pixels pontualmente com PIL.
3. **Mapear** cada campo da migration, na ordem, para o centro da sua linha. Conferir a contagem por grupo (campos do grupo == linhas do grupo, somando as folhas em que o grupo continua).
4. **Escrever o imprimir.php** seguindo o padrão abaixo.
5. **Gerar o PDF de conferência** (sem banco) e olhar as páginas:
   ```bash
   cd <pasta do imprimir.php>
   php <raiz>/.claude/skills/checklist-pdf-marcacoes/scripts/teste_render.php imprimir.php <scratchpad>/teste.pdf
   python -c "import fitz; d=fitz.open('<scratchpad>/teste.pdf'); [p.get_pixmap(dpi=110).save(f'<scratchpad>/p{i+1}.png') for i,p in enumerate(d)]"
   ```
   O script alterna respostas 1/2/0 em todos os campos, preenche observações para todos e põe `75` em todo `anotar_*`. Ajustar offsets e reexecutar até alinhar. Rodar `php -l imprimir.php` ao final.

## Padrão do código

O topo do arquivo (consultas, `$perguntasRespostasImprimir`, `uasort`, criação do TCPDF) é reaproveitado sem alteração. A parte específica do checklist vai de `$fundoBg_1 =` até `$resultadoListaDeObs = gerarListaDeObs(...)` (esses dois marcadores são usados pelo `teste_render.php`; mantê-los).

```php
$fundoBg_1 = "../checklist_modelos/folha_mod_XXXX_1.jpg";   // relativo ao cwd (pasta do imprimir.php)

function imprimirResposta($pdf, &$dados, $campo, $centroY)
{
	$dado = isset($dados[$campo]) ? $dados[$campo] : null;
	if ($dado && isset($dado['resposta']) && isset($dado['tipo'])) {
		$pdf->SetFont('Helvetica', '', 9);
		$posY = $centroY - 1.5;
		if ($dado['resposta'] == '1' && $dado['tipo'] != 'text')
			$pdf->writeHTMLCell(8.9, 4, 173.1, $posY, '<b>X</b>', 0, 0, 0, true, 'C', true);   // ✔
		if ($dado['resposta'] == '2' && $dado['tipo'] != 'text')
			$pdf->writeHTMLCell(8.9, 4, 182.0, $posY, '<b>X</b>', 0, 0, 0, true, 'C', true);   // ✖
		if ($dado['resposta'] == '0' && $dado['tipo'] != 'text')
			$pdf->writeHTMLCell(9.0, 4, 190.9, $posY, '<b>X</b>', 0, 0, 0, true, 'C', true);   // N.A.
	}
}

/** imprime uma lista [campo => centroY] */
function imprimirGrupo($pdf, &$dados, array $campos)
{
	foreach ($campos as $campo => $centroY)
		imprimirResposta($pdf, $dados, $campo, $centroY);
}

// ================= FOLHA 1 =================
$pdf->AddPage('P', 'A4');
$pdf->SetAutoPageBreak(false, 0);
$pdf->Image($fundoBg_1, 0, 0, 210, 297, '', '', '', false, 300, '', false, false, 0);
$pdf->setPageMark();

/** GRUPO 1 PREPARAÇÃO */
imprimirGrupo($pdf, $perguntasRespostasImprimir, [
	'acessorios_cliente'        => 64.97,
	'capas_protetoras_internas' => 71.06,
]);
```

Regras:
- **Colunas ✔/✖/N.A.**: os X/larguras acima são da folha RAM 1500 (bordas 173.1 / 182.0 / 190.9 / 199.9 mm). Remedir com `--colunas-y` em toda folha nova: X = borda esquerda da coluna, largura = distância até a próxima borda, alinhamento `'C'`.
- **Vertical**: `writeHTMLCell` com fonte 9 pt e `posY = centroY - 1.5` centraliza o X na linha. Usar o centro medido, nunca `posY += passo` acumulado (itens de 2 linhas e cabeçalhos quebram o passo fixo).
- **Um bloco `imprimirGrupo` por grupo e por folha**; quando o grupo continua na folha seguinte, repetir o comentário com a faixa de itens (`/** GRUPO 4 ... (itens 27 a 30) */`).
- **Valores anotados no texto** (ex.: `anotar_tensao_bateria` para "____V"): ler de `$dadosChecklist` (coluna própria, não pergunta), fonte 7, célula ~7,5 mm sobre o traço, `y = centroY - 2.8`. O campo de status da mesma linha continua em `imprimirResposta`.
- **Cabeçalho**: uma `writeHTMLCell` por célula com X/largura da célula e `'C'`; `y` ~ centro da célula - 2. Nome do técnico vem de `$consultor['nome']` (confirmar com o usuário se deve ser `$mecanico`). Assinatura via `printSignature($pdf, $dadosChecklist['assinatura_recebedor'] ?? '', x, y, w, h)` dentro da célula.
- **Data/hora** (`s_data` "dd/mm/aaaa", `s_hora` "hh:mm[:ss]"): medir as posições de "/" "|" ":" e centralizar cada parte entre os separadores; células com pelo menos ~7 mm, senão o valor quebra linha ("1 / 0"). Usar `count($partes) >= 2` para a hora.
- **Grade de anomalias**: `$posObsY` = topo da 1ª linha, `$lineHeight` = (base da última - topo da 1ª) / nº de linhas, limite de linhas = nº de linhas da grade; texto em `$posObsY + 1.2`, fonte 8; colunas GRUPO / ITEM / DESCRIÇÃO com X e largura medidos.
- **Caminhos**: `require_once(__DIR__ . "/../../../...")` com um `../` a mais por nível de subpasta (`v3/` usa `/../../../../`). Fundos são relativos ao cwd: na raiz `checklist_modelos/...`, em subpasta `../checklist_modelos/...`. Conferir com `ls` que os arquivos existem nos novos caminhos.
- Atualizar o comentário do `set_time_limit` com o nº de folhas e remover blocos herdados de outro checklist (linhas agrupadas, campos que não existem na migration).
- Comentários curtos em `/** ... */`, sem emojis, tabs para indentar, no estilo do arquivo.

## Variante roteiro de entrega técnica (coluna única STATUS)
Referência: `stellantis/ram/roteiro_entrega_tecnica_1500/v3/imprimir.php` (5 folhas, 106 campos).
- Respostas lidas direto de `$dadosChecklist[campo]`: 1 => ✔ (ZapfDingbats `chr(51)`), 2 => X, 3 => NA, todos centralizados na coluna STATUS (medir com `--x-ini/--x-fim` dentro da coluna, ex. 1110..1178 px).
- `printChecklistMark($pdf, $dadosChecklist, $campo, $centroY)` + `imprimirGrupo`; offsets verticais: ✔ `-3.0` (12 pt), X `-2.9` (12 pt), NA `-2.6` (10 pt).
- Cabeçalho "( )" de tipo/local da entrega: medir o centro entre "(" e ")" e marcar X fonte 8 com `x = centro - 2.5`, `y = centro - 1.6`.
- Linhas de 3 a 5 linhas de texto aparecem no medidor como "bloco/gap"; se a contagem bater com os campos, é uma linha só.
- Uma página por `setupPage($pdf, $fundoBg_N)`; não repetir `AddPage` com o mesmo fundo (gera folha duplicada).
- Após buscar o registro, `if (!isset($dadosChecklist)) die('checklist não encontrado');` evita a cascata de warnings quando o codCheckList não existe na tabela.
- `teste_render.php` aceita `chave=valor` extras: `... imprimir.php saida.pdf tipo_checklist=2 local_entrega=2`.

## Pontos de atenção
- Bordas cinza-claras podem não ser detectadas (aparecem como "bloco/gap"); dividir pela metade ou medir a linha pontualmente.
- A numeração dos itens na folha pode reiniciar dentro de um grupo (ex.: grupo 2 com itens 1-4 e grupo 3 começando em 5); o item exibido na grade de anomalias vem de `checklist_perguntas.ordem`, então avisar o usuário se divergir.
- Não executar `git commit/push/pull` nem migrations; apenas sugerir ao usuário.
- Arquivos de teste (PDF, PNG) vão para o scratchpad, nunca para o projeto.
