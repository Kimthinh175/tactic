/**
 * Tactic AdPulse - Mini Campaign KPI Dashboard
 * Engine quản lý dữ liệu, tính toán KPI, biểu đồ Chart.js, AI phân tích & xuất báo cáo
 */

// Storage keys (v3 clean production state)
const STORAGE_KEY = "tactic_kpi_campaign_data_v3";
const CAMPAIGN_NAME_KEY = "tactic_campaign_name_v3";
const AI_RECOMMENDATIONS_STORAGE_KEY = "tactic_ai_recommendations_cache_v3";

function loadAiRecommendationsFromStorage(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(AI_RECOMMENDATIONS_STORAGE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    return cache && cache[key] ? cache[key] : null;
  } catch (e) {
    return null;
  }
}

function saveAiRecommendationsToStorage(key, data) {
  if (!key || !data) return;
  try {
    let cache = {};
    const raw = localStorage.getItem(AI_RECOMMENDATIONS_STORAGE_KEY);
    if (raw) {
      try { cache = JSON.parse(raw) || {}; } catch {}
    }
    cache[key] = data;
    const keys = Object.keys(cache);
    if (keys.length > 30) {
      delete cache[keys[0]];
    }
    localStorage.setItem(AI_RECOMMENDATIONS_STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

function clearAiRecommendationsStorage() {
  try {
    localStorage.removeItem(AI_RECOMMENDATIONS_STORAGE_KEY);
  } catch {}
}

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
    ? `<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`
    : `<svg class="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;
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

let clearPendingTimer = null;
function clearAllData(e) {
  if (e && e.preventDefault) e.preventDefault();
  const btn = document.getElementById("btn-clear-all");

  // If user clicks the 2nd time during pending state -> instant clear without needing browser dialog
  if (btn && btn.dataset.pendingConfirm === "true") {
    clearTimeout(clearPendingTimer);
    btn.dataset.pendingConfirm = "false";
    btn.innerHTML = `
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      <span>Xóa hết</span>
    `;
    btn.className = "h-8 px-2.5 text-xs font-medium rounded-lg btn-secondary text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 whitespace-nowrap";
    doClear();
    return;
  }

  // First call window.confirm (for browsers that support it and Playwright E2E tests)
  let confirmed = false;
  try {
    confirmed = confirm("Bạn có chắc chắn muốn xóa toàn bộ dữ liệu? Thao tác này sẽ đưa Dashboard về trạng thái trống ban đầu.");
  } catch {
    confirmed = false;
  }

  if (confirmed) {
    doClear();
  } else {
    // If confirm was cancelled or suppressed by browser dialog blockers:
    // Turn button into a direct 2nd-click confirmation for 4 seconds!
    if (btn) {
      btn.dataset.pendingConfirm = "true";
      btn.innerHTML = `
        <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        <span>Bấm lại để xác nhận xóa hết!</span>
      `;
      btn.className = "h-8 px-2.5 text-xs font-semibold rounded-lg text-white bg-rose-600 hover:bg-rose-700 inline-flex items-center gap-1 whitespace-nowrap";
      showToast("Nhấp lại nút 'Xác nhận xóa hết' để đưa Dashboard về trạng thái trống!", "info");

      clearPendingTimer = setTimeout(() => {
        if (btn) {
          btn.dataset.pendingConfirm = "false";
          btn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            <span>Xóa hết</span>
          `;
          btn.className = "h-8 px-2.5 text-xs font-medium rounded-lg btn-secondary text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 whitespace-nowrap";
        }
      }, 4000);
    }
  }

  function doClear() {
    state.data = [];
    state.geminiAnalysisResult = null;
    state.currentContextId = null;
    state.selectedRowId = null;
    clearAiRecommendationsStorage();
    toggleAiPanel(false, false);
    const thread = document.getElementById("ai-chat-thread");
    if (thread) {
      thread.innerHTML = "";
      thread.classList.add("hidden");
    }
    saveData();
    renderDashboard();
    showToast("Đã đưa Dashboard về trạng thái trống ban đầu!", "info");
  }
}
window.clearAllData = clearAllData;

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
    btnClearAll.addEventListener("click", clearAllData);
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
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      <span>Cập nhật ngày</span>
    `;
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
      <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
      <span>Lưu số liệu ngày</span>
    `;
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
    <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
    ${startDate} – ${endDate} (${filtered.length} ngày)
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
  const tableFoot = document.getElementById("data-table-foot");
  const emptyState = document.getElementById("table-empty-state");
  if (!tableBody) return;

  const filtered = [...getFilteredData()].reverse(); // Show latest on top

  if (filtered.length === 0) {
    tableBody.innerHTML = "";
    if (tableFoot) {
      tableFoot.innerHTML = "";
      tableFoot.classList.add("hidden");
    }
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  // Find min and max CPA for highlight
  const validCpaItems = filtered.filter((d) => d.orders > 0);
  const minCpa = validCpaItems.length > 0 ? Math.min(...validCpaItems.map((d) => d.cost / d.orders)) : null;
  const maxCpa = validCpaItems.length > 1 ? Math.max(...validCpaItems.map((d) => d.cost / d.orders)) : null;

  const sumReach = filtered.reduce((a, d) => a + (d.reach || 0), 0);
  const sumClicks = filtered.reduce((a, d) => a + (d.clicks || 0), 0);
  const sumCost = filtered.reduce((a, d) => a + (d.cost || 0), 0);
  const sumOrders = filtered.reduce((a, d) => a + (d.orders || 0), 0);
  const avgCtr = sumReach > 0 ? (sumClicks / sumReach) * 100 : null;
  const avgCpc = sumClicks > 0 ? Math.round(sumCost / sumClicks) : null;
  const avgCpa = sumOrders > 0 ? sumCost / sumOrders : null;
  const topCpa = validCpaItems.length ? Math.max(...validCpaItems.map((d) => d.cost / d.orders)) : 0;

  tableBody.innerHTML = filtered
    .map((item) => {
      const ctr = item.reach > 0 ? (item.clicks / item.reach) * 100 : 0;
      const cpc = item.clicks > 0 ? Math.round(item.cost / item.clicks) : 0;
      const cpa = item.orders > 0 ? Math.round(item.cost / item.orders) : 0;

      let cpaHighlightClass = "text-foreground font-medium";
      let cpaBadge = "";
      if (item.orders > 0) {
        if (minCpa && cpa === Math.round(minCpa) && validCpaItems.length > 2) {
          cpaHighlightClass = "text-emerald-700 dark:text-emerald-400 font-bold";
          cpaBadge = `<span class="ml-1.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded">Tốt nhất</span>`;
        } else if (maxCpa && cpa === Math.round(maxCpa) && validCpaItems.length > 2) {
          cpaHighlightClass = "text-rose-700 dark:text-rose-400 font-bold";
          cpaBadge = `<span class="ml-1.5 text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.5 rounded">Cao nhất</span>`;
        }
      }

      return `
      <tr class="data-row hover:bg-surface-subtle transition-colors">
        <td data-label="Ngày" class="cell-date py-2.5 px-3 sm:px-4 font-semibold text-foreground whitespace-nowrap tabular-nums sticky left-0 bg-surface">
          ${formatDateVN(item.date)}
        </td>
        <td data-label="Reach" class="py-2.5 px-2.5 text-right font-medium text-muted whitespace-nowrap tabular-nums hidden md:table-cell">${formatNumber(item.reach)}</td>
        <td data-label="Clicks" class="py-2.5 px-2.5 text-right font-medium text-foreground whitespace-nowrap tabular-nums">${formatNumber(item.clicks)}</td>
        <td data-label="Chi phí" class="py-2.5 px-2.5 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">${formatCurrency(item.cost)}</td>
        <td data-label="Đơn hàng" class="py-2.5 px-2.5 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-secondary text-foreground">
            ${formatNumber(item.orders)} đơn
          </span>
        </td>
        <td data-label="Click/reach" class="py-2.5 px-2.5 text-right font-medium text-foreground whitespace-nowrap tabular-nums">${item.reach > 0 ? formatPercent(ctr) : "Chưa xác định"}</td>
        <td data-label="CPC" class="py-2.5 px-2.5 text-right font-medium text-muted whitespace-nowrap tabular-nums hidden lg:table-cell">${item.clicks > 0 ? formatCurrency(cpc) : "Chưa xác định"}</td>
        <td data-label="Chi phí/đơn (CPA)" class="py-2.5 px-2.5 text-right whitespace-nowrap tabular-nums ${cpaHighlightClass}">
          <div class="sm:text-right">${item.orders > 0 ? formatCurrency(cpa) : '<span class="text-muted italic">Chưa xác định</span>'}${cpaBadge}${cpaBar(item, avgCpa, topCpa)}</div>
        </td>
        <td data-label="Thao tác" class="cell-actions py-2 px-3 text-center whitespace-nowrap">
          <div class="flex items-center justify-end sm:justify-center gap-1.5">
            <button type="button" onclick="startEditRecord('${item.id}')" title="Chỉnh sửa ngày ${formatDateVN(item.date)}" aria-label="Chỉnh sửa ngày ${formatDateVN(item.date)}" class="w-8 h-8 rounded-lg btn-subtle inline-flex items-center justify-center text-muted hover:text-foreground">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button type="button" onclick="deleteRecord('${item.id}')" title="Xóa ngày ${formatDateVN(item.date)}" aria-label="Xóa ngày ${formatDateVN(item.date)}" class="w-8 h-8 rounded-lg btn-subtle inline-flex items-center justify-center text-muted hover:text-rose-600 dark:hover:text-rose-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </td>
      </tr>
      `;
    })
    .join("");

  if (tableFoot) {
    tableFoot.classList.remove("hidden");
    tableFoot.innerHTML = `
      <tr>
        <td data-label="Kỳ tổng hợp" class="py-3 px-3 sm:px-4 font-bold text-foreground whitespace-nowrap sticky left-0 bg-surface-subtle">Tổng / TB (${filtered.length} ngày)</td>
        <td data-label="Tổng Reach" class="py-3 px-2.5 text-right font-semibold text-muted whitespace-nowrap tabular-nums hidden md:table-cell">${formatNumber(sumReach)}</td>
        <td data-label="Tổng Clicks" class="py-3 px-2.5 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">${formatNumber(sumClicks)}</td>
        <td data-label="Tổng Chi phí" class="py-3 px-2.5 text-right font-bold text-foreground whitespace-nowrap tabular-nums">${formatCurrency(sumCost)}</td>
        <td data-label="Tổng Đơn hàng" class="py-3 px-2.5 text-right font-bold text-foreground whitespace-nowrap tabular-nums">${formatNumber(sumOrders)} đơn</td>
        <td data-label="TB Click/reach" class="py-3 px-2.5 text-right font-semibold text-foreground whitespace-nowrap tabular-nums">${avgCtr !== null ? formatPercent(avgCtr) : "Chưa xác định"}</td>
        <td data-label="TB CPC" class="py-3 px-2.5 text-right font-semibold text-muted whitespace-nowrap tabular-nums hidden lg:table-cell">${avgCpc !== null ? formatCurrency(avgCpc) : "Chưa xác định"}</td>
        <td data-label="TB CPA" class="py-3 px-2.5 text-right font-bold text-foreground whitespace-nowrap tabular-nums">${avgCpa !== null ? formatCurrency(Math.round(avgCpa)) : "Chưa xác định"}</td>
        <td class="py-3 px-3 text-center text-muted hidden sm:table-cell">—</td>
      </tr>
    `;
  }
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

  const isDark = document.documentElement.classList.contains("dark");
  const textColor = isDark ? "#9ca3af" : "#5b606b";
  const gridColor = isDark ? "rgba(156, 163, 175, 0.12)" : "rgba(222, 222, 227, 0.75)";
  const fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

  const colCost = isDark ? "#818cf8" : "#4f46e5";
  const colReach = isDark ? "#38bdf8" : "#0284c7";
  const colCtr = isDark ? "#34d399" : "#059669";
  const colOrders = isDark ? "#fbbf24" : "#d97706";

  let datasets = [];
  let scales = {};

  const type = state.chartType; // 'combo', 'line', 'bar'

  if (state.chartMetricView === "all") {
    datasets = [
      {
        label: "Chi phí (VNĐ)",
        type: type === "combo" ? "bar" : type,
        data: costData,
        yAxisID: "yCost",
        backgroundColor: isDark ? "rgba(129, 140, 248, 0.28)" : "rgba(79, 70, 229, 0.2)",
        borderColor: colCost,
        borderWidth: 1.5,
        borderRadius: 4,
        order: 3,
      },
      {
        label: "Tiếp cận (Reach)",
        type: "line",
        data: reachData,
        yAxisID: "yCount",
        borderColor: colReach,
        backgroundColor: "rgba(2, 132, 199, 0.08)",
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        order: 2,
      },
      {
        label: "Số đơn hàng",
        type: "line",
        data: ordersData,
        yAxisID: "yOrders",
        borderColor: colOrders,
        backgroundColor: colOrders,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        order: 1,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 } },
      },
      yCount: {
        type: "linear",
        display: true,
        position: "left",
        title: { display: true, text: "Tiếp cận", color: colReach, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => formatNumber(v) },
      },
      yCost: {
        type: "linear",
        display: true,
        position: "right",
        title: { display: true, text: "Chi phí", color: colCost, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => (v >= 1000000 ? v / 1000000 + " tr" : v / 1000 + " k") },
      },
      yOrders: {
        type: "linear",
        display: true,
        position: "right",
        title: { display: true, text: "Đơn", color: colOrders, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, stepSize: 5 },
      },
    };
  } else if (state.chartMetricView === "cost_orders") {
    datasets = [
      {
        label: "Chi phí (VNĐ)",
        type: type === "combo" ? "bar" : type,
        data: costData,
        yAxisID: "yCost",
        backgroundColor: isDark ? "rgba(129, 140, 248, 0.32)" : "rgba(79, 70, 229, 0.24)",
        borderColor: colCost,
        borderWidth: 1.5,
        borderRadius: 4,
      },
      {
        label: "Số đơn hàng",
        type: "line",
        data: ordersData,
        yAxisID: "yOrders",
        borderColor: colOrders,
        backgroundColor: "rgba(217, 119, 6, 0.14)",
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: 4,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 } },
      },
      yCost: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Chi phí (VNĐ)", color: colCost, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => formatCurrency(v) },
      },
      yOrders: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Số đơn hàng", color: colOrders, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 } },
      },
    };
  } else if (state.chartMetricView === "reach_clicks") {
    datasets = [
      {
        label: "Tiếp cận (Reach)",
        type: type === "combo" ? "bar" : type,
        data: reachData,
        yAxisID: "yReach",
        backgroundColor: isDark ? "rgba(56, 189, 248, 0.26)" : "rgba(2, 132, 199, 0.22)",
        borderColor: colReach,
        borderWidth: 1.5,
        borderRadius: 4,
      },
      {
        label: "Lượt nhấp (Clicks)",
        type: "line",
        data: clicksData,
        yAxisID: "yClicks",
        borderColor: colCost,
        backgroundColor: "rgba(79, 70, 229, 0.14)",
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 4,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 } },
      },
      yReach: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Tiếp cận (Reach)", color: colReach, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => formatNumber(v) },
      },
      yClicks: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Lượt nhấp (Clicks)", color: colCost, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => formatNumber(v) },
      },
    };
  } else if (state.chartMetricView === "efficiency") {
    datasets = [
      {
        label: "Click/reach (%)",
        type: "line",
        data: ctrData,
        yAxisID: "yCtr",
        borderColor: colCtr,
        backgroundColor: "rgba(5, 150, 105, 0.12)",
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 3.5,
        fill: true,
      },
      {
        label: "CPA - Chi phí/đơn (VNĐ)",
        type: "line",
        data: cpaData,
        yAxisID: "yCpa",
        borderColor: colOrders,
        backgroundColor: "transparent",
        borderWidth: 2.5,
        borderDash: [5, 5],
        tension: 0.35,
        pointRadius: 3.5,
      },
    ];

    scales = {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 } },
      },
      yCtr: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Click/reach (%)", color: colCtr, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { color: gridColor },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => v + "%" },
      },
      yCpa: {
        type: "linear",
        position: "right",
        title: { display: true, text: "CPA (VNĐ)", color: colOrders, font: { family: fontFamily, weight: "600", size: 11 } },
        grid: { drawOnChartArea: false },
        ticks: { color: textColor, font: { family: fontFamily, size: 11 }, callback: (v) => formatCurrency(v) },
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
            font: { family: fontFamily, weight: "500", size: 12 },
            usePointStyle: true,
            boxWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: isDark ? "rgba(19, 22, 27, 0.96)" : "rgba(255, 255, 255, 0.96)",
          titleColor: isDark ? "#f3f4f6" : "#111318",
          bodyColor: isDark ? "#d1d5db" : "#374151",
          borderColor: isDark ? "#2a2f3a" : "#dedee3",
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          titleFont: { family: fontFamily, weight: "600", size: 12 },
          bodyFont: { family: fontFamily, size: 12 },
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
  const key = JSON.stringify(result);

  // 1. Kiểm tra RAM trước; nếu RAM chưa có hoặc khác key, nạp từ localStorage
  if (!state.geminiAnalysisResult || state.geminiAnalysisResult.key !== key) {
    const stored = loadAiRecommendationsFromStorage(key);
    if (stored && Array.isArray(stored.recommendations) && stored.recommendations.length === 3) {
      state.geminiAnalysisResult = {
        key,
        recommendations: stored.recommendations,
        contextId: stored.contextId,
        driver: stored.driver,
        fromCache: true
      };
      if (stored.contextId) {
        state.currentContextId = stored.contextId;
      }
    }
  }

  const cached = state.geminiAnalysisResult;
  const ai = cached && cached.key === key;
  const recommendations = ai ? cached.recommendations : result.recommendations;
  const driverText = result.complete && result.driver?.driverSummary ? `\nPhân rã biến động CPA (CPA = CPC ÷ CVR): ${result.driver.driverSummary}` : '';
  const rangeHeader = result.prevStart
    ? `${result.start || '—'} → ${result.end || '—'} so với ${result.prevStart || '—'} → ${result.prevEnd || '—'}.`
    : `Giai đoạn đánh giá: từ ${result.start || '—'} đến ${result.end || '—'} (${result.coverage.current} ngày).`;
  let statusColor = 'indigo';
  if (result.complete && result.delta) {
    const o = Math.abs(result.delta.orders || 0) <= result.threshold ? 0 : Math.sign(result.delta.orders || 0);
    const c = Math.abs(result.delta.cpa || 0) <= result.threshold ? 0 : Math.sign(result.delta.cpa || 0);
    if (o > 0 && c < 0) statusColor = 'emerald';
    else if (o < 0 && c > 0) statusColor = 'rose';
    else if ((o > 0 && c > 0) || (o < 0 && c < 0)) statusColor = 'amber';
  }

  return {
    statusLabel: result.conclusion,
    statusColor,
    rawResult: result,
    rangeHeader,
    driverText,
    trendMetrics: [],
    trendSummary: `${rangeHeader}\nĐánh giá chung: ${result.conclusion}.${driverText}\nSố ngày ghi nhận: ${result.coverage.current}/${result.days} ngày.${result.prevStart ? ` Ngưỡng ổn định: ±${result.threshold}% (quy ước).` : ' Đang trong giai đoạn thu thập dữ liệu ban đầu (< 7 ngày).'}\n${result.complete ? 'Chi tiết số liệu: ' + result.evidence.map(e=>e.text).join('\n') : 'Đang đánh giá trực tiếp số liệu từ ngày ' + (result.start || '—') + ' đến ' + (result.end || '—') + '; hệ thống sẽ kích hoạt 03 gợi ý tối ưu chiến dịch khi tích lũy đủ 7 ngày.'}\nLưu ý: Click/reach không phải là CTR (click/lượt hiển thị). Tổng reach theo ngày có thể trùng lặp người xem giữa các ngày. Chưa đủ dữ liệu xác định nguyên nhân hoặc lợi nhuận.`,
    recommendations: recommendations.map((r,i)=>({
      pillar: `${i+1}. ${ai ? (cached?.fromCache ? 'AI khuyến nghị · từ bộ nhớ' : 'AI hỗ trợ · cần kiểm chứng') : (result.complete ? 'Gợi ý cải thiện chiến dịch' : 'Đánh giá dữ liệu ban đầu')}`,
      title:r.title,
      desc:`Vì sao: ${r.why} Đo thế nào: ${r.measure}`,
      action:result.complete ? 'Thử và đo lại' : 'Theo dõi tiếp'
    }))
  };
}
function analyzeCampaignIntelligenceOffline() { return analyzeCampaignIntelligence(); }

