// ============================================================
// helpers-puros.test.js — testes das funções puras/quase-puras do app
// controle-chaveiro. Roda o <script> real do index.html dentro do jsdom
// (via montarAmbiente) e chama as funções internas por window.eval.
//
// Rode com:
//   CAMINHO_INDEX_TESTE=/tmp/index_canonico.html node --test helpers-puros.test.js
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, semearCache, semearProdutos } = require("./ambiente")

// Helper: avalia uma expressão no escopo léxico global do app (onde vivem as
// funções e as variáveis `let CACHE`/`SESSAO`). Serializa via JSON para trazer
// o valor de volta ao lado do Node com segurança.
function avaliar(window, expressao) {
  return window.eval("(" + expressao + ")")
}

// ---------------------------------------------------------------------------
// parseMoeda — converte texto de moeda pt-BR para número (ponto = milhar,
// vírgula = decimal). Entradas inválidas viram 0.
// ---------------------------------------------------------------------------
test("parseMoeda converte 'R$ 1.234,56' para 1234.56", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "parseMoeda('R$ 1.234,56')"), 1234.56)
})

test("parseMoeda trata string vazia e null como 0", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "parseMoeda('')"), 0)
  assert.strictEqual(avaliar(window, "parseMoeda(null)"), 0)
})

test("parseMoeda trata texto não numérico ('abc') como 0", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "parseMoeda('abc')"), 0)
})

test("parseMoeda converte '10,5' para 10.5 e '-5' para -5", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "parseMoeda('10,5')"), 10.5)
  assert.strictEqual(avaliar(window, "parseMoeda('-5')"), -5)
})

// ---------------------------------------------------------------------------
// fmtTelefone — máscara de telefone: celular (11 díg) e fixo (10 díg).
// Descarta prefixo 55 quando o número tem mais de 11 dígitos.
// ---------------------------------------------------------------------------
test("fmtTelefone formata celular de 11 dígitos", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "fmtTelefone('35999998888')"),
    "(35) 99999-8888",
  )
})

test("fmtTelefone formata fixo de 10 dígitos", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "fmtTelefone('3533334444')"),
    "(35) 3333-4444",
  )
})

test("fmtTelefone descarta o prefixo 55 (número com 13 dígitos)", async () => {
  const { window } = await montarAmbiente()
  // 55 + 35 + 99999-8888
  assert.strictEqual(
    avaliar(window, "fmtTelefone('5535999998888')"),
    "(35) 99999-8888",
  )
})

test("fmtTelefone com entrada curta '(3' devolve '(3'", async () => {
  const { window } = await montarAmbiente()
  // só sobra 1 dígito ('3'), então d.length <= 2 -> '(' + d
  assert.strictEqual(avaliar(window, "fmtTelefone('(3')"), "(3")
})

test("fmtTelefone com entrada vazia devolve ''", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "fmtTelefone('')"), "")
})

// ---------------------------------------------------------------------------
// fmtDocumento — máscara de CPF (até 11 díg) ou CNPJ (12–14 díg).
// ---------------------------------------------------------------------------
test("fmtDocumento formata CPF de 11 dígitos", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "fmtDocumento('12345678901')"),
    "123.456.789-01",
  )
})

test("fmtDocumento formata CNPJ de 14 dígitos", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "fmtDocumento('12345678000199')"),
    "12.345.678/0001-99",
  )
})

test("fmtDocumento formata CPF parcial (6 dígitos)", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "fmtDocumento('123456')"), "123.456")
})

test("fmtDocumento com entrada vazia devolve ''", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "fmtDocumento('')"), "")
})

// ---------------------------------------------------------------------------
// iconeTipoProduto / rotuloTipoProduto / opcoesTipoProduto — dependem de
// CACHE.tipos (semear antes). 'servico' tem ícone 🛠️.
// ---------------------------------------------------------------------------
test("iconeTipoProduto('servico') devolve 🛠️ e 'chave' devolve 🔑", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  assert.strictEqual(avaliar(window, "iconeTipoProduto('servico')"), "🛠️")
  assert.strictEqual(avaliar(window, "iconeTipoProduto('chave')"), "🔑")
})

test("iconeTipoProduto de tipo desconhecido cai no fallback 📦", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  assert.strictEqual(avaliar(window, "iconeTipoProduto('inexistente')"), "📦")
})

test("rotuloTipoProduto('servico') devolve 'Serviço' e desconhecido devolve a própria chave", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  assert.strictEqual(avaliar(window, "rotuloTipoProduto('servico')"), "Serviço")
  // sem tipo correspondente, devolve a chave passada
  assert.strictEqual(avaliar(window, "rotuloTipoProduto('xyz')"), "xyz")
})

test("opcoesTipoProduto marca a opção selecionada e inclui as 3 tipos", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  const html = avaliar(window, "opcoesTipoProduto('servico')")
  // deve ter uma <option> para cada tipo semeado (3)
  assert.strictEqual((html.match(/<option/g) || []).length, 3)
  // a opção 'servico' deve estar marcada como selected
  assert.match(html, /value="servico"\s+selected/)
  // e deve conter o ícone + rótulo do serviço
  assert.match(html, /🛠️ Serviço/)
})

