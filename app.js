/* ==========================================================
   OrçaElétrica — cálculo de pontos por ambiente
   Baseado na regra prática usual da NBR 5410 para dimensionamento
   de pontos de iluminação e tomadas de uso geral (TUG), com
   sugestão de circuitos, condutores e cores.
   Ferramenta de apoio a orçamento — não substitui projeto elétrico
   assinado por profissional habilitado. Sempre valide cargas
   especiais (chuveiro, forno, ar-condicionado etc.), quedas de
   tensão e agrupamento de condutores conforme a instalação real.
   ========================================================== */

const STORAGE_KEY_AMBIENTES = "orcaeletrica_ambientes";
const STORAGE_KEY_CONFIG = "orcaeletrica_config";
const STORAGE_KEY_OBRA = "orcaeletrica_obra";

const TIPO_LABELS = {
  sala: "Sala / Estar",
  quarto: "Quarto",
  cozinha: "Cozinha",
  banheiro: "Banheiro",
  areaServico: "Área de serviço",
  garagem: "Garagem",
  corredor: "Corredor / Hall",
  outro: "Outro",
};

/* Altura recomendada de tomadas por tipo de ambiente (cm do piso) */
const ALTURA_TOMADA_CM = {
  banheiro: 100,      // acima da bancada/lavatório
  cozinha: 120,        // sobre bancada
  areaServico: 120,
  sala: 30,
  quarto: 30,
  garagem: 30,
  corredor: 30,
  outro: 30,
};

const ALTURA_INTERRUPTOR_CM = 105; // padrão junto à porta, lado da maçaneta

/* Limites práticos de pontos por circuito (para sugestão do quadro) */
const MAX_PONTOS_LUZ_POR_CIRCUITO = 8;
const MAX_TOMADAS_POR_CIRCUITO = 6;

/* Estimativa de material */
const FOLGA_POR_PONTO_M = 0.5; // emendas/curvas/conexão na caixa, por ponto
const DIAM_ELETRODUTO_LUZ = '1/2" (16 mm)';
const DIAM_ELETRODUTO_TOMADA = '3/4" (20 mm)';

const TIPO_INSTALACAO_LABELS = {
  residencial: "Residencial",
  comercial: "Comercial",
  industrial: "Industrial",
};

const LIGACAO_LABELS = {
  mono127: "Monofásico 127 V (fase + neutro)",
  mono220: "Monofásico 220 V (fase + neutro)",
  bi127220: "Bifásico 127/220 V (2 fases + neutro)",
  tri220: "Trifásico 220 V (3 fases + neutro)",
  tri380: "Trifásico 380 V (3 fases + neutro)",
};

/* ---------- Estado ---------- */
let ambientes = [];
let config = { tomada: 0, luz: 0, interruptor: 0, perda: 10 };
let obra = { cliente: "", endereco: "", telefone: "", responsavel: "", data: "", tipoInstalacao: "residencial", ligacao: "mono127" };

/* ---------- Persistência ---------- */
function carregarDados() {
  try {
    const a = localStorage.getItem(STORAGE_KEY_AMBIENTES);
    ambientes = a ? JSON.parse(a) : [];
  } catch (e) { ambientes = []; }

  try {
    const c = localStorage.getItem(STORAGE_KEY_CONFIG);
    config = c ? JSON.parse(c) : { tomada: 0, luz: 0, interruptor: 0, perda: 10 };
    if (config.perda === undefined) config.perda = 10;
  } catch (e) { config = { tomada: 0, luz: 0, interruptor: 0, perda: 10 }; }

  try {
    const o = localStorage.getItem(STORAGE_KEY_OBRA);
    obra = o ? JSON.parse(o) : { cliente: "", endereco: "", telefone: "", responsavel: "", data: "", tipoInstalacao: "residencial", ligacao: "mono127" };
    if (!obra.tipoInstalacao) obra.tipoInstalacao = "residencial";
    if (!obra.ligacao) obra.ligacao = "mono127";
  } catch (e) { obra = { cliente: "", endereco: "", telefone: "", responsavel: "", data: "", tipoInstalacao: "residencial", ligacao: "mono127" }; }
}

