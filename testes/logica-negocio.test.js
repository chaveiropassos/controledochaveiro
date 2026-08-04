// ============================================================
// logica-negocio.test.js — testes das funções puras de logica-negocio.js.
//
// Servem a dois propósitos:
//  1) Cobertura/comportamento das funções puras extraídas do canônico.
//  2) Alvo do teste de MUTAÇÃO (Stryker muta logica-negocio.js e roda ISTO).
//
// As assertivas são fortes (limites, sinais, casos de borda) para MATAR o
// máximo de mutantes: trocar > por >=, apagar um replace, inverter um ternário
// etc. devem quebrar algum teste aqui.
//
// O bloco final ("espelho do canônico") confere que cada função aqui produz o
// MESMO resultado que a homônima rodando DENTRO do index.html real — assim a
// extração não pode divergir silenciosamente do app.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const L = require("./logica-negocio")

// ------------------------------------------------------------
// parseMoeda
// ------------------------------------------------------------
test("parseMoeda: 'R$ 1.234,56' -> 1234.56", function () {
  assert.strictEqual(L.parseMoeda("R$ 1.234,56"), 1234.56)
})
test("parseMoeda: milhar com ponto e decimal com vírgula", function () {
  assert.strictEqual(L.parseMoeda("1.000.000,00"), 1000000)
  assert.strictEqual(L.parseMoeda("10,5"), 10.5)
})
test("parseMoeda: null/undefined/'' e texto viram 0; negativo preservado", function () {
  assert.strictEqual(L.parseMoeda(null), 0)
  assert.strictEqual(L.parseMoeda(undefined), 0)
  assert.strictEqual(L.parseMoeda(""), 0)
  assert.strictEqual(L.parseMoeda("abc"), 0)
  assert.strictEqual(L.parseMoeda("-5"), -5)
})
test("parseMoeda: número já numérico passa por String() sem quebrar", function () {
  assert.strictEqual(L.parseMoeda(12.34), 1234) // '12.34' -> remove ponto -> '1234'
})

// ------------------------------------------------------------
// fmtNum
// ------------------------------------------------------------
test("fmtNum: 2 casas, vírgula decimal", function () {
  assert.strictEqual(L.fmtNum(1234.5), "1234,50")
  assert.strictEqual(L.fmtNum(0), "0,00")
  assert.strictEqual(L.fmtNum(""), "0,00")
  assert.strictEqual(L.fmtNum(0.1 + 0.2), "0,30") // arredonda
})

// ------------------------------------------------------------
// fmtTelefone
// ------------------------------------------------------------
test("fmtTelefone: celular 11 dígitos", function () {
  assert.strictEqual(L.fmtTelefone("35999998888"), "(35) 99999-8888")
})
test("fmtTelefone: entrada já mascarada só mantém os dígitos", function () {
  // input com muitos não-dígitos: o replace(/\D/g,"") tem que apagá-los (não
  // substituí-los por outra coisa) — mata mutantes no arg do replace.
  assert.strictEqual(L.fmtTelefone("(35) 99999-8888"), "(35) 99999-8888")
  // "35 999999888" -> 11 dígitos -> formato celular
  assert.strictEqual(L.fmtTelefone("tel: 35 abc 99999-9888"), "(35) 99999-9888")
})
test("fmtTelefone: fixo 10 dígitos usa corte 6", function () {
  assert.strictEqual(L.fmtTelefone("3533334444"), "(35) 3333-4444")
})
test("fmtTelefone: descarta DDI 55 quando >11 dígitos", function () {
  assert.strictEqual(L.fmtTelefone("5535999998888"), "(35) 99999-8888")
})
test("fmtTelefone: entradas parciais e vazias", function () {
  assert.strictEqual(L.fmtTelefone(""), "")
  assert.strictEqual(L.fmtTelefone("3"), "(3")
  assert.strictEqual(L.fmtTelefone("35"), "(35")
  assert.strictEqual(L.fmtTelefone("359"), "(35) 9")
})
test("fmtTelefone: 55 curto (não DDI) NÃO é descartado", function () {
  // 10 dígitos começando com 55: length<=11, então NÃO cai no ramo do DDI.
  assert.strictEqual(L.fmtTelefone("5533334444"), "(55) 3333-4444")
})
test("fmtTelefone: 11 dígitos começando 55 NÃO é tratado como DDI (fronteira >11)", function () {
  // 11 dígitos: `d.length > 11` é FALSO (mata o mutante >=11). O 55 é o DDD.
  assert.strictEqual(L.fmtTelefone("55999998888"), "(55) 99999-8888")
})
test("fmtTelefone: 12 dígitos começando 55 descarta o DDI (fronteira >11 verdadeira)", function () {
  // 12 dígitos: `> 11` verdadeiro -> tira '55' -> sobra 10 dígitos.
  assert.strictEqual(L.fmtTelefone("553533334444"), "(35) 3333-4444")
})
test("fmtTelefone: 12 dígitos NÃO iniciados por 55 não sofrem strip de DDI", function () {
  // 12 dígitos '3599...': `> 11` verdadeiro, mas startsWith('55') FALSO -> não
  // strip. Depois slice(0,11) recorta p/ 11. Mata mutantes:
  //  - startsWith("") sempre-true (stripava indevidamente)
  //  - slice(0,11) -> identidade (deixaria 12 dígitos)
  assert.strictEqual(L.fmtTelefone("359999988887"), "(35) 99999-8888")
})
test("fmtTelefone: exatamente 6 dígitos não ganha hífen (fronteira length>corte)", function () {
  // corte=6; `d.length > corte` = 6>6 é FALSO -> sem hífen (mata mutante >=corte).
  assert.strictEqual(L.fmtTelefone("353333"), "(35) 3333")
})
test("fmtTelefone: 7 dígitos ganha hífen a partir do corte", function () {
  assert.strictEqual(L.fmtTelefone("3533335"), "(35) 3333-5")
})