// ---------------------------------------------------------------------------
// labelPerfil — mapeia chave de perfil para rótulo legível; perfil
// desconhecido volta como está.
// ---------------------------------------------------------------------------
test("labelPerfil traduz perfis conhecidos", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "labelPerfil('admin')"), "Administrador")
  assert.strictEqual(avaliar(window, "labelPerfil('supervisor')"), "Supervisor")
  assert.strictEqual(avaliar(window, "labelPerfil('operador')"), "Operador")
  assert.strictEqual(
    avaliar(window, "labelPerfil('funcionario')"),
    "Funcionário",
  )
})

test("labelPerfil devolve a própria chave para perfil desconhecido", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "labelPerfil('gerente')"), "gerente")
})

// ---------------------------------------------------------------------------
// slugTipo — normaliza texto (minúsculas, sem acentos, só a-z0-9) para slug.
// ---------------------------------------------------------------------------
test("slugTipo remove acentos e espaços", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "slugTipo('Serviço Especial')"), "servicoespecial")
  assert.strictEqual(avaliar(window, "slugTipo('Ação')"), "acao")
})

test("slugTipo com entrada vazia/null devolve ''", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "slugTipo('')"), "")
  assert.strictEqual(avaliar(window, "slugTipo(null)"), "")
})

// ---------------------------------------------------------------------------
// fmtData / fmtDataCurta / hojeISO — formatação de datas em pt-BR
// (fuso America/Sao_Paulo).
// ---------------------------------------------------------------------------
test("fmtData formata um ISO conhecido em dd/mm/aaaa HH:MM (fuso SP)", async () => {
  const { window } = await montarAmbiente()
  // 2024-01-15T12:00:00Z -> 09:00 no horário de Brasília (UTC-3)
  assert.strictEqual(
    avaliar(window, "fmtData('2024-01-15T12:00:00Z')"),
    "15/01/2024 09:00",
  )
})

test("fmtData com entrada vazia devolve ''", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "fmtData('')"), "")
})

test("fmtDataCurta formata só a data (dd/mm/aaaa)", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "fmtDataCurta('2024-01-15T12:00:00Z')"),
    "15/01/2024",
  )
})

test("hojeISO devolve a data atual no formato aaaa-mm-dd", async () => {
  const { window } = await montarAmbiente()
  const hoje = avaliar(window, "hojeISO()")
  assert.match(hoje, /^\d{4}-\d{2}-\d{2}$/)
})

// ---------------------------------------------------------------------------
// nomeCliente / nomeFuncionario / nomeFabricante / nomeChave / descChave /
// rotuloChave — leituras sobre o CACHE (semear antes).
// ---------------------------------------------------------------------------
test("nomeCliente devolve o nome de id existente e '' de inexistente", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  assert.strictEqual(avaliar(window, "nomeCliente(1)"), "Cliente Teste")
  assert.strictEqual(avaliar(window, "nomeCliente(999)"), "")
})

test("nomeFuncionario devolve '' quando não há funcionários no cache", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  // semearCache não popula funcionarios -> lista vazia -> ''
  assert.strictEqual(avaliar(window, "nomeFuncionario(1)"), "")
})

test("nomeFabricante devolve o nome de id existente e '—' de inexistente", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  assert.strictEqual(avaliar(window, "nomeFabricante(1)"), "Fabricante Teste")
  assert.strictEqual(avaliar(window, "nomeFabricante(999)"), "—")
})

test("nomeChave compõe codigo · descricao e sinaliza chave removida", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  semearProdutos(window)
  assert.strictEqual(avaliar(window, "nomeChave(10)"), "CH1 · Chave Fisica")
  assert.strictEqual(avaliar(window, "nomeChave(999)"), "(chave removida)")
})

test("rotuloChave prefere o código; sem código usa a descrição", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "rotuloChave({ codigo: 'CH1', descricao: 'Chave Fisica' })"),
    "CH1",
  )
  assert.strictEqual(
    avaliar(window, "rotuloChave({ descricao: 'Só Descrição' })"),
    "Só Descrição",
  )
  // objeto vazio -> fallback '—'
  assert.strictEqual(avaliar(window, "rotuloChave({})"), "—")
})

test("descChave compõe fabricante + codigo + descricao", async () => {
  const { window } = await montarAmbiente()
  semearCache(window)
  assert.strictEqual(
    avaliar(
      window,
      "descChave({ fabricante_id: 1, codigo: 'CH1', descricao: 'Chave Fisica' })",
    ),
    "Fabricante Teste CH1 — Chave Fisica",
  )
  // sem código: omite o código (sem espaço solto)
  assert.strictEqual(
    avaliar(
      window,
      "descChave({ fabricante_id: 1, codigo: '', descricao: 'Chave Fisica' })",
    ),
    "Fabricante Teste — Chave Fisica",
  )
})

