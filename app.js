"use strict";

/* =========================================================
   CONFIG
========================================================= */

const API_URL =
  "https://script.google.com/macros/s/AKfycbygtTbkC_T2wsvJqXqzZEMVzZicDGwHtBYuL7QYvwAtywdzlmtnva0IBHtuXHeL2-9HtQ/exec";

const TOKEN_KEY = "wedding_guest_token_v3";
const ROLE_KEY = "wedding_guest_role_v3";

const AUTO_REFRESH_MS = 5000;
const AUTO_SAVE_DELAY_MS = 650;

const REQUEST_TIMEOUT_MS = 15000;
const LOAD_RETRY_COUNT = 4;

const COLUMN_WIDTHS_KEY =
  "wedding_guest_column_widths_v1";

const ROW_HEIGHTS_KEY =
  "wedding_guest_row_heights_v1";

const MIN_COLUMN_WIDTH = 90;
const MAX_COLUMN_WIDTH = 520;

const MIN_ROW_HEIGHT = 46;
const MAX_ROW_HEIGHT = 220;


/* =========================================================
   STATE
========================================================= */

let state = {
  columns: [],
  rows: [],
};

let currentRole = null;
let renameColumnKey = null;
let refreshTimer = null;
let isLoadingData = false;

const pendingSaves = new Map();

let columnWidths =
  loadLocalObject(COLUMN_WIDTHS_KEY);

let rowHeights =
  loadLocalObject(ROW_HEIGHTS_KEY);


/* =========================================================
   ELEMENTS
========================================================= */

const els = {
  loginScreen:
    document.getElementById("loginScreen"),

  loginForm:
    document.getElementById("loginForm"),

  loginBtn:
    document.getElementById("loginBtn"),

  pinInput:
    document.getElementById("pinInput"),

  togglePinBtn:
    document.getElementById("togglePinBtn"),

  loginError:
    document.getElementById("loginError"),

  mainApp:
    document.getElementById("mainApp"),

  roleBadge:
    document.getElementById("roleBadge"),

  logoutBtn:
    document.getElementById("logoutBtn"),

  table:
    document.getElementById("guestTable"),

  colgroup:
    document.getElementById("tableColgroup"),

  header:
    document.getElementById("tableHeader"),

  body:
    document.getElementById("tableBody"),

  footer:
    document.getElementById("tableFooter"),

  addGuestBtn:
    document.getElementById("addGuestBtn"),

  addGuestBottomBtn:
    document.getElementById(
      "addGuestBottomBtn",
    ),

  exportBtn:
    document.getElementById("exportBtn"),

  resetBtn:
    document.getElementById("resetBtn"),

  searchInput:
    document.getElementById("searchInput"),

  clearSearch:
    document.getElementById("clearSearch"),

  paymentFilter:
    document.getElementById("paymentFilter"),

  bankFilter:
    document.getElementById("bankFilter"),

  addColumnBtn:
    document.getElementById("addColumnBtn"),

  addColumnBottomBtn:
    document.getElementById(
      "addColumnBottomBtn",
    ),

  columnDialog:
    document.getElementById("columnDialog"),

  newColumnName:
    document.getElementById("newColumnName"),

  confirmAddColumn:
    document.getElementById(
      "confirmAddColumn",
    ),

  renameColumnDialog:
    document.getElementById(
      "renameColumnDialog",
    ),

  renameColumnInput:
    document.getElementById(
      "renameColumnInput",
    ),

  confirmRenameColumn:
    document.getElementById(
      "confirmRenameColumn",
    ),

  totalGuests:
    document.getElementById("totalGuests"),

  totalKHR:
    document.getElementById("totalKHR"),

  totalUSD:
    document.getElementById("totalUSD"),

  paymentSplit:
    document.getElementById("paymentSplit"),

  resultInfo:
    document.getElementById("resultInfo"),

  syncStatus:
    document.getElementById("syncStatus"),

  emptyTemplate:
    document.getElementById(
      "emptyStateTemplate",
    ),
};


/* =========================================================
   HELPERS
========================================================= */

function loadLocalObject(key) {
  try {
    return JSON.parse(
      localStorage.getItem(key) || "{}",
    );
  } catch {
    return {};
  }
}


function saveLocalObject(key, object) {
  localStorage.setItem(
    key,
    JSON.stringify(object),
  );
}


function sleep(ms) {
  return new Promise(
    (resolve) => setTimeout(resolve, ms),
  );
}


function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value),
  );
}


function getToken() {
  return (
    localStorage.getItem(TOKEN_KEY) || ""
  );
}


function setSyncStatus(type, text) {
  if (!els.syncStatus) {
    return;
  }

  els.syncStatus.className =
    `sync-status ${type}`;

  els.syncStatus.textContent =
    text;
}


/* =========================================================
   API
========================================================= */

