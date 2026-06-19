// ---------- Configuração ----------

const SHEET_BASE = "https://opensheet.elk.sh/1mom9hynDfQHN5MxXSeZQM3M63Tb11tb7hc-td8Zsapc";
const URLS = {
  faturamento: `${SHEET_BASE}/Faturamento`,
  produtos: `${SHEET_BASE}/Produtos`,
  gastos: `${SHEET_BASE}/Gastos`,
};

const PRODUCT_COLUMNS = ["Milk-shake", "Cascão", "Casquinha", "Cascão Trufado", "Sundae", "Açaí"];
const EXPENSE_CATEGORIES = ["Estoque", "Luz", "Aluguel", "Água", "Funcionários", "Outros"];
const MONTHLY_GOAL = 6000;

const CATEGORY_COLORS = {
  Estoque: "#a78bfa",
  Luz: "#fbbf24",
  Aluguel: "#60a5fa",
  Água: "#34d399",
  Funcionários: "#fb923c",
  Outros: "#f87171",
};

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// ---------- Estado ----------

let state = {
  faturamento: [],
  produtos: [],
  gastos: [],
  selectedMonthKey: null,
};

// ---------- Utilitários de formatação ----------

function formatCurrency(value) {
  return "R$ " + (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value) {
  return (value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function formatPercent(value) {
  return `${(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ---------- Utilitários de parsing ----------

function parseValor(raw) {
  if (typeof raw === "number") return raw;
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  s = s.replace(/r\$/gi, "").replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDataBR(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    let [d, m, y] = parts.map((p) => parseInt(p, 10));
    if (y < 100) y += 2000;
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(s);
  return isNaN(date.getTime()) ? null : date;
}

function normalizeText(str) {
  return String(str || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function monthNameToIndex(name) {
  if (name == null || name === "") return null;
  const norm = normalizeText(name);
  const idx = MONTHS_PT.findIndex((m) => normalizeText(m) === norm);
  if (idx >= 0) return idx;
  const n = parseInt(name, 10);
  return isNaN(n) ? null : n - 1;
}

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthKeyOf(row) {
  const ano = parseInt(row["Ano"], 10);
  const mesIdx = monthNameToIndex(row["Mês"]);
  if (isNaN(ano) || mesIdx == null) return null;
  return `${ano}-${mesIdx}`;
}

// ---------- Carregamento de dados ----------

async function fetchSheet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar ${url}`);
  return res.json();
}

async function loadAllData() {
  const [faturamento, produtos, gastos] = await Promise.all([
    fetchSheet(URLS.faturamento),
    fetchSheet(URLS.produtos),
    fetchSheet(URLS.gastos),
  ]);
  return { faturamento, produtos, gastos };
}

// ---------- Construção da lista de meses ----------

function buildMonthOptions() {
  const map = new Map();

  [...state.faturamento, ...state.produtos, ...state.gastos].forEach((row) => {
    const key = monthKeyOf(row);
    if (!key) return;
    if (!map.has(key)) {
      const ano = parseInt(row["Ano"], 10);
      const mesIdx = monthNameToIndex(row["Mês"]);
      const label = `${row["Mês"]} ${ano}`.trim();
      map.set(key, { key, ano, mesIdx, label });
    }
  });

  return [...map.values()].sort((a, b) => (b.ano * 12 + b.mesIdx) - (a.ano * 12 + a.mesIdx));
}

function renderMonthSelect(options) {
  const select = document.getElementById("month-select");
  select.innerHTML = "";

  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.key;
    el.textContent = opt.label.charAt(0).toUpperCase() + opt.label.slice(1);
    select.appendChild(el);
  });

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
  state.selectedMonthKey = options.some((o) => o.key === currentKey)
    ? currentKey
    : (options[0] ? options[0].key : null);

  select.value = state.selectedMonthKey;
  select.addEventListener("change", () => {
    state.selectedMonthKey = select.value;
    renderMonthDependent();
  });
}

