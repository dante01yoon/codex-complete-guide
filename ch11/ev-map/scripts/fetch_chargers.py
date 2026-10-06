#!/usr/bin/env python3
"""Fetch Seoul chargers and recent status updates without logging credentials.

Run: python3 scripts/fetch_chargers.py
JSON files contain arrays of the API's original charger records.
getChargerStatus returns changes within the last 10 minutes, not a full snapshot.
"""

import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib import error, parse, request
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://apis.data.go.kr/B552584/EvCharger/"
PAGE_SIZE = 9999
TASKS = (
    ("stations", "getChargerInfo", 24 * 60 * 60),
    ("status", "getChargerStatus", 10 * 60),
)


class FetchError(Exception):
    """Contains only safe messages, never URLs or response bodies."""


def load_key():
    value = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not value:
        try:
            lines = (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines()
        except OSError:
            raise FetchError(".env를 읽을 수 없습니다.") from None
        for line in lines:
            match = re.match(r"^\s*(?:export\s+)?DATA_GO_KR_KEY\s*=\s*(.*)$", line)
            if not match:
                continue
            value = match.group(1).strip()
            if value.startswith(("'", '"')):
                end = value.find(value[0], 1)
                if end < 0:
                    raise FetchError("인증키의 따옴표 형식이 잘못되었습니다.")
                value = value[1:end]
            else:
                value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
            break
    if not value:
        raise FetchError("DATA_GO_KR_KEY가 없거나 비어 있습니다.")
    return parse.unquote(value)


def cache_fresh(path, ttl):
    try:
        age = time.time() - path.stat().st_mtime
        if not 0 <= age < ttl:
            return False
        # Invalid/partial files must not suppress a fresh request.
        records = json.loads(path.read_text(encoding="utf-8"))
        return isinstance(records, list) and all(isinstance(x, dict) for x in records)
    except (OSError, ValueError):
        return False


def parse_response(raw):
    try:
        data = json.loads(raw)
    except ValueError:
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            raise FetchError("API 응답을 해석할 수 없습니다. 원문은 출력하지 않습니다.") from None
        code = root.findtext(".//resultCode") or root.findtext(".//returnReasonCode")
        records = [
            {child.tag: child.text or "" for child in item}
            for item in root.findall(".//items/item")
        ]
        total = root.findtext(".//totalCount")
        if code not in ("00", "0", "0000"):
            raise FetchError("API가 성공이 아닌 결과를 반환했습니다.")
    else:
        try:
            envelope = data.get("response", data)
            header = envelope.get("header", envelope)
            body = envelope.get("body", envelope)
            code = str(header.get("resultCode", ""))
            if code not in ("00", "0", "0000"):
                raise FetchError("API가 성공이 아닌 결과를 반환했습니다.")
            if "items" not in body:
                raise FetchError("API 응답에 items 항목이 없습니다.")
            records = body["items"]
            if isinstance(records, dict):
                records = records.get("item", [])
            if records in (None, ""):
                records = []
            if isinstance(records, dict):
                records = [records]
            total = body.get("totalCount")
        except (AttributeError, TypeError):
            raise FetchError("API 응답 구조가 예상과 다릅니다.") from None
    if not isinstance(records, list) or not all(isinstance(x, dict) for x in records):
        raise FetchError("충전기 목록 형식이 잘못되었습니다.")
    try:
        total = int(total) if total is not None else None
        if total is not None and total < 0:
            raise ValueError
    except (ValueError, TypeError):
        raise FetchError("API의 totalCount 값이 잘못되었습니다.") from None
    return records, total


class Client:
    def __init__(self):
        self.key = None
        self.last_finished = None
        self.calls = {name: 0 for name, _, _ in TASKS}

    def fetch_page(self, name, endpoint, page):
        if self.key is None:
            self.key = load_key()
        if self.last_finished is not None:
            time.sleep(max(0, 1 - (time.monotonic() - self.last_finished)))
        params = {
            "serviceKey": self.key,
            "pageNo": page,
            "numOfRows": PAGE_SIZE,
            "zcode": "11",
            "dataType": "JSON",
        }
        if endpoint == "getChargerStatus":
            params["period"] = 10
        url = BASE_URL + endpoint + "?" + parse.urlencode(params)
        self.calls[name] += 1
        print(f"[{name}] API 호출 {self.calls[name]}회: pageNo={page}, numOfRows={PAGE_SIZE}", flush=True)
        try:
            with request.urlopen(url, timeout=60) as response:
                raw = response.read().decode("utf-8-sig")
        except error.HTTPError as exc:
            raise FetchError(f"HTTP 오류 {exc.code}; 요청 URL과 원문은 출력하지 않습니다.") from None
        except (error.URLError, OSError, UnicodeError, ValueError):
            raise FetchError("API 연결 또는 응답 읽기에 실패했습니다.") from None
        finally:
            self.last_finished = time.monotonic()
        return parse_response(raw)

    def fetch_all(self, name, endpoint):
        records = []
        seen_pages = set()
        page = 1
        while True:
            batch, total = self.fetch_page(name, endpoint, page)
            # Fail instead of looping forever if the server ignores pageNo.
            signature = json.dumps(batch, sort_keys=True, ensure_ascii=False)
            if batch and signature in seen_pages:
                raise FetchError("API가 동일한 페이지를 반복해서 반환했습니다.")
            seen_pages.add(signature)
            if name == "stations" and any(str(x.get("zcode")) != "11" for x in batch):
                raise FetchError("서울 외 지역의 충전기 정보가 반환되었습니다.")
            records.extend(batch)
            print(f"[{name}] 수신 {len(batch):,}개, 누적 {len(records):,}개", flush=True)
            if total is not None:
                if len(records) >= total:
                    break
                if not batch:
                    raise FetchError("전체 개수를 받기 전에 빈 페이지가 반환되었습니다.")
            elif len(batch) < PAGE_SIZE:
                break
            page += 1
        return records


def save_atomic(path, records, key):
    content = json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    # Refuse to persist any response that unexpectedly echoes the credential.
    variants = {key, parse.quote(key, safe=""), parse.quote_plus(key)}
    if any(secret and secret in content for secret in variants):
        raise FetchError("응답에 인증정보가 포함되어 저장을 중단했습니다.")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    client = Client()
    failed = False
    for name, endpoint, ttl in TASKS:
        path = ROOT / "data" / (name + ".json")
        try:
            if cache_fresh(path, ttl):
                print(f"[{name}] 캐시 사용: data/{name}.json (유효기간 {ttl // 60}분)", flush=True)
                continue
            records = client.fetch_all(name, endpoint)
            save_atomic(path, records, client.key)
            print(f"[{name}] 저장 완료: data/{name}.json ({len(records):,}개)", flush=True)
        except FetchError as exc:
            failed = True
            print(f"[{name}] 실패: {exc}", flush=True)
        except Exception:
            failed = True
            # Tracebacks can contain credential-bearing URLs, so never print them.
            print(f"[{name}] 처리 실패; 상세 예외는 인증정보 보호를 위해 출력하지 않습니다.", flush=True)
    print(f"호출 횟수: 정보 {client.calls['stations']}회, 상태 {client.calls['status']}회, 총 {sum(client.calls.values())}회", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
