// ============================================================
// pdv-fluxo.test.js — cobertura do fluxo de PDV (Ponto de Venda / Venda Rápida)
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom, com o
// Supabase dublado que REGISTRA as escritas (insert/update) por tabela.
// Assim afirmamos comportamento OBSERVÁVEL: total no #pdvTotal, conteúdo do
// carrinho (PDV_CART e HTML do #pdvCartBody) e o que foi gravado no Supabase.
//
// Funções cobertas: pdvAddItem, pdvSetQty, pdvSetPreco, pdvRemove,
// pdvDescontoValor, renderPdvCart, pdvClear, pdvFinish, pdvScan.
//
// Como CACHE/SESSAO/PDV_CART são `let` de topo do <script>, não são
// propriedades de window — lemos/escrevemos via window.eval (mesmo escopo).
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// Formata igual ao app: "R$ 12,34" (2 casas, vírgula decimal).
function formatoReais(valor) {
  return "R$ " + parseFloat(valor || 0).toFixed(2).replace(".", ",")
}

// Monta o app já semeado (cache + produtos) e com a página PDV renderizada,
// devolvendo o essencial para os testes.
async function prepararPdv() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  semearProdutos(window)
  // renderiza a tela do PDV; os ids (pdvCartBody, pdvTotal, ...) passam a existir.
  // pagePDV() chama carregarChaves()/carregarClientes(), que com o Supabase
  // dublado (data vazio) sobrescrevem o CACHE — por isso re-semeamos DEPOIS.
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  // garante carrinho limpo entre montagens (o PDV_CART é módulo-global)
  window.eval("PDV_CART = []; renderPdvCart()")
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

// Adiciona ao carrinho o produto do CACHE com o id informado.
function adicionar(window, chaveId) {
  window.eval(
    "pdvAddItem(CACHE.chaves.find(function(k){return k.id===" +
      chaveId +
      "}))",
  )
}

// Lê o texto atual do total exibido.
function textoTotal(doc) {
  return doc.getElementById("pdvTotal").textContent
}

// ------------------------------------------------------------
// (1) pdvAddItem duas vezes o MESMO produto → soma quantidade (1 linha, qtd 2).
// ------------------------------------------------------------
test("pdvAddItem do mesmo produto duas vezes soma a quantidade (não duplica a linha)", async function () {
  const { window } = await prepararPdv()
  adicionar(window, 10)
  adicionar(window, 10)

  const tamanho = window.eval("PDV_CART.length")
  const quantidade = window.eval("PDV_CART[0].quantidade")
  assert.strictEqual(tamanho, 1, "deve haver uma única linha para o mesmo produto")
  assert.strictEqual(quantidade, 2, "a quantidade deve somar para 2")
})

// ------------------------------------------------------------
// (2) pdvAddItem de dois produtos diferentes → 2 linhas; total = soma correta.
// ------------------------------------------------------------
test("pdvAddItem de dois produtos diferentes cria 2 linhas e soma o total corretamente", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // preço 10
  adicionar(window, 11) // preço 5

  assert.strictEqual(window.eval("PDV_CART.length"), 2, "duas linhas distintas")
  assert.strictEqual(
    textoTotal(doc),
    formatoReais(15),
    "total = 10 + 5 = R$ 15,00",
  )
})

// ------------------------------------------------------------
// (3) pdvSetQty: <1 vira 1; string numérica funciona; total recalcula.
// ------------------------------------------------------------
test("pdvSetQty: valor <1 vira 1, aceita string numérica e recalcula o total", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // preço 10

  // string numérica "3" → quantidade 3, total 30
  window.eval("pdvSetQty(0, '3')")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 3, "aceita string '3'")
  assert.strictEqual(textoTotal(doc), formatoReais(30), "total recalcula para 30")

  // valor abaixo de 1 é normalizado para 1
  window.eval("pdvSetQty(0, 0)")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 1, "0 vira 1")
  assert.strictEqual(textoTotal(doc), formatoReais(10), "total volta para 10")

  // negativo também vira 1
  window.eval("pdvSetQty(0, -5)")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 1, "negativo vira 1")
})

