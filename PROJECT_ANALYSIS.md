# PROJECT_ANALYSIS — SNIPER WEB (PHASE 0)

작성일: 2026-11-19 · 대상 커밋: upstream `7f8a15a` (Default quality to 4), 총 49 커밋
작성 방식: 코드 수정 없이 전체 파일을 읽고, 빌드와 기존 Playwright 테스트를 실행해 확인한 내용만 기록했다.
추측이 섞인 부분은 "추정"이라고 표시했다.

---

## 1. 요약

| 항목 | 내용 |
| --- | --- |
| 원본 | Leonxlnx/claude-of-duty, 패키지명 `dust-corridor` 1.0.0 |
| 라이선스 | **MIT** (Copyright 2026 Leonxlnx). 상업적 이용·수정·재배포 가능, 저작권 고지 유지 필수 |
| 장르 | 브라우저 1인칭 전술 FPS, 플레이어 1명 vs AI 6명, 북아프리카 시장 거리 1개 맵 |
| 런타임 의존성 | `three@0.180.0` 하나뿐 |
| 개발 의존성 | `vite@^7`, `@playwright/test@^1.50` (설치 시 1.62.0) |
| 코드 규모 | `src/` 59개 모듈 약 19,000줄, `tests/` 5개 파일 약 1,750줄, `tools/` 47개 파일 |
| 에셋 | **외부 에셋 0개.** 지형, 건물, 텍스처, 무기, 병사, 하늘, 사운드를 모두 런타임에 코드로 생성 |
| 빌드 결과 | `dist/` = `index.html` + `game.js`(882KB, gzip 247KB) + `game.css`. `file://`에서도 실행되도록 단일 번들 |
| 테스트 | Playwright 45개 (smoke 7, gameplay 26, visual 8, performance 4). 이 컨테이너(GPU 없음)에서 24 통과 · 19 실패(전부 시간 부족) · 2 미실행. 상세는 `TEST_REPORT.md` |
| 저장소 문서 | README.md, HANDOFF.md(함정 기록), WORKBENCH.md(시각 개선 루프 로그), PROMPT.md(원본 개발 지시서) |

핵심 결론: 렌더러, 물리, AI, 전투, 사운드가 모두 직접 구현되어 있고 품질이 높다. 그러나 **맵이 약 96m × 152m의 좁은 시가지 회랑**이라 저격 거리(100~500m)가 나오지 않는다.
저격 게임으로 가려면 "넓은 맵"이 가장 먼저 필요하고, 그 다음이 스코프와 탄도다.

---

## 2. 디렉터리와 파일별 기능

### 루트
| 파일 | 기능 |
| --- | --- |
| `index.html` | `#scene` 캔버스와 `#ui-root`만 있는 셸. `src/main.js` 로드 |
| `vite.config.js` | `base: './'`, 모든 에셋 인라인(`assetsInlineLimit: 1e8`), 출력 파일명 `game.js`/`game.css` 고정, `__BUILD_STAMP__` 주입 |
| `playwright.config.js` | `vite build && vite preview`(4319 포트)를 띄우고 1920×1080, worker 1개, ANGLE/GL 플래그로 실행 |
| `package.json` | dev / build / preview / test / test:install / profile 스크립트 |
| `PROMPT.md` | 원본 게임의 전체 개발 지시서(품질 기준) |
| `HANDOFF.md` | 다음 개발자를 위한 함정 목록(커서 갇힘, 포트 혼동, 히트 판정 버그 등) |
| `WORKBENCH.md` | 라운드별 시각 품질 개선 기록 |

