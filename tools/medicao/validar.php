<?php
/**
 * Gera um PDF de teste com a arte de fundo e TODAS as posicoes marcadas, sem
 * tocar no banco.
 *
 * E o passo que fecha a medicao: numero batendo na planilha nao prova que o X
 * cai dentro da caixa. Aqui o PDF sai pelo mesmo caminho do imprimir.php
 * (TCPDF escrevendo sobre a arte), entao o que se ve e o que vai sair.
 *
 *   php validar.php saida.pdf pos.json
 *   php validar.php saida.pdf entrada.json saida.json --tcpdf=/caminho/tcpdf.php
 *   php validar.php saida.pdf pos.json --centros
 *
 * Varios JSON = varios blocos na mesma folha, cada um com a sua cor. Os JSON
 * sao os que o posicoes.py emite.
 *
 * O TCPDF e procurado nesta ordem: --tcpdf=, a env TCPDF_PATH e
 * includes/class/pdf/tcpdf.php subindo a partir deste arquivo.
 */

error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);

// Cores dos blocos, na ordem dos JSON passados.
$CORES = array(
    array(220, 30, 30),
    array(30, 90, 220),
    array(20, 150, 60),
    array(200, 120, 0),
    array(150, 40, 180),
);

function acharTcpdf($explicito)
{
    if ($explicito) {
        if (is_file($explicito)) {
            return $explicito;
        }
        fwrite(STDERR, "ERRO: --tcpdf aponta para arquivo inexistente: $explicito\n");
        exit(1);
    }
    $env = getenv('TCPDF_PATH');
    if ($env && is_file($env)) {
        return $env;
    }
    $dir = __DIR__;
    for ($i = 0; $i < 6; $i++) {
        $tentativa = $dir . '/includes/class/pdf/tcpdf.php';
        if (is_file($tentativa)) {
            return $tentativa;
        }
        $pai = dirname($dir);
        if ($pai === $dir) {
            break;
        }
        $dir = $pai;
    }
    fwrite(STDERR, "ERRO: tcpdf.php nao encontrado. Use --tcpdf= ou defina TCPDF_PATH.\n");
    exit(1);
}

function lerJson($caminho)
{
    if (!is_file($caminho)) {
        fwrite(STDERR, "ERRO: arquivo nao encontrado: $caminho\n");
        exit(1);
    }
    $dados = json_decode(file_get_contents($caminho), true);
    if (!is_array($dados) || !isset($dados['posicoes'])) {
        fwrite(STDERR, "ERRO: $caminho nao e um JSON do posicoes.py (falta 'posicoes').\n");
        exit(1);
    }
    return $dados;
}

// --- argumentos -------------------------------------------------------------

$argumentos = array_slice($argv, 1);
$tcpdfExplicito = null;
$marcarCentros = false;
$arquivos = array();

foreach ($argumentos as $a) {
    if (strpos($a, '--tcpdf=') === 0) {
        $tcpdfExplicito = substr($a, 8);
    } elseif ($a === '--centros') {
        $marcarCentros = true;
    } elseif (strpos($a, '--') === 0) {
        fwrite(STDERR, "ERRO: opcao desconhecida: $a\n");
        exit(1);
    } else {
        $arquivos[] = $a;
    }
}

if (count($arquivos) < 2) {
    fwrite(STDERR, "uso: php validar.php SAIDA.pdf POS.json [POS2.json ...] [--centros] [--tcpdf=]\n");
    exit(1);
}

$saidaPdf = array_shift($arquivos);
$blocos = array();
foreach ($arquivos as $f) {
    $blocos[] = lerJson($f);
}

// A arte vem do primeiro JSON que a declarar; sem ela o PDF sai em branco e nao
// da para conferir nada.
$arte = null;
foreach ($blocos as $b) {
    if (!empty($b['arte'])) {
        $arte = $b['arte'];
        break;
    }
}
if (!$arte) {
    fwrite(STDERR, "ERRO: nenhum JSON traz 'arte'. Rode o posicoes.py com --arte CAMINHO.\n");
    exit(1);
}
if (!is_file($arte)) {
    fwrite(STDERR, "ERRO: arte nao encontrada: $arte\n");
    exit(1);
}

require_once acharTcpdf($tcpdfExplicito);

// --- montagem ---------------------------------------------------------------

list($larguraPx, $alturaPx) = getimagesize($arte);
$paisagem = $larguraPx > $alturaPx;
$larguraMm = $paisagem ? 297 : 210;
$alturaMm = $paisagem ? 210 : 297;

$pdf = new TCPDF($paisagem ? 'L' : 'P', 'mm', 'A4', true, 'UTF-8', false);
$pdf->SetPrintHeader(false);
$pdf->SetPrintFooter(false);
$pdf->SetAutoPageBreak(false, 0);
$pdf->AddPage();
$pdf->Image($arte, 0, 0, $larguraMm, $alturaMm, '', '', '', false, 300, '', false, false, 0);
$pdf->setPageMark();

$total = 0;
foreach ($blocos as $i => $bloco) {
    $cor = $CORES[$i % count($CORES)];
    $pdf->SetTextColor($cor[0], $cor[1], $cor[2]);
    $pdf->SetDrawColor($cor[0], $cor[1], $cor[2]);

    $pt = isset($bloco['fonte_pt']) ? $bloco['fonte_pt'] : 10;
    $negrito = !empty($bloco['negrito']);
    $texto = isset($bloco['texto']) ? $bloco['texto'] : 'X';
    $pdf->SetFont('Helvetica', $negrito ? 'B' : '', $pt);

    foreach ($bloco['posicoes'] as $p) {
        $pdf->writeHTMLCell(20, 5, $p['x'], $p['y'], $texto, 0, 0, 0, true, 'L', true);
        $total++;

        // A cruz no centro medido mostra, quando algo sai torto, se o erro veio
        // da medicao ou da conversao centro -> canto.
        if ($marcarCentros && isset($p['centro_x'])) {
            $cx = $p['centro_x'];
            $cy = $p['centro_y'];
            $pdf->Line($cx - 1.5, $cy, $cx + 1.5, $cy);
            $pdf->Line($cx, $cy - 1.5, $cx, $cy + 1.5);
        }
    }
}

$pdf->Output($saidaPdf, 'F');

printf("# arte: %s (%dx%d px, %s)\n", $arte, $larguraPx, $alturaPx, $paisagem ? 'paisagem' : 'retrato');
foreach ($blocos as $i => $bloco) {
    printf(
        "# bloco %d: %d posicoes, texto %s, %g pt%s\n",
        $i + 1,
        count($bloco['posicoes']),
        isset($bloco['texto']) ? $bloco['texto'] : 'X',
        isset($bloco['fonte_pt']) ? $bloco['fonte_pt'] : 10,
        !empty($bloco['negrito']) ? ' negrito' : ''
    );
}
printf("%s  %d marcacoes\n", $saidaPdf, $total);