async function api(action, payload = {}) {

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

  try {

    const response =
      await fetch(
        API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8",
          },

          body: JSON.stringify({
            action,
            token: getToken(),
            ...payload,
          }),

          cache: "no-store",

          signal:
            controller.signal,
        },
      );


    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status}`,
      );
    }


    const text =
      await response.text();


    if (!text) {
      throw new Error(
        "EMPTY_SERVER_RESPONSE",
      );
    }


    let data;

    try {
      data =
        JSON.parse(text);
    } catch {
      throw new Error(
        "INVALID_SERVER_RESPONSE",
      );
    }


    if (!data.ok) {

      if (
        data.error ===
        "UNAUTHORIZED"
      ) {
        logout(false);
      }

      throw new Error(
        data.error ||
        "API_ERROR",
      );
    }


    return data;

  } catch (error) {

    if (
      error.name ===
      "AbortError"
    ) {
      throw new Error(
        "REQUEST_TIMEOUT",
      );
    }

    throw error;

  } finally {

    clearTimeout(timeout);
  }
}


/* =========================================================
   LOGIN
========================================================= */

async function submitLogin(event) {

  event.preventDefault();

  const pin =
    els.pinInput.value.trim();

  if (!pin) {
    els.loginError.textContent =
      "សូមបញ្ចូលលេខសម្ងាត់។";
    return;
  }


  els.loginBtn.disabled = true;
  els.loginBtn.textContent =
    "កំពុងចូល...";

  els.loginError.textContent = "";


  try {

    const result =
      await api(
        "login",
        {
          pin,
          token: "",
        },
      );


    localStorage.setItem(
      TOKEN_KEY,
      result.token,
    );

    localStorage.setItem(
      ROLE_KEY,
      result.role,
    );


    currentRole =
      result.role;


    els.pinInput.value = "";


    showApp();


    await loadData({
      retries:
        LOAD_RETRY_COUNT,
    });


    startAutoRefresh();

  } catch (error) {

    console.error(
      "Login error:",
      error,
    );


    if (
      error.message ===
      "INVALID_PIN"
    ) {
      els.loginError.textContent =
        "លេខសម្ងាត់មិនត្រឹមត្រូវ។";

    } else {
      els.loginError.textContent =
        "មិនអាចភ្ជាប់ទៅ Server បានទេ។";
    }

  } finally {

    els.loginBtn.disabled = false;

    els.loginBtn.textContent =
      "ចូលប្រើ";
  }
}


/* =========================================================
   SESSION
========================================================= */

async function restoreSession() {

  if (!getToken()) {
    showLogin();
    return;
  }


  currentRole =
    localStorage.getItem(
      ROLE_KEY,
    );


  showApp();


  try {

    await loadData({
      retries:
        LOAD_RETRY_COUNT,
    });

    startAutoRefresh();

  } catch (error) {

    console.error(
      "Restore session failed:",
      error,
    );


    if (!getToken()) {
      return;
    }


    setSyncStatus(
      "error",
      "● Server មិនទាន់ឆ្លើយតប",
    );


    startAutoRefresh();
  }
}


function showApp() {

  els.loginScreen.classList.add(
    "hidden",
  );

  els.mainApp.classList.remove(
    "hidden",
  );

  applyRoleUI();
}


function showLogin() {

  els.mainApp.classList.add(
    "hidden",
  );

  els.loginScreen.classList.remove(
    "hidden",
  );

  stopAutoRefresh();

  setTimeout(
    () => els.pinInput.focus(),
    50,
  );
}


function logout(clearMessage = true) {

  localStorage.removeItem(
    TOKEN_KEY,
  );

  localStorage.removeItem(
    ROLE_KEY,
  );

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


/* =========================================================
   OWNER / STAFF
========================================================= */

function applyRoleUI() {

  const isOwner =
    currentRole === "owner";


  els.roleBadge.textContent =
    isOwner
      ? "Owner"
      : "Staff";


  document
    .querySelectorAll(
      ".owner-only",
    )
    .forEach(
      (element) => {

        element.classList.toggle(
          "hidden",
          !isOwner,
        );
      },
    );
}


/* =========================================================
   LOAD FROM GOOGLE SHEET
========================================================= */

async function loadData(
  options = {},
) {

  const {
    quiet = false,
    retries = 3,
  } = options;


  if (isLoadingData) {
    return null;
  }


  isLoadingData = true;

  let lastError = null;


  if (!quiet) {
    setSyncStatus(
      "saving",
      "● កំពុងទាញទិន្នន័យ...",
    );
  }


  try {

    for (
      let attempt = 1;
      attempt <= retries;
      attempt++
    ) {

      try {

        const result =
          await api("load");


        if (
          !Array.isArray(result.columns) ||
          !Array.isArray(result.rows)
        ) {
          throw new Error(
            "INVALID_SERVER_DATA",
          );
        }


        state.columns =
          result.columns;

        state.rows =
          result.rows;


        currentRole =
          result.role ||
          currentRole;


        render();


        setSyncStatus(
          "online",
          "● បានភ្ជាប់",
        );


        return result;

      } catch (error) {

        lastError = error;


        if (!getToken()) {
          throw error;
        }


        if (
          attempt < retries
        ) {
          await sleep(
            700 * attempt,
          );
        }
      }
    }


    setSyncStatus(
      "error",
      "● ការភ្ជាប់មានបញ្ហា — ទិន្នន័យចាស់នៅតែបង្ហាញ",
    );


    throw (
      lastError ||
      new Error("LOAD_FAILED")
    );

  } finally {

    isLoadingData = false;
  }
}


/* =========================================================
   AUTO REFRESH
========================================================= */

function startAutoRefresh() {

  stopAutoRefresh();


  refreshTimer =
    setInterval(
      async () => {

        if (!getToken()) {
          return;
        }


        if (
          isLoadingData ||
          pendingSaves.size > 0 ||
          document.hidden
        ) {
          return;
        }


        const active =
          document.activeElement;


        if (
          active &&
          (
            active.classList.contains(
              "cell",
            ) ||
            active.classList.contains(
              "select-cell",
            )
          )
        ) {
          return;
        }


        try {

          await loadData({
            quiet: true,
            retries: 1,
          });

        } catch (error) {

          console.warn(
            "Auto refresh failed:",
            error,
          );
        }

      },
      AUTO_REFRESH_MS,
    );
}


function stopAutoRefresh() {

  if (refreshTimer) {

    clearInterval(
      refreshTimer,
    );

    refreshTimer = null;
  }
}


/* =========================================================
   RENDER EVERYTHING
========================================================= */

function render() {

  renderColgroup();
  renderHeader();
  renderBody();
  renderSummary();
  renderFooter();
  applyRoleUI();
}


/* =========================================================
   COLUMN WIDTH
========================================================= */

function getDefaultColumnWidth(column) {

  if (
    column.key ===
    "name"
  ) {
    return 240;
  }


  if (
    column.type ===
    "number"
  ) {
    return 140;
  }


  if (
    column.type ===
    "payment"
  ) {
    return 130;
  }


  if (
    column.type ===
    "bank"
  ) {
    return 170;
  }


  return 180;
}


function getColumnWidth(column) {

  const width =
    Number(
      columnWidths[
        column.key
      ],
    );


  if (
    Number.isFinite(width) &&
    width >=
      MIN_COLUMN_WIDTH
  ) {
    return width;
  }


  return getDefaultColumnWidth(
    column,
  );
}


/* =========================================================
   COLGROUP
========================================================= */

function renderColgroup() {

  els.colgroup.innerHTML = "";


  const numberCol =
    document.createElement(
      "col",
    );

  numberCol.style.width =
    "64px";

  els.colgroup.appendChild(
    numberCol,
  );


  state.columns.forEach(
    (column) => {

      const col =
        document.createElement(
          "col",
        );

      col.dataset.key =
        column.key;

      col.style.width =
        `${getColumnWidth(
          column,
        )}px`;

      els.colgroup.appendChild(
        col,
      );
    },
  );


  const actionCol =
    document.createElement(
      "col",
    );

  actionCol.style.width =
    "86px";

  els.colgroup.appendChild(
    actionCol,
  );
}


/* =========================================================
   HEADER
========================================================= */

function renderHeader() {

  els.header.innerHTML = "";


  const noTh =
    document.createElement(
      "th",
    );

  noTh.className =
    "row-number";

  noTh.textContent =
    "No.";

  els.header.appendChild(
    noTh,
  );


  state.columns.forEach(
    (column) => {

      const th =
        document.createElement(
          "th",
        );

      th.style.position =
        "relative";


      const wrap =
        document.createElement(
          "div",
        );

      wrap.className =
        "column-header";


      const title =
        document.createElement(
          "span",
        );

      title.className =
        "column-title";

      title.textContent =
        column.label;

      wrap.appendChild(
        title,
      );


      if (
        currentRole ===
        "owner"
      ) {

        const actions =
          document.createElement(
            "div",
          );

        actions.className =
          "column-actions";


        const renameButton =
          document.createElement(
            "button",
          );

        renameButton.type =
          "button";

        renameButton.textContent =
          "✎";

        renameButton.title =
          "Rename";

        renameButton.addEventListener(
          "click",
          () =>
            openRenameColumn(
              column.key,
            ),
        );


        const deleteButton =
          document.createElement(
            "button",
          );

        deleteButton.type =
          "button";

        deleteButton.className =
          "column-delete";

        deleteButton.textContent =
          "×";

        deleteButton.title =
          "Delete";

        deleteButton.addEventListener(
          "click",
          () =>
            removeColumn(
              column.key,
            ),
        );


        actions.append(
          renameButton,
          deleteButton,
        );

        wrap.appendChild(
          actions,
        );
      }


      th.appendChild(
        wrap,
      );


      const resize =
        document.createElement(
          "span",
        );

      resize.className =
        "column-resize-handle";

      resize.addEventListener(
        "pointerdown",
        (event) =>
          startColumnResize(
            event,
            column.key,
          ),
      );

      resize.addEventListener(
        "dblclick",
        () =>
          autoFitColumn(
            column.key,
          ),
      );


      th.appendChild(
        resize,
      );

      els.header.appendChild(
        th,
      );
    },
  );


  const actionTh =
    document.createElement(
      "th",
    );

  actionTh.className =
    "actions-col";

  actionTh.textContent =
    "Action";

  els.header.appendChild(
    actionTh,
  );
}


/* =========================================================
   FILTER
========================================================= */

function getFilteredRows() {

  const query =
    els.searchInput.value
      .trim()
      .toLowerCase();


  const payment =
    els.paymentFilter.value;


  const bank =
    els.bankFilter.value;


  return state.rows.filter(
    (row) => {

      if (
        payment !== "all" &&
        String(
          row.payment || "",
        ) !== payment
      ) {
        return false;
      }


      if (
        bank !== "all" &&
        String(
          row.bank || "",
        ) !== bank
      ) {
        return false;
      }


      if (!query) {
        return true;
      }


      return state.columns.some(
        (column) => {

          return String(
            row[column.key] ?? "",
          )
            .toLowerCase()
            .includes(query);
        },
      );
    },
  );
}


/* =========================================================
   BODY
========================================================= */

function renderBody() {

  els.body.innerHTML = "";


  const rows =
    getFilteredRows();


  els.resultInfo.textContent =
    `${rows.length} records`;


  if (
    rows.length === 0
  ) {

    const empty =
      els.emptyTemplate.content
        .cloneNode(true);

    els.body.appendChild(
      empty,
    );

    return;
  }


  rows.forEach(
    (row) => {

      const realIndex =
        state.rows.findIndex(
          (item) =>
            item.id === row.id,
        );


      const tr =
        document.createElement(
          "tr",
        );

      tr.dataset.rowId =
        row.id;


      const savedHeight =
        Number(
          rowHeights[row.id],
        );


      if (
        Number.isFinite(
          savedHeight,
        )
      ) {
        tr.style.height =
          `${savedHeight}px`;
      }


      const numberTd =
        document.createElement(
          "td",
        );

      numberTd.className =
        "row-number";

      numberTd.textContent =
        String(
          realIndex + 1,
        );


      const resize =
        document.createElement(
          "span",
        );

      resize.className =
        "row-resize-handle";


      resize.addEventListener(
        "pointerdown",
        (event) =>
          startRowResize(
            event,
            row.id,
          ),
      );


      numberTd.appendChild(
        resize,
      );

      tr.appendChild(
        numberTd,
      );


      state.columns.forEach(
        (column) => {

          const td =
            document.createElement(
              "td",
            );


          const field =
            createCell(
              row,
              column,
            );


          td.appendChild(
            field,
          );

          tr.appendChild(
            td,
          );
        },
      );


      const actionTd =
        document.createElement(
          "td",
        );

      actionTd.className =
        "actions-col";


      if (
        currentRole ===
        "owner"
      ) {

        const deleteButton =
          document.createElement(
            "button",
          );

        deleteButton.type =
          "button";

        deleteButton.className =
          "delete-row";

        deleteButton.textContent =
          "×";

        deleteButton.title =
          "Delete guest";


        deleteButton.addEventListener(
          "click",
          () =>
            deleteRow(
              row.id,
            ),
        );


        actionTd.appendChild(
          deleteButton,
        );
      }


      tr.appendChild(
        actionTd,
      );


      els.body.appendChild(
        tr,
      );
    },
  );
}


/* =========================================================
   CREATE CELL
========================================================= */

function createCell(
  row,
  column,
) {

  let field;


  if (
    column.type ===
    "payment"
  ) {

    field =
      document.createElement(
        "select",
      );

    field.className =
      "select-cell";


    [
      "",
      "Cash",
      "QR",
    ].forEach(
      (value) => {

        const option =
          document.createElement(
            "option",
          );

        option.value =
          value;

        option.textContent =
          value ||
          "-";

        field.appendChild(
          option,
        );
      },
    );


    field.value =
      String(
        row[column.key] ?? "",
      );


  } else if (
    column.type ===
    "bank"
  ) {

    field =
      document.createElement(
        "select",
      );

    field.className =
      "select-cell";


    [
      "",
      "ABA",
      "ACLEDA",
      "Wing",
      "Other",
    ].forEach(
      (value) => {

        const option =
          document.createElement(
            "option",
          );

        option.value =
          value;

        option.textContent =
          value ||
          "-";

        field.appendChild(
          option,
        );
      },
    );


    field.value =
      String(
        row[column.key] ?? "",
      );


  } else {

    field =
      document.createElement(
        "input",
      );

    field.className =
      "cell";


    if (
      column.type ===
      "number"
    ) {

      field.type =
        "number";

      field.inputMode =
        "decimal";

      field.classList.add(
        "number-cell",
      );

    } else {

      field.type =
        "text";
    }


    field.value =
      row[column.key] ?? "";
  }


  field.dataset.rowId =
    row.id;

  field.dataset.key =
    column.key;


  field.addEventListener(
    "input",
    () => {

      updateLocalRow(
        row.id,
        column.key,
        field.value,
      );

      scheduleCellSave(
        row.id,
        column.key,
        field.value,
      );

      renderSummary();
      renderFooter();
    },
  );


  field.addEventListener(
    "change",
    () => {

      updateLocalRow(
        row.id,
        column.key,
        field.value,
      );

      scheduleCellSave(
        row.id,
        column.key,
        field.value,
      );

      renderSummary();
      renderFooter();
    },
  );


  field.addEventListener(
    "blur",
    () => {

      flushCellSave(
        row.id,
        column.key,
      );
    },
  );


  return field;
}


/* =========================================================
   LOCAL UPDATE
========================================================= */

function updateLocalRow(
  rowId,
  key,
  value,
) {

  const row =
    state.rows.find(
      (item) =>
        item.id === rowId,
    );


  if (!row) {
    return;
  }


  row[key] =
    value;
}


/* =========================================================
   SAVE CELL
========================================================= */

function saveKey(
  rowId,
  key,
) {
  return (
    `${rowId}::${key}`
  );
}


function scheduleCellSave(
  rowId,
  key,
  value,
) {

  const id =
    saveKey(
      rowId,
      key,
    );


  const existing =
    pendingSaves.get(id);


  if (existing) {
    clearTimeout(
      existing.timer,
    );
  }


  const timer =
    setTimeout(
      () => {

        performCellSave(
          rowId,
          key,
          value,
          id,
        );

      },
      AUTO_SAVE_DELAY_MS,
    );


  pendingSaves.set(
    id,
    {
      timer,
      value,
    },
  );


  setSyncStatus(
    "saving",
    "● កំពុងរក្សាទុក...",
  );
}


async function flushCellSave(
  rowId,
  key,
) {

  const id =
    saveKey(
      rowId,
      key,
    );


  const pending =
    pendingSaves.get(id);


  if (!pending) {
    return;
  }


  clearTimeout(
    pending.timer,
  );


  await performCellSave(
    rowId,
    key,
    pending.value,
    id,
  );
}


async function performCellSave(
  rowId,
  key,
  value,
  pendingId,
) {

  try {

    await api(
      "updateCell",
      {
        rowId,
        key,
        value,
      },
    );


    pendingSaves.delete(
      pendingId,
    );


    if (
      pendingSaves.size === 0
    ) {
      setSyncStatus(
        "online",
        "● បានរក្សាទុក",
      );
    }

  } catch (error) {

    console.error(
      "Save failed:",
      error,
    );


    pendingSaves.delete(
      pendingId,
    );


    setSyncStatus(
      "error",
      "● រក្សាទុកមិនបាន",
    );
  }
}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  let khr = 0;
  let usd = 0;
  let cash = 0;
  let qr = 0;


  state.rows.forEach(
    (row) => {

      khr +=
        Number(
          row.khr || 0,
        ) || 0;


      usd +=
        Number(
          row.usd || 0,
        ) || 0;


      if (
        row.payment ===
        "Cash"
      ) {
        cash++;
      }


      if (
        row.payment ===
        "QR"
      ) {
        qr++;
      }
    },
  );


  els.totalGuests.textContent =
    String(
      state.rows.length,
    );


  els.totalKHR.textContent =
    `KHR ${khr.toLocaleString()}`;


  els.totalUSD.textContent =
    `$${usd.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )}`;


  els.paymentSplit.textContent =
    `${cash} / ${qr}`;
}


/* =========================================================
   FOOTER
========================================================= */

function renderFooter() {

  els.footer.innerHTML = "";


  const number =
    document.createElement(
      "td",
    );

  number.textContent =
    "Total";

  els.footer.appendChild(
    number,
  );


  state.columns.forEach(
    (column) => {

      const td =
        document.createElement(
          "td",
        );


      if (
        column.key ===
        "khr"
      ) {

        const total =
          state.rows.reduce(
            (sum, row) =>
              sum +
              (
                Number(
                  row.khr || 0,
                ) || 0
              ),
            0,
          );


        td.textContent =
          total.toLocaleString();


      } else if (
        column.key ===
        "usd"
      ) {

        const total =
          state.rows.reduce(
            (sum, row) =>
              sum +
              (
                Number(
                  row.usd || 0,
                ) || 0
              ),
            0,
          );


        td.textContent =
          `$${total.toLocaleString(
            undefined,
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            },
          )}`;
      }


      els.footer.appendChild(
        td,
      );
    },
  );


  els.footer.appendChild(
    document.createElement(
      "td",
    ),
  );
}


/* =========================================================
   ADD GUEST
========================================================= */

async function addRow() {

  try {

    setSyncStatus(
      "saving",
      "● កំពុងបន្ថែមភ្ញៀវ...",
    );


    const result =
      await api(
        "addRow",
      );


    state.rows.push(
      result.row,
    );


    render();


    setSyncStatus(
      "online",
      "● បានបន្ថែម",
    );


    requestAnimationFrame(
      () => {

        const selector =
          `[data-row-id="${CSS.escape(
            result.row.id,
          )}"][data-key="name"]`;


        const input =
          document.querySelector(
            selector,
          );


        if (input) {

          input.focus();


          const scroll =
            document.querySelector(
              ".table-scroll",
            );


          if (scroll) {
            scroll.scrollTop =
              scroll.scrollHeight;
          }
        }
      },
    );

  } catch (error) {

    console.error(
      "Add row failed:",
      error,
    );


    setSyncStatus(
      "error",
      "● បន្ថែមមិនបាន",
    );
  }
}


