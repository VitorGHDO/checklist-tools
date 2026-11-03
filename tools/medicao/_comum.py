# -*- coding: utf-8 -*-
"""
Base comum das ferramentas de medicao de arte.

Toda coordenada de checklist e em MILIMETROS na folha A4 (210x297 retrato,
297x210 paisagem). A arte e um raster: a conversao px <-> mm sai do tamanho da
imagem, nao de um DPI fixo, porque as artes do repositorio variam de resolucao.

Os comentarios seguem o padrao dos .php do repositorio: portugues sem acento,
para nao depender do encoding do console no Windows.
"""

import argparse
import sys

import numpy as np
from PIL import Image

A4_CURTO_MM = 210.0
A4_LONGO_MM = 297.0

# Abaixo disso o pixel conta como tinta. As artes sao line art sobre branco; 200
# pega linha fina e texto sem puxar o antialiasing do fundo.
LIMIAR_TINTA = 200


class Arte:
    """Imagem da arte com a escala px <-> mm ja resolvida."""

    def __init__(self, caminho, forcar=None):
        self.caminho = caminho
        imagem = Image.open(caminho)
        self.largura_px, self.altura_px = imagem.size
        self.cinza = np.asarray(imagem.convert("L"))

        if forcar == "paisagem":
            paisagem = True
        elif forcar == "retrato":
            paisagem = False
        else:
            paisagem = self.largura_px > self.altura_px

        self.paisagem = paisagem
        self.largura_mm = A4_LONGO_MM if paisagem else A4_CURTO_MM
        self.altura_mm = A4_CURTO_MM if paisagem else A4_LONGO_MM
        self.px_por_mm_x = self.largura_px / self.largura_mm
        self.px_por_mm_y = self.altura_px / self.altura_mm

    # --- conversoes ---------------------------------------------------------

    def x_mm(self, px):
        return px / self.px_por_mm_x

    def y_mm(self, px):
        return px / self.px_por_mm_y

    def x_px(self, mm):
        return mm * self.px_por_mm_x

    def y_px(self, mm):
        return mm * self.px_por_mm_y

    def descricao(self):
        return "%s  %dx%d px  %s  %.3f px/mm" % (
            self.caminho,
            self.largura_px,
            self.altura_px,
            "paisagem" if self.paisagem else "retrato",
            self.px_por_mm_x,
        )

    # --- leitura ------------------------------------------------------------

    def tinta(self, limiar=LIMIAR_TINTA, invertido=False):
        """
        Mascara booleana do que conta como marca.

        Normalmente e o pixel escuro sobre papel branco. Com `invertido`, e o
        contrario: cabecalho de tabela com tarja escura e texto em branco (a
        folha da Omoda e assim). Sem isso a tarja inteira vira um blob so.
        """
        if invertido:
            return self.cinza > limiar
        return self.cinza < limiar

    def faixa_px(self, x0_mm, x1_mm, y0_mm, y1_mm):
        """Converte um retangulo em mm para indices de pixel ja limitados a imagem."""
        x0 = 0 if x0_mm is None else max(0, int(round(self.x_px(x0_mm))))
        x1 = self.largura_px if x1_mm is None else min(self.largura_px, int(round(self.x_px(x1_mm))))
        y0 = 0 if y0_mm is None else max(0, int(round(self.y_px(y0_mm))))
        y1 = self.altura_px if y1_mm is None else min(self.altura_px, int(round(self.y_px(y1_mm))))
        if x1 <= x0 or y1 <= y0:
            sys.exit("ERRO: faixa vazia (x %s..%s, y %s..%s em mm)" % (x0_mm, x1_mm, y0_mm, y1_mm))
        return x0, x1, y0, y1


def agrupar_consecutivos(indices, folga=1):
    """
    Agrupa indices vizinhos num unico achado. Uma divisoria tem 1 a 3 px de
    espessura e um rotulo tem dezenas: sem agrupar, cada coluna de pixel viraria
    uma medida separada.

    Devolve [(inicio, fim)] com fim inclusivo.
    """
    if len(indices) == 0:
        return []
    grupos = []
    inicio = anterior = int(indices[0])
    for i in indices[1:]:
        i = int(i)
        if i - anterior <= folga:
            anterior = i
            continue
        grupos.append((inicio, anterior))
        inicio = anterior = i
    grupos.append((inicio, anterior))
    return grupos


def centro_do_grupo(grupo):
    return (grupo[0] + grupo[1]) / 2.0


def argumentos_base(descricao):
    """Parser com as opcoes que todas as ferramentas aceitam."""
    p = argparse.ArgumentParser(
        description=descricao,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("arte", help="caminho da imagem de fundo (JPG/PNG)")
    p.add_argument(
        "--em-mm",
        action="store_true",
        help="as coordenadas passadas estao em mm (padrao: px da arte)",
    )
    grupo = p.add_mutually_exclusive_group()
    grupo.add_argument("--paisagem", action="store_true", help="forca A4 deitada")
    grupo.add_argument("--retrato", action="store_true", help="forca A4 em pe")
    p.add_argument(
        "--invertido",
        action="store_true",
        help="marca clara sobre fundo escuro (cabecalho com tarja preta e texto branco)",
    )
    p.add_argument(
        "--limiar",
        type=int,
        default=LIMIAR_TINTA,
        help="nivel de cinza abaixo do qual o pixel conta como tinta (padrao %d)" % LIMIAR_TINTA,
    )
    return p


def abrir(args):
    forcar = "paisagem" if args.paisagem else ("retrato" if args.retrato else None)
    return Arte(args.arte, forcar)


def para_mm(arte, valor, eixo, em_mm):
    """Normaliza um argumento de corte para mm, aceitando px ou mm na entrada."""
    if valor is None:
        return None
    if em_mm:
        return float(valor)
    return arte.x_mm(float(valor)) if eixo == "x" else arte.y_mm(float(valor))