// ------------------------------------------------------------
// (4) pdvSetPreco: negativo vira 0; recalcula o total.
// ------------------------------------------------------------
test("pdvSetPreco: preço negativo vira 0 e recalcula o total", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // preço 10

  window.eval("pdvSetPreco(0, -3)")
  assert.strictEqual(window.eval("PDV_CART[0].preco_unit"), 0, "negativo vira 0")
  assert.strictEqual(textoTotal(doc), formatoReais(0), "total zera")

  // valor válido volta a somar
  window.eval("pdvSetPreco(0, 7.5)")
  assert.strictEqual(window.eval("PDV_CART[0].preco_unit"), 7.5, "aceita 7,50")
  assert.strictEqual(textoTotal(doc), formatoReais(7.5), "total recalcula para 7,50")
})

// ------------------------------------------------------------
// (5) pdvRemove remove a linha certa.
// ------------------------------------------------------------
test("pdvRemove remove a linha certa do carrinho", async function () {
  const { window } = await prepararPdv()
  adicionar(window, 10) // índice 0
  adicionar(window, 11) // índice 1
  adicionar(window, 20) // índice 2

  // remove o do meio (índice 1 = produto 11)
  window.eval("pdvRemove(1)")
  assert.strictEqual(window.eval("PDV_CART.length"), 2, "restam 2 linhas")
  const ids = window.eval("PDV_CART.map(function(it){return it.chave_id}).join(',')")
  assert.strictEqual(ids, "10,20", "sobram exatamente os produtos 10 e 20")
})

// ------------------------------------------------------------
// (6) pdvDescontoValor: reais e pct; nunca passa do subtotal; negativo vira 0.
// ------------------------------------------------------------
test("pdvDescontoValor: reais e pct, limitado ao subtotal e negativo vira 0", async function () {
  const { window, doc } = await prepararPdv()

  // desconto em REAIS
  doc.getElementById("pdvDescTipo").value = "reais"
  doc.getElementById("pdvDesc").value = "4"
  assert.strictEqual(
    window.eval("pdvDescontoValor(20)"),
    4,
    "R$ 4 de desconto sobre subtotal 20",
  )

  // desconto em PORCENTAGEM
  doc.getElementById("pdvDescTipo").value = "pct"
  doc.getElementById("pdvDesc").value = "10"
  assert.strictEqual(
    window.eval("pdvDescontoValor(200)"),
    20,
    "10% de 200 = 20",
  )

  // desconto nunca passa do subtotal
  doc.getElementById("pdvDescTipo").value = "reais"
  doc.getElementById("pdvDesc").value = "999"
  assert.strictEqual(
    window.eval("pdvDescontoValor(30)"),
    30,
    "desconto é limitado ao subtotal (30)",
  )

  // negativo vira 0
  doc.getElementById("pdvDesc").value = "-5"
  assert.strictEqual(
    window.eval("pdvDescontoValor(50)"),
    0,
    "desconto negativo vira 0",
  )
})

// ------------------------------------------------------------
// (6b) Integração do desconto no total via renderPdvCart.
// ------------------------------------------------------------
test("desconto em reais desce o total exibido no #pdvTotal", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // 10
  adicionar(window, 11) // 5  → subtotal 15

  doc.getElementById("pdvDescTipo").value = "reais"
  doc.getElementById("pdvDesc").value = "5"
  window.eval("renderPdvCart()")

  assert.strictEqual(textoTotal(doc), formatoReais(10), "15 − 5 = R$ 10,00")
  const info = doc.getElementById("pdvDescInfo").textContent
  assert.ok(/desconto/.test(info), "a linha de desconto aparece no #pdvDescInfo")
})

// ------------------------------------------------------------
// (7) renderPdvCart com carrinho vazio: "Nenhum item" e botão finalizar disabled.
// ------------------------------------------------------------
test("carrinho vazio mostra 'Nenhum item' e desabilita o botão Finalizar", async function () {
  const { window, doc } = await prepararPdv()
  // carrinho já vem vazio de prepararPdv()
  const html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/Nenhum item/i.test(html), "mensagem de carrinho vazio presente")
  assert.strictEqual(
    doc.getElementById("pdvFinishBtn").disabled,
    true,
    "botão Finalizar desabilitado com carrinho vazio",
  )

  // ao adicionar um item, o botão volta a ficar habilitado
  adicionar(window, 10)
  assert.strictEqual(
    doc.getElementById("pdvFinishBtn").disabled,
    false,
    "botão Finalizar habilita quando há item",
  )
})