// Render Structured Visual Content Blocks for Trend Summary
function renderTrendBlocks(analysis) {
  const res = analysis.rawResult;
  if (!res) {
    return `<div class="p-3.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground leading-relaxed"><p class="font-medium">${escapeHtml(analysis.trendSummary)}</p></div>`;
  }

  // Khối 1: Chu kỳ so sánh & Dữ liệu ghi nhận
  const blockHeader = `
    <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-surface-subtle border border-border text-xs">
      <div class="min-w-0">
        <span class="font-semibold text-foreground block">${escapeHtml(analysis.rangeHeader)}</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
        <span class="px-2 py-0.5 rounded text-xs font-semibold ${res.complete ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}">
          Dữ liệu: ${res.coverage.current}/${res.days}&nbsp;ngày
        </span>
        ${res.prevStart ? `<span class="px-2 py-0.5 rounded text-xs font-medium bg-secondary text-muted">Ngưỡng ổn định: ±${res.threshold}%</span>` : `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-secondary text-foreground">Dữ liệu ban đầu (&lt; 7&nbsp;ngày)</span>`}
      </div>
    </div>
  `;

  // Khối 2: Vì sao chi phí mỗi đơn (CPA) thay đổi? (Root-Cause Driver)
  let blockDriver = '';
  if (res.complete && res.driver?.driverSummary) {
    blockDriver = `
      <div class="p-3.5 rounded-lg bg-surface-subtle border border-border">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-xs font-bold uppercase tracking-wider text-muted">Vì sao giá mỗi đơn (CPA) thay&nbsp;đổi?</span>
          <span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-secondary text-foreground whitespace-nowrap">CPA = CPC ÷ CVR</span>
        </div>
        <p class="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
          ${escapeHtml(res.driver.driverSummary)}
        </p>
      </div>
    `;
  }

  // Khối 3: Chi tiết các chỉ số thực tế giữa 2 kỳ
  let blockEvidence = '';
  if (res.complete && Array.isArray(res.evidence) && res.evidence.length > 0) {
    const rows = res.evidence.map((ev, idx) => {
      const deltaVal = res.delta?.[ev.id];
      let deltaBadge = '';
      if (deltaVal !== null && deltaVal !== undefined && isFinite(deltaVal)) {
        const isGood = ['orders', 'cvr', 'clickReach'].includes(ev.id) ? deltaVal > 0 : deltaVal < 0;
        const color = Math.abs(deltaVal) <= (res.threshold || 5)
          ? 'bg-secondary text-muted'
          : isGood
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
        const sign = deltaVal > 0 ? '+' : '';
        deltaBadge = `<span class="text-xs font-semibold px-2 py-0.5 rounded shrink-0 tabular-nums ${color}">${sign}${deltaVal.toLocaleString('vi-VN', {maximumFractionDigits: 2})}%</span>`;
      }

      return `
        <div class="ev-row-${idx} flex items-center justify-between gap-2 py-2 px-3 text-xs">
          <span class="text-foreground font-medium tabular-nums">${escapeHtml(ev.text)}</span>
          ${deltaBadge}
        </div>
      `;
    }).join('');

    blockEvidence = `
      <div class="rounded-lg border border-border bg-surface overflow-hidden">
        <div class="px-3 py-2 bg-surface-subtle border-b border-border flex items-center justify-between text-xs font-semibold text-muted">
          <span>Chi tiết các chỉ số thực tế (so sánh 2 chu&nbsp;kỳ)</span>
          <span>% Thay&nbsp;đổi</span>
        </div>
        <div class="divide-y divide-border">
          ${rows}
        </div>
      </div>
    `;
  } else if (!res.complete) {
    blockEvidence = `
      <div class="p-3.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground">
        <div class="font-bold mb-1">Đang thu thập dữ liệu ban đầu (&lt; 7&nbsp;ngày)</div>
        <p class="leading-relaxed text-muted">
          Đang theo dõi số liệu thực tế từ ngày ${escapeHtml(res.start || '—')} đến ${escapeHtml(res.end || '—')} (${res.coverage.current} ngày). Hệ thống sẽ tự động đưa ra 03 gợi ý cải thiện chiến dịch khi tích lũy đủ 7&nbsp;ngày.
        </p>
      </div>
    `;
  }

  // Khối 4: Lưu ý khi đọc số liệu
  const blockDisclaimer = `
    <div class="p-2.5 rounded-lg bg-surface-subtle border border-border text-xs text-muted leading-relaxed">
      <strong class="font-semibold text-foreground">Lưu ý khi đọc số liệu:</strong> Tỷ lệ click/reach không tương đương với CTR (vì tính trên số người tiếp cận, không phải tổng lượt hiển thị). Tổng reach cộng dồn theo ngày có thể trùng lặp người xem giữa các&nbsp;ngày.
    </div>
  `;

  return `
    <div class="space-y-2.5">
      ${blockHeader}
      ${blockDriver}
      ${blockEvidence}
      ${blockDisclaimer}
    </div>
  `;
}

function renderAiRecommendationsSkeleton() {
  return [1, 2, 3]
    .map(
      (idx) => `
      <div class="rec-card-${idx} p-4 rounded-xl border border-border bg-surface-subtle space-y-3 animate-pulse">
        <div class="flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
            <span>AI đang phân tích #${idx}</span>
          </span>
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded-md w-16"></div>
        </div>
        <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded-md w-3/4"></div>
        <div class="space-y-2 pt-0.5">
          <div class="h-3 bg-gray-200/80 dark:bg-gray-700/80 rounded w-full"></div>
          <div class="h-3 bg-gray-200/80 dark:bg-gray-700/80 rounded w-4/5"></div>
        </div>
      </div>
    `
    )
    .join("");
}

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
      elStatus.className = "text-xs font-semibold px-2.5 py-1 rounded-md bg-secondary text-muted whitespace-nowrap shrink-0";
    }
    if (elTrendSummary) {
      elTrendSummary.innerHTML = `
        <div class="p-3.5 rounded-lg bg-surface-subtle border border-border text-xs text-muted leading-relaxed">
          Chưa có dữ liệu chiến dịch. Hệ thống chẩn đoán phễu <strong class="font-mono text-foreground whitespace-nowrap">CPA = CPC ÷ CVR</strong> sẽ tự động kích hoạt ngay khi bạn nhập số&nbsp;liệu.
        </div>
      `;
    }
    if (containerMetrics) {
      containerMetrics.innerHTML = "";
    }
    if (containerRecs) {
      containerRecs.innerHTML = renderAiRecommendationsSkeleton();
    }
    return;
  }

  const analysis = analyzeCampaignIntelligence(filtered);

  if (elStatus) {
    elStatus.innerText = analysis.statusLabel;
    elStatus.className = `text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
      analysis.statusColor === "emerald"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : analysis.statusColor === "rose"
        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
        : analysis.statusColor === "amber"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-secondary text-foreground"
    }`;
  }

  if (elTrendSummary) {
    elTrendSummary.innerHTML = renderTrendBlocks(analysis);
  }

  if (containerMetrics) {
    containerMetrics.innerHTML = "";
  }

  // 03 Khuyến nghị hành động:
  // Khi AI chưa phân tích xong (đang tải hoặc chưa có kết quả AI cho kỳ này):
  // Hiện skeleton thôi, KHÔNG hiện nội dung offline nữa!
  const snapshot = analysisSnapshot();
  const key = JSON.stringify(snapshot);
  const cached = state.geminiAnalysisResult;
  const isAiReady = Boolean(cached && cached.key === key && Array.isArray(cached.recommendations) && cached.recommendations.length === 3);

  if (containerRecs) {
    if (state.isGeminiLoading || !isAiReady) {
      containerRecs.innerHTML = renderAiRecommendationsSkeleton();
    } else {
      containerRecs.innerHTML = cached.recommendations
        .map((rec, idx) => {
          return `
          <div class="rec-card-${idx + 1} p-3.5 rounded-lg border border-border bg-surface-subtle space-y-1.5 transition-all">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-primary">${idx + 1}. AI khuyến nghị</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-secondary text-foreground">Thử và đo lại · #${idx + 1}</span>
            </div>
            <h4 class="font-bold text-foreground text-xs sm:text-sm">${escapeHtml(rec.title)}</h4>
            <p class="text-xs text-muted leading-relaxed">Vì sao: ${escapeHtml(rec.why)} Đo thế nào: ${escapeHtml(rec.measure)}</p>
          </div>
        `;
        })
        .join("");
    }
  }

  updateAiButtonState();
}

function toggleAiPanel(show, shouldScroll = true) {
  const panel = document.getElementById("ai-interactive-panel");
  if (!panel) return;
  const willShow = (show !== undefined) ? !!show : panel.classList.contains("hidden");
  if (willShow) {
    panel.classList.remove("hidden");
    state.isAiPanelOpen = true;
    if (shouldScroll) {
      setTimeout(() => {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  } else {
    panel.classList.add("hidden");
    state.isAiPanelOpen = false;
  }
  updateAiButtonState();
}
window.toggleAiPanel = toggleAiPanel;

function updateAiButtonState() {
  const btn = document.getElementById('btn-run-gemini-ai');
  const label = document.getElementById("gemini-btn-text");
  if (!btn || !label) return;

  const snapshot = analysisSnapshot();
  const key = JSON.stringify(snapshot);
  const cached = state.geminiAnalysisResult;
  const isCachedAi = cached && cached.key === key;
  const panel = document.getElementById("ai-interactive-panel");
  const isPanelOpen = panel && !panel.classList.contains("hidden");

  if (state.isGeminiLoading) {
    label.textContent = "Đang tạo gợi ý…";
    return;
  }

  if (isPanelOpen && isCachedAi) {
    label.textContent = "Làm mới gợi ý AI";
    btn.title = "Đã lưu 3 gợi ý AI trong LocalStorage (0 token). Nhấp để AI phân tích lại.";
  } else if (isPanelOpen) {
    label.textContent = "Làm mới gợi ý AI";
    btn.title = "Đang hiển thị gợi ý. Nhấp để AI phân tích lại.";
  } else {
    label.textContent = "AI hỗ trợ cải thiện";
    btn.title = "Khám phá 03 khuyến nghị hành động từ AI";
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
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    }

    showToast("Đã sao chép báo cáo vào bộ nhớ tạm! Bạn có thể dán vào Zalo/Slack ngay.", "success");

    const btnCopy = document.getElementById("btn-do-copy");
    if (btnCopy) {
      const origText = btnCopy.innerHTML;
      btnCopy.innerHTML = `
        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        <span>Đã sao chép thành công!</span>
      `;
      setTimeout(() => {
        btnCopy.innerHTML = origText;
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

  const tabBoss = document.getElementById("tab-tpl-boss");
  const tabCompact = document.getElementById("tab-tpl-compact");
  if (tpl === "boss") {
    if (tabBoss) tabBoss.className = "h-8 px-3 text-xs font-semibold rounded-lg btn-primary";
    if (tabCompact) tabCompact.className = "h-8 px-3 text-xs font-medium rounded-lg btn-secondary";
  } else {
    if (tabCompact) tabCompact.className = "h-8 px-3 text-xs font-semibold rounded-lg btn-primary";
    if (tabBoss) tabBoss.className = "h-8 px-3 text-xs font-medium rounded-lg btn-secondary";
  }
}

// Open Bulk Entry Modal (Multi-row entry)
function openBulkModal() {
  const modal = document.getElementById("bulk-modal");
  if (!modal) return;

  const tbody = document.getElementById("bulk-table-body");
  if (tbody) {
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
  tr.className = "bulk-row border-b border-border";
  tr.innerHTML = `
    <td data-label="Ngày (YYYY-MM-DD)" class="p-2 bulk-cell-date">
      <input type="text" inputmode="numeric" value="${date}" placeholder="YYYY-MM-DD" class="bulk-date w-full h-9 px-2.5 text-xs rounded-lg border border-border-strong bg-surface text-foreground tabular-nums" required />
    </td>
    <td data-label="Reach (Tiếp cận)" class="p-2">
      <input type="number" value="${reach}" placeholder="VD: 15000" class="bulk-reach w-full h-9 px-2.5 text-xs rounded-lg border border-border-strong bg-surface text-foreground tabular-nums" required />
    </td>
    <td data-label="Clicks (Lượt nhấp)" class="p-2">
      <input type="number" value="${clicks}" placeholder="VD: 450" class="bulk-clicks w-full h-9 px-2.5 text-xs rounded-lg border border-border-strong bg-surface text-foreground tabular-nums" required />
    </td>
    <td data-label="Chi phí (₫)" class="p-2">
      <input type="number" value="${cost}" placeholder="VD: 1200000" class="bulk-cost w-full h-9 px-2.5 text-xs rounded-lg border border-border-strong bg-surface text-foreground tabular-nums" required />
    </td>
    <td data-label="Đơn hàng" class="p-2">
      <input type="number" value="${orders}" placeholder="VD: 20" class="bulk-orders w-full h-9 px-2.5 text-xs rounded-lg border border-border-strong bg-surface text-foreground tabular-nums" required />
    </td>
    <td class="p-2 text-center bulk-cell-del">
      <button type="button" onclick="this.closest('tr').remove()" aria-label="Xóa dòng" class="w-8 h-8 rounded-lg btn-subtle inline-flex items-center justify-center text-muted hover:text-rose-600">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
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
  if (lines.length <= 1 && !lines[0].includes("\t")) return;

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
  toast.className = `toast-enter flex items-center p-3.5 rounded-xl shadow-popover border text-xs sm:text-sm w-full pointer-events-auto transition-all ${
    type === "success"
      ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
      : type === "error"
      ? "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
      : "bg-surface border-border text-foreground"
  }`;

  const icon =
    type === "success"
      ? `<svg class="w-5 h-5 mr-2.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
      : type === "error"
      ? `<svg class="w-5 h-5 mr-2.5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
      : `<svg class="w-5 h-5 mr-2.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

  toast.innerHTML = `
    ${icon}
    <div class="flex-1 font-medium min-w-0 break-words">${message}</div>
    <button type="button" onclick="this.parentElement.remove()" aria-label="Đóng thông báo" class="ml-2 w-8 h-8 rounded-lg btn-subtle inline-flex items-center justify-center text-muted shrink-0">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
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

