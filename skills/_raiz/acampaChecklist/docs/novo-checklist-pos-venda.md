# Novo checklist de pós-venda — do PDF do cliente ao PDF impresso

Guia operacional. Pega o fluxo inteiro: extrair as perguntas do PDF que o cliente mandou,
gravar no banco, medir a arte e deixar o `imprimir.php` marcando no lugar certo.

Folha de pós-venda é diferente das outras: o mesmo item costuma ser cobrado em mais de uma
coluna (ENTRADA e SAÍDA, ou RECEPÇÃO / MECÂNICO / ENTREGA), os rótulos dos blocos vêm
impressos na vertical e as linhas têm alturas diferentes. Os três detalhes quebram o jeito
antigo de posicionar marcação — por isso este guia existe.

---

## O que você vai precisar

| | |
|---|---|
| Este repositório | `acampa-checklist` |
| Extrator | `checklist-tools` (Next.js, roda local) |
| Python 3.10+ | `pip install pillow numpy pymupdf` |
| PHP CLI | o do XAMPP serve |
| Chave de API | Claude ou Gemini, para o extrator |

Confira antes de começar:

```bash
python -c "import PIL, numpy, fitz; print('ok')"
php -v
```

---

## O mapa

São dois repositórios com papéis distintos. A ponte entre eles são os **status**.

```
checklist-tools (web)                    acampa-checklist (terminal)
─────────────────────                    ──────────────────────────
PDF do cliente                           arte da folha (JPG)
  ↓  leitura por imagem                    ↓  medição
campos + checklist_status                coordenadas em mm
+ checklist_perguntas                      ↓
  ↓                                      imprimir.php
banco  ──────────────────────────────────→
                  ↑
         status e contagem por bloco
```

---

## Passo 0 — ligue o preview

Antes de tudo. Ele mostra no navegador, sozinho, cada imagem e PDF que você gerar durante
a medição. Sem isso você fica abrindo arquivo na mão a cada tentativa.

```bash
mkdir -p ~/Desktop/checklist-preview
cd /c/xampp/htdocs/acampa-checklist/tools/checklist
python preview.py ~/Desktop/checklist-preview
```

Abra **http://localhost:8765** e deixe num canto da tela. A página se atualiza a cada 1,5 s
e destaca em verde o que acabou de mudar. O slider no topo controla a largura da imagem.

A partir daqui, **salve tudo que gerar nessa pasta**. Ela fica fora do repositório de
propósito: é material descartável.

```bash
PREVIEW=~/Desktop/checklist-preview
```

---

## Passo 1 — extraia as perguntas

No `checklist-tools`:

```bash
cd checklist-tools && npm run dev
```

Em `localhost:3000/extrator`:

1. Dê um nome ao checklist
2. Projeto → **Pós Venda**
3. Tipo → **Checklist de Inspeção de Veículos**
4. Suba **só o PDF**. A imagem de referência é opcional aqui — o servidor rasteriza as
   folhas do próprio PDF
5. Configure a chave de API. Prefira **Claude Sonnet** ou **Gemini Pro**: a folha é uma
   tabela densa com rótulos girados, e modelo de visão fraco se perde
6. Extrair com o Airton

A estrutura é lida **da imagem**, não do texto. O OCR dessas folhas é inaproveitável: os
rótulos verticais viram fragmentos soltos e as duas tabelas lado a lado colapsam na mesma
linha.

### Confira antes de seguir

| Conferir | Esperado |
|---|---|
| Colunas | as etapas declaradas uma vez (ex.: `Entrada`, `Saída`) |
| Seções | um status por bloco da folha, com o nome que está impresso |
| Nomes repetidos | item que aparece em dois blocos tem que se diferenciar (`retrovisores_le` ≠ `retrovisores_ld`) |
| Cabeçalho | Placa, Km, Data, assinatura **não** podem virar pergunta |

A regra que separa pergunta de cabeçalho é visual: **item de checklist tem caixa para
marcar; campo de preenchimento tem linha para escrever**.

Aplique no banco, nesta ordem: migration → `checklist_status` → `checklist_perguntas`.

**Anote a lista de status com a contagem de perguntas de cada um.** Você vai usar no passo 7.

---

## Passo 2 — crie a pasta do checklist

```bash
cd /c/xampp/htdocs/acampa-checklist
mkdir -p <marca>/<versao>/checklist_modelos
```

Copie um `imprimir.php` de um checklist parecido como ponto de partida.

---

## Passo 3 — prepare a arte

Se a folha veio em PDF, extraia em **150 DPI** — é o padrão das artes do repositório
(1240×1755 em A4 retrato):

