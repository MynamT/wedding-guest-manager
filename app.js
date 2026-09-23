"use strict";

/* =========================================================
   CONFIGURATION
   After deploying Google Apps Script, paste the /exec URL here.
========================================================= */

const API_URL = "https://script.google.com/macros/s/AKfycbygtTbkC_T2wsvJqXqzZEMVzZicDGwHtBYuL7QYvwAtywdzlmtnva0IBHtuXHeL2-9HtQ/exec";

const TOKEN_KEY = "wedding_guest_token_v3";
const ROLE_KEY = "wedding_guest_role_v3";
const AUTO_REFRESH_MS = 5000;
const AUTO_SAVE_DELAY_MS = 650;

let state = {
  columns: [],
  rows: [],
};

let currentRole = null;
let renameColumnKey = null;
let refreshTimer = null;
const pendingSaves = new Map();

const els = {
  loginScreen: document.getElementById("loginScreen"),
  loginForm: document.getElementById("loginForm"),
  loginBtn: document.getElementById("loginBtn"),
  pinInput: document.getElementById("pinInput"),
  togglePinBtn: document.getElementById("togglePinBtn"),
  loginError: document.getElementById("loginError"),

  mainApp: document.getElementById("mainApp"),
  roleBadge: document.getElementById("roleBadge"),
  logoutBtn: document.getElementById("logoutBtn"),

  header: document.getElementById("tableHeader"),
  body: document.getElementById("tableBody"),
  footer: document.getElementById("tableFooter"),

  addGuestBtn: document.getElementById("addGuestBtn"),
  exportBtn: document.getElementById("exportBtn"),
  resetBtn: document.getElementById("resetBtn"),

  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  paymentFilter: document.getElementById("paymentFilter"),
  bankFilter: document.getElementById("bankFilter"),

  addColumnBtn: document.getElementById("addColumnBtn"),
  columnDialog: document.getElementById("columnDialog"),
  newColumnName: document.getElementById("newColumnName"),
  confirmAddColumn: document.getElementById("confirmAddColumn"),

  renameColumnDialog: document.getElementById("renameColumnDialog"),
  renameColumnInput: document.getElementById("renameColumnInput"),
  confirmRenameColumn: document.getElementById("confirmRenameColumn"),

  totalGuests: document.getElementById("totalGuests"),
  totalKHR: document.getElementById("totalKHR"),
  totalUSD: document.getElementById("totalUSD"),
  paymentSplit: document.getElementById("paymentSplit"),

  resultInfo: document.getElementById("resultInfo"),
  syncStatus: document.getElementById("syncStatus"),
  emptyTemplate: document.getElementById("emptyStateTemplate"),
};

/* =========================================================
   API
========================================================= */

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

async function api(action, payload = {}) {
  if (!API_URL || API_URL.includes("PASTE_YOUR")) {
    throw new Error("API_URL_NOT_CONFIGURED");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action,
      token: getToken(),
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    if (data.error === "UNAUTHORIZED") {
      logout(false);
    }

    throw new Error(data.error || "API_ERROR");
  }

  return data;
}

function setSyncStatus(type, text) {
  els.syncStatus.className = `sync-status ${type}`;
  els.syncStatus.textContent = text;
}

/* =========================================================
   AUTH
========================================================= */

async function submitLogin(event) {
  event.preventDefault();

  const pin = els.pinInput.value.trim();

  if (!pin) {
    els.loginError.textContent = "សូមបញ្ចូលលេខសម្ងាត់។";
    return;
  }

  els.loginBtn.disabled = true;
  els.loginBtn.textContent = "កំពុងចូល...";

  try {
    const result = await api("login", {
      pin,
      token: "",
    });

    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(ROLE_KEY, result.role);

    currentRole = result.role;
    els.pinInput.value = "";
    els.loginError.textContent = "";

    showApp();
    await loadData();
    startAutoRefresh();
  } catch (error) {
    if (error.message === "INVALID_PIN") {
      els.loginError.textContent = "លេខសម្ងាត់មិនត្រឹមត្រូវ។";
    } else if (error.message === "API_URL_NOT_CONFIGURED") {
      els.loginError.textContent = "សូមដាក់ Google Apps Script Web App URL ក្នុង app.js ជាមុនសិន។";
    } else {
      els.loginError.textContent = "មិនអាចភ្ជាប់ទៅ Server បានទេ។";
    }
  } finally {
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = "ចូលប្រើ";
  }
}