### `src/core` — 공통 기반
| 파일 | 기능 |
| --- | --- |
| `GameLoop.js` | rAF 루프. **120Hz 고정 스텝** 시뮬레이션 + 보간 렌더 (`update(dt)`, `render(dt, alpha)`) |
| `Input.js` | 키/마우스 입력, 포인터 락(웹드라이버에서는 의도적으로 생략), 액션 바인딩, 비정상 마우스 스파이크 차단, 테스트용 `inject()` |
| `Settings.js` | 품질 10단계(`QUALITY_LEVELS`), 감도, FOV, 난이도, 키 바인딩. localStorage 키 `dust-corridor.settings.v3` |
| `Spring.js` | 스프링/감쇠 유틸(무기 흔들림, 반동, 카메라) |
| `SeededRandom.js` | 결정적 난수, `WORLD_SEED` |
| `Harness.js` | `window.__harness`: 테스트가 게임을 조작하는 유일한 통로(입력 주입, 순간이동, 조준, AI 정지, 스냅샷, 프로파일) |

### `src/game` — 게임 조립과 진행
| 파일 | 기능 |
| --- | --- |
| `Game.js` (1047줄) | **모든 서브시스템을 조립하고 프레임을 소유.** 부팅, 매치 시작/일시정지/종료, 리스폰, ADS 줌(`_applyAdsZoom`), HUD 갱신, 동적 해상도, 설정 적용 |
| `Player.js` | 1인칭 플레이어: 이동(걷기 5.7, 달리기 8.8 m/s), 앉기, 슬라이드, 점프, 기울이기(Q/E), ADS 블렌드, 반동 누적, 피해 |
| `PlayerTarget.js` | AI가 플레이어를 맞힐 수 있게 하는 히트박스 대리 객체 |
| `Character.js` | AI 병사 몸체: 히트박스, 피해, 사망, 래그돌 전환 |
| `CharacterGeometry.js` | 절차적 병사 메시(16 본), 팀 팔레트 |
| `CharacterRig.js` | 절차적 애니메이션(걷기, 조준, 피격 반응), 총구 위치 |
| `Match.js` | 점수(기본 30킬), 제한 시간 600초, 킬피드 이벤트, 명중률 |

### `src/weapons` — 무기
| 파일 | 기능 |
| --- | --- |
| `Weapon.js` | 사격 제어. `CARBINE` 스펙(MK18, 780rpm, 30발), 고정 반동 패턴, 상태 기반 탄퍼짐, 재장전(전술/빈 탄창), 발사 모드 AUTO/BURST/SEMI. 발사 시 `combat.fireBullet()` 호출 |
| `ViewModel.js` | 1인칭 총 모델과 손. 스프링 기반 흔들림, 반동, ADS, 재장전·점검 애니메이션, 도트사이트(콜리메이터 셰이더) |
| `WeaponGeometry.js` | 카빈, 손, 탄창, 노리쇠를 기본 도형으로 생성. `WEAPON_ANCHORS`(총구, 배출구, 조준창 위치) |
| `GrenadeController.js` | 수류탄 꺼내기/투척 충전/던지기 |

### `src/combat` — 전투
| 파일 | 기능 |
| --- | --- |
| `Combat.js` (920줄) | **즉시 판정(hitscan) 탄환**: 캐릭터 캡슐 + BVH 레이캐스트, 최대 320m, 거리 감쇠, 부위 배율(머리 2.35), 도탄, 관통, 근접 통과(제압) 통지, 트레이서(시각용, 탄속으로 날아감), 탄피·탄창 강체, 수류탄 폭발, 피·파편 효과 |

### `src/physics` — 물리
| 파일 | 기능 |
| --- | --- |
| `BVH.js` | 정적 월드 전체를 하나의 SAH BVH로. 표면 재질(`SURFACE`)별 관통/도탄 정보 |
| `CharacterController.js` | 스웹트 캡슐 이동, 계단, 경사, 지면 스냅, 침투 해소, 맨틀 탐지 |
| `RigidWorld.js` | 탄피·탄창·수류탄용 순차 임펄스 강체 |
| `Ragdoll.js` | 위치 기반 래그돌 |

### `src/ai` — 인공지능
| 파일 | 기능 |
| --- | --- |
| `NavGrid.js` | BVH로 굽는 보행 격자, 최대 연결 영역만 유지, A*, 경로 단순화, 엄폐 지점, 스폰 가능 마스크 |
| `Agent.js` (821줄) | 상태 머신: idle / patrol / advance / engage / cover / suppress / reload / investigate / flank / dead. 시야각 약 132°, **시야 거리 95m**, 청각 60m, 숙련도별 반응·조준 오차 |
| `Director.js` | 에이전트 생성·리스폰, 소리 전파, 주변 경계 전파 |

