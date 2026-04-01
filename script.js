const form = document.querySelector("#salary-form");
const baseDaysInput = document.querySelector("#base-days");
const baseSalaryInput = document.querySelector("#base-salary");
const startDateInput = document.querySelector("#start-date");
const endDateInput = document.querySelector("#end-date");
const restDaysInput = document.querySelector("#rest-days");
const fillExampleButton = document.querySelector("#fill-example");
const clearFormButton = document.querySelector("#clear-form");
const errorMessage = document.querySelector("#error-message");
const clearHistoryButton = document.querySelector("#clear-history");
const historyList = document.querySelector("#history-list");
const historySummary = document.querySelector("#history-summary");

const totalDaysOutput = document.querySelector("#total-days");
const restCountOutput = document.querySelector("#rest-count");
const workDaysOutput = document.querySelector("#work-days");
const payableSalaryOutput = document.querySelector("#payable-salary");
const dailySalaryOutput = document.querySelector("#daily-salary");
const restListOutput = document.querySelector("#rest-list");
const formulaTextOutput = document.querySelector("#formula-text");

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HISTORY_STORAGE_KEY = "nanny-salary-history-v1";

setDefaultDates();
renderHistory();
registerServiceWorker();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  calculateSalary();
});

fillExampleButton.addEventListener("click", () => {
  baseDaysInput.value = "26";
  baseSalaryInput.value = "7000";
  startDateInput.value = "2026-01-01";
  endDateInput.value = "2026-01-31";
  restDaysInput.value = ["1月10日", "1月11日", "1月12日"].join("\n");
  calculateSalary();
});

clearFormButton.addEventListener("click", () => {
  form.reset();
  setDefaultDates();
  renderEmptyState();
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  renderHistory();
});

historyList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  const recordId = target.dataset.recordId;

  if (!action || !recordId) {
    return;
  }

  if (action === "restore") {
    restoreHistoryRecord(recordId);
  }

  if (action === "delete") {
    deleteHistoryRecord(recordId);
  }
});

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  startDateInput.value = toInputDate(firstDay);
  endDateInput.value = toInputDate(lastDay);
}

function renderEmptyState() {
  errorMessage.hidden = true;
  totalDaysOutput.textContent = "0";
  restCountOutput.textContent = "0";
  workDaysOutput.textContent = "0";
  payableSalaryOutput.textContent = "¥0.00";
  dailySalaryOutput.textContent = "¥0.00";
  restListOutput.textContent = "暂无";
  formulaTextOutput.textContent = "先输入信息，再点击“计算工资”。";
}

function calculateSalary() {
  try {
    const baseDays = Number(baseDaysInput.value);
    const baseSalary = Number(baseSalaryInput.value);
    const periodStart = parseInputDate(startDateInput.value);
    const periodEnd = parseInputDate(endDateInput.value);

    if (!Number.isFinite(baseDays) || baseDays <= 0) {
      throw new Error("基准天数必须大于 0。");
    }

    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      throw new Error("基准工资不能小于 0。");
    }

    if (periodStart > periodEnd) {
      throw new Error("结束日期不能早于开始日期。");
    }

    const totalDays = diffInclusiveDays(periodStart, periodEnd);
    const restDates = parseRestDates(restDaysInput.value, periodStart, periodEnd);
    const workDays = totalDays - restDates.length;
    const dailySalary = baseSalary / baseDays;
    const payableSalary = workDays * dailySalary;

    errorMessage.hidden = true;
    renderResult({
      totalDays,
      restDates,
      workDays,
      dailySalary,
      payableSalary,
      periodStart,
      periodEnd,
    });
    saveHistoryRecord({
      id: String(Date.now()),
      savedAt: new Date().toISOString(),
      baseDays,
      baseSalary,
      startDate: startDateInput.value,
      endDate: endDateInput.value,
      restInput: restDaysInput.value.trim(),
      totalDays,
      restDays: restDates.length,
      workDays,
      dailySalary,
      payableSalary,
    });
  } catch (error) {
    errorMessage.hidden = false;
    errorMessage.textContent = error instanceof Error ? error.message : "计算失败，请检查输入内容。";
  }
}

