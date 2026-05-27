import {
  calculateFatGrams,
  formatCalories,
  formatGrams,
  normalizeCaloriesInput,
  summarizeRecords,
} from './calculations.js';
import {
  enumerateDateKeys,
  getHalfYearRange,
  getMonthRange,
  getRetentionCutoffDateKey,
  getWeekRange,
  toDateKey,
} from './date-utils.js';
import {
  filterRecordsByRange,
  mergeImportedRecords,
  normalizeRecord,
} from './records.js';
import {
  cleanupExpiredRecords,
  getRecord,
  listRecords,
  replaceRecords,
  upsertRecord,
} from './storage.js';
import {
  buildWordBlob,
  readWordFile,
} from './word.js';

const todayKey = toDateKey(new Date());

const state = {
  todayKey,
  activeView: 'recordView',
  rangeType: 'week',
  selectedDate: todayKey,
  customStartDate: todayKey,
  customEndDate: todayKey,
  records: [],
};

function byId(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }

  return element;
}

const dom = {
  recordView: byId('recordView'),
  statsView: byId('statsView'),
  todayLabel: byId('todayLabel'),
  todayCalories: byId('todayCalories'),
  todayFat: byId('todayFat'),
  caloriesInput: byId('caloriesInput'),
  recordForm: byId('recordForm'),
  recordError: byId('recordError'),
  recordSubmit: byId('recordSubmit'),
  storageStatus: byId('storageStatus'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  segments: Array.from(document.querySelectorAll('.segment')),
  selectedDateInput: byId('selectedDateInput'),
  customRange: byId('customRange'),
  startDateInput: byId('startDateInput'),
  endDateInput: byId('endDateInput'),
  rangeTip: byId('rangeTip'),
  summaryCalories: byId('summaryCalories'),
  summaryBodyFat: byId('summaryBodyFat'),
  summaryPureFat: byId('summaryPureFat'),
  rangeLabel: byId('rangeLabel'),
  barChart: byId('barChart'),
  exportButton: byId('exportButton'),
  importInput: byId('importInput'),
  importResult: byId('importResult'),
  recordList: byId('recordList'),
  refreshStatsButton: byId('refreshStatsButton'),
};

function setStatus(text) {
  dom.storageStatus.textContent = text;
}

function setRecordError(text) {
  dom.recordError.textContent = text;
}

function getNormalizedRecords(records = state.records) {
  return records
    .map((record) => normalizeRecord(record))
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function refreshRecords() {
  state.records = (await listRecords())
    .slice()
    .sort((left, right) => String(left?.date ?? '').localeCompare(String(right?.date ?? '')));
}

async function renderToday() {
  const record = normalizeRecord(await getRecord(state.todayKey));
  const calories = record ? record.calories : 0;
  const fatGrams = calculateFatGrams(calories);

  dom.todayCalories.textContent = formatCalories(calories);
  dom.todayFat.textContent = `${formatGrams(fatGrams.bodyFatGrams)}/${formatGrams(fatGrams.pureFatGrams)}`;
  dom.todayFat.setAttribute(
    'aria-label',
    `身体脂肪组织 ${formatGrams(fatGrams.bodyFatGrams)} 克，理论纯脂肪 ${formatGrams(fatGrams.pureFatGrams)} 克`,
  );
  dom.caloriesInput.value = record ? String(record.calories) : '';
  dom.recordSubmit.textContent = record ? '修改今日数据' : '提交今日数据';
}

function getActiveRange() {
  if (state.rangeType === 'week') {
    return getWeekRange(state.selectedDate);
  }

  if (state.rangeType === 'month') {
    return getMonthRange(state.selectedDate);
  }

  if (state.rangeType === 'halfYear') {
    return getHalfYearRange(state.selectedDate);
  }

  const startDate = state.customStartDate <= state.customEndDate
    ? state.customStartDate
    : state.customEndDate;
  const endDate = state.customStartDate <= state.customEndDate
    ? state.customEndDate
    : state.customStartDate;

  return { startDate, endDate };
}

function renderBars(records, startDate, endDate) {
  dom.barChart.replaceChildren();

  if (startDate > endDate) {
    return;
  }

  const recordByDate = new Map(records.map((record) => [record.date, record]));
  const maxCalories = Math.max(1, ...records.map((record) => record.calories));

  for (const dateKey of enumerateDateKeys(startDate, endDate)) {
    const record = recordByDate.get(dateKey);
    const calories = record ? record.calories : 0;
    const height = Math.max(8, Math.round((calories / maxCalories) * 154));
    const bar = document.createElement('div');

    bar.className = 'bar';
    bar.style.height = `${height}px`;
    bar.title = `${dateKey}: ${formatCalories(calories)} kcal`;
    bar.setAttribute('aria-label', bar.title);
    dom.barChart.appendChild(bar);
  }
}

function renderRecordList(records) {
  dom.recordList.replaceChildren();

  if (records.length === 0) {
    const item = document.createElement('li');
    item.textContent = '当前范围暂无记录';
    dom.recordList.appendChild(item);
    return;
  }

  for (const record of records) {
    const item = document.createElement('li');
    const date = document.createElement('span');
    const value = document.createElement('strong');
    const fatGrams = calculateFatGrams(record.calories);

    date.textContent = record.date;
    value.textContent = `${formatCalories(record.calories)} kcal · ${formatGrams(fatGrams.bodyFatGrams)}g`;
    item.append(date, value);
    dom.recordList.appendChild(item);
  }
}

function renderStats() {
  const range = getActiveRange();
  const cutoffDate = getRetentionCutoffDateKey(state.todayKey);
  const effectiveStartDate = range.startDate < cutoffDate ? cutoffDate : range.startDate;
  const hasUsableRange = effectiveStartDate <= range.endDate;
  const records = hasUsableRange
    ? filterRecordsByRange(state.records, effectiveStartDate, range.endDate)
    : [];
  const summary = summarizeRecords(records);

  dom.rangeTip.textContent = range.startDate < cutoffDate
    ? '仅保留最近一年数据，已按可用范围统计。'
    : '';
  dom.summaryCalories.textContent = formatCalories(summary.totalCalories);
  dom.summaryBodyFat.textContent = formatGrams(summary.bodyFatGrams);
  dom.summaryPureFat.textContent = formatGrams(summary.pureFatGrams);
  dom.rangeLabel.textContent = hasUsableRange
    ? `${effectiveStartDate} 至 ${range.endDate}`
    : `${range.startDate} 至 ${range.endDate}`;
  renderBars(records, effectiveStartDate, range.endDate);
  renderRecordList(records);
}

function switchView(targetId) {
  state.activeView = targetId;
  dom.recordView.classList.toggle('view-active', targetId === 'recordView');
  dom.statsView.classList.toggle('view-active', targetId === 'statsView');

  for (const tab of dom.tabs) {
    const isActive = tab.dataset.target === targetId;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  }
}

function setRangeType(rangeType) {
  state.rangeType = rangeType;

  for (const segment of dom.segments) {
    const isActive = segment.dataset.rangeType === rangeType;
    segment.classList.toggle('is-active', isActive);
    segment.setAttribute('aria-pressed', String(isActive));
  }

  dom.customRange.hidden = rangeType !== 'custom';
  renderStats();
}

async function handleRecordSubmit(event) {
  event.preventDefault();

  const calories = normalizeCaloriesInput(dom.caloriesInput.value);

  if (!calories.ok) {
    setRecordError('请输入非负数字大卡');
    return;
  }

  await upsertRecord({
    date: state.todayKey,
    calories: calories.value,
    updatedAt: new Date().toISOString(),
  });
  await cleanupExpiredRecords(state.todayKey);
  await refreshRecords();
  await renderToday();
  renderStats();
  setRecordError('');
  setStatus('已保存');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function handleExport() {
  try {
    downloadBlob(buildWordBlob(getNormalizedRecords()), `calorie-records-${state.todayKey}.doc`);
    dom.importResult.textContent = '已生成 Word 导出文件。';
  } catch (error) {
    console.error(error);
    dom.importResult.textContent = '当前浏览器不支持导出 Word。';
  }
}

async function handleImport(event) {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  try {
    const imported = await readWordFile(file, state.todayKey);
    const merged = mergeImportedRecords(state.records, imported.records);

    await replaceRecords(merged.records);
    await cleanupExpiredRecords(state.todayKey);
    await refreshRecords();
    await renderToday();
    renderStats();
    dom.importResult.textContent = `导入 ${imported.records.length} 条，覆盖 ${merged.overwrittenCount} 条，跳过过期 ${imported.expiredCount} 条，跳过无效 ${imported.invalidCount + merged.skippedConflictCount} 条。`;
    setStatus('已导入');
  } catch (error) {
    console.error(error);
    dom.importResult.textContent = 'Word 文件格式不符合模板，请使用导出的模板重新整理数据。';
  } finally {
    event.target.value = '';
  }
}

function bindEvents() {
  dom.recordForm.addEventListener('submit', (event) => {
    handleRecordSubmit(event).catch((error) => {
      console.error(error);
      setRecordError('保存失败，请稍后重试。');
    });
  });
  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.target));
  });
  dom.segments.forEach((segment) => {
    segment.addEventListener('click', () => setRangeType(segment.dataset.rangeType));
  });
  dom.selectedDateInput.addEventListener('change', () => {
    state.selectedDate = dom.selectedDateInput.value || state.todayKey;
    renderStats();
  });
  dom.startDateInput.addEventListener('change', () => {
    state.customStartDate = dom.startDateInput.value || state.todayKey;
    renderStats();
  });
  dom.endDateInput.addEventListener('change', () => {
    state.customEndDate = dom.endDateInput.value || state.todayKey;
    renderStats();
  });
  dom.refreshStatsButton.addEventListener('click', () => {
    refreshRecords()
      .then(() => renderStats())
      .catch((error) => {
        console.error(error);
        dom.rangeTip.textContent = '刷新统计失败。';
      });
  });
  dom.exportButton.addEventListener('click', () => {
    handleExport();
  });
  dom.importInput.addEventListener('change', (event) => {
    handleImport(event);
  });
}

function registerServiceWorker() {
  if (
    typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && window.location.protocol !== 'file:'
  ) {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  }
}

async function init() {
  dom.todayLabel.textContent = state.todayKey;
  dom.selectedDateInput.value = state.selectedDate;
  dom.startDateInput.value = state.customStartDate;
  dom.endDateInput.value = state.customEndDate;
  bindEvents();
  await cleanupExpiredRecords(state.todayKey);
  await refreshRecords();
  await renderToday();
  renderStats();
  registerServiceWorker();
  setStatus('本地保存');
}

init().catch((error) => {
  console.error(error);
  setStatus('本地存储不可用');
  setRecordError('当前浏览器无法使用 IndexedDB，请换用 Safari、Chrome 或华为浏览器。');
});
