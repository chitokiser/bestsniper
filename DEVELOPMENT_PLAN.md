# DEVELOPMENT_PLAN — SNIPER WEB

기준 문서: 사용자 작업지시서(SNIPER WEB 개발 작업지시서), `PROJECT_ANALYSIS.md`
원칙: 원본 Dust Corridor의 기능과 테스트를 보존하고, 저격 기능은 독립 모듈로 추가한다. 각 단계의 테스트가 통과해야 다음 단계로 간다.

## 0. 전체 단계 요약

| 단계 | 브랜치 | 목표 | 완료 조건 |
| --- | --- | --- | --- |
| PHASE 0 | develop | 원본 분석 | 실행, 테스트, 문서화, Git 백업 (**현재 단계**) |
| PHASE 1 | feature/realistic-environment | 넓은 산악 전장과 외관 | 맵 선택, 산악 지형, 조명·안개, 에셋 로딩 경로, 성능 측정 |
| PHASE 2 | feature/sniper-weapon | 저격총 3종 | 데이터 기반 무기 스펙, 선택·교체, 볼트/반자동 사이클, 재장전, 애니메이션 |
| PHASE 3 | feature/scope-system | 스코프 | 4·8·12배, 원형 마스크·레티클, 배율 전환, 감도 보정, 호흡 흔들림 |
| PHASE 4 | feature/ballistic-system | 게임용 탄도 | 비행 시간, 낙차, 가상 바람, 영점, 탄착 판정(기존 판정과 분리) |
| PHASE 5 | feature/enemy-ai, feature/mission-system | AI와 미션 5개 | 장거리 감지, 경계 상태, JSON 미션, 목표·결과 |
| PHASE 6 | feature/game-ui | UI와 저장 | 메인 메뉴, HUD, 점수, 기록, 설정, localStorage/IndexedDB |
| PHASE 7 | feature/performance | 테스트·최적화·배포 | 전체 테스트, 품질 프리셋, Netlify 배포, 최종 보고서 |

## 1. 공통 진행 규칙

- 각 기능은 `develop`에서 `feature/*` 브랜치를 따서 작업하고, 테스트 통과 후 `develop`에 병합한다. `main`은 단계 완료 시에만.
- 원본 기본 맵(시장 거리)과 카빈은 **기본값으로 계속 존재**한다. 신규 기능은 `?map=`, `?mode=sniper` 같은 선택 경로로 들어간다. 그래야 원본 45개 테스트가 회귀 테스트로 계속 의미를 가진다.
- 기존 파일 수정은 "연결 지점(seam)"만 만든다. 로직은 새 모듈에.
- 모든 단계 종료 시 `TEST_REPORT.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md` 갱신.
- 원격 저장소 push는 사용자 승인 후에만. upstream(원본)에는 절대 push하지 않는다.

## 2. PHASE 1 상세 실행 계획 (승인 대기)

### 목표
저격이 성립하는 **산악 전장 1개**를 기존 렌더러 위에 추가한다. 기존 시장 거리 맵은 그대로 둔다.

### 작업 순서
1. **맵 선택 연결부** (기존 파일 수정: `World.js` 소폭, `Game.js` 소폭)
   - `src/environments/index.js`에 맵 레지스트리 `{ market, mountain }`.
   - `World.build(seed, mapId = 'market')`, URL `?map=mountain` 또는 설정값으로 선택.
   - `World.groundAt()`이 선택된 맵의 높이 함수를 쓰도록.
   - 검증: 기존 45개 테스트가 그대로 통과해야 함(기본 맵 불변).
2. **산악 지형 생성기** `src/environments/MountainMap.js` (신규)
   - `MapGenerator.generate()`와 같은 반환 형식.
   - 플레이 구역 약 600m × 600m 높이맵(능선, 계곡, 저격 고지), 바깥 2km까지 충돌 없는 원경 산맥 링.
   - 계곡의 소규모 전초기지: 기존 `Buildings.generateBuilding`, `Props`(샌드백, 바리케이드, 드럼통, 차량) 재사용.
   - 바위와 침엽수는 `GeometryBuilder` + 인스턴싱으로 절차 생성.
3. **재질 추가** (`MaterialLibrary.js` 확장: 레이어 추가만, 기존 20종 불변)
   - GRASS, ROCK, DIRT_PATH, SNOW(능선), BARK/FOLIAGE. 경사·고도에 따른 지형 블렌드.
4. **넓은 맵 대응**
   - 맵별 그림자 최대 거리, 안개 밀도(`uFogDensity` 이미 있음), 카메라 원거리 면 설정.
   - NavGrid는 셀 0.75m 고정이라 600m 맵 전체를 구우면 64만 셀이 된다. AI가 움직이는 **작전 구역만 굽는 bounds 옵션**을 넣는다.
5. **에셋 로딩 경로** (**결정 필요**, 아래 참조)
   - `src/assets/AssetLoader.js`: three에 포함된 `GLTFLoader`(신규 의존성 아님)로 `public/assets/*.glb` 비동기 로딩, 실패 시 절차적 모델로 대체.
   - `ASSET_LICENSES.md`에 출처·라이선스 기록. CC0만 사용.
6. **성능 측정**
   - 기존 `tests/performance.spec.js`와 같은 방식으로 산악 맵 프레임 시간, 드로콜, 삼각형 수, 부팅 시간 측정.
   - 품질 1~4 단계에서 측정해 `TEST_REPORT.md`에 기록.
