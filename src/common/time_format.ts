/**
 * 将秒数转换为视频常用的时间格式
 * 例如: 65      -> "01:05"
 *       3661    -> "01:01:01"
 *       3661.5  -> "01:01:01.500"
 */

export interface FormatOptions {
  /** 是否显示小时位。'auto' 表示超过 1 小时才显示。默认 'auto' */
  showHours?: boolean | 'auto';
  /** 是否显示毫秒。默认 false */
  showMilliseconds?: boolean;
  /** 毫秒分隔符，'.' 或 ','。默认 '.' */
  millisecondSeparator?: '.' | ',';
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

export function formatDuration(
  seconds: number,
  options: FormatOptions = {}
): string {
  const {
    showHours = 'auto',
    showMilliseconds = false,
    millisecondSeparator = '.',
  } = options;

  if (!Number.isFinite(seconds)) {
    throw new TypeError(`formatDuration 需要一个有限数字，收到: ${seconds}`);
  }

  const negative = seconds < 0;
  const abs = Math.abs(seconds);

  // 关键: 先换算成整数毫秒，避免浮点误差在分段取余时累积
  const totalMs = Math.round(abs * 1000);

  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const shouldShowHours = showHours === true || (showHours === 'auto' && h > 0);

  const parts: string[] = [];
  if (shouldShowHours) parts.push(pad(h));
  parts.push(pad(m), pad(s));

  let result = parts.join(':');
  if (showMilliseconds) {
    result += `${millisecondSeparator}${pad(ms, 3)}`;
  }

  return negative ? `-${result}` : result;
}

/**
 * SRT 字幕时间格式: HH:MM:SS,mmm
 * 例如 3661.5 -> "01:01:01,500"
 */
export function formatSRTTime(seconds: number): string {
  // SRT 时间不支持负数，负值按 0 处理
  const safe = Math.max(0, seconds);
  return formatDuration(safe, {
    showHours: true,
    showMilliseconds: true,
    millisecondSeparator: ',',
  });
}