/* =========================================================
   DELETE GUEST
========================================================= */

async function deleteRow(id) {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const row =
    state.rows.find(
      (item) =>
        item.id === id,
    );


  const guestName =
    row?.name ||
    "guest";


  if (
    !confirm(
      `តើអ្នកចង់លុប "${guestName}" មែនទេ?`,
    )
  ) {
    return;
  }


  try {

    setSyncStatus(
      "saving",
      "● កំពុងលុប...",
    );


    await api(
      "deleteRow",
      {
        rowId:
          id,
      },
    );


    state.rows =
      state.rows.filter(
        (item) =>
          item.id !== id,
      );


    delete rowHeights[id];


    saveLocalObject(
      ROW_HEIGHTS_KEY,
      rowHeights,
    );


    render();


    setSyncStatus(
      "online",
      "● បានលុប",
    );

  } catch (error) {

    console.error(
      "Delete failed:",
      error,
    );


    setSyncStatus(
      "error",
      "● លុបមិនបាន",
    );
  }
}


/* =========================================================
   ADD COLUMN
========================================================= */

async function addColumn(name) {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const label =
    name.trim();


  if (!label) {
    return;
  }


  try {

    const result =
      await api(
        "addColumn",
        {
          label,
        },
      );


    state.columns =
      result.columns;


    state.rows.forEach(
      (row) => {

        row[
          result.column.key
        ] = "";
      },
    );


    render();

  } catch (error) {

    console.error(
      error,
    );


    alert(
      "មិនអាចបន្ថែម Column បានទេ។",
    );
  }
}