function renderResult(result) {
  const { totalDays, restDates, workDays, dailySalary, payableSalary, periodStart, periodEnd } = result;
  totalDaysOutput.textContent = String(totalDays);
  restCountOutput.textContent = String(restDates.length);
  workDaysOutput.textContent = String(workDays);
  payableSalaryOutput.textContent = formatCurrency(payableSalary);
  dailySalaryOutput.textContent = `${formatCurrency(dailySalary)} / 天`;
  restListOutput.textContent = restDates.length
    ? restDates.map(formatDisplayDate).join("、")
    : "没有填写休息日期";
  formulaTextOutput.textContent =
    `${formatDisplayDate(periodStart)} 到 ${formatDisplayDate(periodEnd)} 共 ${totalDays} 天，` +
    `休息 ${restDates.length} 天，工作 ${workDays} 天，应付工资 = ${workDays} × ${formatCurrency(dailySalary)} = ${formatCurrency(payableSalary)}`;
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistoryRecord(record) {
  const existing = readHistory();
  const dedupeKey = `${record.startDate}|${record.endDate}|${record.restInput}|${record.baseDays}|${record.baseSalary}|${record.payableSalary}`;
  const previous = existing[0];

  if (previous) {
    const previousKey = `${previous.startDate}|${previous.endDate}|${previous.restInput}|${previous.baseDays}|${previous.baseSalary}|${previous.payableSalary}`;
    if (previousKey === dedupeKey) {
      return;
    }
  }

  const next = [record, ...existing].slice(0, 30);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  renderHistory();
}

function renderHistory() {
  const history = readHistory();
  historySummary.textContent = history.length
    ? `已保存 ${history.length} 条记录，只保存在当前浏览器里。`
    : "每次计算后会自动保存在当前手机或电脑浏览器里。";
  clearHistoryButton.hidden = history.length === 0;

  if (!history.length) {
    historyList.innerHTML = `
      <article class="history-empty">
        还没有保存记录。你计算过一次工资后，这里会自动出现最近的结果。
      </article>
    `;
    return;
  }

  historyList.innerHTML = history
    .map((record) => {
      const savedAt = new Date(record.savedAt);
      const restPreview = record.restInput
        ? escapeHtml(record.restInput).replace(/\n/g, "，")
        : "没有填写休息日期";

      return `
        <article class="history-item">
          <div class="history-top">
            <div class="history-main">
              <h3>${escapeHtml(record.startDate)} 到 ${escapeHtml(record.endDate)}</h3>
              <p>${restPreview}</p>
            </div>
            <div class="history-pay">${formatCurrency(record.payableSalary)}</div>
          </div>
          <div class="history-meta">
            <span>总天数 ${record.totalDays} 天</span>
            <span>休息 ${record.restDays} 天</span>
            <span>工作 ${record.workDays} 天</span>
            <span>保存于 ${formatDateTime(savedAt)}</span>
          </div>
          <div class="history-actions">
            <button type="button" class="secondary" data-action="restore" data-record-id="${record.id}">回填重算</button>
            <button type="button" class="ghost" data-action="delete" data-record-id="${record.id}">删除</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function restoreHistoryRecord(recordId) {
  const record = readHistory().find((item) => item.id === recordId);
  if (!record) {
    return;
  }

  baseDaysInput.value = String(record.baseDays);
  baseSalaryInput.value = String(record.baseSalary);
  startDateInput.value = record.startDate;
  endDateInput.value = record.endDate;
  restDaysInput.value = record.restInput;
  calculateSalary();
}

function deleteHistoryRecord(recordId) {
  const next = readHistory().filter((item) => item.id !== recordId);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  renderHistory();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Ignore registration failures so the calculator still works normally.
    });
  });
}

function parseRestDates(rawValue, periodStart, periodEnd) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return [];
  }

  const uniqueDates = new Set();
  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  let lastParsedMonth = null;

  for (const line of lines) {
    const range = splitRange(line);

    if (range) {
      const rangeStart = parseFlexibleDate(range[0], periodStart, periodEnd, {
        fallbackMonth: lastParsedMonth,
      });
      const rangeEnd = parseFlexibleDate(range[1], periodStart, periodEnd, {
        fallbackMonth: rangeStart.getMonth() + 1,
      });

      if (rangeStart > rangeEnd) {
        throw new Error(`休息区间“${line}”的结束日期不能早于开始日期。`);
      }

      let cursor = rangeStart;
      while (cursor <= rangeEnd) {
        validateDateInPeriod(cursor, periodStart, periodEnd, line);
        uniqueDates.add(toInputDate(cursor));
        cursor = addDays(cursor, 1);
      }
      lastParsedMonth = rangeEnd.getMonth() + 1;
      continue;
    }

    const candidates = line
      .split(/[，,、；;\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const date = parseFlexibleDate(candidate, periodStart, periodEnd, {
        fallbackMonth: lastParsedMonth,
      });
      validateDateInPeriod(date, periodStart, periodEnd, candidate);
      uniqueDates.add(toInputDate(date));
      lastParsedMonth = date.getMonth() + 1;
    }
  }

  return Array.from(uniqueDates)
    .sort()
    .map(parseInputDate);
}

function splitRange(line) {
  const matched = line.match(/^(.*?)\s*(?:~|～|至|to)\s*(.*?)$/i);
  if (!matched) {
    return null;
  }
  return [matched[1].trim(), matched[2].trim()];
}

function parseFlexibleDate(rawValue, periodStart, periodEnd, options = {}) {
  const value = normalizeDateText(rawValue);
  const { fallbackMonth = null } = options;

  const yearMonthDayMatch = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yearMonthDayMatch) {
    return buildDate(
      Number(yearMonthDayMatch[1]),
      Number(yearMonthDayMatch[2]),
      Number(yearMonthDayMatch[3]),
      rawValue
    );
  }

  const monthDayMatch = value.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (monthDayMatch) {
    const month = Number(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    const yearsToTry = periodStart.getFullYear() === periodEnd.getFullYear()
      ? [periodStart.getFullYear()]
      : [periodStart.getFullYear(), periodEnd.getFullYear()];

    for (const year of yearsToTry) {
      const candidate = buildDate(year, month, day, rawValue);
      if (candidate >= periodStart && candidate <= periodEnd) {
        return candidate;
      }
    }

    return buildDate(periodStart.getFullYear(), month, day, rawValue);
  }

  const dayOnlyMatch = value.match(/^(\d{1,2})$/);
  if (dayOnlyMatch && fallbackMonth) {
    return parseFlexibleDate(
      `${fallbackMonth}-${dayOnlyMatch[1]}`,
      periodStart,
      periodEnd,
      options
    );
  }

  throw new Error(`无法识别休息日期“${rawValue}”。请使用“2026-01-10”或“1月10日”的写法。`);
}

function normalizeDateText(value) {
  return value
    .trim()
    .replace(/[.]/g, "-")
    .replace(/\//g, "-")
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/[日号]/g, "")
    .replace(/\s+/g, "");
}

function buildDate(year, month, day, originalValue) {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`日期“${originalValue}”无效，请重新检查。`);
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function validateDateInPeriod(date, periodStart, periodEnd, originalValue) {
  if (date < periodStart || date > periodEnd) {
    throw new Error(`休息日期“${originalValue}”不在结算区间内。`);
  }
}

function parseInputDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return buildDate(year, month, day, value);
}

function diffInclusiveDays(startDate, endDate) {
  return Math.floor((endDate - startDate) / DAY_IN_MS) + 1;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
