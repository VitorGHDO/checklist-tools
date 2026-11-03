"""
Mede a grade de uma folha de checklist (imagem de fundo do PDF) e imprime as
coordenadas em mm prontas para o imprimir.php.

Uso:
    python medir_folha.py <imagem> [--x-ini PX --x-fim PX] [--colunas-y PX] [--largura-mm 210]

- Linhas: detecta as bordas horizontais varrendo uma faixa X (por padrão a área das
  colunas de status, ~83%..95% da largura). Faixas com fundo escuro são cabeçalhos
  de grupo (GRUPO N / ✔ ✖ N.A.).
- Colunas: com --colunas-y informe uma linha Y (px) dentro de uma linha de item para
  listar as bordas verticais naquela altura (ex.: colunas ✔ ✖ N.A.).
"""
import argparse
from PIL import Image


def agrupar(valores, tolerancia=2):
    grupos = []
    for v in valores:
        if grupos and v - grupos[-1][-1] <= tolerancia:
            grupos[-1].append(v)
        else:
            grupos.append([v])
    return grupos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('imagem')
    ap.add_argument('--x-ini', type=int)
    ap.add_argument('--x-fim', type=int)
    ap.add_argument('--colunas-y', type=int)
    ap.add_argument('--largura-mm', type=float, default=210.0)
    ap.add_argument('--limiar', type=int, default=200, help='tom médio de cinza (0-255) abaixo do qual a linha conta como borda')
    args = ap.parse_args()

    im = Image.open(args.imagem).convert('L')
    w, h = im.size
    px = im.load()
    k = args.largura_mm / w
    x_ini = args.x_ini if args.x_ini is not None else int(w * 0.83)
    x_fim = args.x_fim if args.x_fim is not None else int(w * 0.95)
    faixa = x_fim - x_ini

    print(f'imagem {w}x{h}px | escala {k:.5f} mm/px | faixa X {x_ini}..{x_fim}px')

    if args.colunas_y is not None:
        y = args.colunas_y
        xs = [x for x in range(w) if px[x, y] < args.limiar]
        print('bordas verticais (mm):', [round(sum(g) / len(g) * k, 2) for g in agrupar(xs)])
        return

    # media de tom da linha na faixa: bordas finas e cabeçalhos preenchidos ficam abaixo do limiar
    escuras = [y for y in range(h) if sum(px[x, y] for x in range(x_ini, x_fim)) / faixa < args.limiar]

    # cada grupo fino (<=4px) é uma borda; grupo grosso é um cabeçalho preenchido
    bordas = []  # (y_mm, tipo) tipo: 'borda' | 'cab_ini' | 'cab_fim'
    for g in agrupar(escuras):
        if len(g) <= 4:
            bordas.append((sum(g) / len(g) * k, 'borda'))
        else:
            bordas.append((g[0] * k, 'cab_ini'))
            bordas.append((g[-1] * k, 'cab_fim'))

    print(f'\n{"#":>3} {"topo":>7} {"base":>7} {"centro":>7} {"alt":>5}  tipo')
    n = 0
    for (y1, t1), (y2, t2) in zip(bordas, bordas[1:]):
        alt = y2 - y1
        if alt < 2.5:
            continue
        if t1 == 'cab_ini':
            tipo = 'CABECALHO'
        elif alt > 8:
            tipo = 'linha (2 linhas de texto?)' if alt < 11 else 'bloco/gap - conferir'
        else:
            tipo = 'linha'
        if tipo.startswith('linha'):
            n += 1
        print(f'{n if tipo.startswith("linha") else "":>3} {y1:7.2f} {y2:7.2f} {(y1 + y2) / 2:7.2f} {alt:5.2f}  {tipo}')


if __name__ == '__main__':
    main()
