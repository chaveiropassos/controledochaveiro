// ============================================================
// ambiente.js — monta o DOM (jsdom) do index.html com o <script>
// inline REALMENTE executando, mas com todos os globais externos
// (Supabase, XLSX, QRCode) SUBSTITUIDOS por dublês (stubs).
//
// Objetivo: rodar o comportamento de verdade (renderizar formulários,
// disparar oninput/onchange) SEM tocar em rede nenhuma.
// ============================================================

const fs = require("fs")
const path = require("path")
const vm = require("vm")
const { JSDOM } = require("jsdom")

// Diretório onde o <script> inline do app é EXTRAÍDO para um arquivo .js real,
// para que a cobertura V8/c8 consiga instrumentá-lo (V8 indexa por nome de
// arquivo). Ver comentário em extrairScriptDoApp().
const DIRETORIO_SCRIPT_EXTRAIDO =
  process.env.COBERTURA_DIR_SCRIPT ||
  path.join(require("os").tmpdir(), "cobertura-chaveiro")

// Por padrão testa o index.html ao lado (../index.html). Um override por
// variável de ambiente (CAMINHO_INDEX_TESTE) permite apontar para outra cópia
// — útil só para validar a própria suíte contra uma versão corrigida.
const CAMINHO_INDEX =
  process.env.CAMINHO_INDEX_TESTE || path.join(__dirname, "..", "index.html")

// Constrói um cliente Supabase FAKE. Qualquer cadeia (from().select().eq()...)
// devolve um objeto encadeável cujas promessas resolvem { data: [], error: null }.
// Assim nenhuma chamada real acontece e o boot do app não quebra.
function criarClienteSupabaseFake() {
  // Registro das operações de escrita, por tabela. Cada teste pode inspecionar
  // (ex.: garantir que NENHUMA movimentação foi inserida para um serviço).
  // Formato: { movimentacoes: [ {payload}, ... ], chaves: [...], ... }
  const registro = { insert: {}, update: {}, delete: {}, upsert: {} }
  // Injeção de erro por (tipo de escrita, tabela). Um teste pode setar, por
  // exemplo, registro.__erros.insert.transacoes = { message: "..." } para
  // simular uma FALHA daquele insert (perda de conexão, timeout). O padrão é
  // null (nenhum erro), então não afeta nenhum teste existente.
  registro.__erros = { insert: {}, update: {}, delete: {}, upsert: {} }
  function erroInjetado(tipo, tabela) {
    return (registro.__erros[tipo] && registro.__erros[tipo][tabela]) || null
  }
  function registrar(tipo, tabela, payload) {
    if (!registro[tipo][tabela]) registro[tipo][tabela] = []
    registro[tipo][tabela].push(payload)
  }

  function criarConsulta(tabela) {
    // resultado padrão que o app espera de uma query
    const resultado = { data: [], error: null }
    // Tipo da última escrita nesta cadeia (insert/update/delete/upsert), para
    // que a resolução (.then/.single) devolva o erro injetado correspondente.
    let ultimaEscrita = null

    // O encadeável é, ao mesmo tempo:
    //  - encadeável: cada método devolve o próprio objeto
    //  - "thenable": pode ser aguardado com await, resolvendo o resultado padrão
    const encadeavel = {}

    const metodos = [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "in",
      "is",
      "or",
      "like",
      "ilike",
      "filter",
      "match",
      "not",
      "order",
      "range",
      "limit",
    ]
    metodos.forEach(function (nome) {
      encadeavel[nome] = function () {
        return encadeavel
      }
    })

    // insert/update sobrescrevem o encadeável padrão para REGISTRAR o payload
    // (mantendo o encadeamento). Assim os testes conseguem afirmar o que foi
    // (ou não foi) gravado em cada tabela.
    encadeavel.insert = function (payload) {
      registrar("insert", tabela, payload)
      ultimaEscrita = "insert"
      return encadeavel
    }
    encadeavel.update = function (payload) {
      registrar("update", tabela, payload)
      ultimaEscrita = "update"
      return encadeavel
    }
    // delete não tem payload; registramos uma marca por chamada para os testes
    // conseguirem afirmar que um delete FOI (ou não foi) disparado na tabela.
    encadeavel.delete = function () {
      registrar("delete", tabela, { chamado: true })
      ultimaEscrita = "delete"
      return encadeavel
    }
    // upsert (usado para gravar configurações por par chave/valor): registra o
    // payload para os testes afirmarem o que foi gravado.
    encadeavel.upsert = function (payload) {
      registrar("upsert", tabela, payload)
      ultimaEscrita = "upsert"
      return encadeavel
    }

    // Devolve o resultado da cadeia levando em conta erro injetado para a
    // última escrita nesta tabela. Sem injeção, é o resultado padrão (sucesso).
    function resultadoComErro(base) {
      const erro = ultimaEscrita ? erroInjetado(ultimaEscrita, tabela) : null
      if (erro) return { data: null, error: erro }
      return base
    }

    // Métodos que "terminam" a consulta e resolvem um único registro. Para a
    // tabela 'servicos' (OS/venda), devolvemos uma linha com id fixo para o
    // fluxo de finalização seguir (ele usa os.id nos passos seguintes).
    function registroUnico() {
      if (tabela === "servicos") return { id: 999 }
      // Para o fluxo de login: se um teste semeou um usuário em
      // registro.__loginUser, devolve-o na consulta de 'funcionarios'.
      if (tabela === "funcionarios" && registro.__loginUser)
        return registro.__loginUser
      return null
    }
    encadeavel.maybeSingle = function () {
      return Promise.resolve(
        resultadoComErro({ data: registroUnico(), error: null }),
      )
    }
    encadeavel.single = function () {
      return Promise.resolve(
        resultadoComErro({ data: registroUnico(), error: null }),
      )
    }

    // Torna o encadeável aguardável (thenable) — resolve a lista vazia (ou o
    // erro injetado para a última escrita, quando um teste o configura).
    encadeavel.then = function (aoResolver, aoRejeitar) {
      return Promise.resolve(resultadoComErro(resultado)).then(
        aoResolver,
        aoRejeitar,
      )
    }
    encadeavel.catch = function (aoRejeitar) {
      return Promise.resolve(resultadoComErro(resultado)).catch(aoRejeitar)
    }

    return encadeavel
  }

  return {
    from: function (tabela) {
      return criarConsulta(tabela)
    },
    // Exposto só para os testes: o registro das escritas por tabela.
    __registro: registro,
    // caso o app use canais/realtime em algum ponto, devolve dublês inertes
    channel: function () {
      return {
        on: function () {
          return this
        },
        subscribe: function () {
          return this
        },
      }
    },
    removeChannel: function () {},
  }
}