/* =========================================================
   RENAME COLUMN
========================================================= */

function openRenameColumn(key) {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const column =
    state.columns.find(
      (item) =>
        item.key === key,
    );


  if (!column) {
    return;
  }


  renameColumnKey =
    key;


  els.renameColumnInput.value =
    column.label;


  els.renameColumnDialog
    .showModal();


  setTimeout(
    () => {

      els.renameColumnInput.focus();

      els.renameColumnInput.select();

    },
    50,
  );
}


async function renameColumn() {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const label =
    els.renameColumnInput.value
      .trim();


  if (
    !renameColumnKey ||
    !label
  ) {
    return;
  }


  try {

    const result =
      await api(
        "renameColumn",
        {
          key:
            renameColumnKey,

          label,
        },
      );


    state.columns =
      result.columns;


    renameColumnKey =
      null;


    els.renameColumnDialog
      .close();


    render();

  } catch (error) {

    console.error(
      error,
    );


    alert(
      "មិនអាចប្តូរឈ្មោះ Column បានទេ។",
    );
  }
}


/* =========================================================
   DELETE COLUMN
========================================================= */

async function removeColumn(key) {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const column =
    state.columns.find(
      (item) =>
        item.key === key,
    );


  if (!column) {
    return;
  }


  if (
    !confirm(
      `តើអ្នកពិតជាចង់លុប Column "${column.label}" មែនទេ?\n\nទិន្នន័យក្នុង Column នេះនឹងត្រូវលុប។`,
    )
  ) {
    return;
  }


  try {

    const result =
      await api(
        "deleteColumn",
        {
          key,
        },
      );


    state.columns =
      result.columns;


    state.rows.forEach(
      (row) => {

        delete row[key];
      },
    );


    delete columnWidths[key];


    saveLocalObject(
      COLUMN_WIDTHS_KEY,
      columnWidths,
    );


    render();

  } catch (error) {

    console.error(
      error,
    );


    alert(
      "មិនអាចលុប Column បានទេ។",
    );
  }
}


