<?php
/**
 * Gera um PDF de conferência das marcações de um imprimir.php sem banco de dados.
 *
 * Uso (rodar com o cwd na pasta do imprimir.php, pois os fundos são caminhos relativos):
 *   cd <pasta do imprimir.php>
 *   php <skill>/scripts/teste_render.php imprimir.php <saida.pdf>
 *
 * Executa somente o trecho entre "$fundoBg_1 =" e o primeiro de "// COMPROVANTE" ou
 * "$resultadoListaDeObs = gerarListaDeObs", após declarar as funções de nível superior do
 * arquivo (setupPage, imprimirResposta, ...). Todo campo encontrado em "'campo' => <número>"
 * e em imprimirResposta(..., 'campo', ...) recebe resposta fictícia:
 * - $perguntasRespostasImprimir (revisão): 1 (✔) / 2 (✖) / 0 (N.A.), com observação;
 * - $dadosChecklist (roteiro):              1 (✔) / 2 (X) / 3 (NA).
 * Argumentos extras chave=valor sobrescrevem $dadosChecklist (ex.: tipo_checklist=2 local_entrega=2).
 */
$arquivo = $argv[1] ?? 'imprimir.php';
$saida = $argv[2] ?? (sys_get_temp_dir() . '/teste_marcacoes.pdf');
/** raiz do repositório: a skill fica em <repo>/.claude/skills/checklist-pdf-marcacoes/scripts */
$raiz = dirname(__DIR__, 4);

require_once($raiz . '/includes/class/pdf/tcpdf.php');

/** assinatura vira um retângulo para mostrar a área ocupada */
function printSignature($pdf, $s, $x, $y, $w, $h) { $pdf->Rect($x, $y, $w, $h, 'D'); }

$src = file_get_contents($arquivo);
$ini = strpos($src, '$fundoBg_1 =');
$fins = array_filter([strpos($src, '// COMPROVANTE'), strpos($src, '$resultadoListaDeObs = gerarListaDeObs')], function ($p) use ($ini) {
	return $p !== false && $p > $ini;
});
if ($ini === false || !$fins)
	die("marcadores \$fundoBg_1 / // COMPROVANTE / \$resultadoListaDeObs não encontrados em $arquivo\n");
$body = substr($src, $ini, min($fins) - $ini);

/** funções declaradas fora do trecho (ex.: setupPage, printChecklistMark antes do $fundoBg_1) */
preg_match_all('/^function \w+\(.*?^\}/ms', substr($src, 0, $ini), $mf);
$funcoesAntes = implode("\n", $mf[0]);

preg_match_all("/'([a-z0-9_]+)'\s*=>\s*[0-9.]+/", $body, $m1);
preg_match_all("/imprimirResposta\(\s*\\\$pdf,\s*\\\$\w+,\s*'([a-z0-9_]+)'/", $body, $m2);
$campos = array_values(array_unique(array_merge($m1[1], $m2[1])));

$perguntasRespostasImprimir = [];
foreach ($campos as $i => $c)
	$perguntasRespostasImprimir[$c] = [
		'grupo' => 1 + intdiv($i, 10), 'item' => $i + 1, 'campo' => $c,
		'resposta' => (string) ($i % 3), 'tipo' => 'radio', 'observacoes' => "obs $c",
	];

$dadosChecklist = [
	'chassi' => '1C6SRFFT0RN123456', 'versao' => 'VERSAO TESTE', 'modelo' => 'MODELO TESTE', 'cor' => 'PRETO',
	'km_inicial' => '12', 'km_final' => '25', 's_data' => '27/10/2026', 's_hora' => '14:35',
	'assinatura_recebedor' => 'x', 'assinatura_cliente' => 'x', 'assinatura_consultor_vendas' => 'x',
	'cliente' => 'CLIENTE TESTE', 'placa' => 'ABC1D23', 'cpf' => '123.456.789-00', 'status' => 0,
	'programada_data' => '2026-10-27', 'programada_hora' => '09:45:00', 'tipo_checklist' => 1, 'local_entrega' => 1,
];
foreach ($campos as $i => $c)
	$dadosChecklist[$c] = (string) (1 + $i % 3);
foreach (array_slice($argv, 3) as $arg) {
	list($k, $v) = array_pad(explode('=', $arg, 2), 2, '');
	$dadosChecklist[$k] = $v;
}
/** campos livres (anotar_*) recebem um valor fictício */
preg_match_all("/\\\$dadosChecklist\['(anotar_[a-z0-9_]+)'\]/", $body, $m3);
foreach (array_unique($m3[1]) as $c)
	$dadosChecklist[$c] = '75';
$consultor = ['nome' => 'FULANO DE TAL DA SILVA'];
$mecanico = ['nome' => 'CICLANO MECANICO'];

$pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8', false);
$pdf->setPrintHeader(false);
$pdf->setPrintFooter(false);
eval('?><?php ' . $funcoesAntes . "\n" . $body);
$pdf->Output($saida, 'F');

echo count($campos) . " campos marcados -> $saida\n";
