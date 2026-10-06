#!/usr/bin/env python3
"""Merge locally saved charger states and create a compact station snapshot.

Never reads .env; never makes an API call. State order: ready, charging,
maintenance, unknown. Code 1 (communication failure) belongs to unknown.
"""
from collections import Counter
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def status_index(code):
    return {'2': 0, '3': 1, '4': 2, '5': 2}.get(str(code), 3)


def timestamp(record):
    value = str(record.get('statUpdDt', ''))
    return value if re.fullmatch(r'\d{14}', value) else ''


def charger_key(record):
    return str(record['statId']), str(record['chgerId'])


def coordinate(record):
    try:
        lng, lat = float(record['lng']), float(record['lat'])
        # API occasionally includes swapped, zero or out-of-region coordinates.
        if math.isfinite(lng) and math.isfinite(lat) and 126.7 <= lng <= 127.3 and 37.35 <= lat <= 37.75:
            return round(lng, 6), round(lat, 6)
    except (KeyError, ValueError, TypeError):
        pass
    return None


def aggregate(stations, updates):
    latest = {}
    for item in updates:
        key = charger_key(item)
        if timestamp(item) and (key not in latest or timestamp(item) > timestamp(latest[key])):
            latest[key] = item
    chargers = {}
    for item in stations:
        key = charger_key(item)
        if key not in chargers or timestamp(item) > timestamp(chargers[key]):
            chargers[key] = item
    groups = {}
    totals = [0] * 4
    applied = 0
    for key, original in chargers.items():
        if str(original.get('zcode')) != '11':
            continue
        update = latest.get(key)
        effective = update if update and timestamp(update) > timestamp(original) else original
        applied += effective is not original
        state = status_index(effective.get('stat'))
        totals[state] += 1
        group = groups.setdefault(key[0], {
            'name': str(original.get('statNm', '')).strip(),
            'addr': str(original.get('addr', '')).strip(),
            'coords': Counter(), 'counts': [0] * 4, 'updated': '',
        })
        group['counts'][state] += 1
        group['updated'] = max(group['updated'], timestamp(effective))
        point = coordinate(original)
        if point:
            group['coords'][point] += 1
    rows = []
    unmapped = 0
    for stat_id, group in sorted(groups.items()):
        point = group['coords'].most_common(1)[0][0] if group['coords'] else (None, None)
        unmapped += point[0] is None
        rows.append([stat_id, group['name'], group['addr'], *point, group['counts'], group['updated']])
    return {
        'version': 1,
        'meta': {
            'stationCount': len(rows), 'chargerCount': sum(totals), 'counts': totals,
            'updatedChargers': applied, 'unmappedStations': unmapped,
        },
        'stations': rows,
    }


def main():
    stations_path, status_path = ROOT / 'data/stations.json', ROOT / 'data/status.json'
    stations = json.loads(stations_path.read_text(encoding='utf-8'))
    updates = json.loads(status_path.read_text(encoding='utf-8'))
    dashboard = aggregate(stations, updates)
    dashboard['meta'].update({
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'stationsFetchedAt': datetime.fromtimestamp(stations_path.stat().st_mtime, timezone.utc).isoformat(),
        'statusFetchedAt': datetime.fromtimestamp(status_path.stat().st_mtime, timezone.utc).isoformat(),
    })
    path = ROOT / 'data/dashboard.json'
    content = json.dumps(dashboard, ensure_ascii=False, separators=(',', ':'))
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
        temporary = Path(f.name)
        f.write(content)
    try:
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
    meta = dashboard['meta']
    print(f"충전소 {meta['stationCount']:,}곳 / 충전기 {meta['chargerCount']:,}개 / 최신 상태 반영 {meta['updatedChargers']:,}개")
    size = path.stat().st_size
    raw_size = stations_path.stat().st_size + status_path.stat().st_size
    print(f"data/dashboard.json: {size:,} bytes (원본 대비 {100 * (1-size/raw_size):.1f}% 감소), 좌표 확인 불가 {meta['unmappedStations']}곳")


if __name__ == '__main__':
    main()