// Lê o index.html e REMOVE os <script src="..."> externos (configuracao.js e
// as 3 CDNs: supabase, xlsx, qrcode). Eles seriam buscados na rede — em vez
// disso, injetamos dublês desses globais via beforeParse (abaixo).
function lerHtmlSemScriptsExternos() {
  let html = fs.readFileSync(CAMINHO_INDEX, "utf8")
  // remove qualquer <script src="..."></script> (só os externos têm src)
  html = html.replace(/<script\s+src="[^"]*"><\/script>/g, "")
  return html
}

// ------------------------------------------------------------------
// EXTRAÇÃO DO <script> DO APP PARA COBERTURA (Parte A, caminho ii)
//
// jsdom executa o <script> inline dentro de um contexto VM. A cobertura do V8
// (usada pelo c8) indexa código por NOME DE ARQUIVO. Um <script> inline não tem
// arquivo, então a cobertura não o enxerga.
//
// Solução: extraímos o MAIOR <script> inline (o código do app, ~6000 linhas)
// para um arquivo .js real, e o executamos via vm.Script(...).runInContext()
// com esse nome de arquivo. O comportamento é IDÊNTICO ao inline (mesmo
// contexto global, mesmo escopo léxico compartilhado com o <script> pequeno das
// constantes SUPABASE_URL/KEY): scripts clássicos compartilham o ambiente
// léxico global, e o vm.Script no MESMO contexto herda esse ambiente. Assim as
// `const` do script pequeno ficam visíveis, e os `let CACHE`/`SESSAO` do app
// continuam acessíveis via window.eval (mesmo lexical global).
//
// Fora do modo cobertura, mantemos o inline puro (comportamento de referência).
// ------------------------------------------------------------------