// ---------- Data atual ----------

function renderCurrentDate() {
  const el = document.getElementById("current-date");
  const now = new Date();
  const formatted = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  el.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

// ---------- Faturamento de hoje ----------

function renderTodayRevenue() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  let todayTotal = 0;
  let yesterdayTotal = 0;
  let hasYesterday = false;

  state.faturamento.forEach((row) => {
    const date = parseDataBR(row["Data"]);
    if (!date) return;
    const valor = parseValor(row["Valor (R$)"]);
    if (isSameDay(date, now)) todayTotal += valor;
    if (isSameDay(date, yesterday)) {
      yesterdayTotal += valor;
      hasYesterday = true;
    }
  });

  document.getElementById("kpi-today").textContent = formatCurrency(todayTotal);

  const deltaEl = document.getElementById("kpi-today-delta");
  if (hasYesterday && yesterdayTotal > 0) {
    const delta = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
    deltaEl.textContent = `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}% vs. ontem`;
    deltaEl.className = "kpi-delta " + (delta >= 0 ? "positive" : "negative");
  } else {
    deltaEl.textContent = "Sem dados de ontem";
    deltaEl.className = "kpi-delta";
  }
}

// ---------- Gráfico de barras (últimos 7 dias) ----------

function renderBarChart() {
  const container = document.getElementById("bar-chart");
  container.innerHTML = "";

  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }

  const totalsByDay = days.map((d) => {
    let total = 0;
    state.faturamento.forEach((row) => {
      const date = parseDataBR(row["Data"]);
      if (date && isSameDay(date, d)) total += parseValor(row["Valor (R$)"]);
    });
    return total;
  });

  const max = Math.max(...totalsByDay, 1);

  days.forEach((d, index) => {
    const isToday = index === days.length - 1;
    const label = isToday ? "Hoje" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

    const col = document.createElement("div");
    col.className = "bar-col" + (isToday ? " today" : "");

    const valueLabel = document.createElement("span");
    valueLabel.className = "bar-value";
    valueLabel.textContent = `R$ ${formatNumber(totalsByDay[index])}`;

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = "0%";

    const dayLabel = document.createElement("span");
    dayLabel.className = "bar-label";
    dayLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

    col.appendChild(valueLabel);
    col.appendChild(bar);
    col.appendChild(dayLabel);
    container.appendChild(col);

    const heightPercent = (totalsByDay[index] / max) * 100;
    requestAnimationFrame(() => {
      bar.style.height = `${heightPercent}%`;
    });
  });
}

// ---------- Cálculos do mês selecionado ----------

function getSelectedMonthInfo() {
  if (!state.selectedMonthKey) return null;
  const [anoStr, mesIdxStr] = state.selectedMonthKey.split("-");
  return { ano: parseInt(anoStr, 10), mesIdx: parseInt(mesIdxStr, 10) };
}

function computeMonthRevenue(info) {
  let total = 0;
  let recordCount = 0;
  const rows = [];
  state.faturamento.forEach((row) => {
    if (monthKeyOf(row) !== state.selectedMonthKey) return;
    const valor = parseValor(row["Valor (R$)"]);
    if (valor > 0) recordCount++;
    total += valor;
    rows.push({ date: parseDataBR(row["Data"]), dateLabel: row["Data"], valor });
  });
  rows.sort((a, b) => (b.date && a.date ? b.date - a.date : 0));
  return { total, recordCount, rows };
}

