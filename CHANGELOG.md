# CHANGELOG — SNIPER WEB

## [Unreleased]

### PHASE 2 — 2026-11-19 (feature/sniper-weapon)
- 추가: 저격총 3종 (`src/sniper/SniperWeapons.js`, 데이터로 정의). 이름은 게임용 가상 이름
  - KESTREL R7: 볼트액션 7.62x51, 5발, 몸통 92 / 머리 276 피해, 볼트 조작 0.95초
  - VANTA SR-10: 반자동 7.62x51, 10발, 68 피해, 최소 발사 간격 0.2초
  - HALBERD .50: 볼트액션 12.7x99, 5발, 165 피해, 관통력 4.0, 볼트 조작 1.35초
- 추가: 볼트 사이클(손잡이 들기, 당기기, 탄피 배출, 밀기, 잠그기), 볼트 도중 발사·재장전 불가, 빈 탄창 재장전 끝에 볼트 조작, 총마다 따로 남는 탄약
- 추가: 무기 교체 `1`/`2`/`3` 키 (설정 메뉴에서 변경 가능), 꺼내는 시간 동안 발사 불가, 화면에 총 이름 표시
- 추가: 총 모델 3종 절차 생성 (`src/sniper/SniperGeometry.js`, 섀시형 개머리판, 스코프, 볼트 손잡이, 양각대). 기존 장갑 손 재사용
- 추가: 조준 시 임시 4배 스코프 화면(원형 마스크, 십자선, 마우스 감도 1/4). **PHASE 3에서 4·8·12배 스코프 시스템으로 교체 예정**
- 추가: `tests/sniper.spec.js` 7개 테스트
- 추가: 모드 선택 `?mode=sniper|carbine`. 산악 맵은 기본이 저격 모드, 시장 거리는 기본이 카빈
- 변경(연결부만): `Weapon`에 스펙 주입, 사격 모드 목록, 볼트 사이클, 넣기/꺼내기, 저격총용 반동 / `ViewModel.setModel()`로 총 모델 교체 / `Combat` 사거리를 스펙에서 읽음(기본 320m 유지) / 새 표면 `BARRIER`: 보이지 않는 경계벽은 몸은 막고 탄은 흔적 없이 멈춤 / `AudioEngine.playShot`에 `weight`(저격총 총성을 낮고 길게) / HUD 총 이름·탄 부족 기준을 탄창 크기 비율로 / `Player.lookScale` / 키 설정 3개 추가 / `Harness.snapshot()`에 `mode`, `scoped`, `weapon.id`, `weapon.cycling`, `weapon.slot`
- 카빈과 시장 거리 동작은 변경 없음

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