### `src/render` — 렌더링 (EffectComposer 없이 직접 스케줄)
| 파일 | 기능 |
| --- | --- |
| `RenderGraph.js` | 프레임 순서: 그림자 → MRT 지오메트리 패스 → 하늘/구름 → GTAO → 데칼·파티클 → TAA → 모션블러 → 블룸 → 노출 측정 → LUT → AgX 합성. 월드 카메라와 뷰모델 카메라를 따로 받음. 디버그 뷰 9종 |
| `ShadowSystem.js` | 캐스케이드 그림자 4단, **최대 거리 110m**, 뷰모델 전용 캐스케이드 |
| `Sky.js` | 대기 산란 하늘, 레이마칭 구름(반해상도), SH9 앰비언트, 시간대 |
| `Materials.js` | 월드/동적/뷰모델/캐릭터 머티리얼 팩토리, 속도 버퍼용 트래커 |
| `ColorGrade.js` | 절차적 3D LUT |
| `FullscreenPass.js` | 풀스크린 패스 헬퍼 |
| `shaders/*.glsl.js` | world, character, sky, post, particle, optic(도트사이트), noise |

### `src/world` — 맵
| 파일 | 기능 |
| --- | --- |
| `MapGenerator.js` (675줄) | **맵 데이터 생성.** `MAP` 상수(경계 ±48m, z −76~+76m), 지면 높이 함수, 건물 열, 거리·골목·광장 소품, 스카이라인, 스폰 |
| `World.js` | 생성 결과로 메시, BVH, 천·케이블 시스템을 만듦. 다른 모듈은 `World`만 봄 |
| `Buildings.js` | 파사드 문법으로 건물 생성 |
| `Props.js` | 가판대, 바리케이드, 차량, 야자수 등 소품 함수 |
| `MaterialLibrary.js` | 20종 표면을 셰이더로 구워 `sampler2DArray` 3장(알베도, 노멀, ORM)으로 |
| `GeometryBuilder.js` | 정점 배치와 충돌 삼각형을 동시에 쌓는 빌더 |
| `ClothSystem.js` | 차양, 빨래, 전선 흔들림 |
| `Noise.js` | 값 노이즈, fbm |

### `src/fx`, `src/audio`, `src/ui`
| 파일 | 기능 |
| --- | --- |
| `fx/Particles.js` | 먼지·연기·불꽃·피·트레이서 파티클 |
| `fx/Decals.js` | 탄흔, 그을음, 혈흔 데칼 |
| `fx/InstancedBatch.js` | 탄피·탄창·수류탄 인스턴싱 |
| `audio/AudioEngine.js` (959줄) | **모든 소리를 Web Audio로 합성.** 총성, 초음속 크랙, 표면별 착탄음, 발소리, UI. PannerNode 위치음, BVH 차폐 |
| `ui/HUD.js` | 십자선, 히트마커, 탄약, 체력, 수류탄, 자세 칩, 점수·시계, 킬피드, 피격 방향, 나침반, 리스폰 |
| `ui/Menu.js` | 시작/일시정지 메뉴, 설정 패널(품질, 감도, 키 재설정 등), 결과 보드 |
| `ui/Loading.js`, `ui/Fatal.js` | 로딩 진행 표시, 치명적 오류 오버레이 |
| `ui/style.css` | 전체 UI 스타일 |