// Toggle Template Download Dropdown Menu
function toggleTemplateMenu(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const menu = document.getElementById("template-dropdown-menu");
  if (!menu) return;
  menu.classList.toggle("hidden");
}
window.toggleTemplateMenu = toggleTemplateMenu;

// Close template menu when clicking outside
document.addEventListener("click", (e) => {
  const wrapper = document.getElementById("template-dropdown-wrapper");
  const menu = document.getElementById("template-dropdown-menu");
  if (menu && !menu.classList.contains("hidden")) {
    if (!wrapper || !wrapper.contains(e.target)) {
      menu.classList.add("hidden");
    }
  }
});

// Process Campaign File (Excel, Word, PDF, or Screenshot Image via Gemini Vision)
async function processCampaignFile(file, customFilename) {
  if (!file) return;

  const fname = customFilename || file.name || "campaign_data.png";
  const validExts = ['.xlsx', '.xls', '.csv', '.docx', '.doc', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
  const ext = '.' + (fname.split('.').pop() || '').toLowerCase();
  if (!validExts.includes(ext)) {
    showToast(`Định dạng ${ext} không được hỗ trợ. Vui lòng chọn file Excel, Word, PDF hoặc Ảnh chụp màn hình (.png, .jpg, .webp)!`, "error");
    return;
  }

  const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'].includes(ext);
  const iconIdle = document.getElementById("icon-import-idle");
  const iconLoading = document.getElementById("icon-import-loading");
  const labelText = document.getElementById("label-import-text");
  const prevText = labelText ? labelText.innerText : "Nhập File / Ảnh OCR";

  if (iconIdle) iconIdle.classList.add("hidden");
  if (iconLoading) iconLoading.classList.remove("hidden");
  if (labelText) labelText.innerText = isImage ? `Vision AI đang đọc...` : `Đang đọc ${fname.slice(0, 12)}...`;

  if (isImage) {
    showToast(`📸 Đang gửi ảnh chụp màn hình tới Gemini Vision OCR để phân tích bảng số liệu...`, "info");
  } else {
    showToast(`Đang trích xuất dữ liệu từ file ${fname}...`, "info");
  }

  try {
    const base64 = await readFileAsBase64(file);
    const response = await fetch('/api/import-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: fname,
        dataBase64: base64
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Không thể trích xuất dữ liệu từ file.');
    }

    const rows = result.rows || [];
    let addedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (CampaignAnalysis.isValidRow(row)) {
        const existIdx = state.data.findIndex((d) => d.date === row.date);
        if (existIdx !== -1) {
          state.data[existIdx] = {
            id: state.data[existIdx].id,
            date: row.date,
            reach: row.reach,
            clicks: row.clicks,
            cost: row.cost,
            orders: row.orders
          };
          updatedCount++;
        } else {
          state.data.push({
            id: "file-" + Date.now() + "-" + i,
            date: row.date,
            reach: row.reach,
            clicks: row.clicks,
            cost: row.cost,
            orders: row.orders
          });
          addedCount++;
        }
      }
    }

    sortDataByDate();
    saveData();
    renderDashboard();

    const fileTypeLabel = isImage ? 'Ảnh chụp màn hình (Gemini Vision)' : (ext.includes('xls') || ext === '.csv' ? 'Excel' : ext.includes('doc') ? 'Word' : 'PDF');
    showToast(`🎉 Nhập thành công ${rows.length} ngày từ ${fileTypeLabel} (${addedCount} ngày mới, ${updatedCount} ngày cập nhật)!`, "success");
  } catch (err) {
    console.error("Lỗi import file/ảnh:", err);
    showToast(`❌ ${err.message || "Lỗi khi xử lý file!"}`, "error");
  } finally {
    if (iconIdle) iconIdle.classList.remove("hidden");
    if (iconLoading) iconLoading.classList.add("hidden");
    if (labelText) labelText.innerText = prevText;
    const input = document.getElementById("campaign-file-input");
    if (input) input.value = "";
  }
}

