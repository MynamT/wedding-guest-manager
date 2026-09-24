"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const API_URL =
  "https://script.google.com/macros/s/AKfycbygtTbkC_T2wsvJqXqzZEMVzZicDGwHtBYuL7QYvwAtywdzlmtnva0IBHtuXHeL2-9HtQ/exec";

const TOKEN_KEY = "wedding_guest_token_v3";
const ROLE_KEY = "wedding_guest_role_v3";

const AUTO_REFRESH_MS = 5000;
const AUTO_SAVE_DELAY_MS = 650;


/* =========================================================
   NETWORK SETTINGS
========================================================= */

const LOAD_RETRY_COUNT = 4;
const AUTO_REFRESH_RETRY_COUNT = 2;
const REQUEST_TIMEOUT_MS = 15000;


/* =========================================================
   TABLE SIZE SETTINGS
========================================================= */

const COLUMN_WIDTHS_KEY =
  "wedding_guest_column_widths_v1";

const ROW_HEIGHTS_KEY =
  "wedding_guest_row_heights_v1";

const MIN_COLUMN_WIDTH = 90;
const MAX_COLUMN_WIDTH = 520;

const MIN_ROW_HEIGHT = 46;
const MAX_ROW_HEIGHT = 220;


/* =========================================================
   LOAD SAVED TABLE SIZE
========================================================= */

function loadSizeMap(key) {
  try {
    return JSON.parse(
      localStorage.getItem(key) || "{}",
    );
  } catch (error) {
    return {};
  }
}


function saveSizeMap(key, value) {
  localStorage.setItem(
    key,
    JSON.stringify(value),
  );
}


let columnWidths =
  loadSizeMap(COLUMN_WIDTHS_KEY);

let rowHeights =
  loadSizeMap(ROW_HEIGHTS_KEY);


/* =========================================================
   APPLICATION STATE
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
    document.getElementById(
      "paymentFilter",
    ),

  bankFilter:
    document.getElementById(
      "bankFilter",
    ),


  addColumnBtn:
    document.getElementById(
      "addColumnBtn",
    ),

  addColumnBottomBtn:
    document.getElementById(
      "addColumnBottomBtn",
    ),

  columnDialog:
    document.getElementById(
      "columnDialog",
    ),

  newColumnName:
    document.getElementById(
      "newColumnName",
    ),

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
    document.getElementById(
      "totalGuests",
    ),

  totalKHR:
    document.getElementById(
      "totalKHR",
    ),

  totalUSD:
    document.getElementById(
      "totalUSD",
    ),

  paymentSplit:
    document.getElementById(
      "paymentSplit",
    ),


  resultInfo:
    document.getElementById(
      "resultInfo",
    ),

  syncStatus:
    document.getElementById(
      "syncStatus",
    ),

  emptyTemplate:
    document.getElementById(
      "emptyStateTemplate",
    ),
};


/* =========================================================
   SMALL HELPER
========================================================= */

function sleep(ms) {
  return new Promise(
    (resolve) => {
      setTimeout(resolve, ms);
    },
  );
}


/* =========================================================
   API
========================================================= */

function getToken() {
  return (
    localStorage.getItem(TOKEN_KEY) || ""
  );
}


async function api(
  action,
  payload = {},
) {

  if (
    !API_URL ||
    API_URL.includes("PASTE_YOUR")
  ) {
    throw new Error(
      "API_URL_NOT_CONFIGURED",
    );
  }


  /*
   * Abort the request if Google Apps Script
   * takes too long to answer.
   */

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
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

          signal:
            controller.signal,

          cache:
            "no-store",
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

    } catch (error) {

      throw new Error(
        "INVALID_SERVER_RESPONSE",
      );
    }


    if (!data.ok) {

      if (
        data.error ===
        "UNAUTHORIZED"
      ) {

        /*
         * This is the ONLY server error
         * that should remove the login.
         */

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

    clearTimeout(
      timeout,
    );
  }
}


/* =========================================================
   SYNC STATUS
========================================================= */

function setSyncStatus(
  type,
  text,
) {

  if (!els.syncStatus) {
    return;
  }


  els.syncStatus.className =
    `sync-status ${type}`;


  els.syncStatus.textContent =
    text;
}


/* =========================================================
   LOGIN
========================================================= */

