/**
 * Tactic AdPulse - Mini Campaign KPI Dashboard
 * Engine quản lý dữ liệu, tính toán KPI, biểu đồ Chart.js, AI phân tích & xuất báo cáo
 */

// Storage keys (v3 clean production state)
const STORAGE_KEY = "tactic_kpi_campaign_data_v3";
const CAMPAIGN_NAME_KEY = "tactic_campaign_name_v3";

// Clean up all legacy caches from previous development builds
try {
  localStorage.removeItem("tactic_kpi_campaign_data_v1");
  localStorage.removeItem("tactic_campaign_name_v1");
  localStorage.removeItem("tactic_kpi_campaign_data_v2");
  localStorage.removeItem("tactic_campaign_name_v2");
  localStorage.removeItem("tactic_kpi_campaign_data");
  localStorage.removeItem("tactic_campaign_name");
} catch (e) {}

// Application State
const state = {
  campaignName: "Chiến Dịch Mới (Chưa đặt tên)",
  data: [],
  chartType: "combo", // 'combo' | 'line' | 'bar'
  chartMetricView: "all", // 'all' | 'cost_orders' | 'reach_clicks' | 'efficiency'
  filterRange: "all", // 'all' | '7days' | '14days'
  editingId: null,
  darkMode: false,

  geminiAnalysisResult: null,
  isGeminiLoading: false,
  chatHistory: [],
};

// Global Chart Instance
let campaignChart = null;

// Formatters
const formatCurrency = (val) => {
  if (isNaN(val) || val === null || val === undefined) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(val);
};

const formatNumber = (val) => {
  if (isNaN(val) || val === null || val === undefined) return "0";
  return new Intl.NumberFormat("vi-VN").format(val);
};

const formatPercent = (val) => {
  if (isNaN(val) || val === null || val === undefined) return "0.00%";
  return val.toFixed(2) + "%";
};

const formatDateVN = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadData();
  setupEventListeners();
  renderDashboard();

  // Support direct modal opening via URL hash
  handleUrlHash();
  window.addEventListener("hashchange", handleUrlHash);
});

function handleUrlHash() {
  if (window.location.hash === "#export") {
    openExportModal();
  } else if (window.location.hash === "#bulk") {
    openBulkModal();

  }
}

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem("tactic_theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
    state.darkMode = true;
  } else {
    document.documentElement.classList.remove("dark");
    state.darkMode = false;
  }
  updateThemeIcon();
}