// Handle Campaign File Select (File Dialog)
async function handleCampaignFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  await processCampaignFile(file, file.name);
}
window.handleCampaignFileSelect = handleCampaignFileSelect;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      } else {
        reject(new Error('Không thể đọc file'));
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function handleCsvFileSelect(e) {
  handleCampaignFileSelect(e);
}
window.handleCsvFileSelect = handleCsvFileSelect;

// Global Clipboard Paste Listener (Ctrl + V to paste screenshot directly)
window.addEventListener("paste", async (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
  if (activeTag === "input" || activeTag === "textarea") return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf("image") !== -1) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      if (blob) {
        showToast("📋 Đã nhận ảnh từ Clipboard (Ctrl+V), đang gửi tới Gemini Vision AI...", "info");
        await processCampaignFile(blob, `screenshot-${Date.now()}.png`);
      }
      break;
    }
  }
});

// ==========================================
// GEMINI 3.8 FLASH DEEP AI ANALYSIS & CHAT
// ==========================================

async function runGeminiAiAnalysis() {
  toggleAiPanel(true, true);
  if (state.isGeminiLoading) return;
  const snapshot = analysisSnapshot();
  const key = JSON.stringify(snapshot);
  const btn = document.getElementById('btn-run-gemini-ai');
  const label = document.getElementById("gemini-btn-text");
  state.isGeminiLoading = true;
  if (btn) btn.disabled = true;
  if (label) label.textContent = "Đang tạo gợi ý…";
  renderAiAnalysis(); // Chuyển sang skeleton ngay khi bắt đầu phân tích
  try {
    const response = await fetch('/api/recommendations', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:state.data,days:snapshot.days,threshold:snapshot.threshold}),signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error('AI unavailable');
    const result = await response.json();
    if (!Array.isArray(result.recommendations) || result.recommendations.length !== 3 || !result.recommendations.every(r=>['title','why','measure'].every(k=>typeof r[k] === 'string'))) throw new Error('Invalid response');
    if (key !== JSON.stringify(analysisSnapshot())) return;
    state.currentContextId = result.contextId || null;
    const aiData = {key, recommendations: result.recommendations, contextId: result.contextId, driver: result.driver, savedAt: Date.now()};
    state.geminiAnalysisResult = aiData;
    saveAiRecommendationsToStorage(key, aiData);
    showToast('Đã nhận 3 gợi ý AI (đã lưu bộ nhớ để tải lại không tốn token).', 'success');
  } catch {
    state.geminiAnalysisResult = null;
    showToast('AI chưa khả dụng. Vui lòng kiểm tra kết nối và thử lại.', 'info');
  } finally {
    state.isGeminiLoading = false;
    if (btn) btn.disabled = false;
    renderAiAnalysis();
    updateAiButtonState();
  }
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text ? String(text).replace(/[&<>"']/g, (m) => map[m]) : '';
}

async function askAiQuestion(question) {
  toggleAiPanel(true, false);
  const inputEl = document.getElementById('ai-chat-input');
  if (inputEl) inputEl.value = question;
  await submitAiQuestion();
}

async function submitAiQuestion() {
  toggleAiPanel(true, false);
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
      <div class="flex items-start gap-2 justify-end">
        <div class="p-3 rounded-xl bg-primary text-white text-xs sm:text-sm max-w-[85%]">
          <p class="font-medium">${escapeHtml(question)}</p>
        </div>
      </div>
      <div id="${userMsgId}" class="flex items-start gap-2">
        <div class="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs text-primary font-bold shrink-0">AI</div>
        <div class="p-3 rounded-xl bg-surface-subtle text-foreground text-xs sm:text-sm max-w-[85%] border border-border-strong">
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
        ? `<span class="inline-flex items-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded mr-2">Hit RAM Cache (0 token)</span>`
        : `<span class="inline-flex items-center text-xs font-semibold text-primary bg-secondary px-2 py-0.5 rounded mr-2">Gemini 3.8 Flash</span>`;

      el.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs text-primary font-bold shrink-0">AI</div>
        <div class="p-3 rounded-xl bg-surface text-foreground text-xs sm:text-sm max-w-[85%] border border-border-strong">
          <div class="flex items-center mb-1.5 flex-wrap gap-1">
            ${cacheBadge}
            <span class="text-xs text-muted">Đã qua 6 lớp kiểm soát số liệu</span>
          </div>
          <p class="leading-relaxed font-normal whitespace-pre-line">${escapeHtml(data.answer)}</p>
        </div>
      `;
    }
  } catch {
    const el = document.getElementById(userMsgId);
    if (el) {
      el.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-xs text-rose-700 dark:text-rose-300 font-bold shrink-0">!</div>
        <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs sm:text-sm max-w-[85%] border border-rose-200 dark:border-rose-900">
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
// UI v3.0: delta vs previous period, sparklines, hero, CPA bar, report summary
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
  const base = "text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap tabular-nums ";
  const tone = {
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    bad: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    info: "bg-secondary text-foreground",
    mute: "bg-secondary text-muted",
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
  if (pts.length < 2) return '<div class="h-full flex items-end"><div class="w-full border-t border-dashed border-border-strong"></div></div>';
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
  const colors = { cost: "#4f46e5", reach: "#0284c7", ctr: "#059669", orders: "#d97706" };
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
  const pill = document.getElementById("hero-status-pill");
  if (!box || !h || !s || !p) return;
  if (!state.data.length) {
    document.getElementById("hero-cta")?.classList.add("hidden");
    box.dataset.tone = "neutral";
    if (pill) {
      pill.textContent = "Tổng quan\u00A0kỳ";
      pill.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold status-pill-neutral";
    }
    h.textContent = "Chưa có số liệu chiến\u00A0dịch";
    s.textContent = "Nhập số liệu ngày đầu tiên ở form bên dưới hoặc dán nhiều dòng từ Excel. KPI, biểu đồ và nhận xét sẽ tự cập\u00A0nhật.";
    p.textContent = "";
    return;
  }
  document.getElementById("hero-cta")?.classList.remove("hidden");
  const snap = analysisSnapshot();
  h.textContent = String(snap.conclusion || "").replace(/\s+(\S+)$/, "\u00A0$1");
  p.textContent = "· " + (snap.complete ? snap.days + " ngày gần nhất " : state.data.length + " ngày ") + fmtShortDate(snap.start) + "–" + fmtShortDate(snap.end);
  if (!snap.complete) {
    box.dataset.tone = "neutral";
    if (pill) {
      pill.textContent = "Đang tích lũy dữ\u00A0liệu";
      pill.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold status-pill-neutral";
    }
    const totals = snap.current;
    const bestDay = snap.extrema?.bestCpaDay ? ` · Ngày tốt nhất: ${fmtShortDate(snap.extrema.bestCpaDay.date)} (CPA ${formatCurrency(snap.extrema.bestCpaDay.cpa)})` : '';
    s.textContent = `Tổng chi phí: ${formatCurrency(totals.cost)} · ${totals.orders} đơn hàng · CPA tb ${totals.cpa ? formatCurrency(Math.round(totals.cpa)) : 'Chưa xác định'}${bestDay} · Đang theo dõi máy học (đủ 7 ngày sẽ kích hoạt 03 gợi ý tối\u00A0ưu).`;
    return;
  }
  const d = snap.delta, t = snap.threshold;
  const o = d.orders === null ? 0 : Math.abs(d.orders) <= t ? 0 : Math.sign(d.orders);
  const c = d.cpa === null ? 0 : Math.abs(d.cpa) <= t ? 0 : Math.sign(d.cpa);
  const tone = o > 0 && c < 0 ? "good" : o < 0 && c > 0 ? "bad" : "neutral";
  box.dataset.tone = tone;
  if (pill) {
    pill.textContent = tone === "good" ? "Hiệu suất tích\u00A0cực" : tone === "bad" ? "Cảnh báo suy\u00A0giảm" : "Kết luận điều\u00A0hành";
    const pillCls = tone === "good" ? "status-pill-scale" : tone === "bad" ? "status-pill-cut" : "status-pill-neutral";
    pill.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold " + pillCls;
  }
  const part = (label, v) => label + " " + (v === null ? "chưa xác định" : fmtDeltaPct(v).replace("▲ ", "+").replace("▼ ", "−"));
  const comparedText = snap.prevStart ? `so với\u00A0${fmtShortDate(snap.prevStart)}–${fmtShortDate(snap.prevEnd)}.` : 'so với nửa đầu\u00A0tuần.';
  s.textContent = [part("Số đơn/ngày", d.orders), part("CPA", d.cpa), part("Chi phí/ngày", d.cost)].join(" · ") + " " + comparedText;
}

function cpaBar(item, avgCpa, topCpa) {
  if (!(item.orders > 0) || !avgCpa || !topCpa) return "";
  const cpa = item.cost / item.orders;
  const rel = (cpa / avgCpa - 1) * 100;
  const color = rel <= -5 ? "bg-emerald-500" : rel >= 5 ? "bg-rose-500" : "bg-amber-400";
  const w = Math.max(6, Math.round((cpa / topCpa) * 100));
  const tip = (rel >= 0 ? "+" : "−") + Math.abs(rel).toFixed(0) + "% so với CPA trung bình của giai đoạn đang xem";
  return '<div class="mt-1 ml-auto w-16 h-1 rounded-full bg-secondary overflow-hidden" title="' + tip + '"><div class="h-full rounded-full ' + color + '" style="width:' + w + '%"></div></div>';
}

function renderExportSummary() {
  const box = document.getElementById("export-report-summary");
  if (!box) return;
  if (!state.data.length) { box.innerHTML = '<p class="text-xs text-muted">Chưa có số liệu để tóm\u00A0tắt.</p>'; return; }
  const snap = analysisSnapshot();
  const cur = snap.current, d = snap.delta;
  const dl = (v) => {
    if (!snap.complete || v === null || v === undefined) return '<span class="text-muted">chưa so\u00A0sánh</span>';
    if (Math.abs(v) <= snap.threshold) return '<span class="text-muted">ổn\u00A0định</span>';
    return '<span class="text-foreground font-semibold">' + fmtDeltaPct(v) + "</span>";
  };
  const cell = (label, val, delta) =>
    '<div><div class="text-xs font-semibold text-muted">' + label + '</div>' +
    '<div class="mt-1 text-base sm:text-lg font-bold tracking-tight text-foreground whitespace-nowrap tabular-nums">' + val + '</div>' +
    '<div class="mt-0.5 text-xs tabular-nums">' + delta + "</div></div>";
  box.innerHTML =
    '<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3 border-b border-border">' +
      '<div class="text-sm font-bold text-foreground truncate">' + escapeHtml(state.campaignName) + "</div>" +
      '<div class="text-xs text-muted tabular-nums">' + snap.days + " ngày gần nhất · " + fmtShortDate(snap.start) + "–" + fmtShortDate(snap.end) + "</div></div>" +
    '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3">' +
      cell("Chi phí", formatCurrency(cur.cost), dl(d.cost)) +
      cell("Số đơn", formatNumber(cur.orders), dl(d.orders)) +
      cell("CPA", cur.cpa === null ? "—" : formatCurrency(Math.round(cur.cpa)), dl(d.cpa)) +
      cell("Click/reach", cur.clickReach === null ? "—" : formatPercent(cur.clickReach), dl(d.clickReach)) +
    "</div>" +
    '<div class="pt-3 mt-3 border-t border-border text-xs text-muted">' + escapeHtml(snap.conclusion) + "</div>";
}

// Nút lên đầu trang: hiện khi cuộn xuống quá 400px + đóng Modal bằng phím Escape / bấm nền ngoài
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (typeof closeBulkModal === "function") closeBulkModal();
      if (typeof closeExportModal === "function") closeExportModal();
    }
  });
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
  return '<span class="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold ' +
    (all ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-secondary text-muted") +
    '" title="Số liệu do hệ thống sinh ngẫu nhiên để demo, không phải số liệu thật">' + (all ? "Mô phỏng" : "Có dòng mẫu") + "</span>";
}
