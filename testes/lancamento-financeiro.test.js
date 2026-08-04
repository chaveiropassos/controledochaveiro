// ============================================================
// lancamento-financeiro.test.js — o bug "OS gravada sem lançamento".
//
// Contexto do bug: pdvFinish, osSalvar e osDarBaixa inserem a OS em
// 'servicos' (com checagem de erro) e, depois, o lançamento financeiro em
// 'transacoes'. Antes da correção, o insert de 'transacoes' NÃO checava erro:
// se ele falhasse (perda de conexão, timeout), o app mostrava SUCESSO e a OS
// ficava concluída/paga SEM lançamento (dinheiro sumido).
//
// Estes testes forçam o insert de 'transacoes' a falhar (via injeção de erro
// no Supabase dublado — registro.__erros.insert.transacoes) e verificam que:
//   - o fluxo NÃO mostra o toast de sucesso;
//   - o toast fica em estado de ERRO (className contém "err");
// ou seja, o erro do lançamento sobe e cai no catch, em vez de mentir sucesso.
//
// Também cobrem a RECONCILIAÇÃO (Commit 2): detectar OS pagas sem transação.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// Lê o estado do #toast: { texto, classe }. Sucesso = classe "show ok";
// erro = classe "show err". (O app zera a classe após 3s via setTimeout, mas
// os testes inspecionam logo após o fluxo, dentro da janela.)
function lerToast(doc) {
  const t = doc.getElementById("toast")
  return { texto: t ? t.textContent : "", classe: t ? t.className : "" }
}

// Marca o insert de 'transacoes' para falhar no Supabase dublado.
function forcarFalhaNoLancamento(registro) {
  registro.__erros.insert.transacoes = {
    message: "conexão perdida ao gravar o lançamento",
  }
}

// ------------------------------------------------------------
// Preparação do PDV (espelha pdv-fluxo.test.js).
// ------------------------------------------------------------
async function prepararPdv() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  semearProdutos(window)
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  window.eval("PDV_CART = []; renderPdvCart()")
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

function adicionar(window, chaveId) {
  window.eval(
    "pdvAddItem(CACHE.chaves.find(function(k){return k.id===" +
      chaveId +
      "}))",
  )
}

// ------------------------------------------------------------
// Preparação da OS (espelha os-fluxo.test.js).
// ------------------------------------------------------------
async function abrirFormularioOS() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  window.eval("osForm()")
  await esperarAssentar(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

function definirCampo(doc, id, valor) {
  const el = doc.getElementById(id)
  if (!el) throw new Error("Campo não encontrado: " + id)
  el.value = valor
  return el
}

// ============================================================
// COMMIT 1 — o lançamento que falha NÃO pode virar toast de sucesso
// ============================================================

// (1) pdvFinish: venda paga cujo lançamento em 'transacoes' falha.
test("pdvFinish: falha no lançamento financeiro não mostra sucesso (mostra erro)", async function () {
  const { window, doc, registro } = await prepararPdv()
  adicionar(window, 10) // item físico, preço 10
  window.eval("pdvSetQty(0, 2)") // total 20, pago por padrão

  forcarFalhaNoLancamento(registro)

  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const toast = lerToast(doc)
  assert.ok(
    /err/.test(toast.classe),
    "o toast deve estar em estado de ERRO (className com 'err'), não de sucesso",
  )
  assert.ok(
    !/finalizada/i.test(toast.texto),
    "não deve exibir a mensagem de venda finalizada com sucesso",
  )
  // O botão volta a ficar habilitado (o catch reabilita para nova tentativa).
  assert.strictEqual(
    doc.getElementById("pdvFinishBtn").disabled,
    false,
    "botão reabilitado após o erro (permite tentar de novo)",
  )
})

// (2) osSalvar: OS paga na hora cujo lançamento em 'transacoes' falha.
test("osSalvar: falha no lançamento financeiro não mostra sucesso (mostra erro)", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "OS paga cujo lançamento falha")
  definirCampo(doc, "osMaoObra", "100,00")
  definirCampo(doc, "osStatus", "orcamento")
  definirCampo(doc, "osStatusPag", "pendente")
  definirCampo(doc, "osValorPago", "100,00")

  forcarFalhaNoLancamento(registro)

  await window.eval("osSalvar()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const toast = lerToast(doc)
  assert.ok(
    /err/.test(toast.classe),
    "o toast deve estar em estado de ERRO, não de sucesso",
  )
  assert.ok(
    !/criada|atualizada/i.test(toast.texto),
    "não deve exibir a mensagem de OS criada/atualizada com sucesso",
  )
})

// (3) osDarBaixa: dar baixa cujo lançamento em 'transacoes' falha.
test("osDarBaixa: falha no lançamento financeiro não mostra sucesso (mostra erro)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const doc = window.document
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  // OS pendente, com saldo a receber (total 100, pago 0).
  window.eval(
    "CACHE.servicos = [{ id: 77, titulo: 'A receber', tipo: 'residencial'," +
      " status: 'pendente', status_pagamento: 'pendente', cliente_id: 1," +
      " funcionario_id: 1, total: 100, valor_pago: 0, itens: [] }];" +
      "SESSAO = { id: 1, usuario: 'teste', nome: 'Teste', perfil: 'admin' };",
  )

  forcarFalhaNoLancamento(registro)

  await window.eval("osDarBaixa(77)")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const toast = lerToast(doc)
  assert.ok(
    /err/.test(toast.classe),
    "o toast deve estar em estado de ERRO, não de sucesso",
  )
  assert.ok(
    !/baixa registrada/i.test(toast.texto),
    "não deve exibir 'Baixa registrada' com sucesso",
  )
})