/* =========================================================
   COLUMN RESIZE
========================================================= */

function startColumnResize(
  event,
  key,
) {

  event.preventDefault();


  const column =
    state.columns.find(
      (item) =>
        item.key === key,
    );


  if (!column) {
    return;
  }


  const startX =
    event.clientX;


  const startWidth =
    getColumnWidth(
      column,
    );


  document.body.classList.add(
    "is-resizing-column",
  );


  function move(moveEvent) {

    const width =
      clamp(
        startWidth +
        moveEvent.clientX -
        startX,

        MIN_COLUMN_WIDTH,

        MAX_COLUMN_WIDTH,
      );


    columnWidths[key] =
      Math.round(width);


    const col =
      els.colgroup.querySelector(
        `col[data-key="${CSS.escape(
          key,
        )}"]`,
      );


    if (col) {
      col.style.width =
        `${Math.round(
          width,
        )}px`;
    }
  }


  function end() {

    document.body.classList.remove(
      "is-resizing-column",
    );


    saveLocalObject(
      COLUMN_WIDTHS_KEY,
      columnWidths,
    );


    window.removeEventListener(
      "pointermove",
      move,
    );


    window.removeEventListener(
      "pointerup",
      end,
    );
  }


  window.addEventListener(
    "pointermove",
    move,
  );


  window.addEventListener(
    "pointerup",
    end,
  );
}


