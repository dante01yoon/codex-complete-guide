# 충전 요금 계산 수용 기준

함수: `calculateFee(kwh, unitPrice, isMember)` — 충전량(kWh), 단가(원/kWh), 회원 여부를 받아 결제할 요금(원)을 돌려준다.

- AC-1 기본 계산
  - GIVEN 비회원이 단가 300원에 10kWh를 충전했을 때
  - WHEN 요금을 계산하면
  - THEN 3,000원이다
- AC-2 10원 미만 버림
  - GIVEN 비회원이 단가 347원에 7.35kWh를 충전했을 때 (계산값 2,550.45원)
  - WHEN 요금을 계산하면
  - THEN 2,550원이다
- AC-3 충전량 0
  - GIVEN 충전량이 0kWh일 때
  - WHEN 요금을 계산하면
  - THEN 0원이다
- AC-4 회원 할인
  - GIVEN 회원이 단가 300원에 10kWh를 충전했을 때
  - WHEN 요금을 계산하면
  - THEN 단가에서 10%를 할인해 2,700원이다
- AC-5 잘못된 입력
  - GIVEN 충전량이나 단가가 음수일 때
  - WHEN 요금을 계산하면
  - THEN 오류를 던진다
