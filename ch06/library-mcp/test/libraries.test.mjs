import test from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import { loadLibraries, decodeCsv, bookCount, searchLibraries, statsByRegion } from '../dist/libraries.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('encoding detection is lossless for CP949 extended Korean and UTF-8 BOM', () => {
  const text = '도서관명,뷁';
  assert.equal(decodeCsv(iconv.encode(text, 'cp949')).text, text);
  assert.equal(decodeCsv(iconv.encode(text, 'cp949')).encoding, 'CP949');
  assert.equal(decodeCsv(Buffer.from('\ufeff' + text)).text, text);
});

test('book count parses separators, distinguishes missing and zero', () => {
  assert.equal(bookCount('1,234'), 1234);
  assert.equal(bookCount('0'), 0);
  for (const value of ['', '미상', '-1', '1.5']) assert.equal(bookCount(value), null);
});

test('CSV handles quoted commas/newlines, removes phone, aggregates missing and paginates AND search', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'library-test-'));
  try {
    const path = join(dir, 'fixture.csv');
    await writeFile(path, '\ufeff도서관명,시도명,시군구명,자료수(도서),소재지도로명주소,도서관전화번호\n"한글, 도서관",서울특별시,종로구,"1,234","서울\n주소",02-000-0000\n두번째,서울특별시,종로구,,주소,02-000-0001\n세번째,부산광역시,종로구,0,주소,02-000-0002\n');
    const { libraries } = await loadLibraries(path);
    assert.equal(libraries[0].fields['소재지도로명주소'], '서울\n주소');
    assert.ok(libraries.every(l => !('도서관전화번호' in l.fields)));
    const search = searchLibraries(libraries, { sido: '서울', sigungu: '종로', keyword: '한글' });
    assert.equal(search.total, 1);
    assert.equal(searchLibraries(libraries, { sido: '서울', sigungu: '종로', keyword: '세번째' }).total, 0);
    const page = searchLibraries(libraries, { sido: '서울', limit: 1 });
    assert.equal(page.total, 2); assert.equal(page.nextOffset, 1);
    assert.equal(searchLibraries(libraries, { sido: '서울', limit: 1, offset: 1 }).nextOffset, null);
    const stats = statsByRegion(libraries);
    assert.equal(stats.totalLibraries, 3); assert.equal(stats.totalBooks, 1234); assert.equal(stats.missingBookCount, 1);
    assert.equal(searchLibraries(libraries, { keyword: '없는이름' }).total, 0);
    await writeFile(path, '잘못된열\n값\n');
    await assert.rejects(loadLibraries(path), /필수 열/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('real CSV loads all rows and has unique phone-free IDs', async () => {
  const path = new URL('../전국도서관표준데이터.csv', import.meta.url);
  const { libraries, encoding } = await loadLibraries(path);
  assert.equal(encoding, 'CP949'); assert.equal(libraries.length, 3601);
  assert.equal(new Set(libraries.map(l => l.id)).size, libraries.length);
  assert.ok(libraries.every(l => Object.keys(l.fields).every(k => !k.includes('전화'))));
});