/* =========================================================
   AUTO FIT COLUMN
========================================================= */

function autoFitColumn(key) {

  const column =
    state.columns.find(
      (item) =>
        item.key === key,
    );


  if (!column) {
    return;
  }


  const canvas =
    document.createElement(
      "canvas",
    );


  const context =
    canvas.getContext("2d");


  context.font =
    '14px "Noto Sans Khmer", sans-serif';


  let width =
    context.measureText(
      column.label,
    ).width +
    70;


  state.rows.forEach(
    (row) => {

      const text =
        String(
          row[key] ?? "",
        );


      width =
        Math.max(
          width,
          context.measureText(
            text,
          ).width +
          35,
        );
    },
  );


  width =
    clamp(
      width,
      MIN_COLUMN_WIDTH,
      MAX_COLUMN_WIDTH,
    );


  columnWidths[key] =
    Math.round(width);


  saveLocalObject(
    COLUMN_WIDTHS_KEY,
    columnWidths,
  );


  renderColgroup();
}


/* =========================================================
   ROW RESIZE
========================================================= */

function startRowResize(
  event,
  rowId,
) {

  event.preventDefault();


  const tr =
    els.body.querySelector(
      `tr[data-row-id="${CSS.escape(
        rowId,
      )}"]`,
    );


  if (!tr) {
    return;
  }


  const startY =
    event.clientY;


  const startHeight =
    tr.getBoundingClientRect()
      .height;


  document.body.classList.add(
    "is-resizing-row",
  );


  function move(moveEvent) {

    const height =
      clamp(
        startHeight +
        moveEvent.clientY -
        startY,

        MIN_ROW_HEIGHT,

        MAX_ROW_HEIGHT,
      );


    tr.style.height =
      `${Math.round(
        height,
      )}px`;


    rowHeights[rowId] =
      Math.round(height);
  }


  function end() {

    document.body.classList.remove(
      "is-resizing-row",
    );


    saveLocalObject(
      ROW_HEIGHTS_KEY,
      rowHeights,
    );


    window.removeEventListener(
      "pointermove",
      move,
    );


    window.removeEventListener(
      "pointerup",
      end,
    );
  }


  window.addEventListener(
    "pointermove",
    move,
  );


  window.addEventListener(
    "pointerup",
    end,
  );
}


