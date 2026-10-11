import { readFile } from 'node:fs/promises';
import { createDemoReservation } from '../rules/reservation-view.ts';

export async function loadDemoReservations() {
  const rows = JSON.parse(await readFile(new URL('../../../ev-map/data/stations.json', import.meta.url), 'utf8'));
  const identities = [['ME183103', '02'], ['ME183103', '52'], ['ME18B278', '11']];
  const nowMs = Date.parse('2026-10-12T10:00:00+09:00');
  const offsets = [150, 60, 20];
  const reservations = identities.map(([statId, chgerId], index) => {
    const source = rows.find((row: { statId: string; chgerId: string }) => row.statId === statId && row.chgerId === chgerId);
    if (!source) throw new Error('시연 충전기의 저장된 원본을 찾을 수 없습니다.');
    return createDemoReservation({ stationName: source.statNm || '정보 없음', statId, chgerId,
      address: source.addr || '정보 없음' }, `demo-${index + 1}`, nowMs, offsets[index]);
  });
  return { nowMs, reservations };
}