7. **신규 테스트** `tests/environment.spec.js`
   - `?map=mountain` 부팅·예외 없음, 지면 위 스폰, 원거리(300m) 지점 충돌·레이캐스트, 하늘/노출 범위, 성능 하한.

### 생성할 파일
`src/environments/index.js`, `src/environments/MountainMap.js`, `src/environments/terrain.js`(높이 함수), `src/environments/foliage.js`, `src/assets/AssetLoader.js`(결정 시), `tests/environment.spec.js`

### 수정할 파일 (연결부만)
`src/world/World.js`, `src/game/Game.js`(맵 ID 전달, 카메라 far), `src/world/MaterialLibrary.js`(레이어 추가), `src/render/ShadowSystem.js`(거리 설정값화), `src/ai/NavGrid.js`(bounds 옵션), 결정에 따라 `tests/gameplay.spec.js`의 오프라인 무결성 허용 경로

### 결정 사항
**GLB 에셋 허용 여부 → 2026-11-19 사용자 결정: A안(CC0 GLB 허용).** 원본은 "외부 에셋 0개, 3개 파일 외 요청 금지"를 테스트로 강제한다.
- A안(권장): `public/assets/`의 CC0 GLB만 허용하도록 해당 테스트 한 곳의 허용 경로를 넓히고, 로딩 실패 시 절차 모델로 대체. 작업지시서의 "GLB 모델 로딩" 완료 조건을 충족한다.
- B안: PHASE 1은 절차 생성만으로 진행하고 GLB는 PHASE 2(저격총 모델)에서 다시 결정.

### 위험
- 넓은 맵에서 BVH 빌드·NavGrid 베이크 시간 증가 → 작전 구역 제한, 원경은 충돌 제외.
- 그림자 110m 한계 → 원거리 지형은 그림자 대신 안개·대기 원근으로 처리, 스코프 시 캐스케이드 재배분은 PHASE 3에서.
- 지형 재질이 사막 시장용 LUT/노출에 맞춰져 있음 → 맵별 시간대·그레이딩 값 필요.
- 이 컨테이너(클라우드)에는 GPU가 없어 브라우저 테스트가 매우 느리고, 실시간 대기 기반 테스트 일부가 환경 때문에 실패한다 → 성능·시각 판정은 사용자 PC(GPU) 실행 결과를 기준으로 삼는다.

### PHASE 1 완료 조건
- 기존 테스트 회귀 없음(기준선 대비) + `environment.spec.js` 통과
- `?map=mountain`에서 300m 이상 시야가 확보된 산악 전장이 브라우저에서 보이고, 콘솔 오류 없음
- 품질 프리셋별 성능 수치 기록
- (A안 시) CC0 GLB 1개 이상 로딩 확인, `ASSET_LICENSES.md` 작성

## 3. 이후 단계 설계 메모

- **PHASE 2 저격총**: `Weapon.js`의 `CARBINE` 상수를 `src/sniper/SniperWeapons.js` 데이터로 확장(볼트 액션, 반자동, 헤비). `Weapon`에 스펙 주입과 볼트 사이클 상태만 추가. 모델은 `WeaponGeometry.js` 방식(절차)으로 먼저, GLB는 결정에 따라.
- **PHASE 3 스코프**: `Game._applyAdsZoom`에 배율 훅. 월드 FOV를 배율로 나누고, `ScopeOverlay`(DOM/CSS 원형 마스크 + 레티클)로 시작. 감도는 배율에 비례해 보정. 호흡 흔들림은 `Spring` 재사용.
- **PHASE 4 탄도**: 저격총 탄만 `ProjectileSystem`으로 비행 시간과 낙차를 시뮬레이션하고, 매 스텝 구간을 `Combat`의 레이캐스트(BVH + 캐릭터)로 판정. 카빈과 AI는 기존 hitscan 유지. 가상 바람은 `WindModel`.
- **PHASE 5 AI/미션**: `Agent`의 시야·청각 거리, 상태 전이 임계값을 난이도 데이터로. 기존 상태(patrol, investigate, cover)를 저격 미션용 Alert/Search로 매핑. 미션은 JSON + `MissionManager`가 `Match` 대신 승패를 판정.
- **PHASE 6 UI/저장**: `Menu`에 미션·무기·기록 화면 추가, `PlayerProgress`는 localStorage(작은 데이터)와 IndexedDB(기록) 어댑터.
- **PHASE 7 배포**: 빌드 산출물이 이미 정적 파일이라 Netlify 설정은 단순. `netlify.toml` 추가, 헤더 확인, 배포 후 실제 URL 점검.

## 4. 테스트 계획

| 구분 | 방법 |
| --- | --- |
| 회귀 | 원본 45개 Playwright 테스트를 매 단계 실행. PHASE 0 기준선 결과와 비교 |
| 신규 기능 | 단계별 spec 파일 추가(environment, sniper, scope, ballistic, mission, ui) |
| 브라우저 확인 | `tools/shot.mjs`로 스크린샷, 콘솔 오류 확인 |
| 성능 | `npm run profile`, 품질 단계별 프레임 시간 |
| 실행 환경 | 기능 테스트는 클라우드 컨테이너, 성능·시각 판정은 GPU가 있는 사용자 PC |