async function restoreSession() {
  const token = getToken();

  if (!token) {
    showLogin();
    return;
  }

  currentRole = localStorage.getItem(ROLE_KEY);

  try {
    showApp();
    await loadData();
    startAutoRefresh();
  } catch (error) {
    logout(false);
  }
}

function showApp() {
  els.loginScreen.classList.add("hidden");
  els.mainApp.classList.remove("hidden");
  applyRoleUI();
}

function showLogin() {
  els.mainApp.classList.add("hidden");
  els.loginScreen.classList.remove("hidden");
  stopAutoRefresh();

  setTimeout(() => {
    els.pinInput.focus();
  }, 50);
}

function logout(clearMessage = true) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);

  currentRole = null;
  state = {
    columns: [],
    rows: [],
  };

  if (clearMessage) {
    els.loginError.textContent = "";
  }

  showLogin();
}

function applyRoleUI() {
  const isOwner = currentRole === "owner";

  els.roleBadge.textContent = isOwner ? "Owner" : "Staff";

  document.querySelectorAll(".owner-only").forEach((element) => {
    element.classList.toggle("hidden", !isOwner);
  });
}

/* =========================================================
   DATA LOADING + LIVE REFRESH
========================================================= */

async function loadData(options = {}) {
  const { quiet = false } = options;

  if (!quiet) {
    setSyncStatus("saving", "● កំពុងទាញទិន្នន័យ...");
  }

  const result = await api("load");

  state.columns = result.columns || [];
  state.rows = result.rows || [];
  currentRole = result.role || currentRole;

  render();

  setSyncStatus("online", "● បានភ្ជាប់");
}