async function submitLogin(
  event,
) {

  event.preventDefault();


  const pin =
    els.pinInput.value.trim();


  if (!pin) {

    els.loginError.textContent =
      "សូមបញ្ចូលលេខសម្ងាត់។";

    return;
  }


  els.loginBtn.disabled =
    true;


  els.loginBtn.textContent =
    "កំពុងចូល...";


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


    els.pinInput.value =
      "";


    els.loginError.textContent =
      "";


    showApp();


    /*
     * Try several times because Apps Script
     * may need a moment to wake up.
     */

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


    } else if (
      error.message ===
      "API_URL_NOT_CONFIGURED"
    ) {

      els.loginError.textContent =
        "សូមដាក់ Google Apps Script Web App URL ក្នុង app.js ជាមុនសិន។";


    } else if (
      getToken()
    ) {

      /*
       * Login succeeded but the first
       * data load temporarily failed.
       *
       * Do NOT remove the session.
       */

      showApp();


      setSyncStatus(
        "error",
        "● Server មិនទាន់ឆ្លើយតប — កំពុងព្យាយាមភ្ជាប់ឡើងវិញ",
      );


      startAutoRefresh();


    } else {

      els.loginError.textContent =
        "មិនអាចភ្ជាប់ទៅ Server បានទេ។";
    }


  } finally {

    els.loginBtn.disabled =
      false;


    els.loginBtn.textContent =
      "ចូលប្រើ";
  }
}


/* =========================================================
   RESTORE LOGIN
========================================================= */

async function restoreSession() {

  const token =
    getToken();


  if (!token) {

    showLogin();

    return;
  }


  currentRole =
    localStorage.getItem(
      ROLE_KEY,
    );


  /*
   * Show app immediately.
   * Don't logout just because one network
   * request fails.
   */

  showApp();


  try {

    await loadData({
      retries:
        LOAD_RETRY_COUNT,
    });


    startAutoRefresh();


  } catch (error) {

    console.error(
      "Initial load failed:",
      error,
    );


    /*
     * api() already logs out if the
     * backend actually says UNAUTHORIZED.
     *
     * Network problem?
     * Stay logged in.
     */

    if (!getToken()) {
      return;
    }


    setSyncStatus(
      "error",
      "● Server មិនទាន់ឆ្លើយតប — កំពុងព្យាយាមភ្ជាប់ឡើងវិញ",
    );


    startAutoRefresh();
  }
}


/* =========================================================
   SHOW APP
========================================================= */

function showApp() {

  els.loginScreen.classList.add(
    "hidden",
  );


  els.mainApp.classList.remove(
    "hidden",
  );


  applyRoleUI();
}


/* =========================================================
   SHOW LOGIN
========================================================= */

function showLogin() {

  els.mainApp.classList.add(
    "hidden",
  );


  els.loginScreen.classList.remove(
    "hidden",
  );


  stopAutoRefresh();


  setTimeout(
    () => {

      els.pinInput.focus();

    },
    50,
  );
}


/* =========================================================
   LOGOUT
========================================================= */

function logout(
  clearMessage = true,
) {

  localStorage.removeItem(
    TOKEN_KEY,
  );


  localStorage.removeItem(
    ROLE_KEY,
  );


  currentRole =
    null;


  state = {
    columns: [],
    rows: [],
  };


  if (clearMessage) {

    els.loginError.textContent =
      "";
  }


  showLogin();
}


/* =========================================================
   OWNER / STAFF UI
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
   LOAD GOOGLE SHEET DATA
========================================================= */

async function loadData(
  options = {},
) {

  const {
    quiet = false,
    retries = 3,
  } = options;


  /*
   * Prevent multiple simultaneous
   * refresh requests.
   */

  if (isLoadingData) {
    return null;
  }


  isLoadingData =
    true;


  if (!quiet) {

    setSyncStatus(
      "saving",
      "● កំពុងទាញទិន្នន័យ...",
    );
  }


  let lastError =
    null;


  try {

    for (
      let attempt = 1;
      attempt <= retries;
      attempt++
    ) {

      try {

        const result =
          await api("load");


        /*
         * Validate server response.
         *
         * Never replace good data
         * with malformed/failed data.
         */

        if (
          !Array.isArray(
            result.columns,
          )
        ) {

          throw new Error(
            "INVALID_COLUMNS",
          );
        }


        if (
          !Array.isArray(
            result.rows,
          )
        ) {

          throw new Error(
            "INVALID_ROWS",
          );
        }


        /*
         * Only NOW replace the table data.
         */

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

        lastError =
          error;


        console.warn(
          `Load attempt ${attempt}/${retries} failed:`,
          error,
        );


        /*
         * If actual session expired,
         * api() has already logged out.
         */

        if (!getToken()) {
          throw error;
        }


        if (
          attempt < retries
        ) {

          setSyncStatus(
            "saving",
            `● កំពុងភ្ជាប់ឡើងវិញ... ${attempt}/${retries}`,
          );


          /*
           * Retry delays:
           *
           * 1 = 800 ms
           * 2 = 1600 ms
           * 3 = 2400 ms
           * 4 = 3200 ms
           */

          await sleep(
            800 * attempt,
          );
        }
      }
    }


    /*
     * IMPORTANT:
     *
     * We do NOT set:
     *
     * state.rows = []
     *
     * Existing visible data stays
     * on screen during network failure.
     */

    setSyncStatus(
      "error",
      "● ការភ្ជាប់មានបញ្ហា — ទិន្នន័យចាស់នៅតែរក្សាទុក",
    );


    throw (
      lastError ||
      new Error(
        "LOAD_FAILED",
      )
    );


  } finally {

    isLoadingData =
      false;
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

        /*
         * Don't refresh background tab.
         */

        if (
          document.hidden
        ) {
          return;
        }


        /*
         * Don't refresh while user
         * is typing.
         */

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


        /*
         * Don't reload data while
         * a save is pending.
         */

        if (
          pendingSaves.size > 0
        ) {
          return;
        }


        if (
          isLoadingData
        ) {
          return;
        }


        try {

          await loadData({
            quiet: true,

            retries:
              AUTO_REFRESH_RETRY_COUNT,
          });


        } catch (error) {

          console.warn(
            "Auto refresh failed:",
            error,
          );


          /*
           * Keep current data on screen.
           */

          if (getToken()) {

            setSyncStatus(
              "error",
              "● ការភ្ជាប់មានបញ្ហា — នឹងព្យាយាមម្ដងទៀត",
            );
          }
        }

      },
      AUTO_REFRESH_MS,
    );
}


