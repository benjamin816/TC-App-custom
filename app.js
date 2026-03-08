const STAGES = [
  { key: "InitialUC", label: "Initial UC" },
  { key: "DueDiligencePeriod", label: "Due Diligence Period" },
  { key: "PostDD", label: "Post DD" },
  { key: "ClearToClose", label: "Clear to Close" },
  { key: "Closed", label: "Closed" },
];

const CONFIG_STORAGE_KEY = "tc_board_config_v1";
const DEFAULT_CONFIG = {
  appsScriptUrl:
    "https://script.google.com/macros/s/AKfycbwhG2Hc5i_QfiFjmOUWPlhkvccGMnqxgZJMVtzPuOCwHBYyWMYYcLiiKTQO6aBE2VVk7Q/exec",
  apiKey: "",
};

let config = loadConfig();
let transactions = [];
let draggedId = null;

const boardEl = document.getElementById("board");
const columnTemplate = document.getElementById("columnTemplate");
const cardTemplate = document.getElementById("cardTemplate");
const cardDialog = document.getElementById("cardDialog");
const cardForm = document.getElementById("cardForm");
const statusSelect = document.getElementById("statusSelect");
const settingsDialog = document.getElementById("settingsDialog");
const settingsForm = document.getElementById("settingsForm");
const appsScriptUrlInput = document.getElementById("appsScriptUrl");
const appsScriptKeyInput = document.getElementById("appsScriptKey");

function loadConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
    return {
      appsScriptUrl: parsed.appsScriptUrl || DEFAULT_CONFIG.appsScriptUrl,
      apiKey: parsed.apiKey || DEFAULT_CONFIG.apiKey,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(nextConfig) {
  config = nextConfig;
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function normalizeStatus(status) {
  switch (status) {
    case "InitialUC":
    case "DueDiligencePeriod":
    case "PostDD":
    case "ClearToClose":
    case "Closed":
      return status;
    case "DepositsPending":
      return "InitialUC";
    case "DueDiligence":
      return "DueDiligencePeriod";
    case "BuilderActive":
    case "Financing":
      return "PostDD";
    default:
      return "InitialUC";
  }
}

function formatMoney(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? `$${num.toLocaleString()}` : "$0";
}

function stageLabel(key) {
  return STAGES.find((s) => s.key === key)?.label || key;
}

function setStatusOptions(selected = "InitialUC") {
  statusSelect.innerHTML = "";
  for (const stage of STAGES) {
    const opt = document.createElement("option");
    opt.value = stage.key;
    opt.textContent = stage.label;
    if (stage.key === selected) opt.selected = true;
    statusSelect.appendChild(opt);
  }
}

function getDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function createTasks(transactionId, txType, effectiveDate) {
  const commonTasks = [
    { name: "Upload Contract to Drive", owner: "TC" },
    { name: "Send Intro Emails", owner: "TC" },
    { name: "Verify EM Receipt", owner: "TC" },
    { name: "Submit to Compliance", owner: "TC" },
  ];
  const resaleTasks = [
    { name: "Order Inspection", owner: "Admin" },
    { name: "Review DD Deadline", owner: "TC" },
    { name: "Schedule Closing", owner: "TC" },
  ];
  const newConstTasks = [
    { name: "Verify Builder Deposit", owner: "TC" },
    { name: "Schedule Framing Walk", owner: "Admin" },
    { name: "Schedule Final Walk", owner: "Admin" },
  ];
  const selected = txType === "Resale" ? resaleTasks : newConstTasks;
  return [...commonTasks, ...selected].map((task) => ({
    TaskID: crypto.randomUUID(),
    TransactionID: transactionId,
    TaskName: task.name,
    Owner: task.owner,
    DueDate: effectiveDate,
    Status: "NotStarted",
    Notes: "",
    Link: "",
  }));
}

function createCalendarEvents(tx) {
  const events = [
    {
      EventID: crypto.randomUUID(),
      TransactionID: tx.TransactionID,
      EventType: "Effective",
      EventDate: tx.EffectiveDate,
      Title: `Effective: ${tx.Address}`,
      Link: "#",
    },
    {
      EventID: crypto.randomUUID(),
      TransactionID: tx.TransactionID,
      EventType: "Closing",
      EventDate: tx.ClosingDate,
      Title: `Closing: ${tx.Address}`,
      Link: "#",
    },
  ];
  if (tx.TransactionType === "Resale" && tx.DDDeadlineDate) {
    events.push({
      EventID: crypto.randomUUID(),
      TransactionID: tx.TransactionID,
      EventType: "DDDeadline",
      EventDate: tx.DDDeadlineDate,
      Title: `DD Deadline: ${tx.Address}`,
      Link: "#",
    });
  }
  return events;
}

async function apiRequest(action, payload = {}, method = "POST") {
  if (!config.appsScriptUrl) {
    throw new Error("Apps Script URL is missing. Open Settings and set it.");
  }

  const headers = {};
  if (config.apiKey) headers["x-api-key"] = config.apiKey;

  let response;
  const url = new URL(config.appsScriptUrl);
  if (method === "GET") {
    url.searchParams.set("action", action);
    if (config.apiKey) url.searchParams.set("key", config.apiKey);
    response = await fetch(url.toString(), { method: "GET", headers });
  } else {
    headers["content-type"] = "application/json";
    response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ action, key: config.apiKey || "", ...payload }),
    });
  }

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.error || "Apps Script returned an error");
  }
  return json.data;
}

