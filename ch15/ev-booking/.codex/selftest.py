"""직접 JSON 입력 시험. 위험 명령은 실행하지 않고 guard에 문자열로만 전달한다."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
count = 0


def snapshot():
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (ROOT / "tests").rglob("*") if p.is_file()}


def run(script, payload, env=None):
    result = subprocess.run([str(script)], input=json.dumps(payload), text=True,
                            capture_output=True, env=env, timeout=60)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def check(label, condition):
    global count
    assert condition, label
    count += 1
    print(f"PASS: {label}")


before = snapshot()
protected_before = {name: (ROOT / '.codex' / name).read_bytes()
                    for name in ('verify.sh', 'hooks.json')}
real_switch = ROOT / '.codex/TEST_WRITING'
switch_before = (real_switch.exists(), real_switch.read_bytes() if real_switch.is_file() else None)
guard = ROOT / ".codex/guard.sh"
cases = [
    ("리다이렉션", "Bash", "echo bad > tests/a.ts", True),
    ("추가 리다이렉션", "Bash", "printf bad >> ./tests/a.ts", True),
    ("삭제", "Bash", "rm -rf tests", True),
    ("인플레이스 수정", "Bash", "sed -i '' 's/a/b/' tests/a.ts", True),
    ("복사", "Bash", "cp src/a.ts tests/a.ts", True),
    ("이동", "Bash", "mv tests/a.ts src/a.ts", True),
    ("tee", "Bash", "echo bad | tee tests/a.ts", True),
    ("하위 폴더 이동 후 수정", "Bash", "cd tests && touch a.ts", True),
    ("인터프리터 쓰기", "Bash", "python3 -c \"open('tests/a.ts','w').write('bad')\"", True),
    ("절대 경로", "Bash", f"touch {ROOT}/tests/a.ts", True),
    ("조회 뒤 쓰기", "Bash", "cat tests/a.ts; touch tests/b.ts", True),
    ("diff 출력 파일", "Bash", "git diff --output=tests/a.ts", True),
    ("스냅샷 갱신", "Bash", "npx vitest run tests -u", True),
    ("조회", "Bash", "cat tests/rules/a.test.ts", False),
    ("검색", "Bash", "rg refund tests/", False),
    ("diff 조회", "Bash", "git diff -- tests/", False),
    ("테스트 실행", "Bash", "npx vitest run tests/rules", False),
    ("일반 구현 쓰기", "Bash", "echo ok > src/rules/a.ts", False),
    ("비슷한 폴더 이름", "Bash", "touch mytests/a.ts", False),
]
for action in ("Add File", "Update File", "Delete File", "Move to"):
    cases.append((f"패치 {action}", "apply_patch", f"*** Begin Patch\n*** {action}: tests/a.ts\n*** End Patch", True))
cases.extend([
    ("패치 구현 파일", "apply_patch", "*** Begin Patch\n*** Add File: src/a.ts\n+// tests/ 문서 참조\n*** End Patch", False),
    ("패치 정규화 경로", "apply_patch", "*** Begin Patch\n*** Update File: src/../tests/a.ts\n*** End Patch", True),
])
for prefix in ("sk", "gsk", "ck", "gck"):
    for tool in ("Bash", "apply_patch"):
        cases.append((f"실제 키 유형 {prefix} / {tool}", tool, "live_" + prefix + "_FAKE_FOR_HOOK_TEST", True))
    cases.append((f"테스트 키 유형 {prefix}", "Bash", "test_" + prefix + "_FAKE_FOR_HOOK_TEST", False))
for label, tool, command, blocked in cases:
    out = run(guard, {"tool_name": tool, "tool_input": {"command": command}, "cwd": str(ROOT)})
    check(label, (out.get("hookSpecificOutput", {}).get("permissionDecision") == "deny") == blocked)
    if blocked:
        assert "FAKE_FOR_HOOK_TEST" not in json.dumps(out)
for tool, command in [("Bash", "touch a.ts"), ("apply_patch", "*** Update File: a.ts")]:
    out = run(guard, {"tool_name": tool, "tool_input": {"command": command}, "cwd": str(ROOT / "tests")})
    check(f"tests 작업 디렉터리 {tool}", out.get("hookSpecificOutput", {}).get("permissionDecision") == "deny")
out = run(guard, {"tool_name": "exec_command", "tool_input": {"cmd": "touch tests/a.ts"}})
check("cmd 입력 호환", out.get("hookSpecificOutput", {}).get("permissionDecision") == "deny")
out = run(guard, {"tool_name": "apply_patch", "tool_input": "*** Delete File: tests/a.ts"})
check("문자열 패치 입력 호환", out.get("hookSpecificOutput", {}).get("permissionDecision") == "deny")

# 실제 프로젝트의 사람용 스위치는 건드리지 않는다. 복사한 가드의 임시 루트만 사용한다.
# 위험 입력은 문자열로 전달하며 해당 명령/패치를 실행하지 않는다.
with tempfile.TemporaryDirectory(prefix='ev-booking-guard-mode-') as tmp:
    sandbox = Path(tmp)
    (sandbox / '.codex').mkdir()
    sandbox_guard = sandbox / '.codex/guard.sh'
    shutil.copy2(guard, sandbox_guard)
    switch = sandbox / '.codex/TEST_WRITING'
    for enabled in (False, True):
        if enabled:
            switch.write_text('isolated test fixture, not the real project switch')
        mode = '스위치 있음' if enabled else '스위치 없음'
        matrix = [
            ('테스트 추가 패치', 'apply_patch', '*** Add File: tests/payments/a.test.ts', not enabled),
            ('테스트 수정 패치', 'apply_patch', '*** Update File: tests/payments/a.test.ts', not enabled),
            ('테스트 삭제 패치', 'apply_patch', '*** Delete File: tests/a.ts', True),
            ('테스트 이동 패치', 'apply_patch', '*** Update File: tests/a.ts\n*** Move to: src/a.ts', True),
            ('테스트로 이동 패치', 'apply_patch', '*** Update File: src/a.ts\n*** Move to: tests/a.ts', True),
            ('테스트 파일 생성', 'Bash', 'touch tests/a.ts', not enabled),
            ('테스트 파일 덮어쓰기', 'Bash', 'printf ok > tests/a.ts', not enabled),
            ('테스트 파일 수정', 'Bash', "sed -i '' 's/a/b/' tests/a.ts", not enabled),
            ('테스트 파일 복사', 'Bash', 'cp src/a.ts tests/a.ts', not enabled),
            ('테스트 파일 삭제', 'Bash', 'rm tests/a.ts', True),
            ('테스트 파일 이동', 'Bash', 'mv tests/a.ts src/a.ts', True),
            ('테스트 임의 스크립트', 'Bash', "python3 -c \"open('tests/a.ts','w').write('x')\"", True),
            ('조회', 'Bash', 'cat tests/a.ts', False),
            ('테스트 실행', 'Bash', 'npx vitest run tests/rules', False),
            ('구현 수정', 'apply_patch', '*** Update File: src/payments/confirm.ts', False),
            ('문서 내용의 보호 경로 참조', 'apply_patch', '*** Update File: docs/harness.md\n+ .codex/TEST_WRITING tests/a.ts', False),
            ('스위치 디렉터리 전체 삭제', 'Bash', 'rm -rf .codex', True),
            ('훅 디렉터리 전체 이동', 'Bash', 'mv .codex old-codex', True),
            ('루트 전체 삭제', 'Bash', f'rm -rf {sandbox}', True),
            ('루트 상대 삭제', 'Bash', 'rm -rf .', True),
            ('루트 셸에서 정상 구현', 'Bash', 'touch src/a.ts', False),
        ]
        for filename in ('TEST_WRITING', 'guard.sh', 'verify.sh', 'hooks.json'):
            for action in ('Add File', 'Update File', 'Delete File', 'Move to'):
                matrix.append((f'{filename} 패치 {action}', 'apply_patch',
                               f'*** {action}: .codex/{filename}', True))
            for command in (f'touch .codex/{filename}', f'rm .codex/{filename}',
                            f'printf x > .codex/{filename}', f'cp src/a.ts .codex/{filename}',
                            f"sed -i '' 's/a/b/' .codex/{filename}",
                            f"python3 -c \"open('.codex/{filename}','w').write('x')\"",
                            f'cat .codex/{filename}; touch src/a.ts'):
                matrix.append((f'{filename} 셸 변경 {command.split()[0]}', 'Bash', command, True))
            matrix.append((f'{filename} 단순 조회', 'Bash', f'cat .codex/{filename}', False))
            matrix.append((f'{filename} 정규화 패치', 'apply_patch',
                           f'*** Update File: .codex/sub/../{filename}', True))
            matrix.append((f'{filename} 절대 경로 패치', 'apply_patch',
                           f'*** Update File: {sandbox}/.codex/{filename}', True))
        for label, tool, command, blocked in matrix:
            out = run(sandbox_guard, {'tool_name': tool, 'tool_input': {'command': command}, 'cwd': str(sandbox)})
            denied = out.get('hookSpecificOutput', {}).get('permissionDecision') == 'deny'
            check(f'{mode} / {label}', denied == blocked)
        # 요청 cwd를 다른 프로젝트로 속여도 가드 자신의 루트의 스위치만 사용한다.
        foreign = sandbox / 'foreign'
        (foreign / '.codex').mkdir(parents=True, exist_ok=True)
        (foreign / '.codex/TEST_WRITING').write_text('untrusted alternate root')
        out = run(sandbox_guard, {'tool_name': 'apply_patch', 'tool_input': {'patch': '*** Add File: tests/a.ts'}, 'cwd': str(foreign)})
        check(f'{mode} / 다른 cwd 스위치로 활성화 불가',
              (out.get('hookSpecificOutput', {}).get('permissionDecision') == 'deny') == (not enabled))
        for filename in ('TEST_WRITING', 'guard.sh', 'verify.sh', 'hooks.json'):
            out = run(sandbox_guard, {'tool_name': 'Bash', 'tool_input': {'cmd': f'touch {filename}'}, 'cwd': str(sandbox / '.codex')})
            check(f'{mode} / 보호 폴더의 상대 경로 {filename}', out.get('hookSpecificOutput', {}).get('permissionDecision') == 'deny')
    switch.unlink()
    switch.mkdir()
    out = run(sandbox_guard, {'tool_name': 'apply_patch', 'tool_input': '*** Add File: tests/a.ts'})
    check('스위치 이름의 디렉터리는 활성화 불가', out.get('hookSpecificOutput', {}).get('permissionDecision') == 'deny')
    switch.rmdir()
    target = sandbox / 'marker'
    target.write_text('fake marker')
    switch.symlink_to(target)
    out = run(sandbox_guard, {'tool_name': 'apply_patch', 'tool_input': '*** Add File: tests/a.ts'})
    check('스위치 심볼릭 링크는 활성화 불가', out.get('hookSpecificOutput', {}).get('permissionDecision') == 'deny')
for script in (guard, ROOT / ".codex/verify.sh"):
    result = subprocess.run([str(script)], input="not json", text=True, capture_output=True)
    out = json.loads(result.stdout)
    check(f"잘못된 JSON {script.name}", result.returncode == 0 and
          (out.get("decision") == "block" or out.get("hookSpecificOutput", {}).get("permissionDecision") == "deny"))

# 격리된 임시 프로젝트에서 실제 Vitest 실패 이름과 TypeScript 진단을 확인한다.
with tempfile.TemporaryDirectory(prefix="ev-booking-hook-test-") as tmp:
    fixture = Path(tmp)
    (fixture / ".codex").mkdir()
    verify = fixture / ".codex/verify.sh"
    shutil.copy2(ROOT / ".codex/verify.sh", verify)
    (fixture / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    (fixture / "package.json").write_text('{"type":"module"}')
    (fixture / "tsconfig.json").write_text('{"compilerOptions":{"noEmit":true,"skipLibCheck":true},"include":["sample.ts"]}')
    (fixture / "sample.test.ts").write_text("import {test,expect} from 'vitest'; test('하네스 실패 이름 확인',()=>expect(1).toBe(2));")
    (fixture / "sample.ts").write_text('const amount: number = "bad";')
    out = run(verify, {"stop_hook_active": False})
    check("실제 실패 시 Stop 차단", out.get("decision") == "block")
    check("실제 실패 테스트 이름 반환", "하네스 실패 이름 확인" in out.get("reason", ""))
    check("테스트 실패 뒤에도 tsc 실행", "TS2322" in out.get("reason", ""))
    check("반복 방지 true", run(verify, {"stop_hook_active": True}) == {})
    (fixture / "sample.test.ts").write_text("import {test,expect} from 'vitest'; test('하네스 성공 확인',()=>expect(1).toBe(1));")
    out = run(verify, {"stop_hook_active": False})
    check("타입 오류만 있어도 차단", out.get("decision") == "block" and "Vitest 실패" not in out["reason"])
    (fixture / "sample.ts").write_text('const amount: number = 3000;')
    check("두 검사 성공 허용", run(verify, {"stop_hook_active": False}) == {})
    # 수집 실패에는 테스트 이름이 없으므로 진단을 반환한다.
    (fixture / "sample.test.ts").write_text("import './missing-file';")
    out = run(verify, {"stop_hook_active": False})
    check("수집 실패도 차단", out.get("decision") == "block")
    (fixture / "node_modules").unlink()
    check("의존성이 없어도 active true 허용", run(verify, {"stop_hook_active": True}) == {})
    check("의존성 누락 차단", run(verify, {"stop_hook_active": False}).get("decision") == "block")
check("기존 tests 파일 보존", before == snapshot())
check('verify.sh·hooks.json 보존', all((ROOT / '.codex' / name).read_bytes() == value for name, value in protected_before.items()))
check('실제 프로젝트 TEST_WRITING 보존', switch_before == (real_switch.exists(), real_switch.read_bytes() if real_switch.is_file() else None))
print(f"PASS: 총 {count}개 직접 시험 (Codex 훅 신뢰 등록·실제 이벤트 연결은 NOT_RUN)")
