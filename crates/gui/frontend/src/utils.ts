// Helper utilities for the frontend application

export type ArgKey =
  | { type: 'positional'; index: number }
  | { type: 'flag'; key: string }
  | { type: 'named'; key: string }
  | { type: 'config'; switch: string; subkey: string };

export type ArgValue =
  | { type: 'none' }
  | { type: 'single'; value: string }
  | { type: 'config'; value: string };

export interface ParsedArg {
  key: ArgKey;
  value: ArgValue;
  originalSwitch?: string;
}

function parseArgs(args: string[]): ParsedArg[] {
  const parsed: ParsedArg[] = [];
  let positionalCount = 0;
  let i = 0;
  while (i < args.length) {
    const item = args[i];
    if (!item) {
      i++;
      continue;
    }
    if ((item === '-c' || item === '--config') && i + 1 < args.length && args[i + 1].includes('=')) {
      const valStr = args[i + 1];
      const eqIdx = valStr.indexOf('=');
      const subkey = valStr.substring(0, eqIdx);
      const val = valStr.substring(eqIdx + 1);
      parsed.push({
        key: { type: 'config', switch: item, subkey },
        value: { type: 'config', value: val }
      });
      i += 2;
    } else if (item.startsWith('-') && item.includes('=')) {
      const eqIdx = item.indexOf('=');
      const key = item.substring(0, eqIdx);
      const val = item.substring(eqIdx + 1);
      parsed.push({
        key: { type: 'named', key },
        value: { type: 'single', value: val },
        originalSwitch: '='
      });
      i += 1;
    } else if (item.startsWith('-')) {
      // Check if next item exists and is a value (does not start with -)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed.push({
          key: { type: 'named', key: item },
          value: { type: 'single', value: args[i + 1] }
        });
        i += 2;
      } else {
        parsed.push({
          key: { type: 'flag', key: item },
          value: { type: 'none' }
        });
        i += 1;
      }
    } else {
      parsed.push({
        key: { type: 'positional', index: positionalCount++ },
        value: { type: 'single', value: item }
      });
      i += 1;
    }
  }
  return parsed;
}

function getArgKeyStr(key: ArgKey): string {
  switch (key.type) {
    case 'positional': return `pos:${key.index}`;
    case 'flag': return `flag:${key.key}`;
    case 'named': return `named:${key.key}`;
    case 'config': return `config:${key.switch}:${key.subkey}`;
  }
}

/**
 * Merges base CLI arguments and override arguments.
 * Override arguments take priority when keys match.
 */
export function mergeCliArgs(baseArgs: string[], overrideArgs: string[]): string[] {
  const baseParsed = parseArgs(baseArgs);
  const overrideParsed = parseArgs(overrideArgs);

  const mergedMap = new Map<string, ParsedArg>();
  const order: string[] = [];

  for (const arg of baseParsed) {
    const keyStr = getArgKeyStr(arg.key);
    mergedMap.set(keyStr, arg);
    order.push(keyStr);
  }

  for (const arg of overrideParsed) {
    const keyStr = getArgKeyStr(arg.key);
    if (mergedMap.has(keyStr)) {
      const existing = mergedMap.get(keyStr)!;
      existing.value = arg.value;
      if (arg.originalSwitch) {
        existing.originalSwitch = arg.originalSwitch;
      }
    } else {
      mergedMap.set(keyStr, arg);
      order.push(keyStr);
    }
  }

  const result: string[] = [];
  for (const keyStr of order) {
    const arg = mergedMap.get(keyStr)!;
    switch (arg.key.type) {
      case 'positional':
        if (arg.value.type === 'single') result.push(arg.value.value);
        break;
      case 'flag':
        result.push(arg.key.key);
        break;
      case 'named':
        if (arg.value.type === 'single') {
          if (arg.originalSwitch === '=') {
            result.push(`${arg.key.key}=${arg.value.value}`);
          } else {
            result.push(arg.key.key);
            result.push(arg.value.value);
          }
        }
        break;
      case 'config':
        if (arg.value.type === 'config') {
          result.push(arg.key.switch);
          result.push(`${arg.key.subkey}=${arg.value.value}`);
        }
        break;
    }
  }
  return result;
}

export interface CollapsedBorderInfo {
  borderTop: string;
  borderRight: string;
  borderBottom: string;
  borderLeft: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomLeftRadius: string;
  borderBottomRightRadius: string;
}

export function computeCollapsedBorders(
  slotLetter: string,
  areasStr: string,
  activeSlots: ({ id: string } | null)[],
  color: string,
): CollapsedBorderInfo {
  const matrix = areasStr
    .split('"')
    .map(s => s.trim())
    .filter(Boolean)
    .map(row => row.split(/\s+/).filter(Boolean));

  const totalRows = matrix.length;
  const totalCols = totalRows > 0 ? matrix[0].length : 0;
  const solid = `2px solid ${color}`;

  if (totalRows === 0 || totalCols === 0) {
    return {
      borderTop: solid,
      borderRight: solid,
      borderBottom: solid,
      borderLeft: solid,
      borderTopLeftRadius: '4px',
      borderTopRightRadius: '4px',
      borderBottomLeftRadius: '4px',
      borderBottomRightRadius: '4px',
    };
  }

  let minR = totalRows;
  let maxR = -1;
  let minC = totalCols;
  let maxC = -1;

  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      if (matrix[r][c] === slotLetter) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }

  let hasTopNeighbor = minR > 0;
  if (minR > 0) {
    for (let c = minC; c <= maxC; c++) {
      const topLetter = matrix[minR - 1][c];
      const topSlotIdx = topLetter.charCodeAt(0) - 97;
      if (topSlotIdx < 0 || topSlotIdx >= activeSlots.length || activeSlots[topSlotIdx] === null) {
        hasTopNeighbor = false;
        break;
      }
    }
  }

  let hasLeftNeighbor = minC > 0;
  if (minC > 0) {
    for (let r = minR; r <= maxR; r++) {
      const leftLetter = matrix[r][minC - 1];
      const leftSlotIdx = leftLetter.charCodeAt(0) - 97;
      if (leftSlotIdx < 0 || leftSlotIdx >= activeSlots.length || activeSlots[leftSlotIdx] === null) {
        hasLeftNeighbor = false;
        break;
      }
    }
  }

  const isTopLeft = minR === 0 && minC === 0;
  const isTopRight = minR === 0 && maxC === totalCols - 1;
  const isBottomLeft = maxR === totalRows - 1 && minC === 0;
  const isBottomRight = maxR === totalRows - 1 && maxC === totalCols - 1;

  return {
    borderTop: hasTopNeighbor ? '0px' : solid,
    borderLeft: hasLeftNeighbor ? '0px' : solid,
    borderRight: solid,
    borderBottom: solid,
    borderTopLeftRadius: isTopLeft ? '4px' : '0px',
    borderTopRightRadius: isTopRight ? '4px' : '0px',
    borderBottomLeftRadius: isBottomLeft ? '4px' : '0px',
    borderBottomRightRadius: isBottomRight ? '4px' : '0px',
  };
}