/* =========================================================
   CSV
========================================================= */

function csvEscape(value) {

  const text =
    String(
      value ?? "",
    );


  return (
    `"${text.replaceAll(
      '"',
      '""',
    )}"`
  );
}


function exportCSV() {

  const rows = [
    [
      "No.",

      ...state.columns.map(
        (column) =>
          column.label,
      ),
    ],
  ];


  state.rows.forEach(
    (row, index) => {

      rows.push([
        index + 1,

        ...state.columns.map(
          (column) =>
            row[column.key] ?? "",
        ),
      ]);
    },
  );


  const content =
    "\uFEFF" +
    rows
      .map(
        (row) =>
          row
            .map(csvEscape)
            .join(","),
      )
      .join("\n");


  const blob =
    new Blob(
      [content],
      {
        type:
          "text/csv;charset=utf-8;",
      },
    );


  const url =
    URL.createObjectURL(
      blob,
    );


  const a =
    document.createElement(
      "a",
    );


  a.href =
    url;


  a.download =
    `wedding-guests-${
      new Date()
        .toISOString()
        .slice(0, 10)
    }.csv`;


  a.click();


  URL.revokeObjectURL(
    url,
  );
}


/* =========================================================
   RESET
========================================================= */

async function resetData() {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const answer =
    prompt(
      'WARNING: This deletes ALL guest data.\n\nType DELETE ALL to continue:',
    );


  if (
    answer !==
    "DELETE ALL"
  ) {
    return;
  }


  if (
    !confirm(
      "ចុងក្រោយ៖ Guest data ទាំងអស់នឹងត្រូវលុប។ Continue?",
    )
  ) {
    return;
  }


  try {

    const result =
      await api(
        "resetData",
      );


    state.columns =
      result.columns;


    state.rows = [];


    render();


    setSyncStatus(
      "online",
      "● បាន Reset",
    );

  } catch (error) {

    console.error(
      error,
    );


    alert(
      "Reset មិនបាន។",
    );
  }
}


