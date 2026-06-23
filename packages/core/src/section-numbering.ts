export interface SectionNumberingOptions {
  enabled: boolean;
  minLevel: number;
  maxLevel: number;
  stripExisting: boolean;
}

export function defaultSectionNumberingOptions(): SectionNumberingOptions {
  return {
    enabled: true,
    minLevel: 2,
    maxLevel: 4,
    stripExisting: true
  };
}

export function computeSectionNumber(
  level: number,
  counters: Record<number, number>,
  options: SectionNumberingOptions
): string {
  if (!options.enabled || level < options.minLevel || level > options.maxLevel) {
    return "";
  }

  counters[level] = (counters[level] || 0) + 1;

  for (let i = level + 1; i <= 6; i += 1) {
    counters[i] = 0;
  }

  const parts: number[] = [];

  for (let i = options.minLevel; i <= level; i += 1) {
    if (!counters[i]) {
      counters[i] = 1;
    }

    parts.push(counters[i]);
  }

  return `${parts.join(".")}.`;
}

export function stripExistingSectionNumber(value: string): string {
  return value.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, "").trim();
}