### `tests`, `tools`
| 경로 | 기능 |
| --- | --- |
| `tests/helpers.js` | `boot()`, `call()`, `snapshot()`, `makeInvulnerable()` |
| `tests/smoke.spec.js` | 부팅, 메뉴, 월드 생성, 매치 수명, 일시정지, 포인터 락 해제, 키 충돌, 예외 없음 |
| `tests/gameplay.spec.js` | 이동, 충돌, 슬라이드, 수류탄, 리스폰, 사격·재장전, 히트 판정, 킬, 래그돌, AI, **사운드 파일 없음**, **오프라인 무결성(3개 파일 외 요청 금지)** |
| `tests/visual.spec.js` | 노출, 하늘색, 그림자, TAA 수렴, 뷰모델 위치, ADS 정렬, 삼각형 방향 |
| `tests/performance.spec.js` | 전투 부하 프레임, 품질 단계별 비용, 동적 해상도, 장시간 자원 |
| `tools/*.mjs`, `tools/snippets/*.js` | 스크린샷(`shot.mjs`), 상태 조회(`eval.mjs`, `poke.mjs`), 시각 점검 라운드(`gauntlet-shots.mjs`) 등 개발 도구 |
| `tools/cursor-guard.ps1`, `unstick-cursor.cmd` | Windows 커서 갇힘 해제 도구 |

---

## 3. 클래스 관계

```
main.js
 └─ Game ─────────────────────────────────────────────── owns the frame
     ├─ Input, Settings, GameLoop(120Hz)
     ├─ RenderGraph ── ShadowSystem, Sky, (TAA/AO/Bloom/Exposure passes)
     │    └─ MaterialFactory ← MaterialLibrary
     ├─ World ── MapGenerator → { soup, batches, spawns, cover, buildings, bounds }
     │    ├─ BVH (static collision for everything)
     │    └─ ClothSystem, CableSystem
     ├─ RigidWorld(bvh)
     ├─ NavGrid(bvh, bounds, buildings)
     ├─ Combat(world, rigidWorld) ── Particles, Decals, InstancedBatch, tracers, grenades
     ├─ AudioEngine
     ├─ Player ── CharacterController(bvh)        PlayerTarget(player)
     ├─ ViewModel(materialFactory) ← WeaponGeometry
     ├─ Weapon(audio, viewModel, player, combat)
     ├─ GrenadeController(player, audio)
     ├─ Director(nav, bvh, combat, audio) ── Agent ×6 ── Character ── CharacterRig, Ragdoll
     ├─ Match
     └─ HUD, Menu, Loading
Harness(game) → window.__harness (tests only)
```

## 4. 데이터 흐름과 이벤트

**프레임**
1. `GameLoop._tick` → 누적 시간만큼 `Game._fixedUpdate(1/120)` 반복 → `Game._render(dt, alpha)` 1회.
2. `_fixedUpdate`: 입력 액션 읽기 → 수류탄/무기 트리거, ADS 요청, 재장전 → `player.update` → `playerTarget.sync` → `weapon.update`(발사 시 `combat.fireBullet`) → `director.update`(AI) → `rigid.step` → `combat.update`.
3. `_render`: 마우스 이동 소비 → `player.updateView` → 카메라 적용 → `_applyAdsZoom`(FOV 조정) → `viewModel.update` → 하늘·월드 갱신 → `graph.render(camera, vmCamera, scenes)` → HUD 갱신.

**사격 경로**
`Input(fire)` → `Weapon.setTrigger` → `Weapon.update` → `Weapon.fire` → 반동(`player.addRecoil`, `vm.applyRecoil`) → `_shotDirection`(탄퍼짐) → `Combat.fireBullet({origin, direction, spec})` → 캐릭터 레이 vs BVH 레이 → 피해/도탄/관통 → 트레이서와 이펙트 → 콜백.

**콜백(이벤트) 연결은 모두 `Game._wireCallbacks`에 있음**
- `combat.onHitConfirm` → HUD 히트마커, 사운드, 데미지 숫자, 명중 기록
- `combat.onKill` / `director.onAgentKilled` → `match.registerKill`
- `weapon.onFire` → 사격 기록, `director.playerFired`(AI가 총성을 들음)
- `playerTarget.onDamaged`, `player.onDeath` → HUD, 리스폰
- `match.onKill`, `match.onEnd` → 킬피드, 결과 화면
- `menu.onStart/onResume/onRestart/onQuitToMenu/onSettingChanged`
- `input.onPointerLockChange/onPointerLockError` → 일시정지

