// ============================================================
// render-branches.test.js — ramos de lógica de negócio ainda não exercidos:
// listagem de OS com dados e filtros, PDV com múltiplos matches (modal de
// seleção) e baixa de OS com item físico (loop de estoque). App REAL no jsdom.
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

function movsDaChave(registro, chaveId) {
  return (registro.insert.movimentacoes || []).filter((m) => m && m.chave_id == chaveId)
}

// ------------------------------------------------------------
// renderServicos: com dados, monta a tabela; o filtro de status reduz a lista
// ------------------------------------------------------------
test("renderServicos monta a tabela e o filtro de status reduz a lista", async function () {
  const { window, doc } = await preparar()
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval(
    "CACHE.servicos = [" +
      "{ id: 1, titulo: 'Aberta A', tipo: 'residencial', status: 'aberta', status_pagamento: 'pendente', cliente_id: 1, funcionario_id: 1, total: 100, criado_em: '2026-01-01T10:00:00Z' }," +
      "{ id: 2, titulo: 'Concluída B', tipo: 'residencial', status: 'concluido', status_pagamento: 'pago', cliente_id: 1, funcionario_id: 1, total: 200, criado_em: '2026-01-02T10:00:00Z' }" +
      "]",
  )
  window.eval("renderServicos()")
  let lista = doc.getElementById("osList")
  assert.match(lista.innerHTML, /Aberta A/, "OS aberta listada")
  assert.match(lista.innerHTML, /Concluída B/, "OS concluída listada")
  // botão de baixa aparece só para pagamento pendente/fiado/parcial
  assert.match(lista.innerHTML, /Baixa/, "OS pendente tem botão de baixa")

  // aplica filtro de status = concluido
  doc.getElementById("osFiltroStatus").value = "concluido"
  window.eval("renderServicos()")
  lista = doc.getElementById("osList")
  assert.doesNotMatch(lista.innerHTML, /Aberta A/, "filtro concluido esconde a aberta")
  assert.match(lista.innerHTML, /Concluída B/, "filtro concluido mantém a concluída")
})

test("renderServicos sem resultados após busca mostra 'Nenhuma OS'", async function () {
  const { window, doc } = await preparar()
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval(
    "CACHE.servicos = [{ id: 1, titulo: 'X', tipo: 'residencial', status: 'aberta', status_pagamento: 'pendente', cliente_id: 1, funcionario_id: 1, total: 1 }]",
  )
  doc.getElementById("osBusca").value = "termo-que-nao-existe"
  window.eval("renderServicos()")
  assert.match(doc.getElementById("osList").innerHTML, /Nenhuma OS/, "lista vazia após busca")
})

// ------------------------------------------------------------
// pdvScan: mais de um match abre o modal de seleção
// ------------------------------------------------------------
test("pdvScan com múltiplos matches abre o modal de seleção de chave", async function () {
  const { window, doc } = await preparar()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  // dois produtos cujo termo aparece na descrição
  window.eval(
    "CACHE.chaves = [" +
      "{ id: 1, codigo: 'K1', descricao: 'Chave Tetra Grande', preco_venda: 10, estoque: 2, tipo_produto: 'chave', fabricante_id: 1 }," +
      "{ id: 2, codigo: 'K2', descricao: 'Chave Tetra Pequena', preco_venda: 12, estoque: 5, tipo_produto: 'chave', fabricante_id: 1 }" +
      "]",
  )
  doc.getElementById("pdvCode").value = "Tetra"
  window.eval("pdvScan()")
  const modal = doc.getElementById("modal")
  assert.match(modal.innerHTML, /chaves encontradas/i, "abre modal com múltiplos matches")
  assert.match(modal.innerHTML, /Chave Tetra Grande/)
  assert.match(modal.innerHTML, /Chave Tetra Pequena/)
})

test("pdvScan com código inexistente não adiciona nada ao carrinho", async function () {
  const { window, doc } = await preparar()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  semearProdutos(window)
  window.eval("PDV_CART = []")
  doc.getElementById("pdvCode").value = "CODIGO-INEXISTENTE-XYZ"
  window.eval("pdvScan()")
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "nada adicionado para código inexistente")
})

// ------------------------------------------------------------
// osDarBaixa: OS ainda não concluída com item físico baixa o estoque
// ------------------------------------------------------------
test("osDarBaixa de OS pendente com item físico gera movimentação de saída", async function () {
  const { window, registro } = await preparar()
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  window.eval(
    "CACHE.servicos = [{ id: 88, titulo: 'Com peça', tipo: 'residencial', status: 'aberta', status_pagamento: 'pendente', cliente_id: 1, funcionario_id: 1, total: 100, valor_pago: 0, mao_de_obra: 0, forma_pagamento: 'Dinheiro', itens: [{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 2, preco_unit: 10 }] }]",
  )
  await window.eval("osDarBaixa(88)")
  await esperarAssentar(window)

  const mov = ultimo(movsDaChave(registro, 10))
  assert.ok(mov, "deveria gerar movimentação para a peça física")
  assert.strictEqual(mov.tipo, "saida", "movimentação é de saída")
  assert.strictEqual(mov.quantidade, 2, "baixa a quantidade do item")

  const upd = ultimo(registro.update.servicos)
  assert.strictEqual(upd.status, "concluido", "OS pendente passa a concluída na baixa")
})