function computeMonthExpenses(info) {
  let total = 0;
  const byCategory = {};
  EXPENSE_CATEGORIES.forEach((c) => (byCategory[c] = 0));
  const rows = [];

  state.gastos.forEach((row) => {
    if (monthKeyOf(row) !== state.selectedMonthKey) return;
    const valor = parseValor(row["Valor (R$)"]);
    const categoria = row["Categoria"];
    total += valor;
    if (byCategory.hasOwnProperty(categoria)) {
      byCategory[categoria] += valor;
    } else {
      byCategory["Outros"] += valor;
    }
    rows.push({
      date: parseDataBR(row["Data"]),
      dateLabel: row["Data"],
      descricao: row["Descrição"],
      categoria: byCategory.hasOwnProperty(categoria) ? categoria : "Outros",
      valor,
    });
  });

  rows.sort((a, b) => (b.date && a.date ? b.date - a.date : 0));

  return { total, byCategory, rows };
}

function computeMonthProducts() {
  const totals = {};
  PRODUCT_COLUMNS.forEach((p) => (totals[p] = 0));

  state.produtos.forEach((row) => {
    if (monthKeyOf(row) !== state.selectedMonthKey) return;
    PRODUCT_COLUMNS.forEach((p) => {
      totals[p] += parseValor(row[p]);
    });
  });

  return Object.entries(totals)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);
}

function computeProjection(info, monthTotal) {
  const now = new Date();
  const isCurrentMonth = info.ano === now.getFullYear() && info.mesIdx === now.getMonth();
  const totalDays = daysInMonth(info.ano, info.mesIdx);

  if (!isCurrentMonth) {
    const isFutureMonth = info.ano * 12 + info.mesIdx > now.getFullYear() * 12 + now.getMonth();
    return isFutureMonth ? 0 : monthTotal;
  }

  const elapsedDays = now.getDate();
  const remainingDays = totalDays - elapsedDays;
  const avgPerDay = elapsedDays > 0 ? monthTotal / elapsedDays : 0;
  return monthTotal + avgPerDay * remainingDays;
}

// ---------- KPIs do mês ----------

function renderMonthKpis() {
  const info = getSelectedMonthInfo();
  if (!info) return;

  const { total: revenue, recordCount, rows: revenueRows } = computeMonthRevenue(info);
  const { total: expenses, byCategory, rows: expenseRows } = computeMonthExpenses(info);
  const profit = revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const ticket = recordCount > 0 ? revenue / recordCount : 0;
  const goalPercent = (revenue / MONTHLY_GOAL) * 100;
  const projection = computeProjection(info, revenue);

  document.getElementById("kpi-month-revenue").textContent = formatCurrency(revenue);
  document.getElementById("kpi-month-expenses").textContent = formatCurrency(expenses);

  const profitEl = document.getElementById("kpi-profit");
  profitEl.textContent = formatCurrency(profit);
  profitEl.style.color = profit >= 0 ? "var(--green)" : "var(--red)";

  const marginEl = document.getElementById("kpi-margin");
  marginEl.textContent = formatPercent(margin);
  marginEl.style.color = margin >= 0 ? "var(--green)" : "var(--red)";

  document.getElementById("kpi-ticket").textContent = formatCurrency(ticket);
  document.getElementById("kpi-goal-percent").textContent = formatPercent(Math.min(goalPercent, 999));
  document.getElementById("kpi-goal-sub").textContent = `${formatCurrency(revenue)} / ${formatCurrency(MONTHLY_GOAL)}`;
  document.getElementById("kpi-goal-sub").className = "kpi-delta";
  document.getElementById("kpi-projection").textContent = formatCurrency(projection);

  return {
    revenue, expenses, byCategory, goalPercent,
    profit, margin, ticket, projection,
    revenueRows, expenseRows,
  };
}

// ---------- Donut de gastos por categoria ----------