// Encontra o maior bloco <script>...</script> SEM atributo src (o do app) e
// devolve { html, codigo, marcador }. No html, o corpo do script é trocado por
// um marcador vazio; o código é injetado depois via vm (com nome de arquivo).
function separarScriptDoApp(html) {
  const regex = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g
  let maior = null
  let m
  while ((m = regex.exec(html)) !== null) {
    const atributos = m[1] || ""
    if (/\ssrc\s*=/.test(atributos)) continue // externos já foram removidos
    const corpo = m[2]
    if (maior === null || corpo.length > maior.corpo.length) {
      maior = { indice: m.index, tamanhoTotal: m[0].length, corpo: corpo }
    }
  }
  if (maior === null) return { html: html, codigo: null }

  const antes = html.slice(0, maior.indice)
  const depois = html.slice(maior.indice + maior.tamanhoTotal)
  // Substitui o script do app por um <script> vazio para preservar a estrutura
  // do DOM (contagem/posição de elementos). O código roda via vm depois.
  const htmlSemApp = antes + "<script></script>" + depois
  return { html: htmlSemApp, codigo: maior.corpo }
}

// Escreve o código extraído num arquivo .js estável e devolve o caminho.
// Estável (mesmo nome por CAMINHO_INDEX) para o relatório de cobertura ficar
// consistente entre execuções e apontar para "o script do app".
function escreverScriptExtraido(codigo) {
  fs.mkdirSync(DIRETORIO_SCRIPT_EXTRAIDO, { recursive: true })
  const nome = "app-inline-script.js"
  const caminho = path.join(DIRETORIO_SCRIPT_EXTRAIDO, nome)
  fs.writeFileSync(caminho, codigo, "utf8")
  return caminho
}

// Silenciador universal usado para XLSX/QRCode: qualquer acesso a propriedade
// devolve outra função silenciadora, e chamá-lo não faz nada. Evita quebrar o
// boot caso o app toque nesses globais durante a inicialização.
function criarSilenciador() {
  const alvo = function () {
    return criarSilenciador()
  }
  return new Proxy(alvo, {
    get: function (obj, prop) {
      if (prop === "CorrectLevel") return { M: 0, L: 0, H: 0, Q: 0 }
      if (prop === "utils") {
        return {
          book_new: function () {
            return {}
          },
          json_to_sheet: function () {
            return {}
          },
          book_append_sheet: function () {},
        }
      }
      return criarSilenciador()
    },
    apply: function () {
      return undefined
    },
  })
}

