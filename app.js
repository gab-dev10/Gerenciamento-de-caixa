// ===================== SUPABASE =====================
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
 
let servicos     = [];
let despesas     = [];
let tiposLavagem = [];
let categorias   = [];
 
// Carrega todos os dados do banco ao iniciar
async function loadAll() {
  showLoading(true);
  try {
    const [s, d, t, c] = await Promise.all([
      db.from('servicos').select('*').order('criado_em', { ascending: false }),
      db.from('despesas').select('*').order('criado_em', { ascending: false }),
      db.from('tipos_lavagem').select('*'),
      db.from('categorias').select('*')
    ]);
    servicos     = s.data || [];
    despesas     = d.data || [];
    tiposLavagem = t.data || [];
    categorias   = c.data || [];
  } catch (e) {
    showToast('Erro ao carregar dados', 'error');
  }
  showLoading(false);
}
 
// Funções de escrita no banco
async function dbInsert(table, obj) {
  const { error } = await db.from(table).insert(obj);
  if (error) throw error;
}
 
async function dbUpdate(table, id, obj) {
  const { error } = await db.from(table).update(obj).eq('id', id);
  if (error) throw error;
}
 
async function dbDelete(table, id) {
  const { error } = await db.from(table).delete().eq('id', id);
  if (error) throw error;
}
 
// Loading overlay
function showLoading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// ===================== LOGIN =====================
async function fazerLogin() {
  const senha = document.getElementById('login-senha').value;
  if (!senha) return;

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(senha));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data, error } = await db.from('config').select('valor').eq('chave', 'senha_hash').single();

  if (error || !data || data.valor !== hashHex) {
    document.getElementById('login-erro').style.display = 'block';
    document.getElementById('login-senha').value = '';
    return;
  }

  sessionStorage.setItem('lj_auth', '1');
  document.getElementById('tela-login').style.display = 'none';
  await loadAll();
  populateFormSelects();
  refreshDashboard();
}

function verificarLogin() {
  if (sessionStorage.getItem('lj_auth') !== '1') {
    document.getElementById('tela-login').style.display = 'flex';
    return false;
  }
  document.getElementById('tela-login').style.display = 'none';
  return true;
}