function salvarAmbientes() { localStorage.setItem(STORAGE_KEY_AMBIENTES, JSON.stringify(ambientes)); }
function salvarConfig() { localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config)); }
function salvarObra() { localStorage.setItem(STORAGE_KEY_OBRA, JSON.stringify(obra)); }

/* ---------- Sugestão automática (regra prática NBR 5410) ---------- */
/* Pontos de iluminação: 1 ponto até 12m², +1 a cada 12m² adicionais (ou fração).
   Critério de área mais conservador — ajuste sempre pelo olho técnico:
   pé-direito, tipo de luminária e leiaute do ambiente também importam. */
function sugerirPontos(largura, comprimento, tipo) {
  const area = largura * comprimento;
  const perimetro = 2 * (largura + comprimento);

  let pontosLuz;
  if (area <= 12) {
    pontosLuz = 1;
  } else {
    pontosLuz = 1 + Math.ceil((area - 12) / 12);
  }

  const interruptores = 1;

  let tomadas;
  if (tipo === "banheiro") {
    tomadas = 1;
  } else if (["cozinha", "areaServico", "garagem"].includes(tipo)) {
    tomadas = Math.max(1, Math.ceil(perimetro / 3.5));
  } else {
    tomadas = Math.max(1, Math.ceil(perimetro / 5));
  }

  return { pontosLuz, interruptores, tomadas };
}

function calcularGeometria(amb) {
  return {
    area: amb.largura * amb.comprimento,
    perimetro: 2 * (amb.largura + amb.comprimento),
  };
}

/* ---------- Estimativa de condutor e eletroduto por ambiente ----------
   Percurso considerado por ponto = distância até o quadro (horizontal,
   informada pelo usuário) + queda vertical até a altura de instalação
   do ponto + folga fixa para emendas/curvas. O eletroduto segue o
   percurso físico; o condutor multiplica esse percurso pela quantidade
   de fios daquele ponto (fase/neutro/terra ou fase/retorno). */
function calcularMateriais(amb) {
  const alturaTomadaM = (ALTURA_TOMADA_CM[amb.tipo] ?? 30) / 100;
  const alturaInterruptorM = ALTURA_INTERRUPTOR_CM / 100;

  const quedaTomada = Math.max(0, amb.altura - alturaTomadaM);
  const quedaInterruptor = Math.max(0, amb.altura - alturaInterruptorM);

  const percursoLuz = amb.distanciaQuadro + FOLGA_POR_PONTO_M;
  const percursoInterruptor = amb.distanciaQuadro + quedaInterruptor + FOLGA_POR_PONTO_M;
  const percursoTomada = amb.distanciaQuadro + quedaTomada + FOLGA_POR_PONTO_M;

  // Eletroduto: percurso físico (não multiplica pelo nº de fios)
  const eletrodutoLuz = amb.pontosLuz * percursoLuz + amb.interruptores * percursoInterruptor;
  const eletrodutoTomada = amb.tomadas * percursoTomada;

  // Condutor: percurso × nº de fios do ponto
  // Luz: fase + neutro + terra (3) · Interruptor: fase + retorno (2) · Tomada: fase + neutro + terra (3)
  const condutorLuz = (amb.pontosLuz * percursoLuz * 3) + (amb.interruptores * percursoInterruptor * 2);
  const condutorTomada = amb.tomadas * percursoTomada * 3;

  return { eletrodutoLuz, eletrodutoTomada, condutorLuz, condutorTomada };
}

/* ---------- Formatação ---------- */
function formatarMoeda(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ---------- Navegação entre abas ---------- */
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
      if (btn.dataset.view === "relatorio") renderRelatorio();
    });
  });
}

/* ---------- Formulário de ambiente ---------- */
let ultimaSugestao = { pontosLuz: "", interruptores: "", tomadas: "" };