// ---------------------------------------------------------------------------
// montarEndereco — junta os campos de endereço numa string.
// ---------------------------------------------------------------------------
test("montarEndereco monta endereço completo com separadores", async () => {
  const { window } = await montarAmbiente()
  const txt = avaliar(
    window,
    "montarEndereco({ endereco: 'Rua A, 10', bairro: 'Centro', cidade: 'Poços', estado: 'MG', cep: '37700-000' })",
  )
  assert.strictEqual(
    txt,
    "Rua A, 10, Centro · Poços - MG · CEP 37700-000",
  )
})

test("montarEndereco com objeto vazio devolve ''", async () => {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "montarEndereco({})"), "")
})

// ---------------------------------------------------------------------------
// mascaraCep / mascaraTelefone / mascaraDocumento — recebem um elemento
// {value} e reescrevem el.value com a máscara aplicada.
// ---------------------------------------------------------------------------
test("mascaraCep aplica a máscara 00000-000 no elemento", async () => {
  const { window } = await montarAmbiente()
  const el = window.document.createElement("input")
  el.value = "37700000"
  window.__elTeste = el
  window.eval("mascaraCep(window.__elTeste)")
  assert.strictEqual(el.value, "37700-000")
})

test("mascaraTelefone aplica a máscara de celular no elemento", async () => {
  const { window } = await montarAmbiente()
  const el = window.document.createElement("input")
  el.value = "35999998888"
  window.__elTeste = el
  window.eval("mascaraTelefone(window.__elTeste)")
  assert.strictEqual(el.value, "(35) 99999-8888")
})

test("mascaraDocumento aplica a máscara de CPF no elemento", async () => {
  const { window } = await montarAmbiente()
  const el = window.document.createElement("input")
  el.value = "12345678901"
  window.__elTeste = el
  window.eval("mascaraDocumento(window.__elTeste)")
  assert.strictEqual(el.value, "123.456.789-01")
})

// ---------------------------------------------------------------------------
// temAcesso / modulosPermitidos — dependem da SESSAO (perfil). admin vê tudo.
// ---------------------------------------------------------------------------
test("modulosPermitidos: admin recebe TODOS os módulos", async () => {
  const { window } = await montarAmbiente()
  semearCache(window) // SESSAO.perfil = 'admin'
  const mods = avaliar(window, "modulosPermitidos(SESSAO)")
  assert.ok(Array.isArray(mods))
  // admin tem acesso a módulos exclusivos como 'funcionarios' e 'backup'
  assert.ok(mods.includes("funcionarios"))
  assert.ok(mods.includes("backup"))
  assert.ok(mods.includes("configuracoes"))
})

test("modulosPermitidos: operador recebe o preset restrito (sem backup)", async () => {
  const { window } = await montarAmbiente()
  const mods = avaliar(
    window,
    "modulosPermitidos({ perfil: 'operador' })",
  )
  assert.ok(mods.includes("pdv"))
  assert.ok(!mods.includes("backup"))
  assert.ok(!mods.includes("funcionarios"))
})

test("temAcesso: admin acessa dashboard e 'backup'", async () => {
  const { window } = await montarAmbiente()
  semearCache(window) // SESSAO admin
  assert.strictEqual(avaliar(window, "temAcesso('dashboard')"), true)
  assert.strictEqual(avaliar(window, "temAcesso('backup')"), true)
})

test("temAcesso: dashboard agora é módulo controlado — operador (preset padrão) NÃO acessa dashboard nem 'backup'", async () => {
  const { window } = await montarAmbiente()
  // troca a SESSAO para um operador (sem permissoes personalizadas → usa preset)
  window.eval("SESSAO = { id: 2, perfil: 'operador' }")
  // O Painel deixou de ser exceção fixa: operador não o tem no preset padrão.
  assert.strictEqual(avaliar(window, "temAcesso('dashboard')"), false)
  assert.strictEqual(avaliar(window, "temAcesso('backup')"), false)
  // ...mas o operador continua acessando seus módulos de venda.
  assert.strictEqual(avaliar(window, "temAcesso('pdv')"), true)
})

test("temAcesso: operador COM dashboard nas permissoes personalizadas acessa o Painel", async () => {
  const { window } = await montarAmbiente()
  window.eval(
    "SESSAO = { id: 3, perfil: 'operador', permissoes: JSON.stringify(['pdv','dashboard']) }",
  )
  assert.strictEqual(avaliar(window, "temAcesso('dashboard')"), true)
})

// ---------------------------------------------------------------------------
// getConfig — devolve o objeto de configuração. Com supabase fake (data vazio)
// e CACHE.config vazio, retorna {}.
// ---------------------------------------------------------------------------
test("getConfig devolve objeto vazio quando não há configurações", async () => {
  const { window } = await montarAmbiente()
  const cfg = await window.eval("getConfig(true)")
  // objeto do realm do jsdom não é reference-equal a {} do Node; checa vazio
  assert.strictEqual(Object.keys(cfg).length, 0)
})

test("getConfig usa o cache quando CACHE.config já tem conteúdo", async () => {
  const { window } = await montarAmbiente()
  window.eval("CACHE.config = { nome_empresa: 'Chaveiro Teste' }")
  // sem forçar, deve devolver o cache existente
  const cfg = await window.eval("getConfig(false)")
  assert.strictEqual(cfg.nome_empresa, "Chaveiro Teste")
})
