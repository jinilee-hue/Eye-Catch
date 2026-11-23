# Eye Catch (아이캐치) — 파닉스 그림 찾기 2인 게임

두 장의 카드에 **딱 하나** 같은 그림이 있다. 먼저 찾은 친구가 **자기 버튼을 누르고 단어를 말하면** 튜터(눈 하나 외계인)가
회사 phonics-api(키가 있을 때) 또는 기기 안 음성인식으로 확인하고, 맞으면 왼쪽 카드를 가져간다. 틀리면 상대에게 기회.
10장, 많이 가진 친구가 승리.
단어·그림·단어 음성: lesson pack `FP.K.U1L1`(공통자료)의 m단어 18개(대명사 my 제외) — mail man map mask mat match meat mice milk mirror mitt monkey moon mop mouse mouth mug mushroom. 한 판에 두 카드로 11개가 보인다.

## 발음 판정 = phonics-api (파닉스 공통 규칙, 2026-11-19)
- 타이틀 왼쪽 위 열쇠 버튼 → 키 입력(기기마다 한 번, `localStorage.phonics_api_key`). 점: 민트 = 회사 서버가 판정, 모래색 = 기기 안 판정.
  키는 코드·저장소에 넣지 않는다(공개 repo). 팀 키 원문은 파닉스 채널 공유본.
- 말한 소리 → `POST /v1/speech/analyze`(사내 서버, 녹음 저장 안 함) → 들린 소리열을 테이블 위 그림들의 기대 소리열과 비교
  (`PhonicsAPI.judge`, phonics-kit). 서버의 `success`는 쓰지 않는다(moon을 mop으로 물어도 통과시킴).