function atualizarSugestao() {
  const largura = parseFloat(document.getElementById("amb-largura").value);
  const comprimento = parseFloat(document.getElementById("amb-comprimento").value);
  const tipo = document.getElementById("amb-tipo").value;
  if (!largura || !comprimento) return;

  const sug = sugerirPontos(largura, comprimento, tipo);
  const campoLuz = document.getElementById("amb-luz");
  const campoInterr = document.getElementById("amb-interruptor");
  const campoTomada = document.getElementById("amb-tomada");

  // Só sobrescreve se o usuário não tiver alterado manualmente o valor sugerido anterior
  if (campoLuz.value === "" || campoLuz.value === String(ultimaSugestao.pontosLuz)) campoLuz.value = sug.pontosLuz;
  if (campoInterr.value === "" || campoInterr.value === String(ultimaSugestao.interruptores)) campoInterr.value = sug.interruptores;
  if (campoTomada.value === "" || campoTomada.value === String(ultimaSugestao.tomadas)) campoTomada.value = sug.tomadas;

  ultimaSugestao = sug;
}

function initFormAmbiente() {
  ["amb-largura", "amb-comprimento", "amb-tipo"].forEach((id) => {
    document.getElementById(id).addEventListener("input", atualizarSugestao);
    document.getElementById(id).addEventListener("change", atualizarSugestao);
  });

  const form = document.getElementById("form-ambiente");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = document.getElementById("amb-nome").value.trim();
    const tipo = document.getElementById("amb-tipo").value;
    const largura = parseFloat(document.getElementById("amb-largura").value);
    const comprimento = parseFloat(document.getElementById("amb-comprimento").value);
    const altura = parseFloat(document.getElementById("amb-altura").value);
    const distanciaQuadro = parseFloat(document.getElementById("amb-distancia").value);
    const pontosLuz = parseInt(document.getElementById("amb-luz").value, 10);
    const interruptores = parseInt(document.getElementById("amb-interruptor").value, 10);
    const tomadas = parseInt(document.getElementById("amb-tomada").value, 10);

    if (!nome || !largura || !comprimento || !altura || isNaN(distanciaQuadro)) return;
    if (isNaN(pontosLuz) || isNaN(interruptores) || isNaN(tomadas)) return;

    ambientes.push({
      id: Date.now().toString(36),
      nome, tipo, largura, comprimento, altura, distanciaQuadro,
      pontosLuz, interruptores, tomadas,
    });
    salvarAmbientes();
    form.reset();
    document.getElementById("amb-altura").value = "2.70";
    document.getElementById("amb-distancia").value = "";
    document.getElementById("amb-luz").value = "";
    document.getElementById("amb-interruptor").value = "";
    document.getElementById("amb-tomada").value = "";
    ultimaSugestao = { pontosLuz: "", interruptores: "", tomadas: "" };
    renderListaAmbientes();
  });
}

function removerAmbiente(id) {
  ambientes = ambientes.filter((a) => a.id !== id);
  salvarAmbientes();
  renderListaAmbientes();
}