// ------------------------------------------------------------
// (8) renderPdvCart: aviso de estoque quando qtd > estoque; sem aviso quando dentro.
// ------------------------------------------------------------
test("renderPdvCart: mostra ⚠️ quando quantidade excede o estoque e 'estoque:' sem aviso quando dentro", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // estoque 3

  // dentro do estoque (qtd 2 <= 3): sem aviso
  window.eval("pdvSetQty(0, 2)")
  let html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/estoque:/.test(html), "mostra o texto 'estoque:'")
  assert.ok(!/⚠️/.test(html), "sem aviso ⚠️ quando dentro do estoque")

  // acima do estoque (qtd 5 > 3): aviso ⚠️
  window.eval("pdvSetQty(0, 5)")
  html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/⚠️/.test(html), "mostra aviso ⚠️ quando excede o estoque")
})

// ------------------------------------------------------------
// (9) pdvFinish: insere a venda em 'servicos' e movimenta 'saida' p/ item físico.
// ------------------------------------------------------------
test("pdvFinish insere a venda em 'servicos' e registra movimentação de saída para item físico", async function () {
  const { window, doc, registro } = await prepararPdv()
  adicionar(window, 10) // item físico, estoque 3, preço 10
  window.eval("pdvSetQty(0, 2)") // 2 unidades → total 20

  // pdvFinish é async — aguardamos a promessa e o assentamento dos awaits internos.
  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  // 1) venda gravada na tabela 'servicos'
  const vendas = registro.insert.servicos || []
  assert.strictEqual(vendas.length, 1, "uma venda inserida em 'servicos'")
  assert.strictEqual(vendas[0].is_pdv, true, "marcada como venda de PDV")
  assert.strictEqual(vendas[0].total, 20, "total da venda = 20")

  // 2) movimentação de saída para o item físico (chave_id 10)
  const movs = (registro.insert.movimentacoes || []).filter(function (m) {
    return m && m.chave_id == 10
  })
  assert.strictEqual(movs.length, 1, "uma movimentação para a chave 10")
  assert.strictEqual(movs[0].tipo, "saida", "movimentação é de saída")
  assert.strictEqual(movs[0].quantidade, 2, "baixa 2 unidades")

  // 3) update de estoque da chave (3 − 2 = 1)
  const updates = registro.update.chaves || []
  assert.ok(
    updates.some(function (u) {
      return u && u.estoque === 1
    }),
    "estoque atualizado para 1",
  )

  // 4) financeiro lançado (venda paga por padrão → transacoes)
  const transacoes = registro.insert.transacoes || []
  assert.strictEqual(transacoes.length, 1, "uma transação de entrada lançada")
  assert.strictEqual(transacoes[0].valor, 20, "valor da transação = 20")

  // 5) o carrinho é esvaziado após finalizar
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "carrinho zerado após venda")
})

// ------------------------------------------------------------
// (10) pdvClear zera o carrinho (confirm dublado como true).
// ------------------------------------------------------------
test("pdvClear zera o carrinho (confirm dublado como true)", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10)
  adicionar(window, 11)
  assert.strictEqual(window.eval("PDV_CART.length"), 2, "carrinho com 2 itens antes")

  window.eval("pdvClear()")
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "carrinho vazio depois")
  const html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/Nenhum item/i.test(html), "volta a mostrar 'Nenhum item'")
})

// ------------------------------------------------------------
// (11) pdvScan: bipar o mesmo código adiciona/soma no carrinho.
// ------------------------------------------------------------
test("pdvScan encontra o produto pelo código e sucessivos bips somam a quantidade", async function () {
  const { window, doc } = await prepararPdv()
  const input = doc.getElementById("pdvCode")

  input.value = "CH1"
  window.eval("pdvScan()")
  assert.strictEqual(window.eval("PDV_CART.length"), 1, "um item após primeiro bip")

  // bipa o mesmo código de novo → soma a quantidade (não cria linha nova)
  input.value = "CH1"
  window.eval("pdvScan()")
  assert.strictEqual(window.eval("PDV_CART.length"), 1, "continua uma linha")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 2, "quantidade somou para 2")
})