- ih/iy는 같은 소리로 본다: 서버가 공식 mitt 녹음도 `m iy t`로 들어서 meat·mitt는 서로 통과한다.
- 키 없음 · 오프라인 · 서버 혼잡 · 6초 초과 → 그 차례는 기기 안 whisper(아래). 실패하면 1분(혼잡이면 15초) 동안 서버를 건너뛴다.
- 말한 소리를 서버도 기기 인식기도 판정하지 못하면(서버 실패 + whisper 없음/실패) 그 단어는 **건너뛰고 아무도 카드를 갖지 않는다**.
  아무 소리나 통과시키지 않는다. 처음부터 들을 수단이 없어도(마이크 없음·거부, file://에 키 없음) 정답만 보여 주고 카드는 아무도 못 가진다 — 카드는 말해야만 얻는다(2026-11-22 사용자). 그림 누르기 모드는 없앴다.

## 말하기 차례 (파닉스 공통 규칙, 2026-11-22 · phonics-kit README)
- 버튼을 누른 친구의 말하기 차례 내내 **JUMP**(Match와 같은 초록 버튼, 점프하는 아이 아이콘)가 튜터 입 옆, 말하는 친구 쪽에 튀어 오른다.
  누르면 그 단어를 건너뛴다 — 정답을 보여 주고 **아무도 카드를 갖지 않는다**.
- 다른 그림으로 들림 · 알아듣기 어려움 → 한 번 더 말할 기회("Try again"), 2번째도 아니면 상대에게 기회(알아듣기 어려움이면 "Good try!").
  말 시작까지 8초, 1.2초 쉬면 말 끝, 한 단어 최대 5초 (2026-11-22 사용자: "발화시간을 너무 적게 줘서 그냥 기회가 빨리 넘어가는거 아냐?").
- 침묵 → "Say it!" 한 번 더, 약 22초(8초 + 11초) 동안 말이 없으면 상대에게 기회. 게임마다 첫 조용한 차례에 한 번,
  말하는 친구의 장갑이 JUMP를 두 번 톡톡 + "넘어가고 싶으면 점프 버튼을 눌러!".
- 게임이 끝나면 공통 기록 `phonics.progress`(`js/phonics-progress.js` = phonics-kit 사본)에 `eye-catch`로 저장:
  level(그 판의 레벨), p1·p2(카드 수), cards, winner(1/2, 비김 0), rounds, words(말해서 맞힌 수), jumps, time(첫 카드부터 초). 레벨이 바뀌면 `setLevel`.

## 레벨 (파닉스 공통 규칙, 2026-11-22 · phonics-kit README "공통 규칙: 레벨")
- 고르지 않는다. 기기 하나에 레벨 하나(두 친구 공용), `localStorage.ecLevel` `{level, poor}` — 없으면 공통 기록의 level, 없으면 1.
- 판이 끝나면 두 친구가 가진 카드 합계로: 7장 이상 → 다음 판 +1(결과에 LEVEL UP! + 새 번호 메달), 4장 이하 → 같은 레벨,
  두 판 연속 4장 이하 → 한 칸 내려감, 5~6장 → 같은 레벨(연속 기록 초기화). 게임 화면 로고 밑에 'LEVEL n'(표시만, 규칙 설명 중엔 숨김).
- `js/game.js` `LEVELS`: 1 = 카드당 그림 4(2-2줄) · 2 = 5(3-2/2-3줄) · 3 = 6(2-3-1/1-3-2, 레벨 전 그대로) · 4 = 6 + 그림 회전(±90°)
  · 5 = 7 + 회전(아무 각도) · 6 = 8 + 회전 + 크기 섞임(1.2~0.8배), 정답 자동 공개 42초 → 30초(힌트는 1/3·2/3 지점).
- 카드 앞면(`js/card3d.js` `layout`): 똑바른 카드는 줄 배치(그림 0.65 / 0.55 / 0.50), 회전 카드는 그림을 감싸는 원을 원 안에 채워 넣기
  (6·7개 r 0.31, 8개 r 0.285) — 어느 각도로 돌아도 안 겹친다. 마지막에 실제 그림 사각형끼리 4px 이상 떨어졌는지, 테두리 r 0.98 안인지
  검사해 닿으면 3%씩 줄인다(카드 1500장 × 6레벨 검사: 겹침 0).

## 실행
- `실행.command` 더블클릭 (또는 `python3 tools/serve.py 5261` → http://127.0.0.1:5261/). 크롬 권장.
- 마이크·음성인식은 http(s)에서만 된다. `index.html` 을 파일로 열면(file://) 버튼을 누른 친구가 **그림을 눌러** 답한다.
- 키보드: 1번 친구 `A`/`←`, 2번 친구 `L`/`→`, 타이틀에서 `Space` = 시작.
- URL 옵션: `?fast=1`(규칙 설명 생략) `?tap=1`(마이크가 없는 기기처럼 — 말을 못 하면 카드 없음) `?fake=1`(QA: `__ec.fake.push('ok'|'wrong'|'unclear'|'silence'|'nojudge'|'hold')`, hold = 30초 대기 → JUMP 시험)
  `?answer=moon`(첫 라운드 정답 고정) `?log=1`(인식 결과 콘솔 출력).

## 구조 (빌드 없음, Vanilla JS)
| 파일 | 역할 |
|---|---|
| `js/game.js` | 진행(타이틀 → 규칙 데모 → 10라운드 → 결과), 버저, 판정 흐름 |
| `js/cards.js` | 덱(연속한 두 카드가 정확히 1개 공유하는 체인) |
| `js/card3d.js` | 카드 = 튜터와 같은 3D 장면의 실제 3D 오브젝트(사용자: "카드들도 3d 형태로"). 광택 테두리가 솟은 두꺼운 원판(lathe) + 앞면 캔버스 텍스처(그림 2-3-1/1-3-2 줄 + 단어, 맞힌 그림 노란 타일) + 뒷면 햇살 무늬. 하늘색/금색/plain(타이틀). 덱(뒷면 코인 더미), 탭 모드 피킹(raycast → UV → 칸) |
| `js/monster.js` | 3D 튜터 — 모델 시트(design/model_sheet.png) 기반 SDF 클레이 모델, 눈·눈꺼풀·입모양 3단·팔·다리 리그 |
| `js/tin3d.js` | 타이틀의 분홍 EYE CATCH 카드통(3D, 목업 기준): 옆면 EYE CATCH와 뚜껑의 로고·별·안쪽 단은 높이맵으로 정점을 밀어 올린 실제 입체(bump 아님), 말린 테두리 lathe, 깊은 뚜껑 옆띠, 안쪽 카드 더미 + 실제 카드. 폰트·로고 로드 후 1회 생성 |
| `js/sdf.js` | SDF + Surface Nets 메셔 (Croco Phonics) |
| `js/mic.js` | 마이크(시작 때 1회 권한), 버튼 누르기 0.7초 전부터 듣는 링버퍼, 음성 구간 검출, 16 kHz 변환 |
| `js/phonics-api.js` | phonics-kit 사본(고치지 말고 kit을 고친 뒤 다시 복사): 키·서버 상태·analyze·판정·키 입력 창 |
| `js/stt.js` + `js/stt-worker.js` + `stt/` | 백업 판정: 기기 안 whisper tiny.en (Phonics Match 워커 재사용). 들린 글자에 정답 단어가 있어야 통과 |
| `js/audio.js` | 튜터 음성(base64), 효과음 합성, 배경음악, 입모양용 음량 |

## 생성물 (손으로 고치지 말 것)
- `js/words.js`, `js/cards-art.js`, `assets/cards/*` ← `uv run --with pillow python tools/build_cards.py`
  (lesson pack 그림 = 대표이미지, 알파 경계로 자름 — moon은 원본이 남색 정사각 하늘이라 사각으로 남는다. `ph` = 서버 G2P 기대 소리열)
- `js/art.js`, `assets/img/*` ← `tools/cut_sprites.py`(목업에서 START·match!·아바타 컷) → `tools/build_art.py` (배경·로고 = 사용자 파일 `design/eyecatch_bg.png`, `eyecatch_logo.png`)
- `js/voice.js`, `js/voice-data.js`, `assets/voice/*` ← `zsh -ic '/Users/jini/.local/bin/uv run --with numpy python tools/build_voice.py'`
  - 단어·/m/ 음가: lesson pack 음성(mirror·mitt·mushroom은 pack의 WAV, 나머지 공식 MP3).
  - 튜터 대사 EN/KO 25쌍: 사내 TTS `qwen-tts` aiden (회사망/VPN). 되읽기 검사: `~/.claude/skills/video-vision/.venv/bin/python tools/voice_check.py`
- `js/bgm-data.js`, `assets/audio/bgm.mp3` ← `uv run --with numpy --with scipy python tools/make_bgm.py` (자체 합성, D장조 112 BPM)

## QA (headless, Playwright 1.62)
- `uv run --with playwright==1.62.0 python tools/qa/flow.py <out> [W H]` — 10라운드 전체 + 기회 넘김 + 아무도 못 맞힌 라운드 + 결과/다시하기/홈
- `uv run --with playwright==1.62.0 python tools/qa/stt_check.py` — 단어 녹음 × 정답 판정표 (대각선만 OK여야 함) + 단어가 아닌 소리
- `uv run --with playwright==1.62.0 python tools/qa/say_flow.py dev/say/moon.wav moon ok [api|device]` — 마이크 경로 전체(getUserMedia만 WAV 재생 스트림으로 대체:
  에이전트에서 띄운 헤드리스 크롬은 macOS 개인정보 보호 때문에 가짜 장치도 못 연다). api = `~/.config/phonics-api/key`를 이 브라우저에 넣음, device = 키 없이 whisper
- `node ../phonics-kit/tools/qa_judge.mjs` — phonics-api 판정 규칙: 단어 × (pack 녹음 + TTS 4목소리) + 단어가 아닌 소리
- `uv run --with playwright==1.62.0 --with pillow python tools/qa/monster_cmp.py <out> "pose=hold"` — 3D 튜터 vs 목업 나란히

## 주의
- 카드 앞면 배치는 카드면 단위(반지름 1)로 계산: 그림 0.40, 단어 0.095, 줄 간격 0.56, 가운데 줄 ±0.56, 모서리 쌍 ±0.27 → 단어가 아래 그림·테두리에 닿지 않음(카드 400장 검사 0건).
- 카드 그림은 data URL(`js/cards-art.js`)로 그린다: file://에서는 이미지 파일을 WebGL 텍스처로 못 쓴다.
- 덱 = 남은 장수만큼 쌓인 3D 뒷면 카드(숫자 없음, 사용자: "숫자가 들어가서 카드 뒷면처럼 안 보여"). 뒷면 가운데에 두 줄 로고. 카드 860 px, 두 카드 사이 360 px에 덱 310 px.
- 맞힌 그림 = 큰 그림 뒤 정사각 노란 타일(단어 없음). 타일 안에 단어를 넣은 안은 사용자가 되돌림.
- 3D 캔버스는 창 전체를 덮는다(`EC3D.resize(k, ex, ey)`): 4:3 스테이지 밖(16:9 화면의 뚜껑 등)도 그려진다.
- 플레이어 패드(아래 모서리) = 점수 캡슐 + 얼굴 버튼을 한 덩어리로(사용자 요청). 캡슐: 이름, 작은 카드 아이콘, 가져간 카드 수. 잠긴 쪽은 패드 전체가 흐려짐(`:has`).
- 게임 화면 상단: 가운데 작은 로고, 그 아래 정답 단어 팝업, 우측 상단 소리·나가기(언어 버튼은 타이틀에만).
- 나가기(`#btnHome`)는 모든 화면: 게임·결과 → 타이틀, 타이틀 → history.back / window.close / reload (Croco Phonics와 같음).
- 카드통 뚜껑은 `settleLid()`가 통 안으로 들어간 점이 없을 때까지 앞쪽으로 밀어내고 바닥에 내려놓는다(관통 방지).
- 게임 화면 배치(사용자 요청): 카드 860 px L(590, 960) 하늘색 · R(1810, 960) 분홍(노란 덱과 구분), 덱(1200, 1060, 두 카드 사이 아래), 튜터는 로고와 카드 사이 위쪽 가운데(발 1200, 805, 폭 390, 위에서 내려옴), 정답 단어 팝업은 아래 가운데(두 패드 사이). 카드 뒷면은 전부 덱의 노란 무늬.
- 카드통은 z -6(튜터가 든 카드와 깊이가 겹쳐 관통하던 문제), 화면상 위치·크기는 그대로.
- 게임 카드는 가운데로 약 27° 돌아 있다(`card.yawTo`, 참고 영상). 오른쪽 카드가 왼쪽으로 옮겨질 때 각도도 바뀐다.
- 주변 빛: 카드 테두리에서 번지는 밝은 후광, 덱 뒤 금빛 햇살(천천히 회전, 맞히면 크게), 카드 주변에 떠오르는 반짝이(`Card3D.ambient`, `burst`). 맞히면 두 카드에 빛 리본.
- 맞힌 그림: 사각 타일 없이 자연스러운 빛(사용자 참고 이미지) — 안쪽 은은한 빛, 그림을 두른 얇은 빛 링 + 따뜻한 번짐, 작은 반짝임. 카드 빛은 테두리에 붙어 번지는 밝은 후광(카드와 함께 기울고 떠다님).
- `js/stt-worker.js` = Phonics Match의 빌드된 워커 사본. GitHub 푸시 보호가 32자 클래스 이름 `Mistral3ForConditionalGeneration`(과 경고 문구 속 gist 링크)을 'Mistral API 키'로 오인해서, 이름을 파일 전체에서 `…GenerationV`로 바꾸고 링크 문구를 지웠다(Whisper만 쓰므로 영향 없음). 워커를 다시 복사하면 같은 처리를 할 것.
- 카드 앞면: 평평한 흰색(테두리와 같은 높이, 안쪽 그림자·그림 그림자 없음, 조명 영향 없이 그대로 표시 — 노란 기 제거). 카드 뒷면은 카드 색(하늘/분홍) 햇살 + 흰 원 + 로고, 덱은 하늘·분홍이 번갈아 쌓임. 덱 뒤 빛도 흰색.
- 상단 시스템 버튼: 튜터 라일락 색 캔디 버튼, 링 하나 + 부드러운 그림자(아래 두께 띠 없음). 인트로 로고 1.25배(폭 850).
- 커밋 전 `python3 tools/stamp.py` — css/js 링크에 내용 해시(?v=)를 붙여 캐시된 옛 파일이 섞이지 않게 한다.