---

## 5. 저격 게임 관점에서 본 핵심 사실

| 시스템 | 현재 값 | 저격 게임에 주는 의미 |
| --- | --- | --- |
| 맵 크기 | x ±48m, z −76~+76m, 건물로 막힌 회랑 | 가장 큰 제약. 장거리 시야가 없다 |
| 카메라 원거리 면 | 600m (`Game.js` 296행) | 500m 저격까지는 가능, 산악 원경은 늘려야 할 수 있음 |
| 그림자 거리 | 110m, 4 캐스케이드 | 스코프로 300m 밖을 보면 그림자가 없다 → 스코프용 설정 필요 |
| 탄환 | hitscan, 최대 320m, 트레이서는 시각용 | 탄도(낙차, 바람, 비행 시간)는 새 모듈이 필요. `fireBullet`의 방향 입력만 바꾸는 방식이 가장 안전 |
| ADS | 월드 FOV × 0.82, 뷰모델 FOV × 0.70 | 스코프 배율은 `_applyAdsZoom`의 월드 FOV를 4·8·12배로 좁히는 방식으로 연결 가능 |
| 마우스 감도 | ADS 시 `adsMultiplier` 0.72 | 배율에 비례한 감도 보정 필요 |
| AI 시야 | 95m, 청각 60m | 저격 거리에서는 AI가 플레이어를 못 봄. 난이도·미션별로 늘리는 설정 필요 |
| 무기 | `CARBINE` 단일 스펙 상수 | 스펙을 데이터로 분리하면 저격총 3종을 같은 `Weapon` 클래스로 처리 가능 |
| 맵 결합도 | `MapGenerator`를 import하는 곳은 `World.js` 하나 | 새 맵 생성기를 같은 데이터 형식으로 만들면 렌더러·BVH·NavGrid를 건드리지 않고 교체 가능 |
| 저장 | Settings만 localStorage | 진행도·기록 저장은 새 모듈 |

---

## 6. 수정 가능한 모듈 / 새로 추가할 모듈

### 기존 파일 중 수정이 필요한 곳 (최소 범위로)
| 파일 | 수정 이유 | 위험도 |
| --- | --- | --- |
| `src/world/World.js` | 맵 생성기를 선택할 수 있게(기본값은 기존 시장 거리 유지) | 중간 — 모든 시스템이 의존 |
| `src/game/Game.js` | 저격 모듈 연결, 스코프 줌, 맵 선택, 미션 연결 | **높음** — 1047줄, 테스트 대부분이 거침 |
| `src/weapons/Weapon.js` | 스펙을 외부 데이터로 받기, 볼트 액션 사이클 | 중간 — 사격 테스트 다수 |
| `src/weapons/ViewModel.js`, `WeaponGeometry.js` | 저격총 모델과 스코프 | 중간 — 시각 테스트(뷰모델 위치, ADS 정렬) |
| `src/combat/Combat.js` | 탄도 모듈이 계산한 방향·지연을 받는 진입점 | 높음 — 히트 판정 테스트 |
| `src/ai/Agent.js` | 시야 거리·난이도를 설정값으로 | 중간 |
| `src/ui/HUD.js`, `Menu.js`, `style.css` | 스코프 HUD, 미션 메뉴 | 낮음~중간 |
| `src/render/ShadowSystem.js`, `Sky.js` | 넓은 맵용 그림자 거리, 안개 | 중간 — 시각·성능 테스트 |
| `src/core/Settings.js` | 새 설정 키 (저장 키 버전 주의) | 낮음 |
| `tests/gameplay.spec.js` 오프라인 무결성 테스트 | GLB를 쓰려면 허용 경로를 늘려야 함 | **사용자 승인 필요** (원본 규칙 변경) |