/* =========================================================
   STOP AUTO REFRESH
========================================================= */

function stopAutoRefresh() {

  if (refreshTimer) {

    clearInterval(
      refreshTimer,
    );


    refreshTimer =
      null;
  }
}


/* =========================================================
   FILTER ROWS
========================================================= */

function filteredRows() {

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

      const searchable =
        state.columns
          .map(
            (column) =>
              String(
                row[column.key] ??
                "",
              ),
          )
          .join(" ")
          .toLowerCase();


      const matchesSearch =
        !query ||
        searchable.includes(
          query,
        );


      const matchesPayment =
        payment === "all" ||
        row.payment === payment;


      const matchesBank =
        bank === "all" ||
        (
          bank === "Other"

            ? row.bank &&
              ![
                "ABA",
                "ACLEDA",
                "Wing",
              ].includes(
                row.bank,
              )

            : row.bank ===
              bank
        );


      return (
        matchesSearch &&
        matchesPayment &&
        matchesBank
      );
    },
  );
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
   DEFAULT COLUMN WIDTH
========================================================= */

function getDefaultColumnWidth(
  column,
) {

  if (
    column.key === "name"
  ) {
    return 240;
  }


  if (
    column.type === "number"
  ) {
    return 140;
  }


  if (
    column.type === "payment"
  ) {
    return 130;
  }


  if (
    column.type === "bank"
  ) {
    return 170;
  }


  return 180;
}


/* =========================================================
   GET COLUMN WIDTH
========================================================= */

function getColumnWidth(
  column,
) {

  const saved =
    Number(
      columnWidths[
        column.key
      ],
    );


  if (
    Number.isFinite(saved) &&
    saved >=
      MIN_COLUMN_WIDTH
  ) {

    return saved;
  }


  return getDefaultColumnWidth(
    column,
  );
}


/* =========================================================
   CREATE COLGROUP
========================================================= */

