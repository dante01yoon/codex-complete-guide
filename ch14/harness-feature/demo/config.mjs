// Copy demo/ to another project, then edit only these settings and adapter.mjs.
export default {
  title: 'ev-booking',
  port: 4174,
  checks: [
    { id: 'rules', label: '예약 규칙 테스트', command: ['npm', 'run', 'test:rules'] },
    { id: 'types', label: '타입 검사', command: ['npm', 'run', 'typecheck'] },
  ],
  timeoutMs: 120_000,
};