function renderBoard() {
  boardEl.innerHTML = "";

  for (const stage of STAGES) {
    const colNode = columnTemplate.content.firstElementChild.cloneNode(true);
    colNode.dataset.status = stage.key;
    colNode.querySelector("h3").textContent = stage.label;

    colNode.addEventListener("dragover", (e) => {
      e.preventDefault();
      colNode.classList.add("over");
    });
    colNode.addEventListener("dragleave", () => {
      colNode.classList.remove("over");
    });
    colNode.addEventListener("drop", async (e) => {
      e.preventDefault();
      colNode.classList.remove("over");
      if (!draggedId) return;
      await moveCard(draggedId, stage.key);
      draggedId = null;
    });

    const cardsEl = colNode.querySelector(".cards");
    const cards = transactions.filter((t) => normalizeStatus(t.Status) === stage.key);
    colNode.querySelector(".count").textContent = String(cards.length);

    for (const tx of cards) {
      const card = cardTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.id = tx.TransactionID;
      card.addEventListener("dragstart", () => {
        draggedId = tx.TransactionID;
      });
      card.addEventListener("dragend", () => {
        draggedId = null;
      });

      const tag = card.querySelector(".tag");
      const isResale = tx.TransactionType === "Resale";
      tag.textContent = tx.TransactionType || "Transaction";
      tag.classList.add(isResale ? "resale" : "new");
      card.querySelector("h4").textContent = tx.Address || "No address";
      card.querySelector(".client").textContent = tx.ClientNames || "No client";
      card.querySelector(".close-date").textContent = tx.ClosingDate || "No close date";
      card.querySelector(".price").textContent = formatMoney(tx.PurchasePrice);

      cardsEl.appendChild(card);
    }

    colNode.querySelector(".add-card").addEventListener("click", () => {
      openNewCardDialog(stage.key);
    });

    boardEl.appendChild(colNode);
  }
}

async function moveCard(transactionId, nextStatus) {
  const current = transactions.find((t) => t.TransactionID === transactionId);
  if (!current) return;
  const previous = current.Status;
  current.Status = nextStatus;
  renderBoard();

  try {
    await apiRequest("updateTransactionStatus", {
      transactionId,
      TransactionID: transactionId,
      status: nextStatus,
      Status: nextStatus,
    });
  } catch (err) {
    current.Status = previous;
    renderBoard();
    alert(`Could not move card: ${err.message}`);
  }
}

async function loadTransactions() {
  try {
    transactions = await apiRequest("getTransactions", {}, "GET");
    renderBoard();
  } catch (err) {
    alert(`Failed to load transactions: ${err.message}`);
  }
}

function openNewCardDialog(defaultStatus = "InitialUC") {
  setStatusOptions(defaultStatus);
  const today = getDateToday();
  cardForm.EffectiveDate.value = today;
  cardForm.ClosingDate.value = today;
  cardDialog.showModal();
}

async function submitNewCard(formEvent) {
  formEvent.preventDefault();
  const formData = new FormData(cardForm);
  const txType = formData.get("TransactionType");
  const txId = crypto.randomUUID();

  const transaction = {
    TransactionID: txId,
    ClientNames: String(formData.get("ClientNames") || ""),
    Address: String(formData.get("Address") || ""),
    TransactionType: txType,
    Status: String(formData.get("Status") || "InitialUC"),
    EffectiveDate: String(formData.get("EffectiveDate") || ""),
    DDDeadlineDate: String(formData.get("DDDeadlineDate") || ""),
    ClosingDate: String(formData.get("ClosingDate") || ""),
    PurchasePrice: String(formData.get("PurchasePrice") || "0"),
    DDAmount: String(formData.get("DDAmount") || "0"),
    DDReceived: "No",
    EMAmount: String(formData.get("EMAmount") || "0"),
    EMReceived: "No",
    EMHolder: "",
    EMReceiptLink: "",
    BuilderDepositAmount: String(formData.get("BuilderDepositAmount") || "0"),
    BuilderDepositPaid: "No",
    DriveFolderLink: "",
    eXpComplianceLink: "",
    AssignedTo: String(formData.get("AssignedTo") || "TC"),
    Notes: String(formData.get("Notes") || ""),
  };

  if (!transaction.ClientNames || !transaction.Address || !transaction.EffectiveDate || !transaction.ClosingDate) {
    alert("Please complete required fields.");
    return;
  }
  if (txType === "Resale" && !transaction.DDDeadlineDate) {
    alert("DD Deadline is required for Resale.");
    return;
  }

  const tasks = createTasks(txId, txType, transaction.EffectiveDate);
  const events = createCalendarEvents(transaction);

  try {
    await apiRequest("addTransaction", { transaction });
    await Promise.all([
      apiRequest("addTasks", { tasks }),
      apiRequest("addCalendarEvents", { events }),
    ]);
    transactions.push(transaction);
    renderBoard();
    cardDialog.close();
    cardForm.reset();
  } catch (err) {
    alert(`Failed to create card: ${err.message}`);
  }
}

function openSettings() {
  appsScriptUrlInput.value = config.appsScriptUrl || "";
  appsScriptKeyInput.value = config.apiKey || "";
  settingsDialog.showModal();
}

function submitSettings(event) {
  event.preventDefault();
  const nextConfig = {
    appsScriptUrl: appsScriptUrlInput.value.trim(),
    apiKey: appsScriptKeyInput.value.trim(),
  };
  saveConfig(nextConfig);
  settingsDialog.close();
  loadTransactions();
}

document.getElementById("newCardBtn").addEventListener("click", () => openNewCardDialog());
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("cancelCardBtn").addEventListener("click", () => cardDialog.close());
document.getElementById("cancelSettingsBtn").addEventListener("click", () => settingsDialog.close());
cardForm.addEventListener("submit", submitNewCard);
settingsForm.addEventListener("submit", submitSettings);

loadTransactions();