function renderColgroup() {

  if (!els.colgroup) {
    return;
  }


  els.colgroup.innerHTML =
    "";


  const noCol =
    document.createElement(
      "col",
    );


  noCol.style.width =
    "64px";


  els.colgroup.appendChild(
    noCol,
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
   TABLE HEADER
========================================================= */

function renderHeader() {

  els.header.innerHTML =
    "";


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


        renameButton.title =
          "ប្តូរឈ្មោះ Column";


        renameButton.textContent =
          "✎";


        renameButton.addEventListener(
          "click",
          () => {

            openRenameColumn(
              column.key,
            );
          },
        );


        const deleteButton =
          document.createElement(
            "button",
          );


        deleteButton.type =
          "button";


        deleteButton.className =
          "column-delete";


        deleteButton.title =
          "លុប Column";


        deleteButton.textContent =
          "×";


        deleteButton.addEventListener(
          "click",
          () => {

            removeColumn(
              column.key,
            );
          },
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


      /*
       * COLUMN RESIZE
       */

      const resizeHandle =
        document.createElement(
          "span",
        );


      resizeHandle.className =
        "column-resize-handle";


      resizeHandle.title =
        "Drag to resize column • Double-click to auto fit";


      resizeHandle.addEventListener(
        "pointerdown",
        (event) => {

          startColumnResize(
            event,
            column.key,
          );
        },
      );


      resizeHandle.addEventListener(
        "dblclick",
        (event) => {

          event.preventDefault();


          autoFitColumn(
            column.key,
          );
        },
      );


      th.appendChild(
        resizeHandle,
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
   TABLE BODY
========================================================= */

function renderBody() {

  const rows =
    filteredRows();


  els.body.innerHTML =
    "";


  if (!rows.length) {

    els.body.appendChild(
      els.emptyTemplate
        .content
        .cloneNode(true),
    );


    els.resultInfo.textContent =
      "0 records";


    return;
  }


  rows.forEach(
    (row) => {

      const tr =
        document.createElement(
          "tr",
        );


      tr.dataset.rowId =
        row.id;


      /*
       * SAVED ROW HEIGHT
       */

      const savedHeight =
        Number(
          rowHeights[
            row.id
          ],
        );


      if (
        Number.isFinite(
          savedHeight,
        ) &&
        savedHeight >=
          MIN_ROW_HEIGHT
      ) {

        tr.style.height =
          `${savedHeight}px`;
      }


      /*
       * ROW NUMBER
       */

      const noTd =
        document.createElement(
          "td",
        );


      noTd.className =
        "row-number";


      noTd.textContent =
        state.rows.indexOf(
          row,
        ) + 1;


      /*
       * ROW RESIZE HANDLE
       */

      const rowResizeHandle =
        document.createElement(
          "span",
        );


      rowResizeHandle.className =
        "row-resize-handle";


      rowResizeHandle.title =
        "Drag to resize row • Double-click to reset";


      rowResizeHandle.addEventListener(
        "pointerdown",
        (event) => {

          startRowResize(
            event,
            row.id,
            tr,
          );
        },
      );


      rowResizeHandle.addEventListener(
        "dblclick",
        (event) => {

          event.preventDefault();


          resetRowHeight(
            row.id,
            tr,
          );
        },
      );


      noTd.appendChild(
        rowResizeHandle,
      );


      tr.appendChild(
        noTd,
      );


      /*
       * CELLS
       */

      state.columns.forEach(
        (column) => {

          const td =
            document.createElement(
              "td",
            );


          td.appendChild(
            makeEditor(
              row,
              column,
            ),
          );


          tr.appendChild(
            td,
          );
        },
      );


      /*
       * ACTION CELL
       */

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


        deleteButton.className =
          "delete-row";


        deleteButton.type =
          "button";


        deleteButton.title =
          "លុបភ្ញៀវ";


        deleteButton.textContent =
          "🗑";


        deleteButton.addEventListener(
          "click",
          () => {

            removeRow(
              row.id,
            );
          },
        );


        actionTd.appendChild(
          deleteButton,
        );


      } else {

        actionTd.textContent =
          "—";
      }


      tr.appendChild(
        actionTd,
      );


      els.body.appendChild(
        tr,
      );
    },
  );


  els.resultInfo.textContent =
    `${rows.length} record${
      rows.length === 1
        ? ""
        : "s"
    }`;
}


/* =========================================================
   CREATE CELL EDITOR
========================================================= */

function makeEditor(
  row,
  column,
) {

  let input;


  /*
   * PAYMENT
   */

  if (
    column.type ===
    "payment"
  ) {

    input =
      document.createElement(
        "select",
      );


    input.className =
      "select-cell center-cell";


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
          value || "—";


        input.appendChild(
          option,
        );
      },
    );


    input.value =
      row[column.key] ?? "";


  /*
   * BANK
   */

  } else if (
    column.type ===
    "bank"
  ) {

    input =
      document.createElement(
        "input",
      );


    input.setAttribute(
      "list",
      "bankOptions",
    );


    input.className =
      "cell";


    input.value =
      row[column.key] ?? "";


    ensureBankOptions();


  /*
   * NORMAL CELL
   */

  } else {

    input =
      document.createElement(
        "input",
      );


    input.className =
      "cell";


    input.value =
      row[column.key] ?? "";


    if (
      column.type ===
      "number"
    ) {

      input.type =
        "number";


      input.min =
        "0";


      input.step =
        column.key === "usd"
          ? "0.01"
          : "1";


      input.classList.add(
        "number-cell",
      );


      input.placeholder =
        column.key === "usd"
          ? "0.00"
          : "0";


    } else {

      input.type =
        "text";
    }
  }


  input.dataset.rowId =
    row.id;


  input.dataset.key =
    column.key;


  input.addEventListener(
    "input",
    onCellInput,
  );


  input.addEventListener(
    "change",
    onCellChange,
  );


  input.addEventListener(
    "blur",
    onCellBlur,
  );


  return input;
}


/* =========================================================
   BANK OPTIONS
========================================================= */

function ensureBankOptions() {

  if (
    document.getElementById(
      "bankOptions",
    )
  ) {
    return;
  }


  const dataList =
    document.createElement(
      "datalist",
    );


  dataList.id =
    "bankOptions";


  [
    "ABA",
    "ACLEDA",
    "Wing",
    "Canadia",
    "Sathapana",
    "Prince",
    "Other",
  ].forEach(
    (bank) => {

      const option =
        document.createElement(
          "option",
        );


      option.value =
        bank;


      dataList.appendChild(
        option,
      );
    },
  );


  document.body.appendChild(
    dataList,
  );
}


/* =========================================================
   COLUMN RESIZE
========================================================= */

function setColumnWidth(
  key,
  width,
  persist = true,
) {

  const clamped =
    Math.max(
      MIN_COLUMN_WIDTH,

      Math.min(
        MAX_COLUMN_WIDTH,
        Math.round(width),
      ),
    );


  columnWidths[key] =
    clamped;


  const col =
    els.colgroup?.querySelector(
      `col[data-key="${key}"]`,
    );


  if (col) {

    col.style.width =
      `${clamped}px`;
  }


  if (persist) {

    saveSizeMap(
      COLUMN_WIDTHS_KEY,
      columnWidths,
    );
  }
}


/* =========================================================
   START COLUMN DRAG
========================================================= */

function startColumnResize(
  event,
  key,
) {

  event.preventDefault();

  event.stopPropagation();


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


  const onMove =
    (moveEvent) => {

      setColumnWidth(
        key,

        startWidth +
        (
          moveEvent.clientX -
          startX
        ),

        false,
      );
    };


  const onEnd =
    () => {

      document.removeEventListener(
        "pointermove",
        onMove,
      );


      document.removeEventListener(
        "pointerup",
        onEnd,
      );


      document.body.classList.remove(
        "is-resizing-column",
      );


      saveSizeMap(
        COLUMN_WIDTHS_KEY,
        columnWidths,
      );
    };


  document.addEventListener(
    "pointermove",
    onMove,
  );


  document.addEventListener(
    "pointerup",
    onEnd,
    {
      once: true,
    },
  );
}


/* =========================================================
   MEASURE TEXT
========================================================= */

function measureTextWidth(
  text,
) {

  const canvas =
    measureTextWidth.canvas ||
    (
      measureTextWidth.canvas =
        document.createElement(
          "canvas",
        )
    );


  const context =
    canvas.getContext(
      "2d",
    );


  if (!context) {

    return (
      String(
        text ?? "",
      ).length * 9
    );
  }


  context.font =
    '14px "Noto Sans Khmer", system-ui, sans-serif';


  return context.measureText(
    String(
      text ?? "",
    ),
  ).width;
}


/* =========================================================
   AUTO FIT COLUMN
========================================================= */

function autoFitColumn(
  key,
) {

  const column =
    state.columns.find(
      (item) =>
        item.key === key,
    );


  if (!column) {
    return;
  }


  let widest =
    measureTextWidth(
      column.label,
    ) + 90;


  state.rows.forEach(
    (row) => {

      widest =
        Math.max(
          widest,

          measureTextWidth(
            row[key] ?? "",
          ) + 34,
        );
    },
  );


  setColumnWidth(
    key,
    widest,
  );
}


/* =========================================================
   ROW RESIZE
========================================================= */

function startRowResize(
  event,
  rowId,
  tr,
) {

  event.preventDefault();

  event.stopPropagation();


  const startY =
    event.clientY;


  const startHeight =
    tr
      .getBoundingClientRect()
      .height;


  document.body.classList.add(
    "is-resizing-row",
  );


  const onMove =
    (moveEvent) => {

      const nextHeight =
        Math.max(
          MIN_ROW_HEIGHT,

          Math.min(
            MAX_ROW_HEIGHT,

            Math.round(
              startHeight +
              moveEvent.clientY -
              startY,
            ),
          ),
        );


      tr.style.height =
        `${nextHeight}px`;


      rowHeights[rowId] =
        nextHeight;
    };


  const onEnd =
    () => {

      document.removeEventListener(
        "pointermove",
        onMove,
      );


      document.removeEventListener(
        "pointerup",
        onEnd,
      );


      document.body.classList.remove(
        "is-resizing-row",
      );


      saveSizeMap(
        ROW_HEIGHTS_KEY,
        rowHeights,
      );
    };


  document.addEventListener(
    "pointermove",
    onMove,
  );


  document.addEventListener(
    "pointerup",
    onEnd,
    {
      once: true,
    },
  );
}


/* =========================================================
   RESET ROW HEIGHT
========================================================= */

function resetRowHeight(
  rowId,
  tr,
) {

  delete rowHeights[
    rowId
  ];


  tr.style.height =
    "";


  saveSizeMap(
    ROW_HEIGHTS_KEY,
    rowHeights,
  );
}


/* =========================================================
   UPDATE LOCAL ROW
========================================================= */

function updateLocalRow(
  event,
) {

  const {
    rowId,
    key,
  } =
    event.target.dataset;


  const row =
    state.rows.find(
      (item) =>
        item.id === rowId,
    );


  if (!row) {
    return null;
  }


  row[key] =
    event.target.value;


  renderSummary();


  return {
    row,
    rowId,
    key,
    value:
      event.target.value,
  };
}


/* =========================================================
   CELL INPUT
========================================================= */

function onCellInput(
  event,
) {

  const change =
    updateLocalRow(
      event,
    );


  if (!change) {
    return;
  }


  queueSave(
    change.rowId,
    change.key,
    change.value,
  );
}


/* =========================================================
   CELL CHANGE
========================================================= */

function onCellChange(
  event,
) {

  const change =
    updateLocalRow(
      event,
    );


  if (!change) {
    return;
  }


  queueSave(
    change.rowId,
    change.key,
    change.value,
    true,
  );
}


/* =========================================================
   CELL BLUR
========================================================= */

function onCellBlur(
  event,
) {

  const {
    rowId,
    key,
  } =
    event.target.dataset;


  const timerKey =
    `${rowId}:${key}`;


  if (
    pendingSaves.has(
      timerKey,
    )
  ) {

    clearTimeout(
      pendingSaves.get(
        timerKey,
      ),
    );


    pendingSaves.delete(
      timerKey,
    );


    saveCell(
      rowId,
      key,
      event.target.value,
    );
  }
}


/* =========================================================
   QUEUE SAVE
========================================================= */

function queueSave(
  rowId,
  key,
  value,
  immediate = false,
) {

  const timerKey =
    `${rowId}:${key}`;


  if (
    pendingSaves.has(
      timerKey,
    )
  ) {

    clearTimeout(
      pendingSaves.get(
        timerKey,
      ),
    );
  }


  if (immediate) {

    pendingSaves.delete(
      timerKey,
    );


    saveCell(
      rowId,
      key,
      value,
    );


    return;
  }


  const timer =
    setTimeout(
      () => {

        pendingSaves.delete(
          timerKey,
        );


        saveCell(
          rowId,
          key,
          value,
        );

      },
      AUTO_SAVE_DELAY_MS,
    );


  pendingSaves.set(
    timerKey,
    timer,
  );


  setSyncStatus(
    "saving",
    "● កំពុងរក្សាទុក...",
  );
}


/* =========================================================
   SAVE CELL TO GOOGLE SHEET
========================================================= */

async function saveCell(
  rowId,
  key,
  value,
) {

  /*
   * Save also gets retry protection.
   */

  const retries =
    3;


  let lastError =
    null;


  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {

    try {

      setSyncStatus(
        "saving",
        "● កំពុងរក្សាទុក...",
      );


      await api(
        "updateCell",
        {
          rowId,
          key,
          value,
        },
      );


      setSyncStatus(
        "online",
        "● បានរក្សាទុក",
      );


      return;


    } catch (error) {

      lastError =
        error;


      console.warn(
        `Save attempt ${attempt}/${retries} failed`,
        error,
      );


      if (!getToken()) {
        return;
      }


      if (
        attempt < retries
      ) {

        setSyncStatus(
          "saving",
          "● កំពុងព្យាយាមរក្សាទុកម្ដងទៀត...",
        );


        await sleep(
          700 * attempt,
        );
      }
    }
  }


  console.error(
    "Saving failed:",
    lastError,
  );


  setSyncStatus(
    "error",
    "● រក្សាទុកមិនបាន — សូមពិនិត្យ Internet",
  );
}


/* =========================================================
   SUM COLUMN
========================================================= */

function sumColumn(
  key,
) {

  return state.rows.reduce(
    (
      sum,
      row,
    ) =>
      sum +
      (
        Number(
          row[key],
        ) || 0
      ),

    0,
  );
}


/* =========================================================
   FORMAT KHR
========================================================= */

function formatKHR(
  value,
) {

  const number =
    Number(
      value || 0,
    );


  return (
    "KHR " +
    number.toLocaleString(
      "en-US",
      {
        maximumFractionDigits:
          0,
      },
    )
  );
}


/* =========================================================
   FORMAT USD
========================================================= */

function formatUSD(
  value,
) {

  const number =
    Number(
      value || 0,
    );


  return (
    "$" +
    number.toLocaleString(
      "en-US",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2,
      },
    )
  );
}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  const cash =
    state.rows.filter(
      (row) =>
        row.payment ===
        "Cash",
    ).length;


  const qr =
    state.rows.filter(
      (row) =>
        row.payment ===
        "QR",
    ).length;


  els.totalGuests.textContent =
    state.rows.length;


  els.totalKHR.textContent =
    formatKHR(
      sumColumn("khr"),
    );


  els.totalUSD.textContent =
    formatUSD(
      sumColumn("usd"),
    );


  els.paymentSplit.textContent =
    `${cash} / ${qr}`;


  renderFooter();
}


