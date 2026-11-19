# CHANGELOG — SNIPER WEB

## [Unreleased]

### PHASE 1 — 2026-11-19 (feature/realistic-environment)
- 추가: `?map=mountain` 산악 전장 "Mountain Watch". 560×600m 충돌 지형(2.5m 격자), 4km 원경 산맥, 남쪽 능선의 플레이어 저격 위치 6곳, 약 300m 떨어진 계곡 전초기지(건물 5동, 감시탑 2개, 방벽, 차량, 소품), 침엽수 1,350그루, 바위 170개, 보이지 않는 경계벽
- 추가: 지형 재질 레이어 GRASS / DIRT / ROCK (기존 20개 레이어 뒤에 덧붙임)
- 추가: `src/assets/AssetLoader.js` GLB 로더. 모델을 월드 셰이더용 정점 색으로 변환해 정적 배치에 합침. 실패 시 절차 모델로 대체
- 추가: CC0 GLB `lantern.glb` (전초기지 조명 5개)
- 추가: `tests/environment.spec.js` 7개 테스트
- 변경(연결부만): `World.build(seed, { mapId, assets })`, `World.groundAt`이 맵별 높이 함수 사용, `NavGrid`에 `groundAt` 옵션(지형 위 상대 높이로 탐사), `Game`이 맵 선택·모델 로딩·카메라 원거리·안개 밀도·고정 스폰을 맵 데이터에서 읽음, `GeometryBuilder`에 `addMesh`와 `skipQuad` 옵션, `Harness.snapshot()`에 `map` 필드
- 기본 맵(시장 거리)과 그 동작은 변경 없음. 기본 맵은 여전히 3개 파일 외 아무것도 요청하지 않음

### PHASE 0 — 2026-11-19
- 원본 Claude of Duty(Dust Corridor) `7f8a15a`를 기준선으로 가져옴. 게임 코드 변경 없음.
- 추가: GEMINI.md, CLAUDE.md, PROJECT_ANALYSIS.md, DEVELOPMENT_PLAN.md, TEST_REPORT.md,
  ASSET_LICENSES.md, KNOWN_ISSUES.md, CHANGELOG.md
