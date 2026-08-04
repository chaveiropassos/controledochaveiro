// ============================================================
// logica-negocio.js — FUNÇÕES PURAS extraídas VERBATIM do <script> inline do
// index.html canônico (../index.html), para permitir teste de MUTAÇÃO (Stryker).
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// O código do app vive num <script> inline dentro do index.html. O Stryker
// muta um ARQUIVO-FONTE e roda os testes contra a versão mutada; ele não sabe
// mutar um trecho de HTML. As funções abaixo foram COPIADAS EXATAMENTE como
// estão no canônico (mesmos regex, mesmos limites, mesma ordem) — nenhuma
// reescrita — e reexportadas aqui. Assim o Stryker muta o código REAL e o
// mutation score reflete a qualidade dos testes sobre essa lógica.
//
// ESCOPO: só as funções genuinamente puras (sem DOM, sem CACHE, sem rede):
// parseMoeda, fmtNum, fmtTelefone, fmtDocumento, slugTipo, mkNormalizar,
// labelPerfil, _sqlVal e o núcleo aritmético do desconto (descontoValor).
// As funções que dependem de DOM/async continuam cobertas pela suíte de
// comportamento (jsdom) — ver relatório; elas não entram no escopo do Stryker
// por causa da arquitetura de <script> inline.
//
// SE ESTE ARQUIVO DIVERGIR DO CANÔNICO, o teste `logica-negocio-espelho`
// (em logica-negocio.test.js) acusa — ele confere que cada função aqui produz
// o MESMO resultado que a função homônima rodando dentro do index.html real.
// ============================================================

// --- parseMoeda: "1.234,56" -> 1234.56 (VERBATIM do canônico) ---
function parseMoeda(txt) {
  if (txt == null) return 0
  let s = String(txt)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// --- fmtNum: número -> "0,00" (VERBATIM do canônico) ---
const fmtNum = (v) =>
  parseFloat(v || 0)
    .toFixed(2)
    .replace(".", ",")

// --- fmtTelefone (VERBATIM do canônico) ---
function fmtTelefone(v) {
  let d = (v || "").replace(/\D/g, "")
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2)
  d = d.slice(0, 11)
  if (!d) return ""
  if (d.length <= 2) return "(" + d
  const corte = d.length > 10 ? 7 : 6
  let r = "(" + d.slice(0, 2) + ") " + d.slice(2, corte)
  if (d.length > corte) r += "-" + d.slice(corte)
  return r
}

// --- fmtDocumento: CPF/CNPJ (VERBATIM do canônico) ---
function fmtDocumento(v) {
  let d = (v || "").replace(/\D/g, "").slice(0, 14)
  if (!d) return ""
  if (d.length <= 11) {
    let r = d.slice(0, 3)
    if (d.length > 3) r += "." + d.slice(3, 6)
    if (d.length > 6) r += "." + d.slice(6, 9)
    if (d.length > 9) r += "-" + d.slice(9, 11)
    return r
  }
  let r =
    d.slice(0, 2) +
    "." +
    d.slice(2, 5) +
    "." +
    d.slice(5, 8) +
    "/" +
    d.slice(8, 12)
  if (d.length > 12) r += "-" + d.slice(12, 14)
  return r
}

// --- slugTipo (VERBATIM do canônico) ---
function slugTipo(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim()
}

// --- mkNormalizar: normaliza o código de ativação (VERBATIM do canônico) ---
function mkNormalizar(c) {
  let s = (c || "").toUpperCase().replace(/-/g, "").replace(/\s/g, "")
  if (s.startsWith("MK")) s = s.slice(2)
  return s
}

// --- labelPerfil (VERBATIM do canônico) ---
function labelPerfil(p) {
  return (
    {
      admin: "Administrador",
      supervisor: "Supervisor",
      operador: "Operador",
      funcionario: "Funcionário",
    }[p] || p
  )
}

// --- _sqlVal: serializa um valor para SQL do backup (VERBATIM do canônico) ---
function _sqlVal(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "object")
    return "'" + JSON.stringify(v).replace(/'/g, "''") + "'"
  return "'" + String(v).replace(/'/g, "''") + "'"
}

// --- núcleo aritmético do desconto (PDV e OS) ---
// No canônico este cálculo aparece DENTRO de pdvDescontoValor/osDescontoValor,
// que leem valor/tipo do DOM. Aqui está a MESMA aritmética, só que recebendo
// os valores por parâmetro (o único trecho não-DOM daquelas funções):
//   let desconto = tipo === "pct" ? (subtotal * valor) / 100 : valor
//   if (desconto < 0) desconto = 0
//   if (desconto > subtotal) desconto = subtotal
// A leitura do DOM em si é coberta pelos testes de comportamento (jsdom).
function descontoValor(subtotal, valor, tipo) {
  let desconto = tipo === "pct" ? (subtotal * valor) / 100 : valor
  if (desconto < 0) desconto = 0
  if (desconto > subtotal) desconto = subtotal
  return desconto
}

module.exports = {
  parseMoeda,
  fmtNum,
  fmtTelefone,
  fmtDocumento,
  slugTipo,
  mkNormalizar,
  labelPerfil,
  _sqlVal,
  descontoValor,
}