### 새로 추가할 모듈 (작업지시서 PART 6 기준, 실제 구조에 맞춰 조정)
- `src/sniper/` — `SniperWeapons.js`(데이터), `ScopeSystem.js`, `ScopeOverlay.js`(HUD 레이어), `BreathSystem.js`, `ZeroingSystem.js`
  - `RecoilSystem.js`, `ScopeCamera.js`, `SniperController.js`는 기존 `Weapon`의 반동 패턴, `Game._applyAdsZoom`, `Weapon` 클래스가 이미 같은 역할을 하므로 **새로 만들지 않고 기존 코드를 확장**하는 것을 권장
- `src/ballistic/` — `BallisticModel.js`, `WindModel.js`, `ProjectileSystem.js`(비행 시간이 있는 탄), `ImpactCalculator.js`
- `src/missions/` — `MissionManager.js`, `MissionLoader.js`, `ObjectiveManager.js`, `MissionResult.js`, `data/*.json`
- `src/progression/` — `PlayerProgress.js`, `ScoreManager.js`, `WeaponUnlock.js`
- `src/environments/` — `MountainMap.js` 등. **`MapGenerator.generate()`와 같은 반환 형식**을 지켜야 함 (soup, batches, cloth, cables, coverPoints, buildings, interiors, ambientEmitters, spawns{A,B}, bounds, playBounds, triangleCount)

---

## 7. 기존 기능과의 충돌 가능성

1. **오프라인 무결성 테스트 vs GLB 에셋.** 원본은 "3개 파일 외 요청 금지, 에셋 0개"를 테스트로 강제한다. 작업지시서 PART 7(GLB 모델)과 정면 충돌한다. 선택지: (a) PHASE 1은 절차적 생성만으로 진행, (b) `assets/` 경로만 허용하도록 테스트를 고치고 라이선스 확인된 GLB 사용. **결정 필요.**
2. **테스트가 시장 거리 좌표에 의존.** 많은 테스트가 특정 좌표로 순간이동한다. 새 맵은 반드시 **선택형**(예: `?map=mountain`, 설정값)으로 넣고 기본 맵은 유지해야 회귀가 없다.
3. **hitscan과 탄도의 이중 판정.** 비행 시간 있는 탄을 넣으면 기존 즉시 판정과 겹친다. 저격총만 새 경로를 타고, 카빈과 AI는 기존 경로를 유지해야 한다.
4. **넓은 맵의 성능.** BVH, NavGrid(격자 셀 수), 그림자 캐스케이드, 구름이 모두 현재 크기를 전제로 튜닝되어 있다. 맵 면적이 수십 배가 되면 네비 베이크 시간과 메모리가 커진다.
5. **포인터 락.** HANDOFF.md의 커서 갇힘 함정: 자동화 환경에서 포인터 락을 되살리면 안 된다.
6. **Settings 저장 키.** 기본값을 바꾸면 기존 사용자 저장값이 우선하므로 키 버전 관리 필요.
7. **단일 번들 빌드.** `inlineDynamicImports`와 큰 인라인 한도 때문에 큰 에셋을 import하면 `game.js`가 비대해진다. GLB를 쓴다면 `public/assets/`로 분리해야 한다.

---

## 8. 실행 확인

- `npm install`: 성공 (취약점 경고 없음)
- `npm run build`: 성공, 1.5초, `dist/` 3개 파일
- `npm test`: 결과는 `TEST_REPORT.md` 참조
- 클라우드 컨테이너 메모: 설치된 `@playwright/test` 1.62가 기대하는 Chromium(1234)과 컨테이너의 Chromium(1243) 리비전이 달라, 커밋하지 않는 로컬 설정(`playwright.local.config.js`)으로 실행 파일 경로만 지정해 실행했다. 사용자 PC에서는 `npm run test:install` 후 `npm test`로 그대로 실행하면 된다.

## 9. Git 상태

- upstream: `https://github.com/Leonxlnx/claude-of-duty.git` (원본, Push 금지)
- origin: `https://github.com/chitokiser/sniper-web.git` 예정 (아직 생성·연결하지 않음, 사용자 승인 대기)
- 브랜치: `main`(원본 그대로) → 분석 문서는 `develop` 브랜치에 커밋
- 원본 소스 변경: 없음