// ===================== UTILITÁRIOS =====================
const fmt    = v => 'R$ ' + (v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today  = () => new Date().toISOString().slice(0, 10);
const isFuture = dateStr => dateStr > today();

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ===================== PERÍODO =====================
let currentPeriod = 'mes';
let customStart = null, customEnd = null;

function getPeriodDates() {
  const now = new Date();
  let start, end;
  if (currentPeriod === 'semana') {
    const day = now.getDay();
    start = new Date(now);
    start.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (currentPeriod === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (currentPeriod === 'mes_ant') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else {
    start = customStart ? new Date(customStart + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
    end   = customEnd   ? new Date(customEnd   + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return { start, end };
}

function inPeriod(dateStr) {
  const { start, end } = getPeriodDates();
  const d = new Date(dateStr + 'T00:00:00');
  return d >= start && d <= end;
}

function setPeriod(p, ev) {
  currentPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (ev && ev.target) ev.target.classList.add('active');
  document.getElementById('period-custom-bar').style.display = p === 'custom' ? 'flex' : 'none';
  if (p !== 'custom') refreshDashboard();
}

function applyCustomPeriod() {
  customStart = document.getElementById('custom-start').value;
  customEnd   = document.getElementById('custom-end').value;
  refreshDashboard();
}

// ===================== NAVEGAÇÃO =====================
function goPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'dashboard')   refreshDashboard();
  if (name === 'historico')   renderHistorico();
  if (name === 'lancamentos') populateFormSelects();
}

// ===================== LANÇAMENTOS =====================
let currentTipo   = 'servico';
let currentStatus = 'pago';
let editingId     = null;
let editingType   = null;

function setTipo(t) {
  currentTipo = t;
  document.querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('active'));
  document.querySelector('.toggle-opt.' + t).classList.add('active');
  document.getElementById('form-servico').classList.toggle('active', t === 'servico');
  document.getElementById('form-despesa').classList.toggle('active', t === 'despesa');
}

function setStatus(s) {
  currentStatus = s;
  document.querySelectorAll('.status-opt').forEach(b => b.classList.remove('active'));
  document.querySelector('.status-opt.' + s).classList.add('active');
}

function populateFormSelects() {
  const selTipo = document.getElementById('s-tipo');
  const selCat  = document.getElementById('d-categoria');
  const fsTipo  = document.getElementById('f-s-tipo');
  const fdCat   = document.getElementById('f-d-cat');

  // Tipo de lavagem nos formulários e filtros
  [selTipo, fsTipo].forEach(el => {
    if (!el) return;
    const placeholder = el === fsTipo ? 'Todos os tipos' : 'Selecionar tipo';
    el.innerHTML = `<option value="">${placeholder}</option>`;
    tiposLavagem.filter(t => t.ativo).forEach(t => {
      el.innerHTML += `<option value="${t.id}">${t.nome} — ${fmt(t.preco)}</option>`;
    });
  });

  // Categoria de despesa nos formulários e filtros
  [selCat, fdCat].forEach(el => {
    if (!el) return;
    const placeholder = el === fdCat ? 'Todas as categorias' : 'Selecionar';
    el.innerHTML = `<option value="">${placeholder}</option>`;
    categorias.filter(c => c.ativo).forEach(c => {
      el.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
  });
}

function autoPreco() {
  const sel = document.getElementById('s-tipo').value;
  const t   = tiposLavagem.find(x => x.id === sel);
  if (t && !editingId) document.getElementById('s-preco').value = t.preco;
}

// Detecta se a data escolhida é futura → agendamento
function detectarAgendamento() {
  const data = document.getElementById('s-data').value;
  const banner = document.getElementById('agendamento-banner');
  if (data && isFuture(data)) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// ===================== SALVAR SERVIÇO =====================
async function salvarServico() {
  const data      = document.getElementById('s-data').value;
  const cliente   = document.getElementById('s-cliente').value.trim();
  const carro     = document.getElementById('s-carro').value.trim();
  const tipo      = document.getElementById('s-tipo').value;
  const preco     = parseFloat(document.getElementById('s-preco').value);
  const pagamento = document.getElementById('s-pagamento').value;
  const obs       = document.getElementById('s-obs').value.trim();
 
  if (!data || !cliente || !carro || !tipo || isNaN(preco)) {
    showToast('Preencha todos os campos obrigatórios!', 'error');
    return;
  }
 
  const agendado    = isFuture(data);
  const statusFinal = agendado ? 'nao-pago' : currentStatus;
 
  const obj = {
    id: editingId || uid(),
    data, cliente, carro,
    tipo_id: tipo, preco, pagamento,
    status: statusFinal,
    agendado,
    data_pagamento: statusFinal === 'pago' ? today() : null,
    obs,
    criado_em: editingId ? undefined : today()
  };
 
  try {
    showLoading(true);
    if (editingId) {
      await dbUpdate('servicos', editingId, obj);
      const idx = servicos.findIndex(s => s.id === editingId);
      servicos[idx] = { ...servicos[idx], ...obj };
      showToast(agendado ? '📅 Agendamento atualizado!' : '✅ Serviço atualizado!');
      cancelEdit();
    } else {
      obj.criado_em = today();
      await dbInsert('servicos', obj);
      servicos.unshift(obj);
      showToast(agendado ? '📅 Agendamento registrado!' : '✅ Serviço salvo!');
      limparFormServico();
    }
  } catch (e) {
    showToast('Erro ao salvar serviço', 'error');
  }
  showLoading(false);
  refreshDashboard();
}
 
// ===================== SALVAR DESPESA =====================
async function salvarDespesa() {
  const data  = document.getElementById('d-data').value;
  const cat   = document.getElementById('d-categoria').value;
  const desc  = document.getElementById('d-descricao').value.trim();
  const valor = parseFloat(document.getElementById('d-valor').value);
  const obs   = document.getElementById('d-obs').value.trim();
 
  if (!data || !cat || !desc || isNaN(valor)) {
    showToast('Preencha todos os campos obrigatórios!', 'error');
    return;
  }
 
  const obj = {
    id: editingId || uid(),
    data, categoria_id: cat,
    descricao: desc, valor, obs
  };
 
  try {
    showLoading(true);
    if (editingId) {
      await dbUpdate('despesas', editingId, obj);
      const idx = despesas.findIndex(d => d.id === editingId);
      despesas[idx] = { ...despesas[idx], ...obj };
      showToast('✅ Despesa atualizada!');
      cancelEdit();
    } else {
      obj.criado_em = today();
      await dbInsert('despesas', obj);
      despesas.unshift(obj);
      showToast('✅ Despesa salva!');
      limparFormDespesa();
    }
  } catch (e) {
    showToast('Erro ao salvar despesa', 'error');
  }
  showLoading(false);
  refreshDashboard();
}

function limparFormServico() {
  document.getElementById('s-data').value     = today();
  document.getElementById('s-cliente').value  = '';
  document.getElementById('s-carro').value    = '';
  document.getElementById('s-tipo').value     = '';
  document.getElementById('s-preco').value    = '';
  document.getElementById('s-pagamento').value = '';
  document.getElementById('s-obs').value      = '';
  document.getElementById('agendamento-banner').style.display = 'none';
  setStatus('pago');
}

function limparFormDespesa() {
  document.getElementById('d-data').value      = today();
  document.getElementById('d-categoria').value = '';
  document.getElementById('d-descricao').value = '';
  document.getElementById('d-valor').value     = '';
  document.getElementById('d-obs').value       = '';
}

function cancelEdit() {
  editingId = null;
  editingType = null;
  document.getElementById('edit-banner').style.display = 'none';
  limparFormServico();
  limparFormDespesa();
}

// ===================== DASHBOARD =====================
let charts = {};

function refreshDashboard() {
  const { start, end } = getPeriodDates();
  const servPeriod = servicos.filter(s => inPeriod(s.data));
  const despPeriod = despesas.filter(d => inPeriod(d.data));

  // Agendamentos futuros (qualquer data)
  const agendamentos = servicos.filter(s => s.agendado && isFuture(s.data));

  // Apenas serviços reais (não futuros agendados)
  const servReais = servPeriod.filter(s => !s.agendado || !isFuture(s.data));

  const receita  = servReais.filter(s => s.status === 'pago').reduce((a, s) => a + s.preco, 0);
  const desp     = despPeriod.reduce((a, d) => a + d.valor, 0);
  const lucro    = receita - desp;
  const lavagens = servReais.length;
  const areceber = servReais.filter(s => s.status === 'nao-pago').reduce((a, s) => a + s.preco, 0);
  const pagos    = servReais.filter(s => s.status === 'pago');
  const ticket   = pagos.length ? receita / pagos.length : 0;

  document.getElementById('kpi-receita').textContent  = fmt(receita);
  document.getElementById('kpi-despesas').textContent = fmt(desp);
  document.getElementById('kpi-lucro').textContent    = fmt(lucro);
  document.getElementById('kpi-lucro').style.color    = lucro >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('kpi-lavagens').textContent = lavagens;
  document.getElementById('kpi-areceber').textContent = fmt(areceber);
  document.getElementById('kpi-ticket').textContent   = fmt(ticket);

  // ---- PAINEL DE AGENDAMENTOS ----
  const panelEl = document.getElementById('agendamentos-panel');
  const agList  = document.getElementById('ag-list');
  const agCount = document.getElementById('ag-count');

  if (agendamentos.length > 0) {
    panelEl.style.display = 'block';
    agCount.textContent = agendamentos.length + (agendamentos.length === 1 ? ' agendamento' : ' agendamentos');
    agList.innerHTML = agendamentos
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(s => {
        const t = tiposLavagem.find(x => x.id === s.tipo_id);
        const diasRestantes = Math.ceil((new Date(s.data + 'T00:00:00') - new Date()) / 86400000);
        const labelDias = diasRestantes === 1 ? 'amanhã' : `em ${diasRestantes} dias`;
        return `<div class="ag-item">
          <div class="ag-icon">📅</div>
          <div class="ag-info">
            <div class="ag-name">${s.cliente} — ${s.carro}</div>
            <div class="ag-sub">${fmtDate(s.data)} · ${t ? t.nome : '—'} · <strong style="color:var(--blue)">${labelDias}</strong></div>
          </div>
          <div class="ag-value">${fmt(s.preco)}</div>
          <button class="btn-pagar" onclick="marcarPago('${s.id}')">✓ Pago</button>
        </div>`;
      }).join('');
  } else {
    panelEl.style.display = 'none';
  }

  // ---- PENDÊNCIAS ----
  const pendentes = servicos.filter(s => s.status === 'nao-pago' && (!s.agendado || !isFuture(s.data)))
    .sort((a, b) => a.data.localeCompare(b.data));
  const totalPend = pendentes.reduce((a, s) => a + s.preco, 0);
  document.getElementById('pend-total-label').textContent = fmt(totalPend);

  const pl = document.getElementById('pend-list');
  if (pendentes.length === 0) {
    pl.innerHTML = '<div class="empty-state">🎉 Nenhuma pendência!</div>';
  } else {
    pl.innerHTML = pendentes.map(s => {
      const tipo = tiposLavagem.find(t => t.id === s.tipo_id);
      return `<div class="pend-item">
        <div class="dot yellow"></div>
        <div class="pend-info">
          <div class="pend-name">${s.cliente} — ${s.carro}</div>
          <div class="pend-sub">${fmtDate(s.data)} · ${tipo ? tipo.nome : '—'}</div>
        </div>
        <div class="pend-value">${fmt(s.preco)}</div>
        <button class="btn-pagar" onclick="marcarPago('${s.id}')">✓ Pago</button>
      </div>`;
    }).join('');
  }

  buildCharts(servReais, despPeriod, start, end);
}

function buildCharts(servs, desps, start, end) {
  Chart.defaults.color       = '#8896b0';
  Chart.defaults.borderColor = '#2a3248';

  const baseOpt = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  // Gera array de dias entre start e end
  const days = [];
  const cur  = new Date(start);
  while (cur <= end && days.length < 62) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  let labels, receitaData, despData;

  if (days.length <= 31) {
    labels      = days.map(d => { const [,m,dy] = d.split('-'); return `${dy}/${m}`; });
    receitaData = days.map(d => servs.filter(s => s.data === d && s.status === 'pago').reduce((a, s) => a + s.preco, 0));
    despData    = days.map(d => desps.filter(x => x.data === d).reduce((a, x) => a + x.valor, 0));
  } else {
    const weeks = {};
    days.forEach(d => {
      const dt  = new Date(d + 'T00:00:00');
      const key = `${d.slice(0,7)}-S${Math.ceil(dt.getDate() / 7)}`;
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(d);
    });
    labels      = Object.keys(weeks);
    receitaData = labels.map(k => weeks[k].reduce((a, d) => a + servs.filter(s => s.data === d && s.status === 'pago').reduce((x, s) => x + s.preco, 0), 0));
    despData    = labels.map(k => weeks[k].reduce((a, d) => a + desps.filter(x => x.data === d).reduce((x, s) => x + s.valor, 0), 0));
  }

  // Receita x Despesas
  mkChart('chartRecDesp', 'bar', {
    labels,
    datasets: [
      { label: 'Receita',   data: receitaData, backgroundColor: 'rgba(34,211,165,0.7)',  borderRadius: 6 },
      { label: 'Despesas',  data: despData,    backgroundColor: 'rgba(248,113,113,0.7)', borderRadius: 6 }
    ]
  }, { ...baseOpt, plugins: { legend: { display: true, labels: { color: '#8896b0', boxWidth: 12 } } } });

  // Evolução de lavagens por dia
  const lavDay = days.map(d => servs.filter(s => s.data === d).length);
  mkChart('chartLavagens', 'line', {
    labels: days.map(d => { const [,m,dy] = d.split('-'); return `${dy}/${m}`; }),
    datasets: [{
      data: lavDay, borderColor: '#60a5fa',
      backgroundColor: 'rgba(96,165,250,0.1)',
      fill: true, tension: 0.4, pointRadius: 3
    }]
  }, baseOpt);

  // Receita por dia da semana
  const dias      = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const recSemana = dias.map((_, i) =>
    servs.filter(s => s.status === 'pago' && new Date(s.data + 'T00:00:00').getDay() === i)
         .reduce((a, s) => a + s.preco, 0)
  );
  mkChart('chartDiaSemana', 'bar', {
    labels: dias,
    datasets: [{ data: recSemana, backgroundColor: 'rgba(167,139,250,0.7)', borderRadius: 6 }]
  }, baseOpt);

  // Pizza — tipos de serviço
  const tipoCount = {};
  servs.forEach(s => {
    const t    = tiposLavagem.find(x => x.id === s.tipo_id);
    const nome = t ? t.nome.split('—')[0].trim() : 'Outro';
    tipoCount[nome] = (tipoCount[nome] || 0) + 1;
  });
  const pizzaColors = ['#3be8a0', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#34d399'];
  mkChart('chartTipos', 'doughnut', {
    labels: Object.keys(tipoCount),
    datasets: [{ data: Object.values(tipoCount), backgroundColor: pizzaColors, borderWidth: 0 }]
  }, { ...baseOpt, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#8896b0', boxWidth: 10, font: { size: 11 } } } } });

  // Pizza — despesas por categoria
  const catVal = {};
  desps.forEach(d => {
    const c    = categorias.find(x => x.id === d.categoria_id);
    const nome = c ? c.nome : 'Outro';
    catVal[nome] = (catVal[nome] || 0) + d.valor;
  });
  mkChart('chartDespesasCat', 'doughnut', {
    labels: Object.keys(catVal),
    datasets: [{ data: Object.values(catVal), backgroundColor: [...pizzaColors].reverse(), borderWidth: 0 }]
  }, { ...baseOpt, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#8896b0', boxWidth: 10, font: { size: 11 } } } } });
}

function mkChart(id, type, data, options) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, { type, data, options });
}

// ===================== MARCAR PAGO =====================
function marcarPago(id) {
  openModal(
    'Confirmar Pagamento',
    `Marcar como pago? A data será registrada como hoje (${fmtDate(today())}).`,
    async () => {
      try {
        showLoading(true);
        const updates = { status: 'pago', agendado: false, data_pagamento: today() };
        await dbUpdate('servicos', id, updates);
        const s = servicos.find(x => x.id === id);
        if (s) Object.assign(s, updates);
        showToast('✅ Serviço marcado como pago!');
      } catch (e) {
        showToast('Erro ao atualizar', 'error');
      }
      showLoading(false);
      refreshDashboard();
    },
    'green'
  );
}

// ===================== HISTÓRICO =====================
let histTab = 'servicos';

function setHistTab(tab) {
  histTab = tab;
  document.getElementById('tab-servicos').classList.toggle('active', tab === 'servicos');
  document.getElementById('tab-despesas').classList.toggle('active', tab === 'despesas');
  document.getElementById('filtros-servicos').style.display = tab === 'servicos' ? 'flex' : 'none';
  document.getElementById('filtros-despesas').style.display = tab === 'despesas' ? 'flex' : 'none';
  renderHistorico();
}

function renderHistorico() {
  const list = document.getElementById('hist-list');
  let items = [], total = 0;

  if (histTab === 'servicos') {
    let data   = [...servicos];
    const ini   = document.getElementById('f-s-ini').value;
    const fim   = document.getElementById('f-s-fim').value;
    const status = document.getElementById('f-s-status').value;
    const tipo  = document.getElementById('f-s-tipo').value;
    const busca = document.getElementById('f-s-busca').value.toLowerCase();

    if (ini)    data = data.filter(s => s.data >= ini);
    if (fim)    data = data.filter(s => s.data <= fim);
    if (status) data = data.filter(s => s.status === status);
    if (tipo)   data = data.filter(s => s.tipo_id === tipo);
    if (busca)  data = data.filter(s =>
      s.cliente.toLowerCase().includes(busca) || s.carro.toLowerCase().includes(busca)
    );

    total = data.filter(s => s.status === 'pago').reduce((a, s) => a + s.preco, 0);

    items = data.map(s => {
      const t         = tiposLavagem.find(x => x.id === s.tipo_id);
      const isAgend   = s.agendado && isFuture(s.data);
      const statusTxt = isAgend ? 'Agendado' : (s.status === 'pago' ? 'Pago' : 'Não Pago');
      const badgeCls  = isAgend ? 'agendado' : (s.status === 'pago' ? 'pago' : 'nao-pago');
      const dotCls    = isAgend ? 'blue' : (s.status === 'pago' ? 'green' : 'yellow');

      return `<div class="hist-item">
        <div class="dot ${dotCls}"></div>
        <div class="hist-info">
          <div class="hist-main">${s.cliente} — ${s.carro}</div>
          <div class="hist-sub">${fmtDate(s.data)} · ${t ? t.nome : '—'} · ${s.pagamento || '—'}</div>
        </div>
        <span class="badge ${badgeCls}">${statusTxt}</span>
        <div class="hist-value green">${fmt(s.preco)}</div>
        <div class="hist-actions">
          <button class="btn-icon" onclick="editarServico('${s.id}')">✏️</button>
          <button class="btn-icon del" onclick="deletarServico('${s.id}')">🗑️</button>
        </div>
      </div>`;
    });

    document.getElementById('hist-count').textContent = data.length + ' registros';
    document.getElementById('hist-total').textContent = fmt(total);

  } else {
    let data   = [...despesas];
    const ini   = document.getElementById('f-d-ini').value;
    const fim   = document.getElementById('f-d-fim').value;
    const cat   = document.getElementById('f-d-cat').value;
    const busca = document.getElementById('f-d-busca').value.toLowerCase();

    if (ini)   data = data.filter(d => d.data >= ini);
    if (fim)   data = data.filter(d => d.data <= fim);
    if (cat)   data = data.filter(d => d.categoria_id === cat);
    if (busca) data = data.filter(d => d.descricao.toLowerCase().includes(busca));

    total = data.reduce((a, d) => a + d.valor, 0);

    items = data.map(d => {
      const c = categorias.find(x => x.id === d.categoria_id);
      return `<div class="hist-item">
        <div class="dot red"></div>
        <div class="hist-info">
          <div class="hist-main">${d.descricao}</div>
          <div class="hist-sub">${fmtDate(d.data)} · ${c ? c.nome : '—'}</div>
        </div>
        <div class="hist-value red">${fmt(d.valor)}</div>
        <div class="hist-actions">
          <button class="btn-icon" onclick="editarDespesa('${d.id}')">✏️</button>
          <button class="btn-icon del" onclick="deletarDespesa('${d.id}')">🗑️</button>
        </div>
      </div>`;
    });

    document.getElementById('hist-count').textContent = data.length + ' registros';
    document.getElementById('hist-total').textContent = fmt(total);
  }

  list.innerHTML = items.length
    ? items.join('')
    : '<div class="empty-state">📭 Nenhum registro encontrado</div>';
}

function editarServico(id) {
  const s = servicos.find(x => x.id === id);
  if (!s) return;
  editingId   = id;
  editingType = 'servico';
  goPage('lancamentos');
  setTipo('servico');
  setTimeout(() => {
    document.getElementById('s-data').value      = s.data;
    document.getElementById('s-cliente').value   = s.cliente;
    document.getElementById('s-carro').value     = s.carro;
    document.getElementById('s-tipo').value      = s.tipo_id;
    document.getElementById('s-preco').value     = s.preco;
    document.getElementById('s-pagamento').value = s.pagamento || '';
    document.getElementById('s-obs').value       = s.obs || '';
    setStatus(s.status);
    detectarAgendamento();
    document.getElementById('edit-banner').style.display = 'block';
  }, 100);
}

function editarDespesa(id) {
  const d = despesas.find(x => x.id === id);
  if (!d) return;
  editingId   = id;
  editingType = 'despesa';
  goPage('lancamentos');
  setTipo('despesa');
  setTimeout(() => {
    document.getElementById('d-data').value      = d.data;
    document.getElementById('d-categoria').value = d.categoria_id;
    document.getElementById('d-descricao').value = d.descricao;
    document.getElementById('d-valor').value     = d.valor;
    document.getElementById('d-obs').value       = d.obs || '';
    document.getElementById('edit-banner').style.display = 'block';
  }, 100);
}

// ===================== DELETAR SERVIÇO =====================
function deletarServico(id) {
  openModal('Excluir Serviço', 'Tem certeza? Esta ação não pode ser desfeita.', async () => {
    try {
      showLoading(true);
      await dbDelete('servicos', id);
      servicos = servicos.filter(s => s.id !== id);
      showToast('Serviço excluído.');
    } catch (e) {
      showToast('Erro ao excluir', 'error');
    }
    showLoading(false);
    renderHistorico();
    refreshDashboard();
  });
}
 
// ===================== DELETAR DESPESA =====================
function deletarDespesa(id) {
  openModal('Excluir Despesa', 'Tem certeza? Esta ação não pode ser desfeita.', async () => {
    try {
      showLoading(true);
      await dbDelete('despesas', id);
      despesas = despesas.filter(d => d.id !== id);
      showToast('Despesa excluída.');
    } catch (e) {
      showToast('Erro ao excluir', 'error');
    }
    showLoading(false);
    renderHistorico();
    refreshDashboard();
  });
}

// ===================== MODAL =====================
let pendingAction = null;

function openModal(title, msg, action, btnClass = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent   = msg;
  const ok = document.getElementById('modal-ok');
  ok.className   = 'btn-confirm' + (btnClass ? ' ' + btnClass : '');
  pendingAction  = action;
  document.getElementById('modal-confirm').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-confirm').classList.remove('open');
  pendingAction = null;
}

function confirmAction() {
  if (pendingAction) pendingAction();
  closeModal();
}

// ===================== CONFIGURAÇÕES =====================
function openSettings() {
  renderConfigLists();
  document.getElementById('modal-config').classList.add('open');
}

function closeConfig() {
  document.getElementById('modal-config').classList.remove('open');
  populateFormSelects();
}

function renderConfigLists() {
  const tl = document.getElementById('config-tipos-list');
  tl.innerHTML = tiposLavagem.filter(t => t.ativo).map(t =>
    `<div class="config-item">
      <span class="config-item-name">${t.nome}</span>
      <span class="config-item-price">${fmt(t.preco)}</span>
      <button class="btn-icon del" onclick="delTipo('${t.id}')">✕</button>
    </div>`
  ).join('') || '<div style="color:var(--muted);font-size:0.82rem">Nenhum tipo cadastrado</div>';

  const cl = document.getElementById('config-cats-list');
  cl.innerHTML = categorias.filter(c => c.ativo).map(c =>
    `<div class="config-item">
      <span class="config-item-name">${c.nome}</span>
      <button class="btn-icon del" onclick="delCat('${c.id}')">✕</button>
    </div>`
  ).join('') || '<div style="color:var(--muted);font-size:0.82rem">Nenhuma categoria cadastrada</div>';
}

// ===================== ADICIONAR TIPO =====================
async function addTipo() {
  const nome  = document.getElementById('novo-tipo-nome').value.trim();
  const preco = parseFloat(document.getElementById('novo-tipo-preco').value) || 0;
  if (!nome) { showToast('Informe o nome do tipo', 'error'); return; }
  const obj = { id: uid(), nome, preco, ativo: true };
  try {
    await dbInsert('tipos_lavagem', obj);
    tiposLavagem.push(obj);
    renderConfigLists();
    document.getElementById('novo-tipo-nome').value  = '';
    document.getElementById('novo-tipo-preco').value = '';
    showToast('Tipo adicionado!');
  } catch (e) {
    showToast('Erro ao adicionar tipo', 'error');
  }
}
 
// ===================== DELETAR TIPO =====================
async function delTipo(id) {
  try {
    await dbUpdate('tipos_lavagem', id, { ativo: false });
    tiposLavagem = tiposLavagem.map(t => t.id === id ? { ...t, ativo: false } : t);
    renderConfigLists();
  } catch (e) {
    showToast('Erro ao remover tipo', 'error');
  }
}

// ===================== ADICIONAR CATEGORIA =====================
async function addCategoria() {
  const nome = document.getElementById('nova-cat-nome').value.trim();
  if (!nome) { showToast('Informe o nome da categoria', 'error'); return; }
  const obj = { id: uid(), nome, ativo: true };
  try {
    await dbInsert('categorias', obj);
    categorias.push(obj);
    renderConfigLists();
    document.getElementById('nova-cat-nome').value = '';
    showToast('Categoria adicionada!');
  } catch (e) {
    showToast('Erro ao adicionar categoria', 'error');
  }
}
 
// ===================== DELETAR CATEGORIA =====================
async function delCat(id) {
  try {
    await dbUpdate('categorias', id, { ativo: false });
    categorias = categorias.map(c => c.id === id ? { ...c, ativo: false } : c);
    renderConfigLists();
  } catch (e) {
    showToast('Erro ao remover categoria', 'error');
  }
}

// ===================== EXPORTAR =====================
function exportCSV() {
  const sp = servicos.filter(s => inPeriod(s.data));
  const dp = despesas.filter(d => inPeriod(d.data));

  let csv = 'SERVIÇOS\n';
  csv += 'Data,Cliente,Carro,Tipo,Preço,Pagamento,Status,Agendado\n';
  sp.forEach(s => {
    const t = tiposLavagem.find(x => x.id === s.tipo_id);
    csv += `${s.data},${s.cliente},${s.carro},${t ? t.nome : ''},${s.preco},${s.pagamento || ''},${s.status},${s.agendado ? 'Sim' : 'Não'}\n`;
  });

  csv += '\nDESPESAS\n';
  csv += 'Data,Categoria,Descrição,Valor\n';
  dp.forEach(d => {
    const c = categorias.find(x => x.id === d.categoria_id);
    csv += `${d.data},${c ? c.nome : ''},${d.descricao},${d.valor}\n`;
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `lavajato_relatorio.csv`;
  a.click();
  showToast('📥 CSV exportado!');
}

function exportPrint() {
  const sp      = servicos.filter(s => inPeriod(s.data));
  const dp      = despesas.filter(d => inPeriod(d.data));
  const receita = sp.filter(s => s.status === 'pago').reduce((a, s) => a + s.preco, 0);
  const desp    = dp.reduce((a, d) => a + d.valor, 0);

  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Relatório LavaJato</title>
  <style>
    body{font-family:sans-serif;padding:20px;color:#111}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th,td{padding:8px;border:1px solid #ddd;font-size:0.85rem}
    th{background:#f0f0f0}
    h2{margin-top:24px}
    @media print{.no-print{display:none}}
  </style>
  </head><body>
  <h1>Relatório — LavaJato</h1>
  <p>Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
  <h2>Resumo Financeiro</h2>
  <table>
    <tr><th>Receita Total</th><th>Despesas</th><th>Lucro Líquido</th></tr>
    <tr><td>${fmt(receita)}</td><td>${fmt(desp)}</td><td>${fmt(receita - desp)}</td></tr>
  </table>
  <h2>Serviços</h2>
  <table>
    <tr><th>Data</th><th>Cliente</th><th>Carro</th><th>Tipo</th><th>Valor</th><th>Status</th></tr>
    ${sp.map(s => {
      const t = tiposLavagem.find(x => x.id === s.tipo_id);
      const isAgend = s.agendado && isFuture(s.data);
      return `<tr><td>${fmtDate(s.data)}</td><td>${s.cliente}</td><td>${s.carro}</td><td>${t ? t.nome : ''}</td><td>${fmt(s.preco)}</td><td>${isAgend ? 'Agendado' : s.status}</td></tr>`;
    }).join('')}
  </table>
  <h2>Despesas</h2>
  <table>
    <tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr>
    ${dp.map(d => {
      const c = categorias.find(x => x.id === d.categoria_id);
      return `<tr><td>${fmtDate(d.data)}</td><td>${c ? c.nome : ''}</td><td>${d.descricao}</td><td>${fmt(d.valor)}</td></tr>`;
    }).join('')}
  </table>
  <button class="no-print" onclick="window.print()">🖨️ Imprimir</button>
  </body></html>`);
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('s-data').value = today();
  document.getElementById('d-data').value = today();
  document.getElementById('today-label').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
 
  document.getElementById('s-data').addEventListener('change', detectarAgendamento);
 
  document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target.id === 'modal-confirm') closeModal();
  });
  document.getElementById('modal-config').addEventListener('click', e => {
    if (e.target.id === 'modal-config') closeConfig();
  });
 
  if (!verificarLogin()) return;

  await loadAll();          // carrega do Supabase
  populateFormSelects();
  refreshDashboard();
});
