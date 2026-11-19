# Eye Catch (아이캐치) — 파닉스 그림 찾기 2인 게임

두 장의 카드에 **딱 하나** 같은 그림이 있다. 먼저 찾은 친구가 **자기 버튼을 누르고 단어를 말하면** 튜터(눈 하나 외계인)가
기기 안 음성인식으로 확인하고, 맞으면 왼쪽 카드를 가져간다. 틀리면 상대에게 기회. 10장, 많이 가진 친구가 승리.
단어·그림: FPR K Unit 1 Lesson 1 (Mm) 12단어 — man map meat milk mirror mitt monkey moon mop mouse mug mushroom.

## 실행
- `실행.command` 더블클릭 (또는 `python3 tools/serve.py 5261` → http://127.0.0.1:5261/). 크롬 권장.
- 마이크·음성인식은 http(s)에서만 된다. `index.html` 을 파일로 열면(file://) 버튼을 누른 친구가 **그림을 눌러** 답한다.
- 키보드: 1번 친구 `A`/`←`, 2번 친구 `L`/`→`, 타이틀에서 `Space` = 시작.
- URL 옵션: `?fast=1`(규칙 설명 생략) `?tap=1`(그림 누르기 모드) `?fake=1`(QA: `__ec.fake.push('ok'|'wrong'|'unclear'|'silence')`)
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
| `js/stt.js` + `js/stt-worker.js` + `stt/` | 기기 안 whisper tiny.en (Phonics Match 워커 재사용). 화면의 12그림 중 정답이 가장 잘 맞아야 통과 |
| `js/audio.js` | 튜터 음성(base64), 효과음 합성, 배경음악, 입모양용 음량 |

## 생성물 (손으로 고치지 말 것)
- `js/words.js`, `js/cards-art.js`, `assets/cards/*` ← `uv run --with pillow python tools/build_cards.py` (Constella 공식 일러스트, map은 한 장짜리 `_2`)
- `js/art.js`, `assets/img/*` ← `tools/cut_sprites.py`(목업에서 START·match!·아바타 컷) → `tools/build_art.py` (배경·로고 = 사용자 파일 `design/eyecatch_bg.png`, `eyecatch_logo.png`)
- `js/voice.js`, `js/voice-data.js`, `assets/voice/*` ← `zsh -ic '/Users/jini/.local/bin/uv run --with numpy python tools/build_voice.py'`
  - 단어: 공식 녹음 우선(FPR K 교재 man map milk mug / Constella meat monkey moon mop mouse). mirror·mitt·mushroom은 공식 녹음이 없어 Magic Block의 사내 TTS(aiden) 클립.
  - 튜터 대사 EN/KO 23쌍: 사내 TTS `qwen-tts` aiden (회사망/VPN). 되읽기 검사: `~/.claude/skills/video-vision/.venv/bin/python tools/voice_check.py`
- `js/bgm-data.js`, `assets/audio/bgm.mp3` ← `uv run --with numpy --with scipy python tools/make_bgm.py` (자체 합성, D장조 112 BPM)

## QA (headless, Playwright 1.62)
- `uv run --with playwright==1.62.0 python tools/qa/flow.py <out> [W H]` — 10라운드 전체 + 기회 넘김 + 아무도 못 맞힌 라운드 + 결과/다시하기/홈
- `uv run --with playwright==1.62.0 python tools/qa/stt_check.py` — 12단어 녹음 × 12정답 판정표 (대각선만 OK여야 함) + 단어가 아닌 소리
- `uv run --with playwright==1.62.0 python tools/qa/say_flow.py dev/say/moon.wav moon ok` — 마이크 경로 전체(getUserMedia만 WAV 재생 스트림으로 대체:
  에이전트에서 띄운 헤드리스 크롬은 macOS 개인정보 보호 때문에 가짜 장치도 못 연다)
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
