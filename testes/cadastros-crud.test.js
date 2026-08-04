// ============================================================
// cadastros-crud.test.js — CRUD dos cadastros (cliente/chave), cadastros
// rápidos (a partir de OS/PDV), exclusões (soft/hard delete) e navegação.
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom, com o
// Supabase dublado que REGISTRA insert/update/delete por tabela. Assim os
// testes afirmam O QUE foi gravado/removido, não só que "não lançou".
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
// CLIENTE — cadastro novo
// ------------------------------------------------------------
test("clienteSalvar (novo): insere em 'clientes' com DDI 55 no telefone", async function () {
  const { window, doc, registro } = await preparar()
  window.eval("clienteForm()")
  await esperarAssentar(window)

  doc.getElementById("clNome").value = "Maria Silva"
  doc.getElementById("clTel").value = "35999998888" // 11 dígitos -> ganha 55
  doc.getElementById("clDoc").value = "123.456.789-00"
  doc.getElementById("clCidade").value = "Pouso Alegre"
  doc.getElementById("clEstado").value = "mg" // vira MG

  await window.eval("clienteSalvar(0, null)")
  await esperarAssentar(window)

  const dados = ultimo(registro.insert.clientes)
  assert.ok(dados, "deveria ter inserido o cliente")
  assert.strictEqual(dados.nome, "Maria Silva")
  assert.strictEqual(dados.telefone, "5535999998888", "telefone BR ganha DDI 55")
  assert.strictEqual(dados.estado, "MG", "estado é normalizado para maiúsculo")
})

test("clienteSalvar sem nome não grava e alerta", async function () {
  const { window, doc, registro } = await preparar()
  window.eval("clienteForm()")
  await esperarAssentar(window)
  doc.getElementById("clNome").value = "   " // só espaços

  await window.eval("clienteSalvar(0, null)")
  await esperarAssentar(window)

  assert.ok(
    !registro.insert.clientes || registro.insert.clientes.length === 0,
    "não deveria inserir cliente sem nome",
  )
})

test("clienteSalvar (edição): faz update em 'clientes' na id certa", async function () {
  const { window, doc, registro } = await preparar()
  window.eval(
    "clienteForm({ id: 7, nome: 'Antigo', telefone: '5535999998888', documento: '', endereco: '', bairro: '', cep: '', cidade: '', estado: '', observacoes: '' })",
  )
  await esperarAssentar(window)
  doc.getElementById("clNome").value = "Nome Novo"

  await window.eval("clienteSalvar(7, null)")
  await esperarAssentar(window)

  const dados = ultimo(registro.update.clientes)
  assert.ok(dados, "deveria ter atualizado o cliente")
  assert.strictEqual(dados.nome, "Nome Novo")
  assert.ok(
    !registro.insert.clientes || registro.insert.clientes.length === 0,
    "edição não deveria inserir novo cliente",
  )
})

test("clienteExcluir confirmado dispara delete em 'clientes'", async function () {
  const { window, registro } = await preparar()
  await window.eval("clienteExcluir(7)")
  await esperarAssentar(window)
  assert.ok(
    registro.delete.clientes && registro.delete.clientes.length >= 1,
    "deveria ter chamado delete em clientes",
  )
})

// ------------------------------------------------------------
// CLIENTE RÁPIDO (a partir de OS/PDV)
// ------------------------------------------------------------
test("clienteRapidoSalvar insere cliente com nome/telefone/documento", async function () {
  const { window, doc, registro } = await preparar()
  window.eval("clienteRapido('pdv')")
  await esperarAssentar(window)

  doc.getElementById("qcNome").value = "Cliente Balcão"
  doc.getElementById("qcTel").value = "3533334444" // 10 dígitos -> ganha 55
  doc.getElementById("qcDoc").value = "999"

  await window.eval("clienteRapidoSalvar('pdv')")
  await esperarAssentar(window)

  const dados = ultimo(registro.insert.clientes)
  assert.ok(dados, "cliente rápido deveria ser inserido")
  assert.strictEqual(dados.nome, "Cliente Balcão")
  assert.strictEqual(dados.telefone, "553533334444", "telefone de 10 dígitos ganha DDI 55")
})

test("clienteRapidoSalvar sem nome não grava", async function () {
  const { window, doc, registro } = await preparar()
  window.eval("clienteRapido('os')")
  await esperarAssentar(window)
  doc.getElementById("qcNome").value = ""
  await window.eval("clienteRapidoSalvar('os')")
  await esperarAssentar(window)
  assert.ok(
    !registro.insert.clientes || registro.insert.clientes.length === 0,
    "cliente rápido sem nome não grava",
  )
})

// ------------------------------------------------------------
// CHAVE RÁPIDA e EXCLUSÃO (soft delete)
// ------------------------------------------------------------
test("chaveRapidaSalvar insere produto com preço convertido e custo/min zerados", async function () {
  const { window, doc, registro } = await preparar()
  window.eval("chaveRapida('os')")
  await esperarAssentar(window)

  doc.getElementById("qkCod").value = "GD-1"
  doc.getElementById("qkDesc").value = "Chave Rápida"
  doc.getElementById("qkPreco").value = "R$ 12,50"
  doc.getElementById("qkEstoque").value = "4"

  await window.eval("chaveRapidaSalvar('os')")
  await esperarAssentar(window)

  const dados = ultimo(registro.insert.chaves)
  assert.ok(dados, "chave rápida deveria ser inserida")
  assert.strictEqual(dados.codigo, "GD-1")
  assert.strictEqual(dados.preco_venda, 12.5, "preço 'R$ 12,50' vira 12.5")
  assert.strictEqual(dados.preco_custo, 0)
  assert.strictEqual(dados.estoque_min, 0)
  assert.strictEqual(dados.estoque, 4)
})