// ------------------------------------------------------------
// fmtDocumento
// ------------------------------------------------------------
test("fmtDocumento: CPF 11 dígitos", function () {
  assert.strictEqual(L.fmtDocumento("12345678900"), "123.456.789-00")
})
test("fmtDocumento: entrada com pontuação/letras só mantém dígitos", function () {
  // mata mutantes no arg do replace(/\D/g,"") de fmtDocumento
  assert.strictEqual(L.fmtDocumento("123.456.789-00"), "123.456.789-00")
  assert.strictEqual(L.fmtDocumento("cpf 123abc456"), "123.456")
})
test("fmtDocumento: CNPJ 14 dígitos", function () {
  assert.strictEqual(L.fmtDocumento("12345678000199"), "12.345.678/0001-99")
})
test("fmtDocumento: CPF parcial", function () {
  assert.strictEqual(L.fmtDocumento("123456"), "123.456")
  assert.strictEqual(L.fmtDocumento("1234"), "123.4")
})
test("fmtDocumento: vazio e limite de 14 dígitos", function () {
  assert.strictEqual(L.fmtDocumento(""), "")
  // 15 dígitos: corta em 14 -> CNPJ completo
  assert.strictEqual(L.fmtDocumento("123456780001999"), "12.345.678/0001-99")
})
test("fmtDocumento: fronteiras de CPF (3, 9 dígitos exatos)", function () {
  // 3 dígitos: `d.length > 3` = 3>3 FALSO -> sem ponto (mata mutante >=3)
  assert.strictEqual(L.fmtDocumento("123"), "123")
  // 9 dígitos: `d.length > 9` = 9>9 FALSO -> sem hífen final (mata mutante >=9)
  assert.strictEqual(L.fmtDocumento("123456789"), "123.456.789")
})
test("fmtDocumento: fronteira de CNPJ (12 dígitos exatos, sem sufixo)", function () {
  // 12 dígitos: `d.length > 12` = 12>12 FALSO -> sem '-XX' final (mata mutante >=12)
  assert.strictEqual(L.fmtDocumento("123456780001"), "12.345.678/0001")
})

// ------------------------------------------------------------
// slugTipo
// ------------------------------------------------------------
test("slugTipo: minúsculo, sem acento nem espaço nem símbolo", function () {
  assert.strictEqual(L.slugTipo("Fechadura Digital"), "fechaduradigital")
  assert.strictEqual(L.slugTipo("Chave-Tetra!"), "chavetetra")
  assert.strictEqual(L.slugTipo("Ação"), "acao")
})
test("slugTipo: vazio/null", function () {
  assert.strictEqual(L.slugTipo(""), "")
  assert.strictEqual(L.slugTipo(null), "")
})

// ------------------------------------------------------------
// mkNormalizar
// ------------------------------------------------------------
test("mkNormalizar: remove hífen/espaço, tira prefixo MK, maiúsculo", function () {
  assert.strictEqual(L.mkNormalizar("mk-abcd-1234"), "ABCD1234")
  assert.strictEqual(L.mkNormalizar("AB CD 12"), "ABCD12")
})
test("mkNormalizar: só remove MK do INÍCIO", function () {
  // 'XMK' não começa com MK -> não remove; 'MKMK' remove só o primeiro MK
  assert.strictEqual(L.mkNormalizar("XMK12"), "XMK12")
  assert.strictEqual(L.mkNormalizar("MKMK12"), "MK12")
})
test("mkNormalizar: vazio/null", function () {
  assert.strictEqual(L.mkNormalizar(""), "")
  assert.strictEqual(L.mkNormalizar(null), "")
})

// ------------------------------------------------------------
// labelPerfil
// ------------------------------------------------------------
test("labelPerfil: traduz conhecidos e devolve a própria chave se desconhecido", function () {
  assert.strictEqual(L.labelPerfil("admin"), "Administrador")
  assert.strictEqual(L.labelPerfil("supervisor"), "Supervisor")
  assert.strictEqual(L.labelPerfil("operador"), "Operador")
  assert.strictEqual(L.labelPerfil("funcionario"), "Funcionário")
  assert.strictEqual(L.labelPerfil("xpto"), "xpto")
})