```bash
cd tools/checklist
python render.py folha.pdf ../../<marca>/<versao>/checklist_modelos/folha_mod_1_1.jpg --dpi 150
```

Resolução maior ajuda a medir, mas a arte vai embutida em todo PDF gerado em produção —
625 DPI deixa cada impressão com vários MB.

```bash
ARTE=../../<marca>/<versao>/checklist_modelos/folha_mod_1_2.jpg
```

---

## Passo 4 — confira a fórmula

**Não pule este passo.** Se a fórmula estiver errada, todo o resto sai deslocado e você
só descobre no fim.

`writeHTMLCell` não centraliza nada: o `'C'` alinha o texto *dentro* da célula, e a célula
começa em `$x,$y`. Quem centraliza é esta conta:

```
larguraTexto   = GetStringWidth(texto)
alturaTexto    = 0.717 × pt × 25.4/72
alturaBaseline = 0.3569 × pt − 0.1035
x = centro − 1 − larguraTexto/2
y = centro + alturaTexto/2 − alturaBaseline
```

Pegue uma marcação de um checklist que **já sai certa**, rode o caminho inverso e compare
com o centro medido na arte:

```bash
python posicoes.py --conferir 46.3,40.13 --fonte 9
```

Diferença acima de **0,3 mm** quer dizer que a fonte ou o padding não são esses. Descubra
antes de medir o resto.

---

## Passo 5 — meça as colunas

As colunas são as caixas de marcação de cada etapa. Passe uma faixa de `y` que cubra **uma
linha de item**, e uma faixa de `x` que pegue o bloco inteiro:

```bash
python medir_colunas.py $ARTE --em-mm --y0 64.2 --y1 68.0 --x0 50 --x1 108 --folga 0.5
```

A saída alterna rótulo e caixa. Na folha da Parvi:

```
# n    centro     largura
# 1    52.92      1.50      <- texto "C"
# 2    56.15      3.17      <- CAIXA do C
# 3    61.02      3.33      <- texto "NC"
# 4    65.21      3.17      <- CAIXA do NC
```

**Você quer as caixas**, as de largura uniforme. Opções que ajudam:

| Opção | Quando usar |
|---|---|
| `--folga` | rótulos próximos se juntam num blob só: diminua |
| `--invertido` | cabeçalho com tarja escura e texto branco |
| `--largura-max` | layout `Rótulo: [ ]`, para pegar só a caixa |

---

## Passo 6 — meça as linhas

A faixa de `x` tem que cobrir **só as colunas de marcação**. Incluir o texto dos itens faz
o texto entrar na projeção e some com as divisórias.

```bash
python medir_linhas.py $ARTE --em-mm --x0 51 --x1 105 --y0 60 --y1 205 \
  --cobertura 0.75 --altura-min 2
```

Repare no aviso no fim:

```
# altura das celulas: 5.65 a 8.90 mm (variacao 3.25 mm)
# ATENCAO: alturas desiguais. Use a lista de centros abaixo, NAO um incremento.
```

Linha com texto em duas linhas (`Luzes internas / Marcadores do painel`) é mais alta que as
vizinhas. **Sempre lista explícita de `y`.** Passo fixo acumula erro e o X cai na célula
de baixo.

Repita para cada bloco da folha. Na Parvi os 12 primeiros `y` são iguais nos dois blocos e
divergem depois — artes feitas em Excel têm grade global.

---

## Passo 7 — olhe

Número batendo em planilha não prova nada. O que prova é a cruz caindo no meio da caixa.

```bash
python overlay.py $ARTE $PREVIEW/overlay.png \
  --cx 56.15,65.21,75.39 --cy 67.05,73.51,80.01 \
  --recorte 48,62,108,84 --zoom 2.2
```

Aparece no preview em um ou dois segundos. **Sempre com `--recorte`** — a folha inteira
reduzida esconde justamente o erro de meio milímetro que você está procurando.

Agora confira a contagem contra os status que você anotou no passo 1:

```
status 3  Entrada > DIANTEIRA   6   ←→  6 linhas medidas no bloco DIANTEIRA
status 4  Entrada > LATERAL LE  6   ←→  6 linhas medidas
```

Se não bater, o erro é de mapeamento. Não adianta mexer em coordenada.

---

## Passo 8 — gere e valide

Um JSON por bloco e etapa:

```bash
python posicoes.py --colunas 56.15,65.21,75.39 --linhas 67.05,73.51,80.01,... \
  --fonte 9 --arte $ARTE > $PREVIEW/esq_entrada.json
```

Junte todos num PDF de teste. Ele desenha **todas** as posições sobre a arte, sem tocar no
banco — cada bloco com uma cor:

