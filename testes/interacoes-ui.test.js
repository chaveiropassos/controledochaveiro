// ============================================================
// interacoes-ui.test.js — helpers puros extras, cadastros-rápidos por prompt,
// pickers (cliente do PDV / genérico / itens da OS), visualização e baixa de OS,
// e toggle de forma de pagamento. Roda o app REAL no jsdom.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

async function preparar() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  semearProdutos(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

function ultimo(lista) {
  return lista && lista.length ? lista[lista.length - 1] : null
}

// ------------------------------------------------------------
// Helpers puros: fmtNum, moedaInput, moedaBlur, _sqlVal
// ------------------------------------------------------------
test("fmtNum formata número em pt-BR com 2 casas", async function () {
  const { window } = await preparar()
  assert.strictEqual(window.eval("fmtNum(1234.5)"), "1234,50")
  assert.strictEqual(window.eval("fmtNum(0)"), "0,00")
  assert.strictEqual(window.eval("fmtNum('')"), "0,00")
})

test("moedaInput remove tudo que não é dígito/vírgula/ponto", async function () {
  const { window, doc } = await preparar()
  const el = doc.createElement("input")
  el.value = "R$ 1a2,3b4"
  window.__el = el
  window.eval("moedaInput(window.__el)")
  assert.strictEqual(el.value, "12,34")
})

test("moedaBlur formata o campo como 0,00 (e vazio quando 0)", async function () {
  const { window, doc } = await preparar()
  const el = doc.createElement("input")
  window.__el = el
  el.value = "1.234,5"
  window.eval("moedaBlur(window.__el)")
  assert.strictEqual(el.value, "1234,50")
  el.value = ""
  window.eval("moedaBlur(window.__el)")
  assert.strictEqual(el.value, "", "valor 0 vira campo vazio")
})

test("_sqlVal serializa null, número, boolean, texto (com escape) e objeto", async function () {
  const { window } = await preparar()
  assert.strictEqual(window.eval("_sqlVal(null)"), "NULL")
  assert.strictEqual(window.eval("_sqlVal(undefined)"), "NULL")
  assert.strictEqual(window.eval("_sqlVal(42)"), "42")
  assert.strictEqual(window.eval("_sqlVal(true)"), "true")
  assert.strictEqual(window.eval("_sqlVal(false)"), "false")
  assert.strictEqual(window.eval("_sqlVal(\"O'Brien\")"), "'O''Brien'")
  assert.strictEqual(window.eval("_sqlVal({ a: 1 })"), "'{\"a\":1}'")
})

// ------------------------------------------------------------
// modalTemEdicao: detecta campo preenchido dentro de um modal
// ------------------------------------------------------------
test("modalTemEdicao é true só quando há input/textarea preenchido", async function () {
  const { window, doc } = await preparar()
  window.eval("clienteForm()")
  await esperarAssentar(window)
  assert.strictEqual(
    window.eval("modalTemEdicao('modal')"),
    false,
    "form recém-aberto sem digitação não conta como editado",
  )
  doc.getElementById("clNome").value = "Fulano"
  assert.strictEqual(
    window.eval("modalTemEdicao('modal')"),
    true,
    "com um campo preenchido, o modal está 'editado'",
  )
})

// ------------------------------------------------------------
// Cadastros rápidos por prompt (cat/fab/tipo)
// ------------------------------------------------------------
test("catCriarRapido insere categoria com o nome do prompt", async function () {
  const { window, registro } = await preparar()
  window.eval("chaveForm()")
  await esperarAssentar(window)
  window.eval("window.__promptRespostas = ['Cadeados']")
  await window.eval("catCriarRapido()")
  await esperarAssentar(window)
  const dados = ultimo(registro.insert.categorias)
  assert.ok(dados, "deveria ter inserido a categoria")
  assert.strictEqual(dados.nome, "Cadeados")
})

test("catCriarRapido com prompt vazio não insere", async function () {
  const { window, registro } = await preparar()
  window.eval("chaveForm()")
  await esperarAssentar(window)
  window.eval("window.__promptRespostas = ['']")
  await window.eval("catCriarRapido()")
  await esperarAssentar(window)
  assert.ok(
    !registro.insert.categorias || registro.insert.categorias.length === 0,
    "prompt vazio não cria categoria",
  )
})

test("fabCriarRapido insere fabricante com o nome do prompt", async function () {
  const { window, registro } = await preparar()
  window.eval("chaveForm()")
  await esperarAssentar(window)
  window.eval("window.__promptRespostas = ['Yale']")
  await window.eval("fabCriarRapido()")
  await esperarAssentar(window)
  const dados = ultimo(registro.insert.fabricantes)
  assert.ok(dados, "deveria ter inserido o fabricante")
  assert.strictEqual(dados.nome, "Yale")
})

test("tipoCriarRapido insere tipo com chave (slug) e ícone dos prompts", async function () {
  const { window, registro } = await preparar()
  window.eval("chaveForm()")
  await esperarAssentar(window)
  // 1º prompt: rótulo; 2º prompt: ícone
  window.eval("window.__promptRespostas = ['Fechadura Digital', '🔒']")
  await window.eval("tipoCriarRapido()")
  await esperarAssentar(window)
  const dados = ultimo(registro.insert.tipos_produto)
  assert.ok(dados, "deveria ter inserido o tipo")
  assert.strictEqual(dados.rotulo, "Fechadura Digital")
  assert.strictEqual(dados.chave, "fechaduradigital", "chave é o slug do rótulo")
  assert.strictEqual(dados.icone, "🔒")
})

// ------------------------------------------------------------
// Picker de cliente do PDV
// ------------------------------------------------------------
test("pdvCustFilter lista clientes filtrados e pdvCustPick seleciona/limpa", async function () {
  const { window, doc } = await preparar()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  window.eval(
    "CACHE.clientes = [{ id: 1, nome: 'Ana', telefone: '5535999990000' }, { id: 2, nome: 'Bruno', telefone: '5535888887777' }]",
  )
  doc.getElementById("pdvCustSearch").value = "ana"
  window.eval("pdvCustFilter()")
  const box = doc.getElementById("pdvCustResults")
  assert.match(box.innerHTML, /Ana/, "resultado deveria conter Ana")
  assert.doesNotMatch(box.innerHTML, /Bruno/, "Bruno não casa o filtro 'ana'")

  window.eval("pdvCustPick(1)")
  assert.strictEqual(doc.getElementById("pdvCust").value, "1", "cliente selecionado")
  assert.match(doc.getElementById("pdvCustChosen").innerHTML, /Ana/)

  window.eval("pdvCustClear()")
  assert.strictEqual(doc.getElementById("pdvCust").value, "", "limpou a seleção")
})

test("pdvPickFromModal adiciona o produto ao carrinho e fecha o modal", async function () {
  const { window } = await preparar()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  // pagePDV recarrega CACHE.chaves do supabase fake (vazio): re-semeia.
  semearProdutos(window)
  window.eval("PDV_CART = []")
  window.eval("pdvPickFromModal(10)") // id 10 = chave física semeada
  const tam = window.eval("PDV_CART.length")
  const chaveId = window.eval("PDV_CART[0] && PDV_CART[0].chave_id")
  assert.strictEqual(tam, 1, "deveria ter 1 item no carrinho")
  assert.strictEqual(chaveId, 10, "o item é a chave 10")
})

// ------------------------------------------------------------
// Picker genérico + itens/endereço da OS
// ------------------------------------------------------------
test("osForm inicia o picker de cliente e osPreencherEndereco puxa o endereço", async function () {
  const { window, doc } = await preparar()
  window.eval(
    "CACHE.clientes = [{ id: 1, nome: 'Cliente Teste', telefone: '5535999998888', endereco: 'Rua A, 10', bairro: 'Centro', cidade: 'Pouso Alegre', estado: 'MG' }]",
  )
  window.eval("osForm()")
  await esperarAssentar(window)

  // seleciona o cliente pelo picker genérico e preenche o endereço a partir dele
  window.eval("pickerPick('osCliente', 1)")
  assert.strictEqual(doc.getElementById("osClienteVal").value, "1", "cliente da OS selecionado")

  window.eval("osPreencherEndereco(true)")
  const end = doc.getElementById("osEndereco").value
  assert.match(end, /Rua A, 10/, "endereço deveria vir do cliente")
  assert.match(end, /Pouso Alegre - MG/, "cidade/UF no endereço")

  // limpa a seleção do picker
  window.eval("pickerClear('osCliente')")
  assert.strictEqual(doc.getElementById("osClienteVal").value, "", "picker limpo")
})

test("osPreencherEndereco sem cliente selecionado não altera o campo", async function () {
  const { window, doc } = await preparar()
  window.eval("osForm()")
  await esperarAssentar(window)
  doc.getElementById("osEndereco").value = ""
  window.eval("osPreencherEndereco(true)")
  assert.strictEqual(doc.getElementById("osEndereco").value, "", "sem cliente, não preenche")
})

test("osItemFiltrar mostra a lista de produtos que casam o termo", async function () {
  const { window, doc } = await preparar()
  window.eval("osForm()")
  await esperarAssentar(window)
  window.eval("osItemAdd()") // cria a linha 0 (com #osItemResults0)
  window.eval("osItemFiltrar(0, 'Chave')")
  const box = doc.getElementById("osItemResults0")
  assert.ok(box, "deveria existir a caixa de resultados do item 0")
  assert.match(box.innerHTML, /Chave Fisica/, "produto físico deveria aparecer")
  assert.match(box.innerHTML, /item manual/, "opção de item manual sempre presente")
})

// ------------------------------------------------------------
// Visualização e baixa de OS
// ------------------------------------------------------------
test("osView abre o modal com título, total e itens da OS", async function () {
  const { window, doc } = await preparar()
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval(
    "CACHE.servicos = [{ id: 55, titulo: 'Troca de Segredo', tipo: 'residencial', status: 'aberta', status_pagamento: 'pendente', cliente_id: 1, funcionario_id: 1, total: 150, valor_pago: 0, mao_de_obra: 50, itens: [{ descricao: 'Peça X', quantidade: 2, preco_unit: 50, total: 100 }] }]",
  )
  window.eval("osView(55)")
  await esperarAssentar(window)
  const modal = doc.getElementById("modal")
  assert.match(modal.innerHTML, /Troca de Segredo/, "título da OS no modal")
  assert.match(modal.innerHTML, /Peça X/, "item da OS listado")
  assert.match(modal.innerHTML, /TOTAL/, "linha de total presente")
})

test("osDarBaixa marca pago/concluído e lança o saldo no financeiro", async function () {
  const { window, registro } = await preparar()
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  // OS pendente, sem itens físicos (para isolar a baixa financeira).
  window.eval(
    "CACHE.servicos = [{ id: 77, titulo: 'Serviço', tipo: 'residencial', status: 'aberta', status_pagamento: 'pendente', cliente_id: 1, funcionario_id: 1, total: 200, valor_pago: 0, mao_de_obra: 200, forma_pagamento: 'Dinheiro', itens: [] }]",
  )
  await window.eval("osDarBaixa(77)")
  await esperarAssentar(window)

  const upd = ultimo(registro.update.servicos)
  assert.ok(upd, "deveria atualizar a OS")
  assert.strictEqual(upd.status_pagamento, "pago", "pagamento vira 'pago'")
  assert.strictEqual(upd.valor_pago, 200, "valor_pago = total")
  assert.strictEqual(upd.status, "concluido", "OS ainda não concluída passa a concluída")

  const tx = ultimo(registro.insert.transacoes)
  assert.ok(tx, "deveria lançar transação de entrada do saldo")
  assert.strictEqual(tx.tipo, "entrada")
  assert.strictEqual(tx.valor, 200, "saldo recebido = 200")
})

// ------------------------------------------------------------
// Forma de pagamento: toggle ativo/inativo
// ------------------------------------------------------------
test("formaPagToggle atualiza o campo ativo da forma de pagamento", async function () {
  const { window, registro } = await preparar()
  await window.eval("formaPagToggle(3, false)")
  await esperarAssentar(window)
  const dados = ultimo(registro.update.formas_pagamento)
  assert.ok(dados, "deveria atualizar formas_pagamento")
  assert.strictEqual(dados.ativo, false, "forma inativada grava ativo=false")
})
