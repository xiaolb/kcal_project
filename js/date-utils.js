/**
 * 把月份和日期补齐为两位数字。
 */
export function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * 获取指定年月的自然天数。
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 按月回退，并在目标月份天数不足时夹到月末。
 */
function subtractMonthsClamped(dateKey, months) {
  const date = parseDateKey(dateKey);
  const targetMonthIndex = date.getFullYear() * 12 + date.getMonth() - months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12 + 1;
  const targetDate = Math.min(date.getDate(), getDaysInMonth(targetYear, targetMonth));

  return toDateKey(new Date(targetYear, targetMonth - 1, targetDate));
}

/**
 * 按年回退，并在闰日等日期不存在时夹到月末。
 */
function subtractYearsClamped(dateKey, years) {
  const date = parseDateKey(dateKey);
  const targetYear = date.getFullYear() - years;
  const targetMonth = date.getMonth() + 1;
  const targetDate = Math.min(date.getDate(), getDaysInMonth(targetYear, targetMonth));

  return toDateKey(new Date(targetYear, targetMonth - 1, targetDate));
}

/**
 * 解析 YYYY-MM-DD 日期键，返回本地时区 Date。
 */
export function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string') {
    throw new Error('日期格式必须是 YYYY-MM-DD。');
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!match) {
    throw new Error(`无效日期：${dateKey}`);
  }

  const [, yearText, monthText, dateText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dateText);

  if (year < 1000 || month < 1 || month > 12 || date < 1 || date > getDaysInMonth(year, month)) {
    throw new Error(`无效日期：${dateKey}`);
  }

  return new Date(year, month - 1, date);
}

/**
 * 将 Date 转成 YYYY-MM-DD 日期键。
 */
export function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('日期对象无效。');
  }

  const year = date.getFullYear();

  if (year < 1000 || year > 9999) {
    throw new Error('日期年份必须是 1000 到 9999。');
  }

  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 在日期键上增加或减少指定天数。
 */
export function addDays(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/**
 * 计算所选日期所在自然周的周一到周日范围。
 */
export function getWeekRange(dateKey) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const startDate = addDays(dateKey, -daysFromMonday);

  return {
    startDate,
    endDate: addDays(startDate, 6),
  };
}

/**
 * 计算所选日期所在自然月的起止日期。
 */
export function getMonthRange(dateKey) {
  const date = parseDateKey(dateKey);
  const year = date.getFullYear();
  const month = date.getMonth();

  return {
    startDate: toDateKey(new Date(year, month, 1)),
    endDate: toDateKey(new Date(year, month + 1, 0)),
  };
}

/**
 * 计算以所选日期为结束日、向前六个月的范围。
 */
export function getHalfYearRange(dateKey) {
  return {
    startDate: subtractMonthsClamped(dateKey, 6),
    endDate: dateKey,
  };
}

/**
 * 计算一年数据保留策略的最早可保留日期。
 */
export function getRetentionCutoffDateKey(todayKey = toDateKey(new Date())) {
  return subtractYearsClamped(todayKey, 1);
}

/**
 * 判断日期键是否落在闭区间范围内。
 */
export function isDateKeyInRange(dateKey, startDate, endDate) {
  parseDateKey(dateKey);
  parseDateKey(startDate);
  parseDateKey(endDate);

  if (startDate > endDate) {
    throw new Error('日期范围无效：开始日期不能晚于结束日期。');
  }

  return dateKey >= startDate && dateKey <= endDate;
}

/**
 * 枚举闭区间内的所有日期键。
 */
export function enumerateDateKeys(startDate, endDate) {
  parseDateKey(startDate);
  parseDateKey(endDate);

  if (startDate > endDate) {
    throw new Error('日期范围无效：开始日期不能晚于结束日期。');
  }

  const dates = [];

  for (let dateKey = startDate; dateKey <= endDate; dateKey = addDays(dateKey, 1)) {
    dates.push(dateKey);
  }

  return dates;
}