/* =========================================================
   ADD COLUMN DIALOG
========================================================= */

function openAddColumnDialog() {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  els.newColumnName.value =
    "";


  els.columnDialog.showModal();


  setTimeout(
    () =>
      els.newColumnName.focus(),
    50,
  );
}


/* =========================================================
   EVENTS
========================================================= */

els.loginForm.addEventListener(
  "submit",
  submitLogin,
);


els.togglePinBtn.addEventListener(
  "click",
  () => {

    const hidden =
      els.pinInput.type ===
      "password";


    els.pinInput.type =
      hidden
        ? "text"
        : "password";


    els.togglePinBtn.textContent =
      hidden
        ? "🙈"
        : "👁";
  },
);


els.logoutBtn.addEventListener(
  "click",
  () =>
    logout(true),
);


els.addGuestBtn.addEventListener(
  "click",
  addRow,
);


els.addGuestBottomBtn.addEventListener(
  "click",
  addRow,
);


els.exportBtn.addEventListener(
  "click",
  exportCSV,
);


els.resetBtn.addEventListener(
  "click",
  resetData,
);


els.searchInput.addEventListener(
  "input",
  renderBody,
);


els.paymentFilter.addEventListener(
  "change",
  renderBody,
);


els.bankFilter.addEventListener(
  "change",
  renderBody,
);


els.clearSearch.addEventListener(
  "click",
  () => {

    els.searchInput.value = "";

    els.paymentFilter.value =
      "all";

    els.bankFilter.value =
      "all";

    renderBody();

    els.searchInput.focus();
  },
);


els.addColumnBtn.addEventListener(
  "click",
  openAddColumnDialog,
);


els.addColumnBottomBtn
  .addEventListener(
    "click",
    openAddColumnDialog,
  );


els.confirmAddColumn.addEventListener(
  "click",
  async (event) => {

    event.preventDefault();


    const name =
      els.newColumnName.value;


    if (!name.trim()) {
      return;
    }


    await addColumn(name);


    els.columnDialog.close();
  },
);


els.newColumnName.addEventListener(
  "keydown",
  async (event) => {

    if (
      event.key !==
      "Enter"
    ) {
      return;
    }


    event.preventDefault();


    if (
      !els.newColumnName.value.trim()
    ) {
      return;
    }


    await addColumn(
      els.newColumnName.value,
    );


    els.columnDialog.close();
  },
);


els.confirmRenameColumn
  .addEventListener(
    "click",
    async (event) => {

      event.preventDefault();

      await renameColumn();
    },
  );


els.renameColumnInput
  .addEventListener(
    "keydown",
    async (event) => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        await renameColumn();
      }
    },
  );


/* =========================================================
   RECONNECT EVENTS
========================================================= */

document.addEventListener(
  "visibilitychange",
  async () => {

    if (
      document.hidden ||
      !getToken() ||
      pendingSaves.size > 0
    ) {
      return;
    }


    try {

      await loadData({
        quiet: true,
        retries: 2,
      });

    } catch (error) {

      console.warn(
        error,
      );
    }
  },
);


window.addEventListener(
  "focus",
  async () => {

    if (
      !getToken() ||
      isLoadingData ||
      pendingSaves.size > 0
    ) {
      return;
    }


    try {

      await loadData({
        quiet: true,
        retries: 2,
      });

    } catch (error) {

      console.warn(
        error,
      );
    }
  },
);


window.addEventListener(
  "online",
  async () => {

    setSyncStatus(
      "saving",
      "● Internet បានត្រឡប់មកវិញ — កំពុងភ្ជាប់...",
    );


    if (!getToken()) {
      return;
    }


    try {

      await loadData({
        quiet: true,
        retries: 4,
      });

    } catch (error) {

      console.warn(
        error,
      );
    }
  },
);


window.addEventListener(
  "offline",
  () => {

    setSyncStatus(
      "error",
      "● Offline — ទិន្នន័យដែលបាន Load នៅតែបង្ហាញ",
    );
  },
);


/* =========================================================
   START
========================================================= */

restoreSession();