function toggleTheme() {
  state.darkMode = !state.darkMode;
  if (state.darkMode) {
    document.documentElement.classList.add("dark");
    localStorage.setItem("tactic_theme", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("tactic_theme", "light");
  }
  updateThemeIcon();
  if (campaignChart) {
    renderChart();
  }
}

function updateThemeIcon() {
  const btn = document.getElementById("btn-toggle-theme");
  if (!btn) return;
  btn.innerHTML = state.darkMode
    ? `<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`
    : `<svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;
}

// Data Management
function loadData() {
  const savedCampaign = localStorage.getItem(CAMPAIGN_NAME_KEY);
  if (savedCampaign) {
    state.campaignName = savedCampaign;
  } else {
    state.campaignName = "Chiến Dịch Mới (Chưa đặt tên)";
  }
  const inputCamp = document.getElementById("campaign-name-input");
  if (inputCamp) {
    inputCamp.value = state.campaignName;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid stored data");
      state.data = parsed.filter(CampaignAnalysis.isValidRow);
    } catch (e) {
      console.error("Lỗi khi đọc localStorage", e);
      state.data = [];
    }
  } else {
    // Production behavior: Khởi đầu bằng trạng thái TRỐNG hoàn toàn!
    state.data = [];
  }
  sortDataByDate();
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  localStorage.setItem(CAMPAIGN_NAME_KEY, state.campaignName);
}

function loadSampleDataAction(showConfirm = false) {
  if (state.data.length > 0 && showConfirm) {
    if (!confirm("Tạo 14 ngày dữ liệu MÔ PHỎNG ngẫu nhiên để trải nghiệm? Dữ liệu hiện tại sẽ được thay thế.")) {
      return;
    }
  }
  const sample = typeof generateRandomSample === "function" ? generateRandomSample(14) : null;
  state.data = sample ? sample.rows : (typeof DEFAULT_SAMPLE_DATA !== "undefined" ? JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA)) : []);
  state.campaignName = sample ? sample.campaignName : "Chiến Dịch Mùa Thu 2026 - Performance Ads";
  const inputCamp = document.getElementById("campaign-name-input");
  if (inputCamp) {
    inputCamp.value = state.campaignName;
  }
  state.geminiAnalysisResult = null;
  sortDataByDate();
  saveData();
  renderDashboard();
  showToast("Đã tạo 14 ngày dữ liệu mô phỏng ngẫu nhiên (mỗi lần nạp là một kịch bản khác).", "success");
}

function sortDataByDate() {
  state.data.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Event Listeners Setup
function setupEventListeners() {
  // Campaign name change
  const campInput = document.getElementById("campaign-name-input");
  if (campInput) {
    campInput.addEventListener("change", (e) => {
      state.campaignName = e.target.value.trim() || "Chiến Dịch Quảng Cáo";
      saveData();
      showToast("Đã lưu tên chiến dịch", "success");
    });
  }

  // Single Row Form Submit
  const singleForm = document.getElementById("single-entry-form");
  if (singleForm) {
    // Set default date to today or next day after last record
    setDefaultDateInput();
    singleForm.addEventListener("submit", handleSingleFormSubmit);
  }

  // Reset to default sample
  const btnResetSample = document.getElementById("btn-load-sample");
  if (btnResetSample) {
    btnResetSample.addEventListener("click", () => {
      loadSampleDataAction(state.data.length > 0);
    });
  }

  // Clear all data
  const btnClearAll = document.getElementById("btn-clear-all");
  if (btnClearAll) {
    btnClearAll.addEventListener("click", () => {
      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu? Thao tác này sẽ đưa Dashboard về trạng thái trống ban đầu.")) {
        state.data = [];
        state.geminiAnalysisResult = null;
        saveData();
        renderDashboard();
        showToast("Đã đưa Dashboard về trạng thái trống ban đầu!", "info");
      }
    });
  }

  // Chart Type Selector
  const chartTypeSelect = document.getElementById("chart-type-select");
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener("change", (e) => {
      state.chartType = e.target.value;
      renderChart();
    });
  }

  // Chart Metric View Selector
  const chartMetricSelect = document.getElementById("chart-metric-select");
  if (chartMetricSelect) {
    chartMetricSelect.addEventListener("change", (e) => {
      state.chartMetricView = e.target.value;
      renderChart();
    });
  }

  // Filter Range Selector
  const filterRangeSelect = document.getElementById("filter-range-select");
  if (filterRangeSelect) {
    filterRangeSelect.addEventListener("change", (e) => {
      state.filterRange = e.target.value;
      renderDashboard();
    });
  }

  // Modals & Export
  const btnOpenBulk = document.getElementById("btn-open-bulk-modal");
  if (btnOpenBulk) {
    btnOpenBulk.addEventListener("click", openBulkModal);
  }

  const btnOpenExport = document.getElementById("btn-open-export-modal");
  if (btnOpenExport) {
    btnOpenExport.addEventListener("click", openExportModal);
  }

  const btnTheme = document.getElementById("btn-toggle-theme");
  if (btnTheme) {
    btnTheme.addEventListener("click", toggleTheme);
  }
}

function setDefaultDateInput() {
  const dateInput = document.getElementById("input-date");
  if (!dateInput) return;
  if (state.data.length > 0) {
    const lastDate = new Date(state.data[state.data.length - 1].date);
    lastDate.setDate(lastDate.getDate() + 1);
    dateInput.value = lastDate.toISOString().split("T")[0];
  } else {
    dateInput.value = new Date().toISOString().split("T")[0];
  }
}

// Single Entry Form Handler
function handleSingleFormSubmit(e) {
  e.preventDefault();
  const dateInput = document.getElementById("input-date");
  const reachInput = document.getElementById("input-reach");
  const clicksInput = document.getElementById("input-clicks");
  const costInput = document.getElementById("input-cost");
  const ordersInput = document.getElementById("input-orders");

  const date = dateInput.value;
  const reach = Number(reachInput.value);
  const clicks = Number(clicksInput.value);
  const cost = parseFloat(costInput.value);
  const orders = Number(ordersInput.value);

  if (!date || isNaN(reach) || isNaN(clicks) || isNaN(cost) || isNaN(orders)) {
    showToast("Vui lòng điền đầy đủ và đúng định dạng các trường!", "error");
    return;
  }

  if (!CampaignAnalysis.isValidRow({date,reach,clicks,cost,orders})) {
    showToast("Số liệu phải không âm, hữu hạn; reach, click và đơn phải là số nguyên!", "error");
    return;
  }

  if (clicks > reach && reach > 0) {
    if (!confirm("Số clicks đang lớn hơn Reach (Lượt tiếp cận). Bạn có chắc muốn lưu số liệu này?")) {
      return;
    }
  }

  if (state.editingId && state.data.some(r => r.date === date && r.id !== state.editingId)) {
    showToast("Ngày này đã có dữ liệu; hãy sửa bản ghi tương ứng.", "error"); return;
  }

  // Check if date already exists
  const existingIndex = state.data.findIndex((item) => item.date === date);

  if (state.editingId) {
    // Updating existing
    const editIndex = state.data.findIndex((item) => item.id === state.editingId);
    if (editIndex !== -1) {
      state.data[editIndex] = {
        id: state.editingId,
        date,
        reach,
        clicks,
        cost,
        orders,
      };
      showToast(`Đã cập nhật số liệu ngày ${formatDateVN(date)}`, "success");
    }
    cancelEdit();
  } else if (existingIndex !== -1) {
    if (confirm(`Ngày ${formatDateVN(date)} đã có số liệu. Bạn có muốn ghi đè lên ngày này?`)) {
      state.data[existingIndex] = {
        id: state.data[existingIndex].id,
        date,
        reach,
        clicks,
        cost,
        orders,
      };
      showToast(`Đã cập nhật số liệu ngày ${formatDateVN(date)}`, "success");
    } else {
      return;
    }
  } else {
    // New entry
    state.data.push({
      id: "entry-" + Date.now(),
      date,
      reach,
      clicks,
      cost,
      orders,
    });
    showToast(`Đã thêm số liệu ngày ${formatDateVN(date)}`, "success");
  }

  sortDataByDate();
  saveData();
  renderDashboard();

  // Reset form inputs except date
  reachInput.value = "";
  clicksInput.value = "";
  costInput.value = "";
  ordersInput.value = "";
  setDefaultDateInput();
}

// Edit Record Handler
function startEditRecord(id) {
  const item = state.data.find((d) => d.id === id);
  if (!item) return;

  state.editingId = id;
  document.getElementById("input-date").value = item.date;
  document.getElementById("input-reach").value = item.reach;
  document.getElementById("input-clicks").value = item.clicks;
  document.getElementById("input-cost").value = item.cost;
  document.getElementById("input-orders").value = item.orders;

  const btnSubmit = document.getElementById("btn-submit-single");
  if (btnSubmit) {
    btnSubmit.innerHTML = `
      <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      Cập nhật ngày
    `;
    btnSubmit.classList.remove("from-indigo-600", "to-violet-600");
    btnSubmit.classList.add("from-emerald-600", "to-teal-600");
  }

  const btnCancel = document.getElementById("btn-cancel-edit");
  if (btnCancel) {
    btnCancel.classList.remove("hidden");
  }

  // Scroll to form smoothly
  document.getElementById("single-entry-form")?.scrollIntoView({ behavior: "smooth" });
}

function cancelEdit() {
  state.editingId = null;
  const btnSubmit = document.getElementById("btn-submit-single");
  if (btnSubmit) {
    btnSubmit.innerHTML = `
      <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
      Lưu số liệu ngày
    `;
    btnSubmit.classList.add("from-indigo-600", "to-violet-600");
    btnSubmit.classList.remove("from-emerald-600", "to-teal-600");
  }

  const btnCancel = document.getElementById("btn-cancel-edit");
  if (btnCancel) {
    btnCancel.classList.add("hidden");
  }

  document.getElementById("input-reach").value = "";
  document.getElementById("input-clicks").value = "";
  document.getElementById("input-cost").value = "";
  document.getElementById("input-orders").value = "";
  setDefaultDateInput();
}

// Delete Record Handler
function deleteRecord(id) {
  const item = state.data.find((d) => d.id === id);
  if (!item) return;
  if (confirm(`Bạn có chắc muốn xóa dữ liệu ngày ${formatDateVN(item.date)}?`)) {
    state.data = state.data.filter((d) => d.id !== id);
    if (state.editingId === id) {
      cancelEdit();
    }
    saveData();
    renderDashboard();
    showToast(`Đã xóa ngày ${formatDateVN(item.date)}`, "info");
  }
}

// Filtered Data based on range
function getFilteredData() {
  if (state.filterRange === 'all' || !state.data.length) return state.data;
  const days = state.filterRange === '7days' ? 7 : 14;
  const end = state.data.at(-1).date;
  const start = CampaignAnalysis.shift(end, 1-days);
  return state.data.filter(r=>r.date >= start && r.date <= end);
}

// Render Entire Dashboard
function renderDashboard() {
  renderKpiCards();
  renderTable();
  renderChart();
  renderAiAnalysis();
  renderHero();
  updateDateRangeBadge();
}

// Update Date Range Badge
function updateDateRangeBadge() {
  const badge = document.getElementById("campaign-date-range-badge");
  if (!badge) return;
  const filtered = getFilteredData();
  if (filtered.length === 0) {
    badge.innerHTML = `
      <span class="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5"></span>
      Chưa có dữ liệu
    `;
    return;
  }
  const startDate = formatDateVN(filtered[0].date);
  const endDate = formatDateVN(filtered[filtered.length - 1].date);
  badge.innerHTML = `
    <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
    ${startDate} - ${endDate} (${filtered.length} ngày)
    ${simulatedTag()}
  `;
}

// Render Summary KPI Cards
function renderKpiCards() {
  const filtered = getFilteredData();

  const elCost = document.getElementById("kpi-total-cost");
  const elReach = document.getElementById("kpi-total-reach");
  const elClicks = document.getElementById("kpi-total-clicks");
  const elOrders = document.getElementById("kpi-total-orders");
  const elCtr = document.getElementById("kpi-avg-ctr");
  const elCpc = document.getElementById("kpi-avg-cpc");
  const elCpa = document.getElementById("kpi-avg-cpa");
  const elCvr = document.getElementById("kpi-avg-cvr");

  if (filtered.length === 0) {
    if (elCost) elCost.innerText = "0 ₫";
    if (elReach) elReach.innerText = "0";
    if (elClicks) elClicks.innerText = "0";
    if (elOrders) elOrders.innerText = "0 đơn";
    if (elCtr) elCtr.innerText = "--";
    if (elCpc) elCpc.innerText = "--";
    if (elCpa) elCpa.innerText = "--";
    if (elCvr) elCvr.innerText = "--";

    renderKpiExtras([], null);
    return;
  }

  let totalCost = 0;
  let totalReach = 0;
  let totalClicks = 0;
  let totalOrders = 0;

  filtered.forEach((d) => {
    totalCost += d.cost || 0;
    totalReach += d.reach || 0;
    totalClicks += d.clicks || 0;
    totalOrders += d.orders || 0;
  });

  const ctr = totalReach > 0 ? (totalClicks / totalReach) * 100 : 0;
  const cpc = totalClicks > 0 ? Math.round(totalCost / totalClicks) : 0;
  const cpa = totalOrders > 0 ? Math.round(totalCost / totalOrders) : 0;
  const cvr = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;

  // Render values to DOM
  if (elCost) elCost.innerText = formatCurrency(totalCost);
  if (elReach) elReach.innerText = formatNumber(totalReach);
  if (elClicks) elClicks.innerText = formatNumber(totalClicks);
  if (elOrders) elOrders.innerText = formatNumber(totalOrders) + " đơn";
  if (elCtr) elCtr.innerText = totalReach > 0 ? formatPercent(ctr) : "Chưa xác định";
  if (elCpc) elCpc.innerText = totalClicks > 0 ? formatCurrency(cpc) : "Chưa xác định";
  if (elCpa) elCpa.innerText = totalOrders > 0 ? formatCurrency(cpa) : "Chưa xác định";
  if (elCvr) elCvr.innerText = totalClicks > 0 ? formatPercent(cvr) : "Chưa xác định";

  renderKpiExtras(filtered, analysisSnapshot());
}

// Render Table
function renderTable() {
  const tableBody = document.getElementById("data-table-body");
  const emptyState = document.getElementById("table-empty-state");
  if (!tableBody) return;

  const filtered = [...getFilteredData()].reverse(); // Show latest on top

  if (filtered.length === 0) {
    tableBody.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  // Find min and max CPA for highlight
  const validCpaItems = filtered.filter((d) => d.orders > 0);
  const minCpa = validCpaItems.length > 0 ? Math.min(...validCpaItems.map((d) => d.cost / d.orders)) : null;
  const maxCpa = validCpaItems.length > 1 ? Math.max(...validCpaItems.map((d) => d.cost / d.orders)) : null;

  const sumCost = filtered.reduce((a, d) => a + (d.cost || 0), 0);
  const sumOrders = filtered.reduce((a, d) => a + (d.orders || 0), 0);
  const avgCpa = sumOrders > 0 ? sumCost / sumOrders : null;
  const topCpa = validCpaItems.length ? Math.max(...validCpaItems.map((d) => d.cost / d.orders)) : 0;

  tableBody.innerHTML = filtered
    .map((item) => {
      const ctr = item.reach > 0 ? (item.clicks / item.reach) * 100 : 0;
      const cpc = item.clicks > 0 ? Math.round(item.cost / item.clicks) : 0;
      const cpa = item.orders > 0 ? Math.round(item.cost / item.orders) : 0;

      let cpaHighlightClass = "text-slate-700 dark:text-slate-200";
      let cpaBadge = "";
      if (item.orders > 0) {
        if (minCpa && cpa === Math.round(minCpa) && validCpaItems.length > 2) {
          cpaHighlightClass = "text-emerald-600 dark:text-emerald-400 font-bold";
          cpaBadge = `<span class="ml-1 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded">Tốt nhất</span>`;
        } else if (maxCpa && cpa === Math.round(maxCpa) && validCpaItems.length > 2) {
          cpaHighlightClass = "text-rose-600 dark:text-rose-400 font-bold";
          cpaBadge = `<span class="ml-1 text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.5 rounded">Cao nhất</span>`;
        }
      }

      return `
      <tr class="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
        <td data-label="Ngày" class="py-3 px-2.5 font-semibold text-slate-800 dark:text-slate-100">
          <div class="flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>${formatDateVN(item.date)}</span>
          </div>
        </td>
        <td data-label="Reach" class="py-3 px-2.5 text-right font-medium text-slate-600 dark:text-slate-300">${formatNumber(item.reach)}</td>
        <td data-label="Clicks" class="py-3 px-2.5 text-right font-medium text-slate-600 dark:text-slate-300">${formatNumber(item.clicks)}</td>
        <td data-label="Chi phí" class="py-3 px-2.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">${formatCurrency(item.cost)}</td>
        <td data-label="Đơn" class="py-3 px-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
            ${formatNumber(item.orders)} đơn
          </span>
        </td>
        <td data-label="Click/reach" class="py-3 px-2.5 text-right font-medium text-blue-600 dark:text-blue-400">${item.reach > 0 ? formatPercent(ctr) : "Chưa xác định"}</td>
        <td data-label="CPC" class="py-3 px-2.5 text-right font-medium text-slate-600 dark:text-slate-300">${item.clicks > 0 ? formatCurrency(cpc) : "Chưa xác định"}</td>
        <td data-label="Chi phí/đơn (CPA)" class="py-3 px-2.5 text-right ${cpaHighlightClass}">
          <div class="text-right">${item.orders > 0 ? formatCurrency(cpa) : '<span class="text-slate-400 italic">Chưa xác định</span>'}${cpaBadge}${cpaBar(item, avgCpa, topCpa)}</div>
        </td>
        <td data-label="Thao tác" class="py-3 px-2.5 text-center">
          <div class="flex items-center justify-center space-x-2">
            <button onclick="startEditRecord('${item.id}')" title="Chỉnh sửa" class="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button onclick="deleteRecord('${item.id}')" title="Xóa" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
      `;
    })
    .join("");
}

// Render Chart with Multi-axis and View Modes
function renderChart() {
  const ctx = document.getElementById("campaign-chart-canvas");
  const emptyChart = document.getElementById("chart-empty-state");
  if (!ctx) return;

  const filtered = getFilteredData();
  if (filtered.length === 0) {
    if (campaignChart) {
      campaignChart.destroy();
      campaignChart = null;
    }
    ctx.classList.add("hidden");
    if (emptyChart) {
      emptyChart.classList.remove("hidden");
      emptyChart.classList.add("flex");
    }
    return;
  }

  ctx.classList.remove("hidden");
  if (emptyChart) {
    emptyChart.classList.add("hidden");
    emptyChart.classList.remove("flex");
  }

  const labels = filtered.map((d) => formatDateVN(d.date));
  const reachData = filtered.map((d) => d.reach);
  const clicksData = filtered.map((d) => d.clicks);
  const costData = filtered.map((d) => d.cost);
  const ordersData = filtered.map((d) => d.orders);
  const ctrData = filtered.map((d) => (d.reach > 0 ? +((d.clicks / d.reach) * 100).toFixed(2) : null));
  const cpaData = filtered.map((d) => (d.orders > 0 ? Math.round(d.cost / d.orders) : null));
  const cpcData = filtered.map((d) => (d.clicks > 0 ? Math.round(d.cost / d.clicks) : null));

  const isDark = document.documentElement.classList.contains("dark");
  const textColor = isDark ? "#94a3b8" : "#64748b";
  const gridColor = isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(226, 232, 240, 0.8)";

  let datasets = [];
  let scales = {};

  const type = state.chartType; // 'combo', 'line', 'bar'

  if (state.chartMetricView === "all") {
    // Multi-Axis: Cost (Bar/Line on right axis), Reach (Line on left axis), Orders (Line/Bar on 3rd axis)
    datasets = [
      {
        label: "Chi phí (VNĐ)",
        type: type === "combo" ? "bar" : type,
        data: costData,
        yAxisID: "yCost",
        backgroundColor: isDark ? "rgba(99, 102, 241, 0.35)" : "rgba(99, 102, 241, 0.25)",
        borderColor: "#6366f1",
        borderWidth: 2,
        borderRadius: 6,
        order: 3,
      },
      {
        label: "Tiếp cận (Reach)",
        type: "line",
        data: reachData,
        yAxisID: "yCount",
        borderColor: "#06b6d4",
        backgroundColor: "rgba(6, 182, 212, 0.1)",
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3.5,
        pointHoverRadius: 6,
        fill: false,
        order: 2,
      },
      {
        label: "Số đơn hàng",
        type: "line",
        data: ordersData,
        yAxisID: "yOrders",
        borderColor: "#f59e0b",
        backgroundColor: "#f59e0b",
        borderWidth: 3,
        tension: 0.3,
        pointRadius: 4.5,
        pointHoverRadius: 7,
        order: 1,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } },
      },
      yCount: {
        type: "linear",
        display: true,
        position: "left",
        title: { display: true, text: "Lượt Tiếp cận", color: "#06b6d4", font: { weight: "600" } },
        grid: { color: gridColor },
        ticks: { color: textColor, callback: (v) => formatNumber(v) },
      },
      yCost: {
        type: "linear",
        display: true,
        position: "right",
        title: { display: true, text: "Chi phí (VNĐ)", color: "#6366f1", font: { weight: "600" } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, callback: (v) => (v >= 1000000 ? v / 1000000 + " tr" : v / 1000 + " k") },
      },
      yOrders: {
        type: "linear",
        display: true,
        position: "right",
        title: { display: true, text: "Đơn hàng", color: "#f59e0b", font: { weight: "600" } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, stepSize: 5 },
      },
    };
  } else if (state.chartMetricView === "cost_orders") {
    // Focus on Cost & Orders
    datasets = [
      {
        label: "Chi phí (VNĐ)",
        type: type === "combo" ? "bar" : type,
        data: costData,
        yAxisID: "yCost",
        backgroundColor: "rgba(99, 102, 241, 0.4)",
        borderColor: "#6366f1",
        borderWidth: 2,
        borderRadius: 6,
      },
      {
        label: "Số đơn hàng",
        type: "line",
        data: ordersData,
        yAxisID: "yOrders",
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.2)",
        borderWidth: 3,
        tension: 0.35,
        fill: true,
        pointRadius: 5,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
      yCost: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Chi phí (VNĐ)", color: "#6366f1", font: { weight: "600" } },
        grid: { color: gridColor },
        ticks: { color: textColor, callback: (v) => formatCurrency(v) },
      },
      yOrders: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Số đơn hàng", color: "#f59e0b", font: { weight: "600" } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor },
      },
    };
  } else if (state.chartMetricView === "reach_clicks") {
    // Traffic Funnel: Reach vs Clicks
    datasets = [
      {
        label: "Tiếp cận (Reach)",
        type: type === "combo" ? "bar" : type,
        data: reachData,
        yAxisID: "yReach",
        backgroundColor: "rgba(6, 182, 212, 0.3)",
        borderColor: "#06b6d4",
        borderWidth: 2,
        borderRadius: 6,
      },
      {
        label: "Lượt nhấp (Clicks)",
        type: "line",
        data: clicksData,
        yAxisID: "yClicks",
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.2)",
        borderWidth: 3,
        tension: 0.3,
        pointRadius: 4.5,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
      yReach: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Tiếp cận (Reach)", color: "#06b6d4", font: { weight: "600" } },
        grid: { color: gridColor },
        ticks: { color: textColor, callback: (v) => formatNumber(v) },
      },
      yClicks: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Lượt nhấp (Clicks)", color: "#3b82f6", font: { weight: "600" } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, callback: (v) => formatNumber(v) },
      },
    };
  } else if (state.chartMetricView === "efficiency") {
    // Efficiency: Click/reach (%) & CPA (VND)
    datasets = [
      {
        label: "Click/reach (%)",
        type: "line",
        data: ctrData,
        yAxisID: "yCtr",
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.15)",
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 4,
        fill: true,
      },
      {
        label: "CPA - Chi phí/đơn (VNĐ)",
        type: "line",
        data: cpaData,
        yAxisID: "yCpa",
        borderColor: "#ec4899",
        backgroundColor: "transparent",
        borderWidth: 2.5,
        borderDash: [5, 5],
        tension: 0.35,
        pointRadius: 4,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
      yCtr: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Click/reach (%)", color: "#10b981", font: { weight: "600" } },
        grid: { color: gridColor },
        ticks: { color: textColor, callback: (v) => v + "%" },
      },
      yCpa: {
        type: "linear",
        position: "right",
        title: { display: true, text: "CPA (VNĐ)", color: "#ec4899", font: { weight: "600" } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, callback: (v) => formatCurrency(v) },
      },
    };
  }

  if (campaignChart) {
    campaignChart.destroy();
  }

  campaignChart = new Chart(ctx, {
    type: type === "combo" ? "bar" : type,
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: textColor,
            font: { family: "'Plus Jakarta Sans', sans-serif", weight: "500", size: 12 },
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)",
          titleColor: isDark ? "#f8fafc" : "#0f172a",
          bodyColor: isDark ? "#cbd5e1" : "#334155",
          borderColor: isDark ? "#334155" : "#e2e8f0",
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          titleFont: { weight: "bold", size: 13 },
          callbacks: {
            label: function (context) {
              const label = context.dataset.label || "";
              const val = context.parsed.y;
              if (label.includes("Chi phí") || label.includes("CPA") || label.includes("CPC")) {
                return ` ${label}: ${formatCurrency(val)}`;
              }
              if (val === null) return ` ${label}: Chưa xác định`;
              if (label.includes("Click/reach")) {
                return ` ${label}: ${val.toFixed(2)}%`;
              }
              if (label.includes("đơn")) {
                return ` ${label}: ${formatNumber(val)} đơn`;
              }
              return ` ${label}: ${formatNumber(val)}`;
            },
          },
        },
      },
      scales,
    },
  });
}

// AI Marketing Intelligence & 03 Recommendations Engine
function analysisSnapshot() {
  return CampaignAnalysis.analyze(state.data, Number(document.getElementById('analysis-days')?.value || 7), Number(document.getElementById('analysis-threshold')?.value || 5));
}
function analyzeCampaignIntelligence() {
  const result = analysisSnapshot();
  const cached = state.geminiAnalysisResult;
  const ai = cached && cached.key === JSON.stringify(result);
  const recommendations = ai ? cached.recommendations : result.recommendations;
  const driverText = result.complete && result.driver?.driverSummary ? `\nPhân rã biến động CPA (CPA = CPC ÷ CVR): ${result.driver.driverSummary}` : '';
  return {
    statusLabel: result.conclusion, statusColor: 'indigo', trendMetrics: [],
    trendSummary: `${result.start || '—'} → ${result.end || '—'} so với ${result.prevStart || '—'} → ${result.prevEnd || '—'}.\nLuận điểm: ${result.conclusion}.${driverText}\nĐộ phủ: ${result.coverage.current}/${result.days} và ${result.coverage.previous}/${result.days} ngày. Ngưỡng ít biến động: ±${result.threshold}% (quy ước, không phải kiểm định thống kê).\n${result.complete ? 'Luận cứ: ' + result.evidence.map(e=>e.text).join('\n') : 'Không suy ra xu hướng khi thiếu ngày hoặc dữ liệu không hợp lệ.'}\nClick/reach không phải CTR (click/lượt hiển thị). Tổng reach theo ngày không phải số người duy nhất của cả kỳ. Chưa đủ dữ liệu xác định nguyên nhân hoặc lợi nhuận.`,
    recommendations: recommendations.map((r,i)=>({pillar: `${i+1}. ${ai ? 'AI hỗ trợ · cần kiểm chứng' : 'Gợi ý theo quy tắc'}`,title:r.title,desc:`Vì sao: ${r.why} Đo thế nào: ${r.measure}`,action:'Thử và đo lại'}))
  };
}
function analyzeCampaignIntelligenceOffline() { return analyzeCampaignIntelligence(); }

// Render AI Analysis Section in UI
function renderAiAnalysis() {
  const filtered = getFilteredData();
  const elStatus = document.getElementById("ai-status-label");
  const elTrendSummary = document.getElementById("ai-trend-summary");
  const containerMetrics = document.getElementById("ai-trend-badges");
  const containerRecs = document.getElementById("ai-recommendations-list");

  if (filtered.length === 0) {
    if (elStatus) {
      elStatus.innerText = "Chờ dữ liệu chiến dịch";
      elStatus.className = "text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    }
    if (elTrendSummary) {
      elTrendSummary.innerText = "Chưa có dữ liệu chiến dịch. Hệ thống AI và bộ chẩn đoán phễu sẽ tự động kích hoạt ngay khi bạn nhập từ 2 ngày số liệu trở lên.";
    }
    if (containerMetrics) {
      containerMetrics.innerHTML = `<span class="text-xs text-slate-400 italic">Nhập số liệu để AI phân tích % biến động giữa các chu kỳ.</span>`;
    }
    if (containerRecs) {
      containerRecs.innerHTML = `
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">1. Khởi tạo dữ liệu</span>
              <span class="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">#1</span>
            </div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1.5">Nhập số liệu hoặc nạp mẫu</h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">Nhập các trường: Tiếp cận (Reach), Lượt nhấp (Clicks), Chi phí và Đơn hàng theo ngày ở form bên trái hoặc dán từ bảng tính Excel.</p>
          </div>
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Thao tác:</span>
            <button type="button" onclick="loadSampleDataAction()" class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 px-2 py-0.5 rounded transition">⚡ Nạp 14 ngày mẫu</button>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">2. Tự động hóa KPI</span>
              <span class="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">#2</span>
            </div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1.5">Tự động tính CTR, CPC, CPA</h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">Không cần nhớ công thức Excel, hệ thống tức thời tính toán tỷ lệ chuyển đổi, chi phí trên mỗi đơn và cảnh báo các ngày có chi phí đắt đỏ.</p>
          </div>
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Tự động:</span>
            <span class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">Realtime</span>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">3. Trợ lý AI thực chiến</span>
              <span class="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">#3</span>
            </div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1.5">Chẩn đoán và gợi ý 3 trụ cột</h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">Tích hợp mô hình Gemini 3.8 Flash hỗ trợ 'bắt bệnh' quảng cáo, phát hiện Ad Fatigue, gợi ý kịch bản hook và tư vấn cách vít ngân sách an toàn.</p>
          </div>
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Công nghệ:</span>
            <span class="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded">Gemini 3.8 Flash</span>
          </div>
        </div>
      `;
    }
    return;
  }

  const analysis = analyzeCampaignIntelligence(filtered);

  if (elStatus) {
    elStatus.innerText = analysis.statusLabel;
    elStatus.className = `text-sm font-semibold px-3 py-1 rounded-full ${
      analysis.statusColor === "emerald"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : analysis.statusColor === "rose"
        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
        : analysis.statusColor === "amber"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
    }`;
  }

  if (elTrendSummary) {
    elTrendSummary.innerText = analysis.trendSummary;
  }

  // Trend Metric Badges
  if (containerMetrics) {
    if (analysis.trendMetrics.length === 0) {
      containerMetrics.innerHTML = `<span class="text-xs text-slate-400 italic">So sánh hai kỳ liền nhau có cùng số ngày, kết thúc tại ngày dữ liệu mới nhất.</span>`;
    } else {
      containerMetrics.innerHTML = analysis.trendMetrics
        .map((m) => {
          const isGood = m.isPositiveGood ? m.change >= 0 : m.change <= 0;
          const bg = isGood
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800/40";
          const icon = m.change >= 0 ? "↑" : "↓";
          return `
          <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${bg}">
            <span>${m.name}:</span>
            <span class="font-bold">${icon} ${m.text}</span>
          </div>
        `;
        })
        .join("");
    }
  }

  // Render 03 Actionable Recommendations
  if (containerRecs) {
    containerRecs.innerHTML = analysis.recommendations
      .map((rec, idx) => {
        return `
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/60 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">${escapeHtml(rec.pillar)}</span>
              <span class="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">#${idx + 1}</span>
            </div>
            <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1.5">${escapeHtml(rec.title)}</h4>
            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">${escapeHtml(rec.desc)}</p>
          </div>
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center">
              <svg class="w-3.5 h-3.5 mr-1 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
              Hành động gợi ý:
            </span>
            <span class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">${rec.action || "Thực hiện ngay"}</span>
          </div>
        </div>
      `;
      })
      .join("");
  }
}

// Generate Formatted Text Report for Boss/Client
function generateReportText(format = "boss") {
  if (state.data.length === 0) {
    return `📊 BÁO CÁO CHIẾN DỊCH QUẢNG CÁO: ${state.campaignName}
----------------------------------------
⚠️ Hiện tại chưa có số liệu được nhập cho chiến dịch này.
Vui lòng nhập số liệu theo ngày trên Dashboard hoặc bấm "Nạp mẫu ngẫu nhiên" để tạo báo cáo chi tiết.`;
  }

  const period = analysisSnapshot();
  const filtered = state.data.filter(r => r.date >= period.start && r.date <= period.end);
  const analysis = analyzeCampaignIntelligence(filtered);

  let totalCost = 0;
  let totalReach = 0;
  let totalClicks = 0;
  let totalOrders = 0;

  filtered.forEach((d) => {
    totalCost += d.cost;
    totalReach += d.reach;
    totalClicks += d.clicks;
    totalOrders += d.orders;
  });

  const avgCtr = totalReach > 0 ? (totalClicks / totalReach) * 100 : 0;
  const avgCpc = totalClicks > 0 ? Math.round(totalCost / totalClicks) : 0;
  const avgCpa = totalOrders > 0 ? Math.round(totalCost / totalOrders) : 0;
  const avgCvr = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;

  const startDate = filtered.length > 0 ? formatDateVN(filtered[0].date) : "N/A";
  const endDate = filtered.length > 0 ? formatDateVN(filtered[filtered.length - 1].date) : "N/A";

  if (format === "compact") {
    // Ultra compact 4-line summary
    return `📊 [BÁO CÁO NHANH] ${state.campaignName} (${startDate} - ${endDate})
💰 Chi phí: ${formatCurrency(totalCost)} | 📦 Đơn hàng: ${formatNumber(totalOrders)} đơn
🏷️ CPA (Giá/đơn): ${totalOrders > 0 ? formatCurrency(avgCpa) : "Chưa xác định"} | 🎯 Click/reach: ${totalReach > 0 ? formatPercent(avgCtr) : "Chưa xác định"} | 💵 CPC: ${totalClicks > 0 ? formatCurrency(avgCpc) : "Chưa xác định"}
📈 ${analysis.trendSummary}
💡 Đề xuất chính: ${analysis.recommendations[0]?.title || "Tiếp tục duy trì ngân sách"}`;
  }

  // Full Executive Standard Report (Boss / Client format)
  return `📊 BÁO CÁO HIỆU QUẢ CHIẾN DỊCH QUẢNG CÁO
----------------------------------------
📌 Tên chiến dịch: ${state.campaignName}
📅 Giai đoạn báo cáo: ${startDate} - ${endDate} (${filtered.length} ngày)
⭐ Đánh giá tổng quan: ${analysis.statusLabel}

1️⃣ CHỈ SỐ HOẠT ĐỘNG CỐT LÕI (KPIs):
• 💰 Tổng chi phí đã tiêu: ${formatCurrency(totalCost)}
• 📦 Tổng số đơn hàng: ${formatNumber(totalOrders)} đơn
• 🏷️ Chi phí trên mỗi đơn (CPA): ${totalOrders > 0 ? formatCurrency(avgCpa) : "Chưa xác định"} / đơn
• 👥 Lượt tiếp cận (Reach): ${formatNumber(totalReach)} lượt
• 🖱️ Lượt nhấp chuột (Clicks): ${formatNumber(totalClicks)} lượt
• 🎯 Tỷ lệ nhấp chuột (Click/reach): ${totalReach > 0 ? formatPercent(avgCtr) : "Chưa xác định"}
• 💵 Giá mỗi nhấp chuột (CPC): ${totalClicks > 0 ? formatCurrency(avgCpc) : "Chưa xác định"} / click
• 🔄 Tỷ lệ chuyển đổi (CVR): ${totalClicks > 0 ? formatPercent(avgCvr) : "Chưa xác định"}

2️⃣ PHÂN TÍCH THEO QUY TẮC:
${analysis.trendSummary}

3️⃣ 03 ĐỀ XUẤT HÀNH ĐỘNG CẢI THIỆN TIẾP THEO:
1. ${analysis.recommendations[0]?.title || ""}
   👉 ${analysis.recommendations[0]?.desc || ""}
2. ${analysis.recommendations[1]?.title || ""}
   👉 ${analysis.recommendations[1]?.desc || ""}
3. ${analysis.recommendations[2]?.title || ""}
   👉 ${analysis.recommendations[2]?.desc || ""}

----------------------------------------
Báo cáo được tổng hợp tự động từ Tactic AdPulse Dashboard.`;
}

// Open Export Modal
function openExportModal() {
  const modal = document.getElementById("export-modal");
  const textarea = document.getElementById("export-report-text");
  if (!modal || !textarea) return;

  textarea.value = generateReportText("boss");
  renderExportSummary();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeExportModal() {
  const modal = document.getElementById("export-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// Copy Report to Clipboard
async function copyReportToClipboard() {
  const textarea = document.getElementById("export-report-text");
  if (!textarea) return;

  const textToCopy = textarea.value;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      // Fallback
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    }

    showToast("Đã sao chép báo cáo vào bộ nhớ tạm! Bạn có thể dán vào Zalo/Slack ngay.", "success");

    // Button feedback animation
    const btnCopy = document.getElementById("btn-do-copy");
    if (btnCopy) {
      const origText = btnCopy.innerHTML;
      btnCopy.innerHTML = `
        <svg class="w-4 h-4 mr-1.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        Đã sao chép thành công!
      `;
      btnCopy.classList.remove("bg-indigo-600", "hover:bg-indigo-700");
      btnCopy.classList.add("bg-emerald-600");

      setTimeout(() => {
        btnCopy.innerHTML = origText;
        btnCopy.classList.add("bg-indigo-600", "hover:bg-indigo-700");
        btnCopy.classList.remove("bg-emerald-600");
      }, 2500);
    }
  } catch (err) {
    console.error("Lỗi copy:", err);
    showToast("Không thể tự động copy, bạn vui lòng bôi đen và nhấn Ctrl+C!", "error");
  }
}

// Switch Report Template
function switchReportTemplate(tpl) {
  const textarea = document.getElementById("export-report-text");
  if (!textarea) return;
  textarea.value = generateReportText(tpl);

  // Update tabs style
  const tabBoss = document.getElementById("tab-tpl-boss");
  const tabCompact = document.getElementById("tab-tpl-compact");
  if (tpl === "boss") {
    tabBoss?.classList.add("bg-indigo-600", "text-white");
    tabBoss?.classList.remove("bg-slate-100", "text-slate-700", "dark:bg-slate-800", "dark:text-slate-300");
    tabCompact?.classList.remove("bg-indigo-600", "text-white");
    tabCompact?.classList.add("bg-slate-100", "text-slate-700", "dark:bg-slate-800", "dark:text-slate-300");
  } else {
    tabCompact?.classList.add("bg-indigo-600", "text-white");
    tabCompact?.classList.remove("bg-slate-100", "text-slate-700", "dark:bg-slate-800", "dark:text-slate-300");
    tabBoss?.classList.remove("bg-indigo-600", "text-white");
    tabBoss?.classList.add("bg-slate-100", "text-slate-700", "dark:bg-slate-800", "dark:text-slate-300");
  }
}

// Open Bulk Entry Modal (Multi-row entry)
function openBulkModal() {
  const modal = document.getElementById("bulk-modal");
  if (!modal) return;

  const tbody = document.getElementById("bulk-table-body");
  if (tbody) {
    // Generate 3 blank rows by default
    tbody.innerHTML = "";
    let baseDate = new Date();
    if (state.data.length > 0) {
      baseDate = new Date(state.data[state.data.length - 1].date);
      baseDate.setDate(baseDate.getDate() + 1);
    }

    for (let i = 0; i < 3; i++) {
      const rowDate = new Date(baseDate);
      rowDate.setDate(rowDate.getDate() + i);
      const dateStr = rowDate.toISOString().split("T")[0];
      addBulkRow(dateStr, "", "", "", "");
    }
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeBulkModal() {
  const modal = document.getElementById("bulk-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function addBulkRow(date = "", reach = "", clicks = "", cost = "", orders = "") {
  const tbody = document.getElementById("bulk-table-body");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-200 dark:border-slate-800";
  tr.innerHTML = `
    <td class="p-2">
      <input type="date" value="${date}" class="bulk-date w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500" required />
    </td>
    <td class="p-2">
      <input type="number" value="${reach}" placeholder="Ví dụ: 15000" class="bulk-reach w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500" required />
    </td>
    <td class="p-2">
      <input type="number" value="${clicks}" placeholder="Ví dụ: 450" class="bulk-clicks w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500" required />
    </td>
    <td class="p-2">
      <input type="number" value="${cost}" placeholder="Ví dụ: 1200000" class="bulk-cost w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500" required />
    </td>
    <td class="p-2">
      <input type="number" value="${orders}" placeholder="Ví dụ: 20" class="bulk-orders w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500" required />
    </td>
    <td class="p-2 text-center">
      <button type="button" onclick="this.closest('tr').remove()" class="p-1 text-slate-400 hover:text-rose-500 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
}

// Save All Rows from Bulk Modal
function saveBulkRows() {
  const tbody = document.getElementById("bulk-table-body");
  if (!tbody) return;

  const rows = tbody.querySelectorAll("tr");
  let addedCount = 0;
  let updatedCount = 0;

  for (const row of rows) {
    const date = row.querySelector(".bulk-date")?.value;
    const reach = parseInt(row.querySelector(".bulk-reach")?.value, 10);
    const clicks = parseInt(row.querySelector(".bulk-clicks")?.value, 10);
    const cost = parseFloat(row.querySelector(".bulk-cost")?.value);
    const orders = parseInt(row.querySelector(".bulk-orders")?.value, 10);

    // Skip empty rows
    if (!date || isNaN(reach) || isNaN(clicks) || isNaN(cost) || isNaN(orders)) {
      continue;
    }

    if (!CampaignAnalysis.isValidRow({date,reach,clicks,cost,orders})) continue;
    const existingIndex = state.data.findIndex((d) => d.date === date);
    if (existingIndex !== -1) {
      state.data[existingIndex] = {
        id: state.data[existingIndex].id,
        date,
        reach,
        clicks,
        cost,
        orders,
      };
      updatedCount++;
    } else {
      state.data.push({
        id: "bulk-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        date,
        reach,
        clicks,
        cost,
        orders,
      });
      addedCount++;
    }
  }

  if (addedCount === 0 && updatedCount === 0) {
    showToast("Không có dòng hợp lệ nào để lưu. Hãy điền đầy đủ các cột!", "error");
    return;
  }

  sortDataByDate();
  saveData();
  renderDashboard();
  closeBulkModal();
  showToast(`Đã lưu thành công: ${addedCount} ngày mới, ${updatedCount} ngày cập nhật!`, "success");
}

// Paste Excel Data into Bulk Modal
function handlePasteFromExcel(e) {
  const pasteData = e.clipboardData?.getData("text");
  if (!pasteData) return;

  const lines = pasteData.trim().split(/\r\n|\n|\r/);
  if (lines.length <= 1 && !lines[0].includes("\t")) return; // Not tab-separated or multi-line

  e.preventDefault();
  const tbody = document.getElementById("bulk-table-body");
  if (!tbody) return;

  let validPasted = 0;
  lines.forEach((line) => {
    const cols = line.split("\t");
    if (cols.length >= 4) {
      let [date, reach, clicks, cost, orders] = cols;
      date = date?.trim();
      reach = reach?.replace(/[^\d]/g, "");
      clicks = clicks?.replace(/[^\d]/g, "");
      cost = cost?.replace(/[^\d]/g, "");
      orders = orders ? orders.replace(/[^\d]/g, "") : "0";

      if (date) {
        addBulkRow(date, reach, clicks, cost, orders);
        validPasted++;
      }
    }
  });

  if (validPasted > 0) {
    showToast(`Đã nhận ${validPasted} dòng từ bảng tính Excel!`, "success");
  }
}

// Toast Notifications
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-enter flex items-center p-3.5 rounded-xl shadow-lg border text-sm max-w-sm pointer-events-auto transition-all ${
    type === "success"
      ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
      : type === "error"
      ? "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
      : "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200"
  }`;

  const icon =
    type === "success"
      ? `<svg class="w-5 h-5 mr-2.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
      : type === "error"
      ? `<svg class="w-5 h-5 mr-2.5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
      : `<svg class="w-5 h-5 mr-2.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

  toast.innerHTML = `
    ${icon}
    <div class="flex-1 font-medium">${message}</div>
    <button onclick="this.parentElement.remove()" class="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("toast-enter");
    toast.classList.add("toast-leave");
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// Export and Import CSV
function exportToCsv() {
  if (state.data.length === 0) {
    showToast("Không có dữ liệu để xuất CSV!", "error");
    return;
  }
  const headers = ["Ngày", "Tiếp cận (Reach)", "Lượt nhấp (Clicks)", "Chi phí (VND)", "Đơn hàng", "Click/reach (%)", "CPC (VND)", "CPA (VND)"];
  const rows = state.data.map((d) => {
    const ctr = d.reach > 0 ? ((d.clicks / d.reach) * 100).toFixed(2) : 0;
    const cpc = d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0;
    const cpa = d.orders > 0 ? Math.round(d.cost / d.orders) : 0;
    return [d.date, d.reach, d.clicks, d.cost, d.orders, ctr, cpc, cpa].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kpi_campaign_${state.campaignName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Đã tải xuống file CSV thành công!", "success");
}

function handleCsvFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    try {
      const text = evt.target.result;
      const lines = text.trim().split(/\r\n|\n|\r/);
      if (lines.length < 2) {
        showToast("File CSV không có dữ liệu hợp lệ!", "error");
        return;
      }

      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 5) {
          const date = parts[0].trim();
          const reach = parseInt(parts[1], 10);
          const clicks = parseInt(parts[2], 10);
          const cost = parseFloat(parts[3]);
          const orders = parseInt(parts[4], 10);

          if (CampaignAnalysis.isValidRow({date,reach,clicks,cost,orders})) {
            const existIdx = state.data.findIndex((d) => d.date === date);
            if (existIdx !== -1) {
              state.data[existIdx] = { id: state.data[existIdx].id, date, reach, clicks, cost, orders };
            } else {
              state.data.push({
                id: "csv-" + Date.now() + "-" + i,
                date,
                reach,
                clicks,
                cost,
                orders,
              });
            }
            count++;
          }
        }
      }

      sortDataByDate();
      saveData();
      renderDashboard();
      showToast(`Đã nhập thành công ${count} ngày từ file CSV!`, "success");
    } catch (err) {
      showToast("Lỗi khi đọc file CSV!", "error");
    }
  };
  reader.readAsText(file);
}

// ==========================================
// GEMINI 3.8 FLASH DEEP AI ANALYSIS & CHAT
// ==========================================

async function runGeminiAiAnalysis() {
  if (state.isGeminiLoading) return;
  const snapshot = analysisSnapshot();
  const key = JSON.stringify(snapshot);
  const btn = document.getElementById('btn-run-gemini-ai');
  const label = document.getElementById("gemini-btn-text");
  state.isGeminiLoading = true; btn.disabled = true; label.textContent = "Đang tạo gợi ý…";
  try {
    const response = await fetch('/api/recommendations', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:state.data,days:snapshot.days,threshold:snapshot.threshold}),signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error('AI unavailable');
    const result = await response.json();
    if (!Array.isArray(result.recommendations) || result.recommendations.length !== 3 || !result.recommendations.every(r=>['title','why','measure'].every(k=>typeof r[k] === 'string'))) throw new Error('Invalid response');
    if (key !== JSON.stringify(analysisSnapshot())) return;
    state.currentContextId = result.contextId || null;
    state.geminiAnalysisResult = {key,recommendations:result.recommendations,contextId:result.contextId,driver:result.driver};
    renderAiAnalysis(); showToast('Đã nhận 3 gợi ý AI; kết luận vẫn do quy tắc xác định.', 'success');
  } catch {
    state.geminiAnalysisResult = null; renderAiAnalysis();
    showToast('AI chưa khả dụng. Đang dùng 3 gợi ý theo quy tắc.', 'info');
  } finally { state.isGeminiLoading = false; btn.disabled = false; label.textContent = "AI hỗ trợ cải thiện"; }
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text ? String(text).replace(/[&<>"']/g, (m) => map[m]) : '';
}

async function askAiQuestion(question) {
  const inputEl = document.getElementById('ai-chat-input');
  if (inputEl) inputEl.value = question;
  await submitAiQuestion();
}

async function submitAiQuestion() {
  const inputEl = document.getElementById('ai-chat-input');
  if (!inputEl) return;
  const question = inputEl.value.trim();
  if (!question) return;

  const btn = document.getElementById('btn-submit-ai-chat');
  const btnText = document.getElementById('ai-chat-btn-text');
  const thread = document.getElementById('ai-chat-thread');
  if (thread) thread.classList.remove('hidden');

  const userMsgId = 'chat-msg-' + Date.now();
  if (thread) {
    thread.innerHTML += `
      <div class="flex items-start space-x-2.5 justify-end">
        <div class="p-3 rounded-2xl bg-indigo-600 text-white text-xs sm:text-sm max-w-[85%] shadow-sm">
          <p class="font-medium">${escapeHtml(question)}</p>
        </div>
      </div>
      <div id="${userMsgId}" class="flex items-start space-x-2.5">
        <div class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-[10px] text-indigo-600 font-bold shrink-0">AI</div>
        <div class="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm max-w-[85%] border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <p class="animate-pulse">Đang đối chiếu dữ liệu chiến dịch và phản hồi...</p>
        </div>
      </div>
    `;
    thread.scrollTop = thread.scrollHeight;
  }

  inputEl.value = '';
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Đang trả lời...';

  const snapshot = analysisSnapshot();
  const payload = {
    rows: state.data,
    days: snapshot.days,
    threshold: snapshot.threshold,
    contextId: state.currentContextId || undefined,
    question
  };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) throw new Error('Chat failed');
    const data = await res.json();
    if (data.contextId) state.currentContextId = data.contextId;

    const el = document.getElementById(userMsgId);
    if (el) {
      const cacheBadge = data.cached
        ? `<span class="inline-flex items-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full mr-2">⚡ Hit RAM Cache (0 token)</span>`
        : `<span class="inline-flex items-center text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full mr-2">🤖 Gemini 3.8 Flash</span>`;

      el.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-[10px] text-indigo-600 font-bold shrink-0">AI</div>
        <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm max-w-[85%] border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="flex items-center mb-1.5 flex-wrap gap-1">
            ${cacheBadge}
            <span class="text-[10px] text-slate-400">Đã qua 6 lớp kiểm soát số liệu</span>
          </div>
          <p class="leading-relaxed font-normal whitespace-pre-line">${escapeHtml(data.answer)}</p>
        </div>
      `;
    }
  } catch {
    const el = document.getElementById(userMsgId);
    if (el) {
      el.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/60 flex items-center justify-center text-[10px] text-rose-600 font-bold shrink-0">!</div>
        <div class="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs sm:text-sm max-w-[85%] border border-rose-200 dark:border-rose-900/50 shadow-sm">
          <p>Không thể kết nối tới AI hoặc câu trả lời không vượt qua kiểm soát số liệu. Vui lòng thử lại với câu hỏi cụ thể hơn.</p>
        </div>
      `;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Gửi câu hỏi';
    if (thread) thread.scrollTop = thread.scrollHeight;
  }
}




// ============================================================
// UI v2.6: delta vs previous period, sparklines, hero, CPA bar, report summary
// Quy ước: chỉ hiện % thay đổi khi CẢ HAI kỳ đủ ngày (CampaignAnalysis.complete)
// ============================================================
function onAnalysisPeriodChange() {
  renderKpiCards();
  renderHero();
  renderAiAnalysis();
}

const fmtShortDate = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");
const fmtDeltaPct = (v) => (v > 0 ? "▲ " : "▼ ") + Math.abs(v).toFixed(1).replace(".", ",") + "%";

function periodTooltip(snap) {
  if (!snap) return "";
  return snap.days + " ngày gần nhất (" + fmtShortDate(snap.start) + "–" + fmtShortDate(snap.end) + ") so với " +
    snap.days + " ngày liền trước (" + fmtShortDate(snap.prevStart) + "–" + fmtShortDate(snap.prevEnd) + ")";
}

// mode: 'up-good' | 'down-good' | 'neutral'
function setDeltaChip(id, snap, key, mode) {
  const el = document.getElementById(id);
  if (!el) return;
  const base = "text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ";
  const tone = {
    good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    bad: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    info: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    mute: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  if (!snap) { el.className = ""; el.textContent = ""; el.removeAttribute("title"); return; }
  const v = snap.complete ? snap.delta[key] : null;
  if (v === null || v === undefined) {
    el.className = base + tone.mute;
    el.textContent = "Chưa so sánh";
    el.title = snap.complete
      ? "Không tính % khi kỳ trước bằng 0 hoặc chưa xác định."
      : "Cần đủ " + snap.days + " ngày ở cả hai kỳ (hiện có " + snap.coverage.current + "/" + snap.days + " và " + snap.coverage.previous + "/" + snap.days + " ngày).";
    return;
  }
  el.title = periodTooltip(snap);
  if (Math.abs(v) <= snap.threshold) { el.className = base + tone.mute; el.textContent = "≈ Ổn định"; return; }
  const up = v > 0;
  const cls = mode === "neutral" ? tone.info : (mode === "up-good" ? up : !up) ? tone.good : tone.bad;
  el.className = base + cls;
  el.textContent = fmtDeltaPct(v);
}

function sparkSvg(values, color) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && Number.isFinite(p.v));
  if (pts.length < 2) return '<div class="h-full flex items-end"><div class="w-full border-t border-dashed border-slate-300 dark:border-slate-600"></div></div>';
  const W = 120, H = 32, pad = 3;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i) => (values.length === 1 ? 0 : (i / (values.length - 1)) * W);
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = pts.map((p) => x(p.i).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ");
  const area = x(pts[0].i).toFixed(1) + "," + H + " " + line + " " + x(pts[pts.length - 1].i).toFixed(1) + "," + H;
  return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" class="w-full h-full" aria-hidden="true">' +
    '<polygon points="' + area + '" fill="' + color + '" fill-opacity="0.14"></polygon>' +
    '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline></svg>';
}

function renderKpiExtras(rows, snap) {
  const series = {
    cost: rows.map((d) => d.cost),
    reach: rows.map((d) => d.reach),
    ctr: rows.map((d) => (d.reach > 0 ? (d.clicks / d.reach) * 100 : null)),
    orders: rows.map((d) => d.orders),
  };
  const colors = { cost: "#6366f1", reach: "#06b6d4", ctr: "#10b981", orders: "#f59e0b" };
  for (const k of Object.keys(series)) {
    const el = document.getElementById("spark-" + k);
    if (el) el.innerHTML = rows.length ? sparkSvg(series[k], colors[k]) : "";
  }
  setDeltaChip("badge-cost-delta", snap, "cost", "neutral");
  setDeltaChip("badge-reach-delta", snap, "reach", "up-good");
  setDeltaChip("badge-ctr-delta", snap, "clickReach", "up-good");
  setDeltaChip("badge-orders-delta", snap, "orders", "up-good");
  setDeltaChip("kpi-cpa-delta", snap, "cpa", "down-good");
}

function renderHero() {
  const box = document.getElementById("hero-summary");
  const h = document.getElementById("hero-headline");
  const s = document.getElementById("hero-sub");
  const p = document.getElementById("hero-period");
  if (!box || !h || !s || !p) return;
  if (!state.data.length) {
    document.getElementById("hero-cta")?.classList.add("hidden");
    box.dataset.tone = "neutral";
    h.textContent = "Chưa có số liệu chiến dịch";
    s.textContent = "Nhập số liệu ngày đầu tiên ở form bên dưới hoặc dán nhiều dòng từ Excel. KPI, biểu đồ và nhận xét sẽ tự cập nhật.";
    p.textContent = "";
    return;
  }
  document.getElementById("hero-cta")?.classList.remove("hidden");
  const snap = analysisSnapshot();
  h.textContent = snap.conclusion;
  p.textContent = "· " + snap.days + " ngày gần nhất " + fmtShortDate(snap.start) + "–" + fmtShortDate(snap.end);
  if (!snap.complete) {
    box.dataset.tone = "neutral";
    s.textContent = "Kỳ hiện tại có " + snap.coverage.current + "/" + snap.days + " ngày, kỳ trước có " + snap.coverage.previous + "/" + snap.days +
      " ngày. Cần đủ cả hai kỳ liền nhau để kết luận xu hướng.";
    return;
  }
  const d = snap.delta, t = snap.threshold;
  const o = d.orders === null ? 0 : Math.abs(d.orders) <= t ? 0 : Math.sign(d.orders);
  const c = d.cpa === null ? 0 : Math.abs(d.cpa) <= t ? 0 : Math.sign(d.cpa);
  box.dataset.tone = o > 0 && c < 0 ? "good" : o < 0 && c > 0 ? "bad" : "neutral";
  const part = (label, v) => label + " " + (v === null ? "chưa xác định" : fmtDeltaPct(v).replace("▲ ", "+").replace("▼ ", "−"));
  s.textContent = [part("Số đơn", d.orders), part("CPA", d.cpa), part("Chi phí", d.cost)].join(" · ") + " so với kỳ liền trước.";
}

function cpaBar(item, avgCpa, topCpa) {
  if (!(item.orders > 0) || !avgCpa || !topCpa) return "";
  const cpa = item.cost / item.orders;
  const rel = (cpa / avgCpa - 1) * 100;
  const color = rel <= -5 ? "bg-emerald-500" : rel >= 5 ? "bg-rose-500" : "bg-amber-400";
  const w = Math.max(6, Math.round((cpa / topCpa) * 100));
  const tip = (rel >= 0 ? "+" : "−") + Math.abs(rel).toFixed(0) + "% so với CPA trung bình của giai đoạn đang xem";
  return '<div class="mt-1 ml-auto w-16 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" title="' + tip + '"><div class="h-full rounded-full ' + color + '" style="width:' + w + '%"></div></div>';
}

function renderExportSummary() {
  const box = document.getElementById("export-report-summary");
  if (!box) return;
  if (!state.data.length) { box.innerHTML = '<p class="text-xs text-slate-500">Chưa có số liệu để tóm tắt.</p>'; return; }
  const snap = analysisSnapshot();
  const cur = snap.current, d = snap.delta;
  const dl = (v) => {
    if (!snap.complete || v === null || v === undefined) return '<span class="text-slate-400">chưa so sánh</span>';
    if (Math.abs(v) <= snap.threshold) return '<span class="text-slate-500">ổn định</span>';
    return '<span class="text-slate-700">' + fmtDeltaPct(v) + "</span>";
  };
  const cell = (label, val, delta) =>
    '<div><div class="text-[10px] font-semibold uppercase tracking-widest text-slate-400">' + label + '</div>' +
    '<div class="mt-1 text-lg sm:text-xl font-light tracking-tight text-slate-900 whitespace-nowrap">' + val + '</div>' +
    '<div class="mt-0.5 text-[11px]">' + delta + "</div></div>";
  box.innerHTML =
    '<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 border-b border-slate-200">' +
      '<div class="text-sm font-bold text-slate-900 truncate">' + escapeHtml(state.campaignName) + "</div>" +
      '<div class="text-[11px] text-slate-500">' + snap.days + " ngày gần nhất · " + fmtShortDate(snap.start) + "–" + fmtShortDate(snap.end) + "</div></div>" +
    '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3">' +
      cell("Chi phí", formatCurrency(cur.cost), dl(d.cost)) +
      cell("Số đơn", formatNumber(cur.orders), dl(d.orders)) +
      cell("CPA", cur.cpa === null ? "—" : formatCurrency(Math.round(cur.cpa)), dl(d.cpa)) +
      cell("Click/reach", cur.clickReach === null ? "—" : formatPercent(cur.clickReach), dl(d.clickReach)) +
    "</div>" +
    '<div class="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-500">' + escapeHtml(snap.conclusion) + "</div>";
}


// Nút lên đầu trang: hiện khi cuộn xuống quá 400px
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-back-to-top");
  if (!btn) return;
  const hiddenCls = ["opacity-0", "translate-y-3", "pointer-events-none"];
  const update = () => {
    const show = window.scrollY > 400;
    hiddenCls.forEach((c) => btn.classList.toggle(c, !show));
  };
  window.addEventListener("scroll", update, { passive: true });
  btn.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
  update();
});


// Phân biệt dữ liệu mô phỏng (nạp mẫu) với số liệu người dùng tự nhập
function simulatedTag() {
  const isSim = (r) => /^(smp|sample)-/.test(String(r.id));
  const n = state.data.filter(isSim).length;
  if (!n) return "";
  const all = n === state.data.length;
  return '<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ' +
    (all ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300") +
    '" title="Số liệu do hệ thống sinh ngẫu nhiên để demo, không phải số liệu thật">' + (all ? "Dữ liệu mô phỏng" : "Có dòng mô phỏng") + "</span>";
}