/* =========================================================
   FOOTER
========================================================= */

function renderFooter() {

  els.footer.innerHTML =
    "";


  const first =
    document.createElement(
      "td",
    );


  first.textContent =
    "សរុប";


  els.footer.appendChild(
    first,
  );


  state.columns.forEach(
    (column) => {

      const td =
        document.createElement(
          "td",
        );


      if (
        column.key === "khr"
      ) {

        td.textContent =
          formatKHR(
            sumColumn("khr"),
          );


        td.style.textAlign =
          "right";


      } else if (
        column.key === "usd"
      ) {

        td.textContent =
          formatUSD(
            sumColumn("usd"),
          );


        td.style.textAlign =
          "right";
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
   ADD ROW
========================================================= */

async function addRow() {

  try {

    setSyncStatus(
      "saving",
      "● កំពុងបន្ថែម...",
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
      "● បានរក្សាទុក",
    );


    requestAnimationFrame(
      () => {

        const firstColumn =
          state.columns[0];


        if (!firstColumn) {
          return;
        }


        const element =
          document.querySelector(
            `[data-row-id="${result.row.id}"][data-key="${firstColumn.key}"]`,
          );


        element?.focus();


        element?.scrollIntoView(
          {
            behavior:
              "smooth",

            block:
              "center",
          },
        );
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
   REMOVE ROW
========================================================= */

async function removeRow(
  id,
) {

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


  if (!row) {
    return;
  }


  const label =
    row.name
      ? `"${row.name}"`
      : "ភ្ញៀវនេះ";


  if (
    !confirm(
      `តើអ្នកពិតជាចង់លុប ${label} មែនទេ?`,
    )
  ) {
    return;
  }


  try {

    await api(
      "deleteRow",
      {
        rowId: id,
      },
    );


    state.rows =
      state.rows.filter(
        (item) =>
          item.id !== id,
      );


    delete rowHeights[
      id
    ];


    saveSizeMap(
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
      "Delete row failed:",
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

async function addColumn(
  name,
) {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const cleaned =
    name.trim();


  if (!cleaned) {
    return;
  }


  try {

    const result =
      await api(
        "addColumn",
        {
          label:
            cleaned,
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
      "Add column failed:",
      error,
    );


    alert(
      "មិនអាចបន្ថែម Column បានទេ។",
    );
  }
}


/* =========================================================
   REMOVE COLUMN
========================================================= */

async function removeColumn(
  key,
) {

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
      `តើអ្នកពិតជាចង់លុប Column "${column.label}" មែនទេ?\n\nទិន្នន័យទាំងអស់ក្នុង Column នេះនឹងត្រូវលុបផងដែរ។`,
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

        delete row[
          key
        ];
      },
    );


    delete columnWidths[
      key
    ];


    saveSizeMap(
      COLUMN_WIDTHS_KEY,
      columnWidths,
    );


    render();


  } catch (error) {

    console.error(
      "Delete column failed:",
      error,
    );


    alert(
      "មិនអាចលុប Column បានទេ។",
    );
  }
}


/* =========================================================
   OPEN RENAME COLUMN
========================================================= */

function openRenameColumn(
  key,
) {

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


  els.renameColumnDialog.showModal();


  setTimeout(
    () => {

      els.renameColumnInput.focus();

      els.renameColumnInput.select();

    },
    50,
  );
}


/* =========================================================
   RENAME COLUMN
========================================================= */

async function renameColumn() {

  if (
    currentRole !==
    "owner"
  ) {
    return;
  }


  const newLabel =
    els.renameColumnInput.value
      .trim();


  if (
    !renameColumnKey ||
    !newLabel
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

          label:
            newLabel,
        },
      );


    state.columns =
      result.columns;


    renameColumnKey =
      null;


    els.renameColumnDialog.close();


    render();


  } catch (error) {

    console.error(
      "Rename column failed:",
      error,
    );


    alert(
      "មិនអាចប្តូរឈ្មោះ Column បានទេ។",
    );
  }
}


/* =========================================================
   CSV
========================================================= */

function csvEscape(
  value,
) {

  const string =
    String(
      value ?? "",
    );


  return `"${string.replaceAll(
    '"',
    '""',
  )}"`;
}


/* =========================================================
   EXPORT CSV
========================================================= */

function exportCSV() {

  const headers = [
    "No.",

    ...state.columns.map(
      (column) =>
        column.label,
    ),
  ];


  const lines = [
    headers
      .map(csvEscape)
      .join(","),
  ];


  state.rows.forEach(
    (
      row,
      index,
    ) => {

      lines.push(
        [
          index + 1,

          ...state.columns.map(
            (column) =>
              row[
                column.key
              ] ?? "",
          ),
        ]
          .map(csvEscape)
          .join(","),
      );
    },
  );


  const blob =
    new Blob(
      [
        "\uFEFF" +
        lines.join("\n"),
      ],

      {
        type:
          "text/csv;charset=utf-8;",
      },
    );


  const url =
    URL.createObjectURL(
      blob,
    );


  const anchor =
    document.createElement(
      "a",
    );


  anchor.href =
    url;


  anchor.download =
    `wedding-guests-${
      new Date()
        .toISOString()
        .slice(0, 10)
    }.csv`;


  anchor.click();


  URL.revokeObjectURL(
    url,
  );
}


/* =========================================================
   RESET ALL DATA
========================================================= */

async function resetData() {

  if (
    currentRole !==
    "owner"
  ) {
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

    const result =
      await api(
        "resetData",
      );


    state.columns =
      result.columns;


    state.rows =
      [];


    render();


    setSyncStatus(
      "online",
      "● បាន Reset",
    );


  } catch (error) {

    console.error(
      "Reset failed:",
      error,
    );


    alert(
      "Reset មិនបាន។",
    );
  }
}


/* =========================================================
   LOGIN SUBMIT
========================================================= */

els.loginForm.addEventListener(
  "submit",
  submitLogin,
);


/* =========================================================
   SHOW / HIDE PIN
========================================================= */

els.togglePinBtn.addEventListener(
  "click",
  () => {

    const isPassword =
      els.pinInput.type ===
      "password";


    els.pinInput.type =
      isPassword
        ? "text"
        : "password";


    els.togglePinBtn.textContent =
      isPassword
        ? "🙈"
        : "👁";
  },
);


/* =========================================================
   LOGOUT EVENT
========================================================= */

els.logoutBtn.addEventListener(
  "click",
  () => {

    logout(true);
  },
);


/* =========================================================
   ADD GUEST BUTTONS
========================================================= */

els.addGuestBtn.addEventListener(
  "click",
  addRow,
);


els.addGuestBottomBtn
  ?.addEventListener(
    "click",
    addRow,
  );


/* =========================================================
   EXPORT / RESET
========================================================= */

els.exportBtn.addEventListener(
  "click",
  exportCSV,
);


els.resetBtn.addEventListener(
  "click",
  resetData,
);


/* =========================================================
   FILTER EVENTS
========================================================= */

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


/* =========================================================
   CLEAR SEARCH
========================================================= */

els.clearSearch.addEventListener(
  "click",
  () => {

    els.searchInput.value =
      "";


    els.searchInput.focus();


    renderBody();
  },
);


/* =========================================================
   OPEN ADD COLUMN DIALOG
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
    () => {

      els.newColumnName.focus();

    },
    50,
  );
}


/* =========================================================
   ADD COLUMN BUTTONS
========================================================= */

els.addColumnBtn.addEventListener(
  "click",
  openAddColumnDialog,
);


els.addColumnBottomBtn
  ?.addEventListener(
    "click",
    openAddColumnDialog,
  );


/* =========================================================
   CONFIRM ADD COLUMN
========================================================= */

els.confirmAddColumn.addEventListener(
  "click",

  async (event) => {

    event.preventDefault();


    const name =
      els.newColumnName.value;


    if (!name.trim()) {
      return;
    }


    await addColumn(
      name,
    );


    els.columnDialog.close();
  },
);


/* =========================================================
   ENTER TO ADD COLUMN
========================================================= */

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


    const name =
      els.newColumnName.value;


    if (!name.trim()) {
      return;
    }


    await addColumn(
      name,
    );


    els.columnDialog.close();
  },
);


/* =========================================================
   CONFIRM RENAME
========================================================= */

els.confirmRenameColumn
  .addEventListener(
    "click",

    async (event) => {

      event.preventDefault();


      await renameColumn();
    },
  );


/* =========================================================
   ENTER TO RENAME
========================================================= */

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
   DEVICE RETURNS TO APP
========================================================= */

document.addEventListener(
  "visibilitychange",

  async () => {

    if (
      document.hidden
    ) {
      return;
    }


    if (!getToken()) {
      return;
    }


    if (
      pendingSaves.size > 0
    ) {
      return;
    }


    try {

      await loadData({
        quiet: true,
        retries: 3,
      });


    } catch (error) {

      console.warn(
        "Reload after returning failed:",
        error,
      );
    }
  },
);


/* =========================================================
   WINDOW GETS FOCUS AGAIN
========================================================= */

window.addEventListener(
  "focus",

  async () => {

    if (!getToken()) {
      return;
    }


    if (
      document.hidden ||
      pendingSaves.size > 0 ||
      isLoadingData
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
        "Focus reload failed:",
        error,
      );
    }
  },
);


/* =========================================================
   INTERNET RETURNS
========================================================= */

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
        "Reconnect failed:",
        error,
      );
    }
  },
);


/* =========================================================
   OFFLINE
========================================================= */

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
