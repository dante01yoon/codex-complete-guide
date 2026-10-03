import { readFile } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { createHash } from 'node:crypto';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';

export type Library = { id: string; fields: Record<string, string>; bookCount: number | null };

export function decodeCsv(bytes: Buffer): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    const text = iconv.decode(bytes, 'cp949');
    // Reject lossy decoding instead of silently corrupting Korean names.
    if (!iconv.encode(text, 'cp949').equals(bytes)) throw new Error('CSV는 UTF-8 또는 올바른 CP949 파일이어야 합니다.');
    return { text, encoding: 'CP949' };
  }
}

export function bookCount(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isSafeInteger(n) ? n : null;
}

export async function loadLibraries(path: string) {
  const { text, encoding } = decodeCsv(await readFile(path));
  const required = ['도서관명', '시도명', '시군구명', '자료수(도서)'];
  const rows: Record<string, string>[] = parse(text, {
    bom: true, skip_empty_lines: true,
    columns: (headers: string[]) => {
      const trimmed = headers.map(h => h.trim());
      if (required.some(h => !trimmed.includes(h))) throw new Error('CSV 필수 열이 누락되었습니다.');
      return trimmed;
    }
  });
  if (!rows.length) throw new Error('CSV에 도서관 데이터가 없습니다.');
  const occurrences = new Map<string, number>();
  const libraries = rows.map(row => {
    const fields = Object.fromEntries(Object.entries(row)
      .filter(([key]) => !/전화|팩스|phone|tel|fax/i.test(key))
      .map(([key, value]) => [key, value.trim()]));
    // Content-based identifiers survive row reordering; identical records get suffixes.
    const hash = createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 24);
    const count = (occurrences.get(hash) ?? 0) + 1;
    occurrences.set(hash, count);
    return { id: `lib-${hash}-${count}`, fields, bookCount: bookCount(fields['자료수(도서)']) };
  });
  return { libraries, encoding };
}

const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');
const includes = (value: string, query?: string) => !query || normalize(value).includes(normalize(query));

export function searchLibraries(libraries: Library[], args: {
  sido?: string; sigungu?: string; keyword?: string; limit?: number; offset?: number;
}) {
  const { sido, sigungu, keyword, limit = 20, offset = 0 } = args;
  const matched = libraries.filter(l => includes(l.fields['시도명'], sido)
    && includes(l.fields['시군구명'], sigungu)
    && includes(['도서관명', '소재지도로명주소', '운영기관명', '도서관유형'].map(k => l.fields[k] ?? '').join(' '), keyword));
  return {
    total: matched.length, offset, limit,
    nextOffset: offset + limit < matched.length ? offset + limit : null,
    libraries: matched.slice(offset, offset + limit).map(l => ({
      id: l.id, name: l.fields['도서관명'], sido: l.fields['시도명'], sigungu: l.fields['시군구명'],
      type: l.fields['도서관유형'], address: l.fields['소재지도로명주소'], bookCount: l.bookCount
    }))
  };
}

export function statsByRegion(libraries: Library[], sido?: string) {
  const grouped = new Map<string, { sido: string; libraryCount: number; bookCount: number; missingBookCount: number }>();
  for (const l of libraries) {
    const region = l.fields['시도명'] || '미상';
    if (!includes(region, sido)) continue;
    const stats = grouped.get(region) ?? { sido: region, libraryCount: 0, bookCount: 0, missingBookCount: 0 };
    stats.libraryCount++;
    if (l.bookCount === null) stats.missingBookCount++;
    else stats.bookCount += l.bookCount;
    grouped.set(region, stats);
  }
  const regions = [...grouped.values()].sort((a, b) => a.sido.localeCompare(b.sido, 'ko'));
  return {
    bookCountColumn: '자료수(도서)',
    totalLibraries: regions.reduce((sum, r) => sum + r.libraryCount, 0),
    totalBooks: regions.reduce((sum, r) => sum + r.bookCount, 0),
    missingBookCount: regions.reduce((sum, r) => sum + r.missingBookCount, 0),
    regions
  };
}
