// ============================================================
// misc-render-ativacao.test.js — trechos residuais: célula "—" da tabela de
// equivalências (cel), remoção de foto do produto, tela "sem conexão" e cópia
// do código de ativação. App REAL no jsdom.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, semearCache, esperarAssentar } = require("./ambiente")

async function preparar() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  return { window: window, doc: window.document }
}

// ------------------------------------------------------------
// renderEquivalencias -> helper `cel` (célula com "—" quando vazio)
// ------------------------------------------------------------
test("renderEquivalencias usa cel: valor preenchido aparece, vazio vira '—'", async function () {
  const { window, doc } = await preparar()
  await window.eval("pageEquivalencias()")
  await esperarAssentar(window)
  window.eval(
    "CACHE.equivalencias = [{ id: 1, marca: 'Yale', modelo: 'Y100', dovale: 'D1', gold: '', land: '', jas: '' }]",
  )
  window.eval("renderEquivalencias()")
  const lista = doc.getElementById("eqList")
  assert.match(lista.innerHTML, /Yale/, "marca preenchida aparece")
  assert.match(lista.innerHTML, /D1/, "campo dovale preenchido aparece")
  assert.match(lista.innerHTML, /—/, "campo vazio (gold/land/jas) vira travessão —")
})

// ------------------------------------------------------------
// chaveRemoverImg: zera a foto pendente e esconde preview/botão
// ------------------------------------------------------------
test("chaveRemoverImg marca imagem pendente como '' e esconde o preview", async function () {
  const { window, doc } = await preparar()
  window.eval("chaveForm()")
  await esperarAssentar(window)
  // simula uma foto no preview
  const prev = doc.getElementById("chImgPreview")
  if (prev) {
    prev.src = "data:image/png;base64,AAAA"
    prev.style.display = ""
  }
  window.eval("chaveRemoverImg()")
  assert.strictEqual(window.eval("_chImagemPendente"), "", "imagem pendente vira '' (remover)")
  if (prev) assert.strictEqual(prev.style.display, "none", "preview escondido")
  const rm = doc.getElementById("chImgRemover")
  if (rm) assert.strictEqual(rm.style.display, "none", "botão remover escondido")
})

// ------------------------------------------------------------
// mostrarTelaSemConexao: mostra a tela dedicada e esconde as demais
// ------------------------------------------------------------
test("mostrarTelaSemConexao exibe a tela de sem conexão e esconde login/app", async function () {
  const { window, doc } = await preparar()
  window.eval("mostrarTelaSemConexao()")
  assert.strictEqual(
    doc.getElementById("semConexaoScreen").style.display,
    "flex",
    "tela sem conexão visível",
  )
  assert.strictEqual(
    doc.getElementById("loginScreen").style.display,
    "none",
    "login escondido",
  )
  assert.ok(
    !doc.getElementById("app").classList.contains("show"),
    "app não visível",
  )
})

// ------------------------------------------------------------
// copiarCodigoAtiv: seleciona o código e mostra o aviso de copiado
// ------------------------------------------------------------
test("copiarCodigoAtiv seleciona o código e mostra confirmação de cópia", async function () {
  const { window, doc } = await preparar()
  const campo = doc.getElementById("ativCodigo")
  campo.value = "MK-ABCD-1234-EFGH-5678"
  // navigator.clipboard pode não existir no jsdom; a função usa `?.` — não deve lançar.
  window.eval("copiarCodigoAtiv()")
  const err = doc.getElementById("ativError")
  assert.match(err.textContent, /copiado/i, "mostra confirmação de cópia")
  assert.match(err.className, /ok/, "estilo de sucesso aplicado")
})