/* ---------- Renderização: lista de ambientes ---------- */
function renderListaAmbientes() {
  const lista = document.getElementById("lista-ambientes");
  const count = document.getElementById("amb-count");
  count.textContent = ambientes.length;

  if (ambientes.length === 0) {
    lista.innerHTML = '<p class="empty-state">Nenhum ambiente cadastrado ainda.<br>Preencha o formulário acima para começar.</p>';
    return;
  }

  lista.innerHTML = ambientes.map((amb) => {
    const g = calcularGeometria(amb);
    return `
      <div class="amb-card">
        <div class="amb-breaker"></div>
        <div class="amb-body">
          <button class="amb-remove" onclick="removerAmbiente('${amb.id}')" aria-label="Remover">✕</button>
          <div class="amb-top">
            <span class="amb-nome">${escapeHtml(amb.nome)}</span>
            <span class="amb-tipo">${TIPO_LABELS[amb.tipo]}</span>
          </div>
          <div class="amb-dims">${amb.largura}m × ${amb.comprimento}m · pé-direito ${amb.altura}m · ${g.area.toFixed(2)}m² · ${amb.distanciaQuadro}m até o quadro</div>
          <div class="amb-stats">
            <div class="amb-stat"><b>${amb.pontosLuz}</b><span>Luz</span></div>
            <div class="amb-stat"><b>${amb.interruptores}</b><span>Interr.</span></div>
            <div class="amb-stat"><b>${amb.tomadas}</b><span>Tomadas</span></div>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ---------- Configurações: mão de obra ---------- */
function initConfig() {
  document.getElementById("cfg-tomada").value = config.tomada;
  document.getElementById("cfg-luz").value = config.luz;
  document.getElementById("cfg-interruptor").value = config.interruptor;
  document.getElementById("cfg-perda").value = config.perda;

  document.getElementById("btn-salvar-perda").addEventListener("click", () => {
    config.perda = parseFloat(document.getElementById("cfg-perda").value) || 0;
    salvarConfig();
    const msg = document.getElementById("perda-saved-msg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 1800);
  });

  document.getElementById("btn-salvar-config").addEventListener("click", () => {
    config.tomada = parseFloat(document.getElementById("cfg-tomada").value) || 0;
    config.luz = parseFloat(document.getElementById("cfg-luz").value) || 0;
    config.interruptor = parseFloat(document.getElementById("cfg-interruptor").value) || 0;
    salvarConfig();

    const msg = document.getElementById("config-saved-msg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 1800);
  });
}

/* ---------- Configurações: dados da obra ---------- */
function initObra() {
  document.getElementById("obra-cliente").value = obra.cliente || "";
  document.getElementById("obra-endereco").value = obra.endereco || "";
  document.getElementById("obra-telefone").value = obra.telefone || "";
  document.getElementById("obra-responsavel").value = obra.responsavel || "";
  document.getElementById("obra-data").value = obra.data || new Date().toISOString().slice(0, 10);
  document.getElementById("obra-tipo-instalacao").value = obra.tipoInstalacao;
  document.getElementById("obra-ligacao").value = obra.ligacao;

  document.getElementById("btn-salvar-obra").addEventListener("click", () => {
    obra.cliente = document.getElementById("obra-cliente").value.trim();
    obra.endereco = document.getElementById("obra-endereco").value.trim();
    obra.telefone = document.getElementById("obra-telefone").value.trim();
    obra.responsavel = document.getElementById("obra-responsavel").value.trim();
    obra.data = document.getElementById("obra-data").value;
    obra.tipoInstalacao = document.getElementById("obra-tipo-instalacao").value;
    obra.ligacao = document.getElementById("obra-ligacao").value;
    salvarObra();

    const msg = document.getElementById("obra-saved-msg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 1800);
  });
}

/* ---------- Quadro de distribuição: agrupamento de circuitos ---------- */
function agruparCircuitos(totalPontos, maxPorCircuito) {
  if (totalPontos <= 0) return [];
  const numCircuitos = Math.ceil(totalPontos / maxPorCircuito);
  const grupos = [];
  let restante = totalPontos;
  for (let i = 0; i < numCircuitos; i++) {
    const qtd = Math.min(maxPorCircuito, restante);
    grupos.push(qtd);
    restante -= qtd;
  }
  return grupos;
}

function formatarData(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ---------- Recomendações de proteção e aterramento ---------- */
function recomendarProtecoes(tipoInstalacao, ligacao) {
  const trifasico = ligacao === "tri220" || ligacao === "tri380";

  let idr = trifasico
    ? "Utilize DR (IDR) de 30 mA para todos os circuitos de tomadas e áreas molhadas. Em quadros trifásicos, prefira dividir os circuitos em 2 ou mais DRs (ex.: por pavimento/setor) para evitar que uma fuga isolada desligue toda a instalação. Avalie DR tipo A ou B se houver cargas eletrônicas, inversores de frequência ou motores com variador."
    : "Utilize DR (IDR) de 30 mA (alta sensibilidade) cobrindo, no mínimo, os circuitos de tomadas — obrigatório em áreas molhadas (banheiro, cozinha, área de serviço, áreas externas). Recomenda-se estender a proteção DR também aos circuitos de iluminação. Em quadros com muitos circuitos, prefira 2 DRs em vez de 1 só, para não desligar a instalação inteira em caso de fuga isolada.";

  let dps = tipoInstalacao === "industrial"
    ? "Instale DPS Classe I (ou combinado Classe I+II) no ponto de entrada de energia, coordenado com DPS Classe II no(s) quadro(s) de distribuição interno(s), conforme NBR 5410 e NBR 5419 (SPDA), especialmente se houver para-raios na estrutura."
    : "Instale DPS Classe II na entrada do quadro de distribuição, entre cada fase e o barramento de terra, com corrente nominal (In) mínima de 5 kA e capacidade de descarga (Imax) recomendada de 40 kA (onda 8/20 µs), com Up compatível com a tensão do sistema.";

  let aterramento = "Esquema recomendado: TN-S, com condutores neutro e terra separados desde a entrada. Utilize haste de aterramento (copperweld, mínimo 2,4 m) e busque resistência de terra abaixo de 10 Ω. Interligue todas as massas metálicas (tubulações, estruturas, carcaças de equipamentos) ao barramento de equipotencialização principal (BEP).";
  if (tipoInstalacao === "industrial" || trifasico) {
    aterramento += " Em instalações trifásicas/industriais, confirme junto à concessionária o esquema de aterramento na entrada (TN-C-S é comum) e avalie malha de terra dedicada conforme a carga e sensibilidade dos equipamentos.";
  }

  return { idr, dps, aterramento };
}

/* ---------- Relatório ---------- */
function renderRelatorio() {
  const obraSecao = document.getElementById("relatorio-obra");
  const temDadosObra = obra.cliente || obra.endereco || obra.responsavel;
  obraSecao.innerHTML = temDadosObra ? `
    <h2>Dados da obra</h2>
    <table class="rel-table">
      <tr><td>Cliente / Proprietário</td><td>${escapeHtml(obra.cliente || "—")}</td></tr>
      <tr><td>Endereço da obra</td><td>${escapeHtml(obra.endereco || "—")}</td></tr>
      <tr><td>Contato</td><td>${escapeHtml(obra.telefone || "—")}</td></tr>
      <tr><td>Responsável técnico</td><td>${escapeHtml(obra.responsavel || "—")}</td></tr>
      <tr><td>Data do orçamento</td><td>${formatarData(obra.data)}</td></tr>
      <tr><td>Tipo de instalação</td><td>${TIPO_INSTALACAO_LABELS[obra.tipoInstalacao]}</td></tr>
      <tr><td>Sistema de alimentação</td><td>${LIGACAO_LABELS[obra.ligacao]}</td></tr>
    </table>` : "";

  const resumoVazio = document.getElementById("resumo-vazio");
  const resumoConteudo = document.getElementById("resumo-conteudo");
  const detalhe = document.getElementById("relatorio-detalhe");
  const quadro = document.getElementById("relatorio-quadro");

  if (ambientes.length === 0) {
    resumoVazio.style.display = "block";
    resumoConteudo.style.display = "none";
    detalhe.innerHTML = "";
    quadro.innerHTML = "";
    return;
  }

  resumoVazio.style.display = "none";
  resumoConteudo.style.display = "block";

  let totalLuz = 0, totalInterruptor = 0, totalTomada = 0;
  let totalCondutorLuz = 0, totalCondutorTomada = 0;
  let totalEletrodutoLuz = 0, totalEletrodutoTomada = 0;
  let detalheHtml = "";

  ambientes.forEach((amb) => {
    const g = calcularGeometria(amb);
    const mat = calcularMateriais(amb);
    totalLuz += amb.pontosLuz;
    totalInterruptor += amb.interruptores;
    totalTomada += amb.tomadas;
    totalCondutorLuz += mat.condutorLuz;
    totalCondutorTomada += mat.condutorTomada;
    totalEletrodutoLuz += mat.eletrodutoLuz;
    totalEletrodutoTomada += mat.eletrodutoTomada;

    detalheHtml += `
      <div class="rel-ambiente">
        <h3>${escapeHtml(amb.nome)} — ${TIPO_LABELS[amb.tipo]}</h3>
        <table class="rel-table">
          <tr><td>Dimensões</td><td>${amb.largura}m × ${amb.comprimento}m · pé-direito ${amb.altura}m</td></tr>
          <tr><td>Área / Perímetro</td><td>${g.area.toFixed(2)} m² / ${g.perimetro.toFixed(2)} m</td></tr>
          <tr><td>Distância até o quadro</td><td>${amb.distanciaQuadro} m</td></tr>
          <tr><td>Pontos de luz (teto)</td><td>${amb.pontosLuz} — altura ${amb.altura.toFixed(2)} m</td></tr>
          <tr><td>Interruptores</td><td>${amb.interruptores} — altura ${ALTURA_INTERRUPTOR_CM} cm</td></tr>
          <tr><td>Tomadas</td><td>${amb.tomadas} — altura ${ALTURA_TOMADA_CM[amb.tipo] ?? 30} cm</td></tr>
          <tr><td>Condutor estimado</td><td>${(mat.condutorLuz).toFixed(1)} m (1,5mm²) + ${(mat.condutorTomada).toFixed(1)} m (2,5mm²)</td></tr>
          <tr><td>Eletroduto estimado</td><td>${(mat.eletrodutoLuz).toFixed(1)} m (${DIAM_ELETRODUTO_LUZ}) + ${(mat.eletrodutoTomada).toFixed(1)} m (${DIAM_ELETRODUTO_TOMADA})</td></tr>
        </table>
      </div>`;
  });

  const maoObra = totalLuz * config.luz + totalInterruptor * config.interruptor + totalTomada * config.tomada;

  /* Circuitos/disjuntores (calculado aqui para já refletir no resumo) */
  const circuitosLuz = agruparCircuitos(totalLuz, MAX_PONTOS_LUZ_POR_CIRCUITO);
  const circuitosTomada = agruparCircuitos(totalTomada, MAX_TOMADAS_POR_CIRCUITO);
  const totalDisjuntoresCircuito = circuitosLuz.length + circuitosTomada.length;
  const totalDisjuntores = totalDisjuntoresCircuito + 1; // +1 disjuntor geral do QDC

  document.getElementById("total-luz").textContent = totalLuz;
  document.getElementById("total-interruptor").textContent = totalInterruptor;
  document.getElementById("total-tomada").textContent = totalTomada;
  document.getElementById("total-disjuntores").textContent = totalDisjuntores;
  document.getElementById("total-mao-obra").textContent = formatarMoeda(maoObra);

  detalhe.innerHTML = detalheHtml;

  /* ---- Quadro de distribuição ---- */
  let circuitosHtml = "";
  circuitosLuz.forEach((qtd, i) => {
    circuitosHtml += `
      <tr>
        <td>Iluminação ${circuitosLuz.length > 1 ? `— Circuito ${i + 1}` : ""}</td>
        <td>${qtd} pontos</td>
        <td>1,5 mm²</td>
        <td>10 A</td>
      </tr>`;
  });
  circuitosTomada.forEach((qtd, i) => {
    circuitosHtml += `
      <tr>
        <td>TUG (tomadas) ${circuitosTomada.length > 1 ? `— Circuito ${i + 1}` : ""}</td>
        <td>${qtd} tomadas</td>
        <td>2,5 mm²</td>
        <td>20 A</td>
      </tr>`;
  });

  const protecoes = recomendarProtecoes(obra.tipoInstalacao, obra.ligacao);

  quadro.innerHTML = `
    <section class="card">
      <h2>Proteção e aterramento — ${TIPO_INSTALACAO_LABELS[obra.tipoInstalacao]} · ${LIGACAO_LABELS[obra.ligacao]}</h2>
      <table class="rel-table texto">
        <tr><td>IDR (DR)</td><td>${protecoes.idr}</td></tr>
        <tr><td>DPS</td><td>${protecoes.dps}</td></tr>
        <tr><td>Aterramento</td><td>${protecoes.aterramento}</td></tr>
      </table>
      <p class="hint">Recomendações de referência conforme NBR 5410. O dimensionamento definitivo de DR, DPS e do sistema de aterramento deve considerar o projeto completo (carga instalada, nível ceráunico local, distância da rede, presença de SPDA) e ser validado por profissional habilitado.</p>
    </section>

    <section class="card">
      <h2>Materiais — condutor e eletroduto</h2>
      <p class="hint">
        Metragem estimada a partir da distância informada de cada ambiente até o quadro,
        somada à queda até a altura de instalação de cada ponto, com folga de ${FOLGA_POR_PONTO_M} m
        por ponto para emendas/curvas, mais ${config.perda}% de perda configurada.
      </p>
      <table class="rel-table quadro-table">
        <tr><td><strong>Material</strong></td><td><strong>Sem perda</strong></td><td><strong>Com ${config.perda}% de perda</strong></td></tr>
        <tr><td>Condutor 1,5 mm² (iluminação/interruptor)</td><td>${totalCondutorLuz.toFixed(1)} m</td><td>${(totalCondutorLuz * (1 + config.perda / 100)).toFixed(1)} m</td></tr>
        <tr><td>Condutor 2,5 mm² (tomadas)</td><td>${totalCondutorTomada.toFixed(1)} m</td><td>${(totalCondutorTomada * (1 + config.perda / 100)).toFixed(1)} m</td></tr>
        <tr><td>Eletroduto ${DIAM_ELETRODUTO_LUZ}</td><td>${totalEletrodutoLuz.toFixed(1)} m</td><td>${(totalEletrodutoLuz * (1 + config.perda / 100)).toFixed(1)} m</td></tr>
        <tr><td>Eletroduto ${DIAM_ELETRODUTO_TOMADA}</td><td>${totalEletrodutoTomada.toFixed(1)} m</td><td>${(totalEletrodutoTomada * (1 + config.perda / 100)).toFixed(1)} m</td></tr>
      </table>
      <p class="hint">Compra sugerida: arredonde para cima conforme o comprimento dos rolos/lances disponíveis no fornecedor (ex.: rolos de 100 m).</p>
    </section>

    <section class="card">
      <h2>Quadro de distribuição — sugestão de circuitos</h2>
      <p class="hint">
        Agrupamento de referência (máx. ${MAX_PONTOS_LUZ_POR_CIRCUITO} pontos de luz e
        ${MAX_TOMADAS_POR_CIRCUITO} tomadas por circuito): <strong>${circuitosLuz.length}</strong>
        disjuntor(es) de iluminação + <strong>${circuitosTomada.length}</strong> disjuntor(es) de TUG
        + <strong>1</strong> disjuntor geral do QDC = <strong>${totalDisjuntores}</strong> disjuntores no total.
        Circuitos de tomada de uso específico (chuveiro, forno, ar-condicionado, torneira elétrica etc.)
        não estão incluídos — devem ser dimensionados à parte, conforme a potência de cada equipamento.
        O disjuntor geral deve ser calculado sobre a carga total instalada e fator de demanda —
        recomendamos revisão por profissional habilitado antes da execução.
      </p>
      <table class="rel-table quadro-table">
        <tr><td><strong>Circuito</strong></td><td><strong>Pontos</strong></td><td><strong>Condutor</strong></td><td><strong>Disjuntor</strong></td></tr>
        ${circuitosHtml}
        <tr><td>Disjuntor geral do QDC</td><td>—</td><td>—</td><td>a calcular*</td></tr>
        <tr><td>Condutor de proteção (terra/PE)</td><td>todos os circuitos</td><td>mesma seção da fase**</td><td>—</td></tr>
      </table>
      <p class="hint">*Dimensionar pela carga total instalada e fator de demanda. **Para condutores fase até 16 mm², o PE deve ter a mesma seção (NBR 5410, tabela de seção mínima do condutor de proteção).</p>

      <h2 style="margin-top:18px">Cores dos condutores (NBR 5410)</h2>
      <table class="rel-table">
        <tr><td>Fase</td><td>Preto, vermelho, branco, cinza ou marrom</td></tr>
        <tr><td>Neutro</td><td>Azul-claro</td></tr>
        <tr><td>Retorno de interruptor</td><td>Vermelho (praxe de mercado)</td></tr>
        <tr><td>Proteção / Terra (PE)</td><td>Verde ou verde-amarelo</td></tr>
      </table>
    </section>`;
}

function initImprimir() {
  document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
}

/* ---------- Service worker (PWA offline) ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- Init ---------- */
window.addEventListener("DOMContentLoaded", () => {
  carregarDados();
  initTabs();
  initFormAmbiente();
  initConfig();
  initObra();
  initImprimir();
  renderListaAmbientes();
});