// Monta o ambiente e devolve { dom, window, clienteFake } já com o app "bootado".
// A promessa só resolve depois que o init() do app assentou (timers/microtasks).
async function montarAmbiente() {
  let html = lerHtmlSemScriptsExternos()
  const clienteFake = criarClienteSupabaseFake()

  // Modo cobertura (COBERTURA=1): extrai o script do app para um .js real e o
  // injeta via vm APÓS o parse, para o c8/V8 medir a cobertura do código REAL.
  // Sem a flag, o script roda inline (comportamento de referência intacto).
  const modoCobertura = process.env.COBERTURA === "1"
  let codigoApp = null
  let caminhoScriptApp = null
  if (modoCobertura) {
    const separado = separarScriptDoApp(html)
    if (separado.codigo !== null) {
      html = separado.html
      codigoApp = separado.codigo
      caminhoScriptApp = escreverScriptExtraido(codigoApp)
    }
  }

  const dom = new JSDOM(html, {
    runScripts: "dangerously", // executa o <script> inline do app DE VERDADE
    resources: undefined, // NÃO busca recursos externos (rede silenciada)
    url: "http://localhost/", // origem estável para localStorage etc.
    pretendToBeVisual: true,
    beforeParse: function (window) {
      // --- Config fake: evita o alerta de "configuração pendente" ---
      window.SUPABASE_URL = "https://projeto-fake.supabase.co"
      window.SUPABASE_KEY = "sb_publishable_chave_fake_para_testes"

      // --- Supabase fake ---
      window.supabase = {
        createClient: function () {
          return clienteFake
        },
      }

      // --- XLSX / QRCode dublados (silenciadores) ---
      window.XLSX = criarSilenciador()
      window.QRCode = criarSilenciador()

      // --- TextEncoder/TextDecoder (o app usa no boot da tela de ativação).
      // jsdom não os expõe no window; reaproveitamos os do Node. ---
      if (typeof window.TextEncoder === "undefined")
        window.TextEncoder = TextEncoder
      if (typeof window.TextDecoder === "undefined")
        window.TextDecoder = TextDecoder

      // --- crypto.subtle.digest fake (o app gera hash do código de instalação
      // no boot da tela de ativação). Devolve um buffer determinístico. ---
      if (!window.crypto) window.crypto = {}
      if (!window.crypto.subtle) {
        window.crypto.subtle = {
          digest: function () {
            return Promise.resolve(new ArrayBuffer(32))
          },
        }
      }
      if (typeof window.crypto.getRandomValues !== "function") {
        window.crypto.getRandomValues = function (arr) {
          for (let i = 0; i < arr.length; i++) arr[i] = (i * 7 + 3) % 256
          return arr
        }
      }

      // --- alert/confirm/print silenciados; confirm devolve true ---
      window.alert = function () {}
      window.confirm = function () {
        return true
      }
      window.print = function () {}

      // --- prompt controlável pelos testes ---
      // Por padrão devolve "" (usuário cancelou/vazio). Um teste pode empilhar
      // respostas em window.__promptRespostas (fila) para simular o usuário
      // digitando: cada chamada de prompt() consome a próxima resposta.
      window.__promptRespostas = []
      window.prompt = function () {
        if (window.__promptRespostas.length) return window.__promptRespostas.shift()
        return ""
      }

      // --- registra chamadas de alert/toast se algum teste quiser inspecionar ---
      window.__alertas = []
      const alertOriginal = window.alert
      window.alert = function (msg) {
        window.__alertas.push(String(msg))
        return alertOriginal.call(window, msg)
      }
    },
  })

  const window = dom.window

  // No modo cobertura, o script do app foi retirado do HTML; injeta-o agora no
  // MESMO contexto VM do jsdom, com nome de arquivo (para o V8/c8 instrumentar).
  // Roda depois do parse do DOM, então document já está montado — equivalente ao
  // inline que executava ao fim do <body>.
  if (modoCobertura && codigoApp !== null) {
    const contexto = dom.getInternalVMContext()
    const script = new vm.Script(codigoApp, { filename: caminhoScriptApp })
    script.runInContext(contexto)
  }

  // Dá tempo do init() (async) rodar: resolve as promessas do supabase fake e
  // esvazia timers curtos (setTimeout de focus etc.). Duas rodadas por garantia.
  await esperarAssentar(window)
  await esperarAssentar(window)

  return { dom: dom, window: window, clienteFake: clienteFake }
}

// Espera microtasks e um tiquinho de timer assentarem no window do jsdom.
function esperarAssentar(window) {
  return new Promise(function (resolve) {
    // setTimeout do próprio jsdom garante que entramos na fila após os timers do app
    window.setTimeout(resolve, 25)
  })
}

// Semeia o CACHE do app com dados mínimos para os formulários renderizarem.
// (fabricantes, categorias, tipos — inclusive um tipo 'servico' obrigatório
// para o teste dos campos de serviço.)
//
// IMPORTANTE: no app, CACHE/SESSAO são declarados com `let` no topo do <script>.
// Em navegador (e no jsdom), variáveis `let`/`const` de topo NÃO viram
// propriedades de `window` — vivem no escopo léxico global. Por isso mexemos
// nelas via window.eval, que roda NAQUELE mesmo escopo e enxerga CACHE/SESSAO.
function semearCache(window) {
  window.eval(
    "CACHE.fabricantes = [{ id: 1, nome: 'Fabricante Teste', tipo: 'ambos' }];" +
      "CACHE.categorias = [{ id: 1, nome: 'Geral' }];" +
      "CACHE.tipos = [" +
      "  { chave: 'chave', rotulo: 'Chave', icone: '🔑' }," +
      "  { chave: 'variados', rotulo: 'Variados', icone: '📦' }," +
      "  { chave: 'servico', rotulo: 'Serviço', icone: '🛠️' }" +
      "];" +
      "CACHE.clientes = [{ id: 1, nome: 'Cliente Teste', telefone: '35999998888' }];" +
      "CACHE.formas = [{ id: 1, nome: 'Dinheiro' }];" +
      "CACHE.formasTodas = [{ id: 1, nome: 'Dinheiro' }];" +
      "SESSAO = { id: 1, usuario: 'teste', nome: 'Teste', perfil: 'admin' };",
  )
}