```bash
php validar.php $PREVIEW/teste.pdf $PREVIEW/esq_entrada.json $PREVIEW/esq_saida.json \
  $PREVIEW/dir_entrada.json $PREVIEW/dir_saida.json
```

O PDF aparece no preview sozinho. Para ampliar um pedaço:

```bash
python render.py $PREVIEW/teste.pdf $PREVIEW/zoom.png --recorte 20,60,210,145 --dpi 200
```

Procure: X fora da caixa, X invadindo a célula vizinha, linha sem marcação, marcação
sobrando no fim do bloco.

`--centros` no `validar.php` desenha também uma cruz no centro medido. Quando algo sai
torto, ela diz se o erro veio da medição ou da conversão.

---

## Passo 9 — cole no `imprimir.php`

```bash
python posicoes.py --colunas ... --linhas ... --fonte 9 --php --nome colunasParvi
```

Estrutura que funciona bem para folha de duas colunas:

```php
$colunasParvi = array(
    'esquerda' => array(
        'entrada' => array('1' => 54.09, '3' => 63.15, '0' => 73.33),
        'saida'   => array('1' => 81.28, '3' => 90.34, '0' => 100.50),
    ),
    'direita' => array( /* ... */ ),
);

// Altura de cada linha, medida na arte. NÃO troque por incremento.
$linhasParvi = array(
    'esquerda' => array(
        //DIANTEIRA (6 itens)
        65.08, 71.54, 78.04, 84.52, 91.00, 97.50,
        //LATERAL LE (6 itens)
        103.97, 110.47, 116.95, 123.08, 129.24, 137.00,
    ),
);
```

`imprimir.php` é **UTF-8 com CRLF**. Editando por script, preserve os dois:

```python
s = io.open(p, encoding='utf-8', newline='').read()
io.open(p, 'w', encoding='utf-8', newline='').write(s)
```

```bash
php -l ../../<marca>/<versao>/imprimir.php
```

---

## Aceite

- [ ] `php -l` passa
- [ ] Coordenadas vieram de medição, não de tentativa e erro
- [ ] A fórmula foi conferida numa marcação que já saía certa (passo 4)
- [ ] PDF de teste com **todas** as posições foi renderizado e olhado
- [ ] Nenhum X invade célula vizinha ou passa da borda
- [ ] Contagem por bloco = contagem de linhas da arte = contagem de perguntas por status
- [ ] Lista explícita de `y`, sem incremento acumulado
- [ ] Arte em 150 DPI
- [ ] Nada de temporário dentro do repositório

---

## Armadilhas conhecidas

**Altura acumulada.** `$y` com passo fixo mais "saltos" em índices mágicos
(`if ($i == 5) { $altura = 80; }`) acumula erro. Lista explícita, medida na arte.

**Item sem resposta consumindo linha.** Se o contador avança dentro do `if (isset(...))`,
um campo em branco puxa todos os de baixo uma linha para cima.

**Campo sem caixa na folha.** Item que é pergunta no banco mas não tem caixa impressa
(espessura de pastilha, por exemplo) deve ser pulado **sem consumir linha**. Lista
explícita de exceções, com os nomes confirmados no banco.

**Status deduzido em vez de conferido.** Na Omoda o código mapeava 8 a 13, mas as etapas
eram 9 a 14: tudo saía uma coluna deslocado e o último bloco sumia. A lista do extrator
(passo 1) já traz os status certos.

**Divisória grossa.** Quando a linha de cima do bloco é uma tarja de cabeçalho (vários mm),
o centro da primeira célula sai do **fim** da tarja, não do meio dela. O `medir_linhas.py`
já trata, mas confira no overlay — o sintoma é só a primeira linha deslocada.

**Rótulo de um glifo.** `C`, `S`, `N` sozinhos são estreitos como uma borda de tabela.
O filtro separa pelos dois critérios (cobertura e largura); se uma coluna sumir, é aí.

---

## Referências

| Onde | O quê |
|---|---|
| `toyota/v4/functionsToyota/functionsToyota.php` | origem das fórmulas; `printMarcacaoCentralizadaChecklist` |
| `omoda_jaecoo/v1/imprimir.php` | grade única compartilhada entre blocos, etapa que pula linhas |
| `mitsubishi/v1/imprimir.php` | tabela de posições por etapa com dois loops |
| `provider/externalAspects/externalAspects.php` | croqui de avarias |
| `parvi_frota/v1/` | folha de duas colunas (ENTRADA/SAÍDA), medida com estas ferramentas |

As ferramentas ficam em `tools/checklist/` e são permanentes — todas aceitam `--help`.
Scripts feitos para **uma** folha específica continuam descartáveis: salve fora do
repositório, junto com os PDFs de teste.