// ------------------------------------------------------------
// _sqlVal
// ------------------------------------------------------------
test("_sqlVal: null/undefined -> NULL", function () {
  assert.strictEqual(L._sqlVal(null), "NULL")
  assert.strictEqual(L._sqlVal(undefined), "NULL")
})
test("_sqlVal: número sem aspas; boolean como true/false", function () {
  assert.strictEqual(L._sqlVal(42), "42")
  assert.strictEqual(L._sqlVal(0), "0")
  assert.strictEqual(L._sqlVal(true), "true")
  assert.strictEqual(L._sqlVal(false), "false")
})
test("_sqlVal: texto com aspas simples é escapado (dobrado)", function () {
  assert.strictEqual(L._sqlVal("O'Brien"), "'O''Brien'")
  assert.strictEqual(L._sqlVal("ok"), "'ok'")
})
test("_sqlVal: objeto vira JSON entre aspas com escape", function () {
  assert.strictEqual(L._sqlVal({ a: 1 }), "'{\"a\":1}'")
  assert.strictEqual(L._sqlVal({ s: "x'y" }), "'{\"s\":\"x''y\"}'")
})

// ------------------------------------------------------------
// descontoValor (núcleo aritmético do desconto)
// ------------------------------------------------------------
test("descontoValor: em reais aplica o valor direto (não percentual)", function () {
  // subtotal 200, valor 30: reais -> 30; se o ternário virasse 'pct' daria 60.
  // (mata o mutante que força o ramo pct)
  assert.strictEqual(L.descontoValor(200, 30, "reais"), 30)
})
test("descontoValor: em pct calcula percentual do subtotal", function () {
  assert.strictEqual(L.descontoValor(200, 10, "pct"), 20)
  assert.strictEqual(L.descontoValor(100, 50, "pct"), 50)
})
test("descontoValor: nunca negativo (piso 0)", function () {
  assert.strictEqual(L.descontoValor(100, -5, "reais"), 0)
})
test("descontoValor: nunca maior que o subtotal (teto = subtotal)", function () {
  assert.strictEqual(L.descontoValor(100, 150, "reais"), 100)
  assert.strictEqual(L.descontoValor(100, 200, "pct"), 100) // 200% limitado a 100
})
test("descontoValor: desconto igual ao subtotal é permitido (limite não exclusivo)", function () {
  assert.strictEqual(L.descontoValor(100, 100, "reais"), 100)
})

// ============================================================
// ESPELHO DO CANÔNICO — garante que logica-negocio.js não divergiu do app.
// Roda o index.html real no jsdom e compara função a função.
// ============================================================
const { montarAmbiente } = require("./ambiente")

test("espelho do canônico: as funções puras batem com o index.html real", async function () {
  const { window } = await montarAmbiente()
  const ev = (expr) => window.eval(expr)

  const casosTel = ["35999998888", "3533334444", "5535999998888", "", "3", "359", "5533334444"]
  for (const c of casosTel) {
    assert.strictEqual(
      L.fmtTelefone(c),
      ev("fmtTelefone(" + JSON.stringify(c) + ")"),
      "fmtTelefone diverge para " + JSON.stringify(c),
    )
  }

  const casosDoc = ["12345678900", "12345678000199", "123456", "", "123456780001999"]
  for (const c of casosDoc) {
    assert.strictEqual(
      L.fmtDocumento(c),
      ev("fmtDocumento(" + JSON.stringify(c) + ")"),
      "fmtDocumento diverge para " + JSON.stringify(c),
    )
  }

  const casosMoeda = ["R$ 1.234,56", "10,5", "-5", "abc", ""]
  for (const c of casosMoeda) {
    assert.strictEqual(
      L.parseMoeda(c),
      ev("parseMoeda(" + JSON.stringify(c) + ")"),
      "parseMoeda diverge para " + JSON.stringify(c),
    )
  }

  const casosSlug = ["Fechadura Digital", "Ação", "Chave-Tetra!", ""]
  for (const c of casosSlug) {
    assert.strictEqual(
      L.slugTipo(c),
      ev("slugTipo(" + JSON.stringify(c) + ")"),
      "slugTipo diverge para " + JSON.stringify(c),
    )
  }

  const casosMk = ["mk-abcd-1234", "AB CD 12", "MKMK12", "XMK12", ""]
  for (const c of casosMk) {
    assert.strictEqual(
      L.mkNormalizar(c),
      ev("mkNormalizar(" + JSON.stringify(c) + ")"),
      "mkNormalizar diverge para " + JSON.stringify(c),
    )
  }

  for (const c of ["admin", "supervisor", "operador", "funcionario", "xpto"]) {
    assert.strictEqual(L.labelPerfil(c), ev("labelPerfil(" + JSON.stringify(c) + ")"))
  }

  for (const c of ["1234.5", "0", ""]) {
    assert.strictEqual(L.fmtNum(c), ev("fmtNum(" + JSON.stringify(c) + ")"))
  }

  // _sqlVal
  assert.strictEqual(L._sqlVal("O'Brien"), ev("_sqlVal(\"O'Brien\")"))
  assert.strictEqual(L._sqlVal(42), ev("_sqlVal(42)"))
  assert.strictEqual(L._sqlVal(null), ev("_sqlVal(null)"))
})
