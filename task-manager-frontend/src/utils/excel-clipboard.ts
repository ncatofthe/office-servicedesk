export type ExcelClipboardLayout = 'original' | 'column' | 'row';

const normalizeLineEndings = (value: string) => value.replace(/\r\n?/g, '\n');

const getNonEmptyCells = (value: string) => normalizeLineEndings(value)
  .split('\n')
  .flatMap((line) => line.split('\t'))
  .map((cell) => cell.trim())
  .filter(Boolean);

export const formatTicketDescriptionForExcel = (
  value: string,
  layout: ExcelClipboardLayout
): string => {
  const normalized = normalizeLineEndings(value);

  if (layout === 'original') {
    return normalized.replace(/\n/g, '\r\n');
  }

  const cells = getNonEmptyCells(normalized);
  return layout === 'column' ? cells.join('\r\n') : cells.join('\t');
};