// Semeia CACHE.chaves com produtos para os testes de estoque:
//  - id 10: 'chave' (item físico, estoque 3) — DEVE movimentar estoque
//  - id 11: 'variados' (item físico, estoque 0) — DEVE movimentar (é o caso do print)
//  - id 20: 'servico' (mão de obra, estoque 0) — NÃO deve movimentar estoque
function semearProdutos(window) {
  window.eval(
    "CACHE.chaves = [" +
      "  { id: 10, codigo: 'CH1', descricao: 'Chave Fisica', preco_venda: 10, estoque: 3, tipo_produto: 'chave', fabricante_id: 1 }," +
      "  { id: 11, codigo: 'VR1', descricao: 'Item Variados', preco_venda: 5, estoque: 0, tipo_produto: 'variados', fabricante_id: 1 }," +
      "  { id: 20, codigo: 'SV1', descricao: 'Abertura de Porta', preco_venda: 80, estoque: 0, tipo_produto: 'servico', fabricante_id: 1 }" +
      "];" +
      "CACHE.imagens = CACHE.imagens || {};",
  )
}

// Coleta os ids duplicados dentro de um elemento (ou do documento inteiro).
// Devolve um array com os ids que aparecem mais de uma vez.
function idsDuplicados(elemento) {
  const vistos = Object.create(null)
  const duplicados = Object.create(null)
  const todos = elemento.querySelectorAll("[id]")
  for (let i = 0; i < todos.length; i++) {
    const id = todos[i].id
    if (!id) continue
    if (vistos[id]) duplicados[id] = true
    vistos[id] = true
  }
  return Object.keys(duplicados)
}

// Acha o CONTAINER (.field) do "Estoque mín." no chaveForm de forma ROBUSTA,
// SEM depender de um id específico. As duas estruturas do index.html divergem:
//   - canônica:  id="chCampoEstMin"
//   - alterada:  id="chCampoEstoqueMinimo"
// Procura por qualquer um dos dois ids e, se nenhum existir, cai no rótulo
// "Estoque mín." (o texto do <label> é o mesmo nas duas versões). Devolve o
// elemento ou null (null significa "não está no DOM" — que para serviço conta
// como "ocultado", ver campoDeServicoOcultado).
function acharCampoEstoqueMinimo(doc) {
  const porId =
    doc.getElementById("chCampoEstMin") ||
    doc.getElementById("chCampoEstoqueMinimo")
  if (porId) return porId
  // Fallback por rótulo: acha o <label> "Estoque mín." e sobe até o .field.
  const labels = doc.querySelectorAll("label")
  for (let i = 0; i < labels.length; i++) {
    const texto = (labels[i].textContent || "").trim().toLowerCase()
    if (texto === "estoque mín." || texto.indexOf("estoque mín") === 0) {
      return labels[i].closest(".field") || labels[i].parentElement
    }
  }
  return null
}

// Diz se um campo de serviço está OCULTO PARA O USUÁRIO, aceitando as DUAS
// estratégias de esconder que o app pode usar:
//   - toggle por display: o elemento existe mas tem style.display === "none";
//   - render condicional: o elemento NÃO existe no DOM (foi removido/omitido).
// Aceita receber o elemento já resolvido (ou null) OU um id (string).
function campoDeServicoOcultado(doc, campoOuId) {
  const campo =
    typeof campoOuId === "string" ? doc.getElementById(campoOuId) : campoOuId
  // Ausente do DOM = ocultado (render condicional).
  if (!campo) return true
  // Presente = ocultado só se display:none (toggle por display).
  return campo.style.display === "none"
}

// Complemento de campoDeServicoOcultado: o campo está VISÍVEL para o usuário
// (existe no DOM e não está com display:none).
function campoDeServicoVisivel(doc, campoOuId) {
  const campo =
    typeof campoOuId === "string" ? doc.getElementById(campoOuId) : campoOuId
  return !!campo && campo.style.display !== "none"
}

module.exports = {
  montarAmbiente: montarAmbiente,
  semearCache: semearCache,
  semearProdutos: semearProdutos,
  idsDuplicados: idsDuplicados,
  esperarAssentar: esperarAssentar,
  criarClienteSupabaseFake: criarClienteSupabaseFake,
  acharCampoEstoqueMinimo: acharCampoEstoqueMinimo,
  campoDeServicoOcultado: campoDeServicoOcultado,
  campoDeServicoVisivel: campoDeServicoVisivel,
}