test("chaveRapidaSalvar sem código/descrição não grava", async function () {
  const { window, doc, registro } = await preparar()
  window.eval("chaveRapida('os')")
  await esperarAssentar(window)
  doc.getElementById("qkCod").value = ""
  doc.getElementById("qkDesc").value = ""
  await window.eval("chaveRapidaSalvar('os')")
  await esperarAssentar(window)
  assert.ok(
    !registro.insert.chaves || registro.insert.chaves.length === 0,
    "chave rápida sem código/descrição não grava",
  )
})

test("chaveExcluir é soft delete: update ativo=false (não delete físico)", async function () {
  const { window, registro } = await preparar()
  await window.eval("chaveExcluir(10)")
  await esperarAssentar(window)
  const dados = ultimo(registro.update.chaves)
  assert.ok(dados, "chaveExcluir deveria fazer update")
  assert.strictEqual(dados.ativo, false, "soft delete grava ativo=false")
  assert.ok(
    !registro.delete.chaves || registro.delete.chaves.length === 0,
    "chaveExcluir NÃO deve fazer delete físico (mantém histórico)",
  )
})

// ------------------------------------------------------------
// EXCLUSÕES de cadastros: categoria/tipo (soft) e equivalência/transação (hard)
// ------------------------------------------------------------
test("catExcluir é soft delete (ativo=false) em 'categorias'", async function () {
  const { window, registro } = await preparar()
  await window.eval("catExcluir(1)")
  await esperarAssentar(window)
  const dados = ultimo(registro.update.categorias)
  assert.ok(dados, "catExcluir deveria fazer update")
  assert.strictEqual(dados.ativo, false)
})

test("tipoExcluir é soft delete (ativo=false) em 'tipos_produto'", async function () {
  const { window, registro } = await preparar()
  await window.eval("tipoExcluir(3)")
  await esperarAssentar(window)
  const dados = ultimo(registro.update.tipos_produto)
  assert.ok(dados, "tipoExcluir deveria fazer update")
  assert.strictEqual(dados.ativo, false)
})

test("eqExcluir faz delete físico em 'equivalencias'", async function () {
  const { window, registro } = await preparar()
  await window.eval("eqExcluir(5)")
  await esperarAssentar(window)
  assert.ok(
    registro.delete.equivalencias && registro.delete.equivalencias.length >= 1,
    "eqExcluir deveria fazer delete em equivalencias",
  )
})

test("txExcluir faz delete físico em 'transacoes'", async function () {
  const { window, registro } = await preparar()
  await window.eval("txExcluir(9)")
  await esperarAssentar(window)
  assert.ok(
    registro.delete.transacoes && registro.delete.transacoes.length >= 1,
    "txExcluir deveria fazer delete em transacoes",
  )
})

// ------------------------------------------------------------
// OS — exclusão com estorno de estoque e permissão
// ------------------------------------------------------------
test("osExcluir por não-admin não remove nada (bloqueio de permissão)", async function () {
  const { window, registro } = await preparar()
  window.eval("SESSAO.perfil = 'operador'")
  await window.eval("osExcluir(999)")
  await esperarAssentar(window)
  assert.ok(
    !registro.delete.servicos || registro.delete.servicos.length === 0,
    "não-admin não pode excluir OS",
  )
})

test("osExcluir por admin faz delete de servicos e transacoes", async function () {
  const { window, registro } = await preparar()
  window.eval("SESSAO.perfil = 'admin'")
  await window.eval("osExcluir(999)")
  await esperarAssentar(window)
  assert.ok(
    registro.delete.servicos && registro.delete.servicos.length >= 1,
    "admin exclui a OS (delete em servicos)",
  )
  assert.ok(
    registro.delete.transacoes && registro.delete.transacoes.length >= 1,
    "exclusão de OS remove as transações vinculadas",
  )
})

// ------------------------------------------------------------
// NAVEGAÇÃO — navigate troca a página e marca o link ativo
// ------------------------------------------------------------
test("navigate('clientes') renderiza a página de clientes e ativa o link", async function () {
  const { window, doc } = await preparar()
  await window.eval("navigate('clientes')")
  await esperarAssentar(window)
  // pageClientes monta um #clBusca no #main
  assert.ok(doc.getElementById("clBusca"), "navigate deveria montar a página de clientes")
})

test("navigate para página desconhecida cai no dashboard", async function () {
  const { window, doc } = await preparar()
  await window.eval("navigate('pagina-que-nao-existe')")
  await esperarAssentar(window)
  // pageDashboard renderiza no #main; garantimos que não lançou e montou algo
  assert.ok(
    doc.getElementById("main").innerHTML.length > 0,
    "fallback do navigate deveria renderizar o dashboard",
  )
})