function renderExpenseDonut(byCategory, totalExpenses) {
  const svg = document.getElementById("donut-chart");
  const legend = document.getElementById("donut-legend");
  svg.innerHTML = "";
  legend.innerHTML = "";

  const radius = 80;
  const center = 100;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  const entries = EXPENSE_CATEGORIES
    .map((name) => ({ name, value: byCategory[name] || 0 }))
    .filter((c) => c.value > 0);

  if (entries.length === 0 || totalExpenses === 0) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", center);
    text.setAttribute("y", center);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("fill", "#9c9ca6");
    text.setAttribute("font-size", "13");
    text.textContent = "Sem gastos";
    svg.appendChild(text);
    return;
  }

  let offset = 0;
  entries.forEach((cat) => {
    const percent = (cat.value / totalExpenses) * 100;
    const dash = (percent / 100) * circumference;
    const color = CATEGORY_COLORS[cat.name] || "#9c9ca6";

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", center);
    circle.setAttribute("cy", center);
    circle.setAttribute("r", radius);
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", strokeWidth);
    circle.setAttribute("stroke-dasharray", `${dash} ${circumference - dash}`);
    circle.setAttribute("stroke-dashoffset", -offset);
    circle.setAttribute("transform", `rotate(-90 ${center} ${center})`);
    circle.style.transition = "stroke-dasharray 0.6s ease";
    svg.appendChild(circle);

    offset += dash;

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="legend-dot" style="background:${color}"></span>
      <span>${cat.name}</span>
      <span class="legend-percent">${percent.toFixed(0)}%</span>
    `;
    legend.appendChild(li);
  });

  const centerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  centerText.setAttribute("x", center);
  centerText.setAttribute("y", center);
  centerText.setAttribute("text-anchor", "middle");
  centerText.setAttribute("dominant-baseline", "middle");
  centerText.setAttribute("fill", "#f4f4f5");
  centerText.setAttribute("font-size", "14");
  centerText.setAttribute("font-weight", "700");
  centerText.textContent = "Gastos";
  svg.appendChild(centerText);
}

// ---------- Ranking de produtos ----------

function renderRanking(products, listId = "ranking-list") {
  const list = document.getElementById(listId);
  list.innerHTML = "";

  const max = Math.max(...products.map((p) => p.qty), 1);

  products.forEach((product, index) => {
    const li = document.createElement("li");
    li.className = "ranking-item";

    const percent = (product.qty / max) * 100;

    li.innerHTML = `
      <span class="rank-pos">${index + 1}</span>
      <div class="rank-info">
        <span class="rank-name">${product.name}</span>
        <div class="rank-bar-bg">
          <div class="rank-bar-fill" style="width:0%"></div>
        </div>
      </div>
      <span class="rank-qty">${formatNumber(product.qty)}</span>
    `;

    list.appendChild(li);

    const fill = li.querySelector(".rank-bar-fill");
    requestAnimationFrame(() => {
      fill.style.width = `${percent}%`;
    });
  });
}

// ---------- Meta do mês ----------

function renderGoal(revenue, goalPercent, containerId = "goals-list") {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const percent = Math.min(goalPercent, 100);

  const div = document.createElement("div");
  div.className = "goal-item";
  div.innerHTML = `
    <div class="goal-top">
      <span class="goal-name">Faturamento vs. Meta (R$ ${formatNumber(MONTHLY_GOAL)})</span>
      <span class="goal-values">${formatCurrency(revenue)} / ${formatCurrency(MONTHLY_GOAL)}</span>
    </div>
    <div class="goal-bar-bg">
      <div class="goal-bar-fill" style="width:0%; background:#a78bfa"></div>
    </div>
    <span class="goal-percent">${formatPercent(goalPercent)} atingido</span>
  `;

  container.appendChild(div);

  const fill = div.querySelector(".goal-bar-fill");
  requestAnimationFrame(() => {
    fill.style.width = `${percent}%`;
  });
}

// ---------- Gastos por categoria detalhado ----------

function renderExpenseGrid(byCategory, totalExpenses, gridId = "expense-grid") {
  const grid = document.getElementById(gridId);
  grid.innerHTML = "";

  EXPENSE_CATEGORIES.forEach((category) => {
    const value = byCategory[category] || 0;
    const percent = totalExpenses > 0 ? (value / totalExpenses) * 100 : 0;

    const card = document.createElement("div");
    card.className = "card stock-card";
    card.innerHTML = `
      <div class="stock-top">
        <span class="stock-name">${category}</span>
        <span class="stock-status" style="background:${CATEGORY_COLORS[category]}26; color:${CATEGORY_COLORS[category]}">${percent.toFixed(0)}%</span>
      </div>
      <div class="stock-qty">${formatCurrency(value)}</div>
    `;

    grid.appendChild(card);
  });
}

// ---------- Página Vendas ----------

function renderVendasBarChart(info) {
  const container = document.getElementById("vendas-bar-chart");
  container.innerHTML = "";

  const totalDays = daysInMonth(info.ano, info.mesIdx);
  const totalsByDay = new Array(totalDays).fill(0);

  state.faturamento.forEach((row) => {
    if (monthKeyOf(row) !== state.selectedMonthKey) return;
    const date = parseDataBR(row["Data"]);
    if (!date) return;
    totalsByDay[date.getDate() - 1] += parseValor(row["Valor (R$)"]);
  });

  const max = Math.max(...totalsByDay, 1);
  const now = new Date();

  totalsByDay.forEach((value, index) => {
    const dayNum = index + 1;
    const isToday = info.ano === now.getFullYear() && info.mesIdx === now.getMonth() && dayNum === now.getDate();

    const col = document.createElement("div");
    col.className = "bar-col" + (isToday ? " today" : "");

    const valueLabel = document.createElement("span");
    valueLabel.className = "bar-value";
    valueLabel.textContent = value > 0 ? `R$ ${formatNumber(value)}` : "";

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = "0%";

    const dayLabel = document.createElement("span");
    dayLabel.className = "bar-label";
    dayLabel.textContent = String(dayNum);

    col.appendChild(valueLabel);
    col.appendChild(bar);
    col.appendChild(dayLabel);
    container.appendChild(col);

    const heightPercent = (value / max) * 100;
    requestAnimationFrame(() => {
      bar.style.height = `${heightPercent}%`;
    });
  });
}

function renderVendasTable(rows) {
  const tbody = document.getElementById("vendas-table-body");
  tbody.innerHTML = rows
    .map((row) => `<tr><td>${row.dateLabel}</td><td>${formatCurrency(row.valor)}</td></tr>`)
    .join("");
}

function renderVendasPage(kpis) {
  document.getElementById("vendas-kpi-today").textContent = document.getElementById("kpi-today").textContent;
  document.getElementById("vendas-kpi-month").textContent = formatCurrency(kpis.revenue);
  document.getElementById("vendas-kpi-ticket").textContent = formatCurrency(kpis.ticket);

  const info = getSelectedMonthInfo();
  renderVendasBarChart(info);
  renderVendasTable(kpis.revenueRows);
}

// ---------- Página Gastos ----------

function renderGastosPage(kpis) {
  document.getElementById("gastos-kpi-total").textContent = formatCurrency(kpis.expenses);
  renderExpenseGrid(kpis.byCategory, kpis.expenses, "gastos-category-grid");

  const tbody = document.getElementById("gastos-table-body");
  tbody.innerHTML = kpis.expenseRows
    .map((row) => `<tr><td>${row.dateLabel}</td><td>${row.descricao || ""}</td><td>${row.categoria}</td><td>${formatCurrency(row.valor)}</td></tr>`)
    .join("");
}

// ---------- Página Metas ----------

function renderMetasPage(kpis) {
  const profitEl = document.getElementById("metas-kpi-profit");
  profitEl.textContent = formatCurrency(kpis.profit);
  profitEl.style.color = kpis.profit >= 0 ? "var(--green)" : "var(--red)";

  const marginEl = document.getElementById("metas-kpi-margin");
  marginEl.textContent = formatPercent(kpis.margin);
  marginEl.style.color = kpis.margin >= 0 ? "var(--green)" : "var(--red)";

  document.getElementById("metas-kpi-projection").textContent = formatCurrency(kpis.projection);

  renderGoal(kpis.revenue, kpis.goalPercent, "metas-goals-list");
}

// ---------- Página Histórico ----------

function renderHistoricoPage() {
  const rows = state.faturamento
    .map((row) => ({
      date: parseDataBR(row["Data"]),
      dateLabel: row["Data"],
      mes: row["Mês"],
      valor: parseValor(row["Valor (R$)"]),
    }))
    .sort((a, b) => (b.date && a.date ? b.date - a.date : 0));

  const tbody = document.getElementById("historico-table-body");
  tbody.innerHTML = rows
    .map((row) => `<tr><td>${row.dateLabel}</td><td>${row.mes}</td><td>${formatCurrency(row.valor)}</td></tr>`)
    .join("");
}

// ---------- Renderização dependente do mês selecionado ----------

function renderMonthDependent() {
  const products = computeMonthProducts();
  const kpis = renderMonthKpis();
  if (!kpis) return;

  renderExpenseDonut(kpis.byCategory, kpis.expenses);
  renderRanking(products);
  renderGoal(kpis.revenue, kpis.goalPercent);
  renderExpenseGrid(kpis.byCategory, kpis.expenses);

  renderRanking(products, "produtos-ranking-list");
  renderVendasPage(kpis);
  renderGastosPage(kpis);
  renderMetasPage(kpis);
}

// ---------- Navegação da sidebar ----------

const PAGE_TITLES = {
  "visao-geral": ["Visão geral", "Acompanhe o desempenho da sua sorveteria em tempo real"],
  vendas: ["Vendas", "Faturamento diário e lançamentos do mês selecionado"],
  produtos: ["Produtos", "Quantidade vendida por produto no mês selecionado"],
  gastos: ["Gastos", "Para onde foram direcionados os gastos do mês selecionado"],
  metas: ["Metas", "Lucro, margem e progresso da meta mensal"],
  historico: ["Histórico", "Todos os lançamentos de faturamento registrados"],
  configuracoes: ["Configurações", "Parâmetros e fontes de dados do dashboard"],
};

function setupSidebarNav() {
  const navItems = document.querySelectorAll(".nav-item");
  const pageSections = document.querySelectorAll(".page-section");
  const titleEl = document.querySelector(".topbar-title h1");
  const subtitleEl = document.querySelector(".topbar-subtitle");

  navItems.forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      const section = item.dataset.section;

      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      pageSections.forEach((sec) => sec.classList.toggle("active-page", sec.dataset.page === section));

      const [title, subtitle] = PAGE_TITLES[section] || PAGE_TITLES["visao-geral"];
      titleEl.textContent = title;
      subtitleEl.textContent = subtitle;
    });
  });
}

// ---------- Estados de UI ----------

function showLoading() {
  document.getElementById("loading-state").hidden = false;
  document.getElementById("error-state").hidden = true;
  document.getElementById("dashboard-content").hidden = true;
}

function showError() {
  document.getElementById("loading-state").hidden = true;
  document.getElementById("error-state").hidden = false;
  document.getElementById("dashboard-content").hidden = true;
}

function showDashboard() {
  document.getElementById("loading-state").hidden = true;
  document.getElementById("error-state").hidden = true;
  document.getElementById("dashboard-content").hidden = false;
}

// ---------- Init ----------

async function init() {
  showLoading();
  renderCurrentDate();

  try {
    const { faturamento, produtos, gastos } = await loadAllData();
    state.faturamento = faturamento;
    state.produtos = produtos;
    state.gastos = gastos;

    const options = buildMonthOptions();
    if (options.length === 0) throw new Error("Nenhum dado encontrado nas planilhas.");

    renderMonthSelect(options);
    renderTodayRevenue();
    renderBarChart();
    renderMonthDependent();
    renderHistoricoPage();

    showDashboard();
  } catch (err) {
    console.error(err);
    showError();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupSidebarNav();
  init();
  document.getElementById("retry-btn").addEventListener("click", init);
});