function startAutoRefresh() {
  stopAutoRefresh();

  refreshTimer = setInterval(async () => {
    if (document.hidden) {
      return;
    }

    const active = document.activeElement;

    if (
      active &&
      (active.classList.contains("cell") ||
        active.classList.contains("select-cell"))
    ) {
      return;
    }

    if (pendingSaves.size > 0) {
      return;
    }

    try {
      await loadData({ quiet: true });
    } catch (error) {
      setSyncStatus("error", "● ការភ្ជាប់មានបញ្ហា");
    }
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/* =========================================================
   FILTERING
========================================================= */

function filteredRows() {
  const query = els.searchInput.value.trim().toLowerCase();
  const payment = els.paymentFilter.value;
  const bank = els.bankFilter.value;

  return state.rows.filter((row) => {
    const searchable = state.columns
      .map((column) => String(row[column.key] ?? ""))
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !query || searchable.includes(query);

    const matchesPayment =
      payment === "all" || row.payment === payment;

    const matchesBank =
      bank === "all" ||
      (bank === "Other"
        ? row.bank &&
          !["ABA", "ACLEDA", "Wing"].includes(row.bank)
        : row.bank === bank);

    return matchesSearch && matchesPayment && matchesBank;
  });
}

/* =========================================================
   RENDER
========================================================= */

function render() {
  renderHeader();
  renderBody();
  renderSummary();
  renderFooter();
  applyRoleUI();
}

function renderHeader() {
  els.header.innerHTML = "";

  const noTh = document.createElement("th");
  noTh.className = "row-number";
  noTh.textContent = "No.";
  els.header.appendChild(noTh);

  state.columns.forEach((column) => {
    const th = document.createElement("th");

    const wrap = document.createElement("div");
    wrap.className = "column-header";

    const title = document.createElement("span");
    title.className = "column-title";
    title.textContent = column.label;

    wrap.appendChild(title);

    if (currentRole === "owner") {
      const actions = document.createElement("div");
      actions.className = "column-actions";

      const renameButton = document.createElement("button");
      renameButton.type = "button";
      renameButton.title = "ប្តូរឈ្មោះ Column";
      renameButton.textContent = "✎";
      renameButton.addEventListener("click", () => {
        openRenameColumn(column.key);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "column-delete";
      deleteButton.title = "លុប Column";
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", () => {
        removeColumn(column.key);
      });

      actions.append(renameButton, deleteButton);
      wrap.appendChild(actions);
    }

    th.appendChild(wrap);
    els.header.appendChild(th);
  });

  const actionTh = document.createElement("th");
  actionTh.className = "actions-col";
  actionTh.textContent = "Action";
  els.header.appendChild(actionTh);
}

function renderBody() {
  const rows = filteredRows();
  els.body.innerHTML = "";

  if (!rows.length) {
    els.body.appendChild(els.emptyTemplate.content.cloneNode(true));
    els.resultInfo.textContent = "0 records";
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const noTd = document.createElement("td");
    noTd.className = "row-number";
    noTd.textContent = state.rows.indexOf(row) + 1;
    tr.appendChild(noTd);

    state.columns.forEach((column) => {
      const td = document.createElement("td");
      td.appendChild(makeEditor(row, column));
      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    actionTd.className = "actions-col";

    if (currentRole === "owner") {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-row";
      deleteButton.type = "button";
      deleteButton.title = "លុបភ្ញៀវ";
      deleteButton.textContent = "🗑";

      deleteButton.addEventListener("click", () => {
        removeRow(row.id);
      });

      actionTd.appendChild(deleteButton);
    } else {
      actionTd.textContent = "—";
    }

    tr.appendChild(actionTd);
    els.body.appendChild(tr);
  });

  els.resultInfo.textContent =
    `${rows.length} record${rows.length === 1 ? "" : "s"}`;
}

function makeEditor(row, column) {
  let input;

  if (column.type === "payment") {
    input = document.createElement("select");
    input.className = "select-cell center-cell";

    ["", "Cash", "QR"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value || "—";
      input.appendChild(option);
    });

    input.value = row[column.key] ?? "";
  } else if (column.type === "bank") {
    input = document.createElement("input");
    input.setAttribute("list", "bankOptions");
    input.className = "cell";
    input.value = row[column.key] ?? "";

    ensureBankOptions();
  } else {
    input = document.createElement("input");
    input.className = "cell";
    input.value = row[column.key] ?? "";

    if (column.type === "number") {
      input.type = "number";
      input.min = "0";
      input.step = column.key === "usd" ? "0.01" : "1";
      input.classList.add("number-cell");
      input.placeholder = column.key === "usd" ? "0.00" : "0";
    } else {
      input.type = "text";
    }
  }

  input.dataset.rowId = row.id;
  input.dataset.key = column.key;

  input.addEventListener("input", onCellInput);
  input.addEventListener("change", onCellChange);
  input.addEventListener("blur", onCellBlur);

  return input;
}

function ensureBankOptions() {
  if (document.getElementById("bankOptions")) {
    return;
  }

  const dataList = document.createElement("datalist");
  dataList.id = "bankOptions";

  [
    "ABA",
    "ACLEDA",
    "Wing",
    "Canadia",
    "Sathapana",
    "Prince",
    "Other",
  ].forEach((bank) => {
    const option = document.createElement("option");
    option.value = bank;
    dataList.appendChild(option);
  });

  document.body.appendChild(dataList);
}

/* =========================================================
   AUTO SAVE
========================================================= */

function updateLocalRow(event) {
  const { rowId, key } = event.target.dataset;
  const row = state.rows.find((item) => item.id === rowId);

  if (!row) {
    return null;
  }

  row[key] = event.target.value;
  renderSummary();

  return {
    row,
    rowId,
    key,
    value: event.target.value,
  };
}

function onCellInput(event) {
  const change = updateLocalRow(event);

  if (!change) {
    return;
  }

  queueSave(change.rowId, change.key, change.value);
}

function onCellChange(event) {
  const change = updateLocalRow(event);

  if (!change) {
    return;
  }

  queueSave(change.rowId, change.key, change.value, true);
}

function onCellBlur(event) {
  const { rowId, key } = event.target.dataset;
  const timerKey = `${rowId}:${key}`;

  if (pendingSaves.has(timerKey)) {
    clearTimeout(pendingSaves.get(timerKey));
    pendingSaves.delete(timerKey);

    saveCell(rowId, key, event.target.value);
  }
}

function queueSave(rowId, key, value, immediate = false) {
  const timerKey = `${rowId}:${key}`;

  if (pendingSaves.has(timerKey)) {
    clearTimeout(pendingSaves.get(timerKey));
  }

  if (immediate) {
    pendingSaves.delete(timerKey);
    saveCell(rowId, key, value);
    return;
  }

  const timer = setTimeout(() => {
    pendingSaves.delete(timerKey);
    saveCell(rowId, key, value);
  }, AUTO_SAVE_DELAY_MS);

  pendingSaves.set(timerKey, timer);
  setSyncStatus("saving", "● កំពុងរក្សាទុក...");
}

async function saveCell(rowId, key, value) {
  try {
    setSyncStatus("saving", "● កំពុងរក្សាទុក...");

    await api("updateCell", {
      rowId,
      key,
      value,
    });

    setSyncStatus("online", "● បានរក្សាទុក");
  } catch (error) {
    setSyncStatus("error", "● រក្សាទុកមិនបាន");
    console.error(error);
  }
}

/* =========================================================
   SUMMARY
========================================================= */

function sumColumn(key) {
  return state.rows.reduce(
    (sum, row) => sum + (Number(row[key]) || 0),
    0,
  );
}

function formatKHR(value) {
  const number = Number(value || 0);

  return (
    "KHR " +
    number.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    })
  );
}

function formatUSD(value) {
  const number = Number(value || 0);

  return (
    "$" +
    number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function renderSummary() {
  const cash = state.rows.filter(
    (row) => row.payment === "Cash",
  ).length;

  const qr = state.rows.filter(
    (row) => row.payment === "QR",
  ).length;

  els.totalGuests.textContent = state.rows.length;
  els.totalKHR.textContent = formatKHR(sumColumn("khr"));
  els.totalUSD.textContent = formatUSD(sumColumn("usd"));
  els.paymentSplit.textContent = `${cash} / ${qr}`;

  renderFooter();
}

function renderFooter() {
  els.footer.innerHTML = "";

  const first = document.createElement("td");
  first.textContent = "សរុប";
  els.footer.appendChild(first);

  state.columns.forEach((column) => {
    const td = document.createElement("td");

    if (column.key === "khr") {
      td.textContent = formatKHR(sumColumn("khr"));
      td.style.textAlign = "right";
    } else if (column.key === "usd") {
      td.textContent = formatUSD(sumColumn("usd"));
      td.style.textAlign = "right";
    }

    els.footer.appendChild(td);
  });

  els.footer.appendChild(document.createElement("td"));
}

/* =========================================================
   ROW ACTIONS
========================================================= */

async function addRow() {
  try {
    setSyncStatus("saving", "● កំពុងបន្ថែម...");

    const result = await api("addRow");

    state.rows.push(result.row);
    render();

    setSyncStatus("online", "● បានរក្សាទុក");

    requestAnimationFrame(() => {
      const firstColumn = state.columns[0];

      if (!firstColumn) {
        return;
      }

      const element = document.querySelector(
        `[data-row-id="${result.row.id}"][data-key="${firstColumn.key}"]`,
      );

      element?.focus();
      element?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  } catch (error) {
    setSyncStatus("error", "● បន្ថែមមិនបាន");
  }
}

async function removeRow(id) {
  if (currentRole !== "owner") {
    return;
  }

  const row = state.rows.find((item) => item.id === id);

  if (!row) {
    return;
  }

  const label = row.name ? `"${row.name}"` : "ភ្ញៀវនេះ";

  if (!confirm(`តើអ្នកពិតជាចង់លុប ${label} មែនទេ?`)) {
    return;
  }

  try {
    await api("deleteRow", {
      rowId: id,
    });

    state.rows = state.rows.filter((item) => item.id !== id);
    render();
    setSyncStatus("online", "● បានលុប");
  } catch (error) {
    setSyncStatus("error", "● លុបមិនបាន");
  }
}

/* =========================================================
   COLUMN ACTIONS
========================================================= */

async function addColumn(name) {
  if (currentRole !== "owner") {
    return;
  }

  const cleaned = name.trim();

  if (!cleaned) {
    return;
  }

  try {
    const result = await api("addColumn", {
      label: cleaned,
    });

    state.columns = result.columns;
    state.rows.forEach((row) => {
      row[result.column.key] = "";
    });

    render();
  } catch (error) {
    alert("មិនអាចបន្ថែម Column បានទេ។");
  }
}

async function removeColumn(key) {
  if (currentRole !== "owner") {
    return;
  }

  const column = state.columns.find((item) => item.key === key);

  if (!column) {
    return;
  }

  if (
    !confirm(
      `តើអ្នកពិតជាចង់លុប Column "${column.label}" មែនទេ?\n\nទិន្នន័យទាំងអស់ក្នុង Column នេះនឹងត្រូវលុបផងដែរ។`,
    )
  ) {
    return;
  }

  try {
    const result = await api("deleteColumn", {
      key,
    });

    state.columns = result.columns;
    state.rows.forEach((row) => {
      delete row[key];
    });

    render();
  } catch (error) {
    alert("មិនអាចលុប Column បានទេ។");
  }
}

function openRenameColumn(key) {
  if (currentRole !== "owner") {
    return;
  }

  const column = state.columns.find((item) => item.key === key);

  if (!column) {
    return;
  }

  renameColumnKey = key;
  els.renameColumnInput.value = column.label;
  els.renameColumnDialog.showModal();

  setTimeout(() => {
    els.renameColumnInput.focus();
    els.renameColumnInput.select();
  }, 50);
}

async function renameColumn() {
  if (currentRole !== "owner") {
    return;
  }

  const newLabel = els.renameColumnInput.value.trim();

  if (!renameColumnKey || !newLabel) {
    return;
  }

  try {
    const result = await api("renameColumn", {
      key: renameColumnKey,
      label: newLabel,
    });

    state.columns = result.columns;
    renameColumnKey = null;
    els.renameColumnDialog.close();
    render();
  } catch (error) {
    alert("មិនអាចប្តូរឈ្មោះ Column បានទេ។");
  }
}

/* =========================================================
   EXPORT
========================================================= */

function csvEscape(value) {
  const string = String(value ?? "");
  return `"${string.replaceAll('"', '""')}"`;
}

function exportCSV() {
  const headers = [
    "No.",
    ...state.columns.map((column) => column.label),
  ];

  const lines = [
    headers.map(csvEscape).join(","),
  ];

  state.rows.forEach((row, index) => {
    lines.push(
      [
        index + 1,
        ...state.columns.map((column) => row[column.key] ?? ""),
      ]
        .map(csvEscape)
        .join(","),
    );
  });

  const blob = new Blob(
    ["\uFEFF" + lines.join("\n")],
    {
      type: "text/csv;charset=utf-8;",
    },
  );

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    `wedding-guests-${new Date().toISOString().slice(0, 10)}.csv`;

  anchor.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   RESET
========================================================= */

async function resetData() {
  if (currentRole !== "owner") {
    return;
  }

  if (
    !confirm(
      "តើអ្នកពិតជាចង់ Reset ទិន្នន័យទាំងអស់មែនទេ?\n\nGuest data ទាំងអស់នឹងត្រូវលុប។",
    )
  ) {
    return;
  }

  try {
    const result = await api("resetData");

    state.columns = result.columns;
    state.rows = [];
    render();

    setSyncStatus("online", "● បាន Reset");
  } catch (error) {
    alert("Reset មិនបាន។");
  }
}

/* =========================================================
   EVENTS
========================================================= */

els.loginForm.addEventListener("submit", submitLogin);

els.togglePinBtn.addEventListener("click", () => {
  const isPassword = els.pinInput.type === "password";

  els.pinInput.type = isPassword ? "text" : "password";
  els.togglePinBtn.textContent = isPassword ? "🙈" : "👁";
});

els.logoutBtn.addEventListener("click", () => {
  logout(true);
});

els.addGuestBtn.addEventListener("click", addRow);
els.exportBtn.addEventListener("click", exportCSV);
els.resetBtn.addEventListener("click", resetData);

els.searchInput.addEventListener("input", renderBody);
els.paymentFilter.addEventListener("change", renderBody);
els.bankFilter.addEventListener("change", renderBody);

els.clearSearch.addEventListener("click", () => {
  els.searchInput.value = "";
  els.searchInput.focus();
  renderBody();
});

els.addColumnBtn.addEventListener("click", () => {
  if (currentRole !== "owner") {
    return;
  }

  els.newColumnName.value = "";
  els.columnDialog.showModal();

  setTimeout(() => {
    els.newColumnName.focus();
  }, 50);
});

els.confirmAddColumn.addEventListener("click", async (event) => {
  event.preventDefault();

  const name = els.newColumnName.value;

  if (!name.trim()) {
    return;
  }

  await addColumn(name);
  els.columnDialog.close();
});

els.newColumnName.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();

  const name = els.newColumnName.value;

  if (!name.trim()) {
    return;
  }

  await addColumn(name);
  els.columnDialog.close();
});

els.confirmRenameColumn.addEventListener("click", async (event) => {
  event.preventDefault();
  await renameColumn();
});

els.renameColumnInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    await renameColumn();
  }
});

window.addEventListener("online", () => {
  setSyncStatus("online", "● បានភ្ជាប់");
});

window.addEventListener("offline", () => {
  setSyncStatus("error", "● Offline");
});

/* START */
restoreSession();
