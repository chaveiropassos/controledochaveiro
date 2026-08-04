// ============================================================
// reconciliacao-lancamento.test.js — a rede de segurança do Commit 2.
//
// reconciliarLancamentos() lista as OS PAGAS (valor_pago > 0) que NÃO têm
// lançamento de ENTRADA correspondente em transacoes. O casamento
// transação ↔ OS é pelo servico_id da transação (a FK que liga transacao à
// OS). É assim que se acham as OS #81/#82 e futuros escapes do bug.
//
// Também exercita registrarLancamentoFaltante(osId): insere a transação que
// faltou (valor = valor_pago da OS) para aquela OS.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, esperarAssentar } = require("./ambiente")

// ------------------------------------------------------------
// (1) detecta exatamente as OS pagas sem transação de entrada
// ------------------------------------------------------------
test("reconciliarLancamentos detecta OS paga sem transação correspondente", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  // OS #81 e #82: pagas, sem transação. OS #83: paga, COM transação (ok).
  window.eval(
    "CACHE.servicos = [" +
      "  { id: 81, titulo: 'Escape 1', status: 'concluido', status_pagamento: 'pago', total: 50, valor_pago: 50 }," +
      "  { id: 82, titulo: 'Escape 2', status: 'concluido', status_pagamento: 'pago', total: 30, valor_pago: 30 }," +
      "  { id: 83, titulo: 'OK', status: 'concluido', status_pagamento: 'pago', total: 20, valor_pago: 20 }" +
      "];" +
      "CACHE.transacoes = [ { id: 1, servico_id: 83, tipo: 'entrada', valor: 20 } ];",
  )

  const lista = JSON.parse(
    window.eval(
      "JSON.stringify(reconciliarLancamentos().map(function(o){return {id:o.id,valor:o.valor};}))",
    ),
  )
  const ids = lista
    .map(function (x) {
      return x.id
    })
    .sort(function (a, b) {
      return a - b
    })
  assert.deepStrictEqual(
    ids,
    [81, 82],
    "deve apontar exatamente as OS 81 e 82 (pagas sem transação)",
  )
  const os81 = lista.find(function (x) {
    return x.id === 81
  })
  assert.strictEqual(os81.valor, 50, "o valor faltante da OS 81 é 50")
})

// ------------------------------------------------------------
// (2) não aponta OS não paga nem OS que já tem lançamento
// ------------------------------------------------------------
test("reconciliarLancamentos ignora OS não paga e OS já com lançamento", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  window.eval(
    "CACHE.servicos = [" +
      "  { id: 90, titulo: 'Pendente', status: 'pendente', status_pagamento: 'pendente', total: 40, valor_pago: 0 }," +
      "  { id: 91, titulo: 'Paga com lançamento', status: 'concluido', status_pagamento: 'pago', total: 60, valor_pago: 60 }" +
      "];" +
      "CACHE.transacoes = [ { id: 5, servico_id: 91, tipo: 'entrada', valor: 60 } ];",
  )
  const qtd = window.eval("reconciliarLancamentos().length")
  assert.strictEqual(qtd, 0, "nenhuma OS faltante nesse cenário")
})

// ------------------------------------------------------------
// (3) uma transação de SAÍDA (estorno) não conta como lançamento de entrada
// ------------------------------------------------------------
test("reconciliarLancamentos não aceita transação de saída como o lançamento faltante", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  window.eval(
    "CACHE.servicos = [ { id: 84, titulo: 'Só saída', status: 'concluido', status_pagamento: 'pago', total: 70, valor_pago: 70 } ];" +
      "CACHE.transacoes = [ { id: 9, servico_id: 84, tipo: 'saida', valor: 70 } ];",
  )
  const ids = JSON.parse(
    window.eval(
      "JSON.stringify(reconciliarLancamentos().map(function(o){return o.id;}))",
    ),
  )
  assert.deepStrictEqual(
    ids,
    [84],
    "a OS 84 tem só uma saída — ainda falta o lançamento de entrada",
  )
})

// ------------------------------------------------------------
// (4) registrarLancamentoFaltante insere a transação que faltava; depois
//     a mesma OS deixa de aparecer na reconciliação.
// ------------------------------------------------------------
test("registrarLancamentoFaltante insere a entrada faltante e a OS some da lista", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  window.eval(
    "SESSAO = { id: 1, usuario: 'teste', nome: 'Teste', perfil: 'admin' };" +
      "CACHE.servicos = [ { id: 81, titulo: 'Escape 1', status: 'concluido', status_pagamento: 'pago', total: 50, valor_pago: 50, forma_pagamento: 'Dinheiro' } ];" +
      "CACHE.transacoes = [];",
  )

  // antes: a OS 81 aparece como faltante
  assert.strictEqual(
    window.eval("reconciliarLancamentos().length"),
    1,
    "antes de corrigir, a OS 81 aparece",
  )

  await window.eval("registrarLancamentoFaltante(81)")
  await esperarAssentar(window)

  // gravou uma transação de entrada com o valor pago da OS
  const inseridas = registro.insert.transacoes || []
  assert.strictEqual(inseridas.length, 1, "inseriu uma transação")
  assert.strictEqual(inseridas[0].servico_id, 81, "ligada à OS 81")
  assert.strictEqual(inseridas[0].tipo, "entrada", "é lançamento de entrada")
  assert.strictEqual(inseridas[0].valor, 50, "valor = valor_pago da OS (50)")

  // simula o recarregamento do CACHE (o app faz carregarTransacoes) e confere
  // que a OS 81 não aparece mais na reconciliação
  window.eval(
    "CACHE.transacoes = [ { id: 1, servico_id: 81, tipo: 'entrada', valor: 50 } ];",
  )
  assert.strictEqual(
    window.eval("reconciliarLancamentos().length"),
    0,
    "após registrar, a OS 81 some da reconciliação",
  )
})
