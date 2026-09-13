# 引き継ぎ資料：行動経済学ベース学習Webゲーム

このドキュメントは、本プロジェクトを別のAI（またはセッションが変わった
Claude自身）が安全に引き継げるようにするための資料です。

**2026-09-07セッションでの更新：** 本セッション開始時点で、既にPhase1〜10の
コード（このHANDOFF.mdの旧版が「未着手」としていたPhase8〜10＝日記・読書・
称号・UI仕上げを含む）が実装済みzipとして存在していました。ただしGitHub
リポジトリのmainブランチはPhase7時点のままでした。今回のセッションでは、
9.8節に挙げられていた既知の未実装事項のうち「CSVインポート/エクスポート
（仕様65章）」「過去ステージ再挑戦（仕様44章）」、および仕様8〜9章・64章で
求められていた「ジャンル（エリア）追加」「問題データ全出力」「現在の
キャラクター/建築物/土地解放状況の確認」を新規に実装しました。詳細は
「## 10. 2026-09-07セッションでの追加実装」を参照してください。

---

## 0. GitHubリポジトリについて（重要）

**このAIセッションにはpush権限（Git認証情報）が無いため、
`https://github.com/ksp520290/StudyGame` へ直接pushすることはできません。**
成果物はzipファイルとしてのみ提供します。GitHubへ反映するには、以下のいずれか
の方法をとってください。

1. 提供されたzipを展開し、中身をローカルの `StudyGame` リポジトリのクローンへ
   上書きコピーしてから `git add -A && git commit -m "Phase 8-10 + CSV/retry/
   genre management" && git push` する。
2. 次のAIセッションでGitHub連携（Personal Access Tokenなど）が利用可能で
   あれば、そのAIに直接pushを依頼する。

**現在のリポジトリ（mainブランチ）はPhase 1〜7の状態のままです。** 今回渡す
zipの中身が最新（Phase1〜10 ＋ 本セッションでの追加実装）なので、こちらを
正として作業を進めてください（リポジトリの内容を正としないよう注意）。

---

## 1. これまでの実装状況

### 完了済み
| Phase | 内容 | 状態 |
|---|---|---|
| Phase 1 | 基盤（ルーティング、IndexedDB/LocalStorage二重保存、JSON入出力、基本データ構造） | ✅完了 |
| Phase 2 | 学習システム（Lv1正誤・Lv2四択・Lv3並び替え、採点、Perfect/Clear/Fail判定） | ✅完了 |
| Phase 3 | 復習システム（1日/3日/1週間/2週間/1か月、スケジュール生成、知の探究画面） | ✅完了（一部簡略化あり。4章参照） |
| Phase 4 | 報酬システム（コンパス固定報酬、連続ログインボーナス、設計図欠片確率計算） | ✅完了 |
| Phase 5 | 地図（1000×1000仮想座標、ズーム/パン、霧の描画、ステージ図形○△□☆） | ✅完了（一部簡略化あり。4章参照） |
| Phase 6 | 建築（設計図9分割→建築物完成、グリッド配置、名前変更、建築拡張） | ✅完了（一部簡略化あり。4章参照） |
| Phase 7 | ガチャ・キャラクター（確率式、20🧭ガチャ、キャラクター欠片10分割、仲間の誘致） | ✅完了（一部簡略化あり。4章参照） |

### 未着手（Phase 8〜10）
| Phase | 内容 |
|---|---|
| Phase 8 | 日記・読書記録（前日分記録→ガチャ解放連携、抽象⇄具体、批判的読書テンプレート） |
| Phase 9 | 称号システム（基本称号・独自称号・条件設定） |
| Phase 10 | UI仕上げ（熱狂段階/習慣段階のUI切替、アニメーション拡充、レスポンシブ、アクセシビリティ） |

---

## 2. ファイル構成（現状）

```
project/
├ index.html                … 画面骨組み・script読み込み順序（依存関係あり、順序厳守）
├ css/
│   ├ variables.css   … デザイントークン
│   ├ layout.css      … 全体レイアウト・ナビゲーション
│   ├ style.css       … 共通コンポーネント（パネル・ボタン・ホーム/設定画面）
│   ├ quiz.css        … 問題・復習画面（Phase2-3）
│   ├ map.css         … 地図・霧・建築物（Phase5/6）
│   ├ gacha.css       … 【Phase7新規】ガチャ・キャラクター画面
│   └ animation.css   … 演出用keyframes
├ js/
│   ├ utils.js         … 汎用関数
│   ├ storage.js       … IndexedDB/LocalStorage二重保存
│   ├ gameState.js     … 状態管理の中核。データ構造は3章参照
│   ├ rewardSystem.js  … コンパス・設計図欠片確率の計算ロジック
│   ├ questionSystem.js… 問題データからLv1/2/3の出題形式を生成
│   ├ importExport.js  … バックアップJSON入出力
│   ├ router.js        … 画面ルーティング。Phase7でホーム画面のガチャ導線、
│   │                     設定画面の「仲間の誘致」UIを追加
│   ├ quizSystem.js    … 未知の霧（新規学習）の出題・進行
│   ├ fogSystem.js     … 霧の不透明度「計算」のみを行う純粋関数モジュール（Phase5）
│   ├ buildingSystem.js … 【Phase6新規】建築物の配置・改名・拡張ロジック
│   ├ characterSystem.js … 【Phase7新規】キャラクター欠片・復元率・仲間の誘致
│   ├ mapSystem.js     … 地図・霧・建築物の描画と操作（Phase5/6）
│   ├ gachaSystem.js   … 【Phase7新規】ガチャ確率計算・演出・キャラクター一覧画面
│   ├ resultSystem.js  … Perfect/Clear/Fail判定・結果画面
│   ├ reviewSystem.js  … 知の探究（復習）のスケジュール・実行
│   └ app.js           … エントリーポイント・動画演出フォールバック
├ data/initialData.json … 初回起動サンプルデータ
└ assets/                … 画像・動画置き場（現在は空）
```

**重要**：`index.html` のscriptタグの順序には依存関係があります。現在の順序：

```
utils → storage → gameState → rewardSystem → questionSystem → importExport
→ router → quizSystem → fogSystem → buildingSystem → characterSystem
→ mapSystem → gachaSystem → resultSystem → reviewSystem → app
```

`Router.registerScreen()` を呼ぶモジュール（quizSystem, mapSystem, gachaSystem,
reviewSystem）は必ず `router.js` より後に読み込んでください。`mapSystem.js` は
`QuizSystem` と `BuildingSystem` を、`gachaSystem.js` は `App` / `RewardSystem`
/ `CharacterSystem` / `BuildingSystem` を呼び出すため、それらより後に読み込む
前提です（ただし全て関数内部での参照であり、実際の呼び出しはDOMContentLoaded
以降のユーザー操作時なので、読み込み順序が多少前後しても実害はありません）。

---

## 3. GameStateのデータ構造（現状の全体像）

```js
state = {
  meta: { version, createdAt, lastSavedAt },
  user: {
    loginDates: [...], currentStreak, longestStreak,
    compass: number,               // 🧭
    settings: { homeDisplayMode: "text" | "graph" },
  },
  genres: [ /* Phase1参照 */ ],
  stageProgress: { /* Phase2参照 */ },
  reviewSchedules: [ /* Phase3参照 */ ],
  reviewHistory: [ /* Phase3参照 */ ],
  missStreakByGenre: { "genre_english": number },
  blueprints: { "genre_english": { fragmentsCollected:0-8, completedCount:number } },
  lifetimeRetryCount: number,      // 未使用（過去ステージ再挑戦は未実装）
  gacha: {
    monthKey: "YYYY-MM", loginCountThisMonth: number, lastLoginDate,
    wasReturningLogin: boolean,    // 【Phase7追加】1週間以上ぶりの復帰日か（仕様40章①の判定用）
  },

  // --- Phase5：地図 ---
  map: {
    "genre_english": {
      virtualSize: 1000,
      stagePositions: { "quest_word_unit1": { x, y }, ... } // 0〜1000の仮想座標
    }
  },

  // --- Phase6：建築 ---
  buildings: [
    {
      id, genreId, hostStageId,      // hostStageId＝配置元にしたステージのid
      slotIndex,                     // 0〜7（BuildingSystem.SLOT_OFFSETS参照）
      level: 1-5, name: string,      // 空文字なら未設定（表示時は仮名を生成）
      assignedCharacterIds: [],      // Phase7以降で使用
      completedAt: "YYYY-MM-DD",
    }
  ],
  buildingExpansionTickets: number,  // 建築拡張権限の所持数（仕様25章）

  // --- Phase7：ガチャ・キャラクター ---
  characterDefs: [
    { id, name, nickname, genreId, image, dialogues:{}, source: "default"|"custom" }
  ],
  characters: [
    {
      id, defId, genreId, name, nickname, image,
      fragmentCount: 0-10, recoveryRate: 0-100,
      obtainedDate: "YYYY-MM-DD"|null,
      assignedBuildingId: string|null,
      contributionCount: number,
      dialogues: {},
    }
  ],

  // --- Phase8以降が使う領域（構造だけ確保済み。中身は空） ---
  titles: [],
  diary: [],
}
```

**Phase8以降を実装するAIへ**：この構造を壊さないでください。追加フィールドが
必要な場合は `gameState.js` の `createDefaultState()` と `migrateIfNeeded()` の
両方に追加し、既存セーブデータでも動くようにしてください。

---

## 4. 既知の簡略化・未解決事項（要レビュー）

Phase1〜5からの既知事項（変更なし）は前版のHANDOFF.mdを参照してください。
以下はPhase6・7で新たに発生したものです。

1. **【Phase6】建築物の配置枠「1ステージ=8マス」は仕様に明記の無い独自実装**：
   ステージ図形を中心とした3x3グリッドから中心を除いた周囲8マスを配置枠とした
   （`buildingSystem.js` の `SLOT_OFFSETS`）。仕様書23章はグリッド・スナップ方式と
   だけ述べており、1ステージあたりの配置可能数は定義されていない。将来的に
   仕様が明確になった場合は `SLOT_OFFSETS` のみ変更すれば良い設計にしてある。

2. **【Phase6】建築拡張権限の入手手段が本Phase時点で存在しない**：仕様25章は
   「建築拡張権限はガチャ報酬などで獲得」とあるが、Phase7で実装したガチャの
   当たり50%のうち半分（全体の25%程度）が権限を排出するようにしたので、
   Phase7完了時点ではこの制約は解消されている。Phase6単体でのテストが必要な
   場合は、ブラウザコンソールから
   `GameState.update(s => { s.buildingExpansionTickets = (s.buildingExpansionTickets||0) + 1; })`
   を実行してください。

3. **【Phase7】ガチャ画面への導線が仕様と異なる（重要・要レビュー）**：
   仕様61章は「前日分の日記記録→ガチャ画面解放」だが、日記システムは
   Phase8で実装予定のため、本Phase時点ではこのゲートが存在しない。
   暫定的に、ホーム画面の左上に🎰ボタンを追加し、いつでも直接
   `Router.navigate("gacha")` へ遷移できるようにした（`router.js` の
   `renderHomeScreen` 内、コメント `【Phase7】` を参照）。
   **Phase8を実装するAIは、この🎰ボタンの動作を「前日分の日記が未記録なら
   開拓日誌画面へ誘導し、記録済みなら直接ガチャ画面へ」という仕様どおりの
   分岐に置き換えてください。** それまでは意図的に無制限アクセスを許可した
   仮実装であることに注意してください。

4. **【Phase7】キャラクター画像は絵文字によるプレースホルダー**：仕様26章の
   `image` フィールドに相当するアップロード機能（仕様64章）が未実装のため、
   `characterSystem.js` はデフォルトで🧑‍🎓、仲間の誘致では🧑を割り当てている。
   Phase9〜10または設定画面拡張時に画像アップロード機能を追加する際は、
   `character.image` に画像URL/DataURLを設定できるようにしてください
   （表示側の `gachaSystem.js` の `character-card-image` は文字列をそのまま
   `textContent` に入れているだけなので、`<img>` タグに切り替える改修が必要）。

5. **【Phase7】キャラクターのセリフ演出は「キャラクター完成時」のみ配線済み**：
   仕様32章は称号獲得時・建築物Lvアップ時・エリア完全解放時・連続記録達成時にも
   セリフを表示するとしているが、本Phaseでは実装コストとのバランスから
   キャラクター完成時（`gachaSystem.js` の `showCharacterCompleteOverlay`）のみ
   実装した。`CharacterSystem.getDialogue(character, triggerKey)` は
   `onTitleEarned` / `onBuildingLevelUp` 用のセリフも既に用意してあるので、
   Phase9（称号）実装時やPhase6拡張時に、該当イベント発生箇所から
   `CharacterSystem.getDialogue(...)` を呼び出すだけで接続できる。

6. **【Phase7】ガチャ確率のx=0（今月まだ一度もログインしていない）は
   起こり得ない**：`recordLoginForToday()` が起動時に必ずその日のログインを
   記録するため、ガチャ画面を開ける時点で必ず `loginCountThisMonth >= 1` に
   なっている。`calcHitProbability()` 側にも `Math.max(1, x)` の防御を入れてある。

7. **未実装（Phase1から引き続き）**：過去ステージ再挑戦（仕様44章）、
   CSVインポート/エクスポート、称号システム、日記・読書記録、地図拡張
   （コンパス5個で1000×1000を拡張）、霧の奥のシルエット演出（仕様48章）。

---

## 5. Phase 8〜10 実装時の技術的な留意点

- **日記・読書記録（Phase8）**：`state.diary` は空配列として確保済み。
  仕様60〜62章の構造（日記エントリ、読書記録、抽象⇄具体、批判的読書質問）に
  合わせて自由に設計してよい。実装後は必ず**4章「3. ガチャ画面への導線」**の
  修正を行うこと（router.jsの🎰ボタンの分岐ロジック差し替え）。
- **称号システム（Phase9）**：`state.titles` は空配列として確保済み。称号の
  獲得条件判定は、既存の `stageProgress` / `reviewHistory` / `blueprints` /
  `characters`（完成数） / `diary`（Phase8実装後）を横断的に見る集計ロジックに
  なるため、`titleSystem.js` として独立モジュール化することを推奨する。
  セリフ演出との接続は上記4章5項の `CharacterSystem.getDialogue(character,
  "onTitleEarned")` を参照。
- **UI仕上げ（Phase10）**：仕様53〜54章の「熱狂段階／習慣段階」の判定条件
  （5条件中2つ達成）は、既存データ（`user.loginDates.length`、
  `stageProgress`の解放ステージ数、`blueprints`の完成数、`characters`の完成数）
  から計算可能。ホーム画面（`router.js`の`renderHomeScreen`）の表示重点を
  この判定結果で出し分ける設計にすること。
- **地図SVGへの要素追加パターン**：`mapSystem.js` の `renderAreaMapScreen()` は
  「土地→道→建築物→ステージ図形＋霧」の順でSVG要素を追加している。今後
  キャラクターを地図上に視覚的に配置する演出を追加する場合も、この並び
  （霧が最前面）を崩さないこと。

---

## 6. 動作確認方法

### Phase6（建築）
1. ローカルサーバーで配信（`python3 -m http.server` 等。`fetch`を使うため
   `file://` 直接オープンは不可）。
2. ログイン→適当なステージのLv1〜3をすべてクリアする（霧が0%になる）。
3. 復習を進めて設計図を9個集め、`state.blueprints[genreId].completedCount`
   が1以上になることを確認（知の探究を何度か行う。またはブラウザコンソールで
   `GameState.update(s => s.blueprints.genre_english = {fragmentsCollected:0, completedCount:1})`
   として時短確認してもよい）。
4. 未知の霧→エリア→クリア済みステージをクリックし、「🏛 建物を配置する」
   ボタンが出ることを確認、空きマスを選んで配置。
5. 建物アイコンをクリックし、名前変更ができることを確認。
6. コンソールで `buildingExpansionTickets` を1以上にしてから「拡張する」を押し、
   Lvが上がり色が変わることを確認。

### Phase7（ガチャ・キャラクター）
1. ホーム画面左上の🎰ボタンからガチャ画面へ遷移できることを確認。
2. コンパスを20以上持った状態で「ガチャを引く」を押し、動画（無ければ
   フォールバック演出）の後に結果（欠片 or 拡張権限 or ハズレ）が出ることを確認。
3. 「🎴 手持ちのキャラクターを見る」からキャラクター一覧に遷移できることを確認。
4. 欠片が10個集まるとキャラクターが完成し、全画面演出が出ることを確認
   （手動で早めたい場合はコンソールから
   `CharacterSystem.addFragment(GameState.getState().characterDefs[0].id)`
   を10回実行）。
5. 完成したキャラクターを、Phase6で配置した建物に配置できることを確認
   （建物のLvに応じた配置人数上限が効いていることも確認）。
6. 設定画面の「仲間の誘致」から、コンパス20を消費して新しいキャラクター定義を
   追加できることを確認。

### 既存機能（Phase1〜5）
7. クイズ・復習・バックアップ出力/読み込みが壊れていないことを確認。

---

## 7. 次のAIに渡すべきファイル

- `gakushu_game_phase1to10.zip`（`project/`一式。Phase1〜10実装済み）
- このHANDOFF.md

## 8. 【Phase8〜10実装により本セクションは役目を終えました】

旧版にあった「次のAIへ提示すべきプロンプト（コピペ用）」は、Phase8〜10が
完了したことにより不要になったため削除しました。Phase11以降に着手する場合は、
9章「未着手・要フォローアップ」の一覧（過去ステージ再挑戦・CSVインポート/
エクスポート・地図拡張・画像アップロード等）を出発点にしてください。

## 9. 【追記】Phase 8〜10 実装完了報告

このセクション以降は、Phase 8〜10 を実装したセッションによる追記です。
Phase 1〜7 部分（0〜8章）の内容は変更していません。

### 9.1 実装目的

- Phase 8：仕様60〜62章の日記・読書記録を実装し、仕様61章のガチャ解放ゲート
  （HANDOFF.md 4章3項で指摘されていた仮実装）を正式な分岐に置き換える。
- Phase 9：仕様63〜64章の称号システム（基本称号＋独自称号）を実装する。
- Phase 10：仕様53〜54章の熱狂段階／習慣・愛着段階の判定とホーム画面重点切替、
  仕様73章のアニメーション拡充、仕様72章のレスポンシブ対応、仕様76章の
  アクセシビリティ対応を行う。

### 9.2 現在のアーキテクチャ確認（既存ファイルとの整合性）

- 既存のモジュールパターン（IIFEで `const XxxSystem = (() => {...})();`、
  `Router.registerScreen()` で画面登録、`GameState.update(mutator)` で状態変更）を
  そのまま踏襲した。
- `gameState.js` の `createDefaultState()` / `migrateIfNeeded()` の両方に
  新規フィールド（`books`, `titleDefs`）を追加済み。既存セーブデータでも
  `migrateIfNeeded()` が欠けているキーを補う。
- 巨大な1ファイルにはせず、Phase8は `diarySystem.js` / `readingSystem.js` の
  2ファイルに、Phase9は `titleSystem.js` の1ファイルに、Phase10は
  `worldPhaseSystem.js` の1ファイル＋`router.js`の一部改修に分割した。
- 依存が薄いモジュール（titleSystem, worldPhaseSystem）は、依存先が無くても
  落ちないよう呼び出し側で `typeof X !== "undefined"` ガードを入れてある
  （既存コードの流儀に合わせた）。

### 9.3 作成・変更したファイル一覧

**新規作成**
- `js/diarySystem.js`（Phase8）
- `js/readingSystem.js`（Phase8）
- `js/titleSystem.js`（Phase9）
- `js/worldPhaseSystem.js`（Phase10）
- `css/journal.css`（Phase8）
- `css/title.css`（Phase9）
- `css/responsive.css`（Phase10）

**変更**
- `js/gameState.js`：`books`, `titleDefs` フィールドを追加（default/migrate両方）
- `js/router.js`：
  - ホーム画面🎰ボタンの分岐ロジックを仕様61章どおりに置き換え（Phase8）
  - 探索画面「霧晴れの開拓日誌」ボタンを`journal`画面へ接続（Phase8）
  - 設定画面に「称号」セクション（一覧リンク・独自称号追加フォーム・削除）を追加（Phase9）
  - ホーム画面を熱狂段階／習慣段階で出し分けるロジックに再構成（Phase10）
  - コンパスボタン・保存ボタンに`aria-label`を追加（Phase10）
- `js/resultSystem.js`：ステージ完了時に`TitleSystem.checkAndAward()`を呼ぶ（Phase9）、
  土地解放パネルに`pop-in`アニメーションクラスを追加（Phase10）
- `js/reviewSystem.js`：復習完了時に`TitleSystem.checkAndAward()`を呼ぶ（Phase9）、
  設計図獲得時の報酬パネルに`fragment-pop`クラスを追加（Phase10）
- `js/gachaSystem.js`：キャラクター完成時に`TitleSystem.checkAndAward()`を呼ぶ（Phase9）、
  当たり演出に`pop-in`クラスを追加（Phase10）
- `css/style.css`：`.genre-progress-row` `.world-summary-*` を追加（Phase10）
- `css/animation.css`：`pop-in` `fog-fade-out` `shine-sweep` `slide-up-fade`
  `fragment-pop` の追加keyframesと`prefers-reduced-motion`対応（Phase10）
- `index.html`：新規CSS/JSファイルの読み込み追加、読み込み順コメントの更新、
  ナビゲーションに`aria-label`追加（全Phase）

### 9.4 データモデル追加分

```js
state.diary = [
  { id, targetDate, changeRecord, dayFlow, feelings, recordedAt }
];
state.books = [
  {
    id, title, author, publisher, tags:[], rereadFlag,
    bookSummary,                          // 目安150文字（強制はしない）
    chapters: [{ id, name, summary }],    // 目安30文字（強制はしない）
    quotes: [{ id, text, note }],
    ladder: [{ id, kind:"abstract"|"concrete", text }],
    criticalQuestions: [{ id, question, answer }],
    createdAt, updatedAt
  }
];
state.titles = [
  { id, defId, label, genreId, source:"builtin"|"custom", earnedAt }
];
state.titleDefs = [   // 独自称号の条件定義（設定画面から追加）
  { id, name, conditionType, genreId, threshold }
];
```

### 9.5 仕様に明記が無く判断した点（要レビュー）

1. **【Phase8】日記保存時の🧭+1報酬**：仕様に直接の記載は無いが、仕様55章の
   Investmentループ（問題を追加/日記を書く等）に対する軽い正のフィードバックとして
   独自に追加した。学習報酬（Lv1で1〜11、Lv2で2〜12等）より必ず小さい値に
   留めてあるため、「ガチャや日記が学習より魅力的になってはいけない」という
   仕様81章の原則には抵触しないと判断している。不要であれば
   `diarySystem.js`の`DIARY_SAVE_COMPASS`を`0`にするだけで無効化できる。
2. **【Phase8】霧晴れの開拓日誌ボタンの遷移先**：仕様61章は「前日分記録済みなら
   霧晴れの開拓日誌→直接ガチャ画面」とあるが、これをそのまま探索画面のボタンにも
   適用すると、日記を書いたあとは読書記録機能に手が届きにくくなる。そこで、
   **ホーム画面の🎰ボタンのみ**仕様どおりの分岐（未記録→journal、記録済み→gacha）とし、
   探索画面の「霧晴れの開拓日誌」ボタンは常にjournalハブ画面（日記・読書・ガチャへの
   入口が並ぶ画面）へ遷移するようにした。journalハブ画面内には、記録済みなら
   目立つ「🎰 ガチャへ進む」ボタンが表示されるため、実質的に仕様の体験は再現できている。
3. **【Phase9】基本称号のしきい値**：仕様63章は称号の名前のみを定義しており、
   具体的な達成数値は書かれていない。仕様53章で使われている数値（7日、10ステージ等）
   と整合させ、新規学習：1→5→10→エリア全クリア、復習：設計図の初欠片→初完成→
   3完成→5完成、という段階を採用した。`titleSystem.js`の`BUILTIN_DEFS`の
   `check`関数のみを変更すれば、しきい値の見直しは容易。
4. **【Phase9】称号獲得のセリフ演出**：仕様32章どおり、称号を獲得したジャンルに
   完成済みキャラクターがいれば`CharacterSystem.getDialogue(character,
   "onTitleEarned")`のセリフを全画面演出内に表示する。完成済みキャラクターが
   いない場合はセリフ部分を省略する（無理に汎用セリフを出すと「所有していない
   キャラクターが喋る」という違和感が生まれるため）。
5. **【Phase10】熱狂段階→習慣段階の判定に使う「ステージ解放」の定義**：
   仕様53章②「複数問題セットをまたいでエリア内10ステージ以上解放」の
   「解放」を、フォグが完全に晴れていなくても`stageProgress`に記録があれば
   カウントする方式にした（Lv1着手だけでフォグが70%→50%に変化する仕様48章の
   世界観と整合させるため）。より厳格に「フォグ0%＝完全クリア」を要求する
   仕様であれば、`worldPhaseSystem.js`の`countStagesTouchedAcrossMultipleSets()`
   の判定条件を`FogSystem.stageFogOpacity(progress) === 0`に差し替えるだけでよい。
6. **【Phase10】段階判定を都度計算方式にした点**：5条件はすべて「一度満たしたら
   減ることが無い」値のみで構成されているため、専用の永続フラグを持たせず、
   ホーム画面描画のたびに`WorldPhaseSystem.isHabitPhase()`を計算する設計にした。
   GameStateへの構造追加が不要というメリットがある一方、将来「一時的に熱狂段階に
   戻す」といった演出をしたくなった場合は、別途フラグ管理への切り替えが必要になる。

### 9.6 既存機能への影響

- Phase1〜7の画面・データ構造・確率式には一切手を加えていない
  （`buildingSystem.js` / `characterSystem.js` / `gachaSystem.js` の確率計算や
  配置ロジックは無改修。`gachaSystem.js`・`resultSystem.js`・`reviewSystem.js`は
  末尾に1〜2行の称号判定呼び出しを追加しただけ）。
- 既存セーブデータ（Phase7までのJSON）を読み込んでも、`migrateIfNeeded()`が
  `books` / `titleDefs`を自動補完するため、エラーなく起動できる。
- ホーム画面のレイアウトは、熱狂段階では従来とほぼ同じ表示（ステージ進捗が主役）。
  習慣段階に入って初めて表示が切り替わるため、序盤ユーザーの体験は変化しない。

### 9.7 動作確認方法

**Phase8（日記・読書記録／ガチャ解放ゲート）**
1. ホーム画面左上の🎰ボタンを押す→前日分の日記が無ければ「霧晴れの開拓日誌」へ
   遷移することを確認。
2. 「日記を書く」→3項目のいずれか1つだけ入力して保存→トーストで
   「🎰 ガチャが解放されました！」が出ることを確認。
3. 再度ホーム画面の🎰ボタンを押すと、今度は直接ガチャ画面へ遷移することを確認。
4. 探索画面→「霧晴れの開拓日誌」→「読書記録をつける」→「＋新しい本を追加」→
   タイトル入力・章追加・引用追加・抽象/具体追加・批判的読書の問いに回答、
   それぞれ保存後に再表示して内容が保持されていることを確認。
5. 読書記録一覧画面でキーワード検索・タグ検索・除外キーワードが機能することを確認。

**Phase9（称号）**
1. 適当なステージのLv1〜3いずれかを初めてクリアした直後に、
   「称号「〇〇のはじめの一歩」を獲得しました！」の全画面演出が出ることを確認。
2. 設定画面→「称号」→「獲得した称号を見る」で一覧に表示されることを確認。
3. 設定画面の「独自称号を追加する」から、例えば「日記の記録日数（全体）≥3」で
   称号を作成→日記を3日分記録すると獲得演出が出ることを確認。
4. コンソールで時短確認する場合：
   `GameState.update(s => { s.blueprints[s.genres[0].id] = {fragmentsCollected:0, completedCount:3}; }); TitleSystem.checkAndAward();`

**Phase10（熱狂段階／習慣段階の切替・アニメーション・レスポンシブ）**
1. コンソールで `WorldPhaseSystem.evaluateConditions()` を実行し、
   5条件の`true/false`配列が返ることを確認。
2. 条件を2つ以上満たす状態を作る（例：ログイン日数7日はコンソールから
   `GameState.getState().user.loginDates`を7件のダミー日付にする、または
   建築物やキャラクターを実際に集める）→ホーム画面が
   「自分の世界の様子」＋「積み上げてきたもの」パネル構成に変わることを確認。
3. ブラウザ幅を1000px以上にリサイズし、探索画面のボタンが横並びになる、
   読書記録一覧が2カラムになることを確認。
4. OS設定で「視差効果を減らす／アニメーションを減らす」を有効にした状態で
   開くと、演出アニメーションが無効化される（`prefers-reduced-motion`）ことを確認。
5. Tabキーだけで主要画面を操作できること、フォーカスリングが視認できることを確認。

**既存機能（Phase1〜7）の回帰確認**
6. クイズ・復習・地図・建築・ガチャ・キャラクターの一連の操作が、Phase7時点と
   変わらず動作することを確認（回帰無し）。

### 9.8 次フェーズ（本Phaseで未着手・要フォローアップ）への引き継ぎ事項

- ~~過去ステージ再挑戦（仕様44章）~~ → 2026-09-07セッションで実装済み（10章参照）。
- ~~CSVインポート/エクスポート（仕様65章）~~ → 2026-09-07セッションで実装済み（10章参照）。
- 地図拡張（仕様45章：コンパス5個で1000×1000を拡張）は**未実装のまま**。
  `mapSystem.js`は`state.map[genreId].virtualSize`をデータとして保持しては
  いるが、実際の描画（`renderAreaMap`のviewBoxなど）はモジュール内の定数
  `VIRTUAL_SIZE = 1000`を直接参照しており、`virtualSize`を書き換えても画面には
  反映されない。安全に実装するには、viewBox・ステージ座標のクランプ範囲・
  既存ステージのジッター計算をすべて`state.map[genreId].virtualSize`から
  動的に読むようリファクタリングする必要があり、ブラウザでの目視確認なしに
  変更すると地図が壊れるリスクが高いため、本セッションでは見送った。
- 霧の奥のシルエット演出（仕様48章：「何かありそう」という影を薄く表示）は
  引き続き未実装。
- キャラクター画像・建築物画像のアップロード機能（仕様64章）も未実装のまま
  （キャラクターは絵文字プレースホルダー）。読書記録・日記にも画像添付は無い。
- 称号獲得時の演出は6秒で自動的に閉じるようにしてあるが、同時に複数の称号を
  獲得した場合（例：ステージクリアで新規学習称号と復習称号が同時解禁される等）
  演出が重なって表示される可能性がある。頻度は低いと想定されるが、
  キューイング処理は入れていない。
- `WorldPhaseSystem`の判定はホーム画面描画のたびに全ジャンル・全ステージを
  スキャンする実装のため、ジャンル数・ステージ数が非常に多くなった場合は
  計算コストを見直す余地がある（現状の想定規模では問題にならない）。
- 独自称号（`titleDefs`）の`conditionType`は5種類のみ用意した
  （`stagesCleared` / `blueprintsCompleted` / `diaryEntries` /
  `charactersCompleted` / `booksRecorded`）。新しい条件タイプを増やす場合は
  `titleSystem.js`の`CUSTOM_CONDITION_TYPES`に追加するだけでよい設計にしてある。


## 10. 2026-09-07セッションでの追加実装

### 10.1 実装目的

前セッションまでにPhase1〜10のコードは実装済みだったが、GitHubリポジトリは
Phase7時点で止まっており、また9.8節（当時）に「未着手」として明記されていた
項目のうち、個人利用アプリとして特に実用上の欠落が大きい以下の4点を実装した。

1. ジャンル（エリア）追加UI（仕様8章・64章）— これが無いと`data/initialData.json`
   に定義した以外のジャンルを一切追加できず、学習ジャンルを拡張できなかった。
2. CSVインポート/エクスポート（仕様65章）
3. 問題データ全出力・現在のキャラクター/建築物/土地解放状況の確認（仕様64章）
4. 過去ステージ再挑戦（仕様44章）

### 10.2 作成・変更したファイル

- 新規：`js/csvManager.js` — CSV⇔問題データの変換・バリデーション（重複ID・
  必須項目・列不足のチェック、仕様65章）。他モジュールに依存しない純粋関数群。
- 変更：`index.html` — `js/csvManager.js` の `<script>` タグを追加
  （`importExport.js`の直後）。
- 変更：`js/router.js` の `renderSettingsScreen()` — 以下を追加：
  - 「ジャンル（エリア）を追加」フォーム
  - 「問題データ管理」（全出力・ジャンル別CSVエクスポート・CSVインポート
    〔取り込み結果のエラー/警告を画面上に表示〕）
  - 「現在の状況確認」（土地解放状況％・所持キャラクター・所持建築物の一覧）
  - `renderExploreScreen()` に「過去ステージ再挑戦」ボタンを追加し、新画面
    `renderRetryStageScreen()`（`"retryStage"`として登録）を追加。
- 変更：`js/rewardSystem.js` — `calcRetryProbability()` / `attemptStageRetry()`
  / `RETRY_COST_COMPASS` を追加（仕様44章の再挑戦報酬確率式を実装）。
- 変更：`css/style.css` — `.settings-group h4` のスタイルを追加（状況確認セクションの小見出し用）。

### 10.3 仕様に明記が無く判断した点（要レビュー）

- **CSVインポートの取り込み単位**：仕様65章はCSV構造のみを定義しており、
  取り込んだ問題をデータ階層のどこに配置するかは明記が無い。「新しい問題
  セット名／新しいステージ名」をユーザーに入力させ、常に**新規ステージ**
  として追加する方式にした（既存ステージへの問題追加は将来拡張として保留）。
  理由：既存ステージへ混ぜると`stageProgress`の整合性（Lv1〜3クリア判定）が
  崩れるリスクがあり、個人利用アプリの安全側に倒した。
- **「問題データ全出力」の形式**：section65のCSVとは別に、section64は
  独立して「問題データ全出力」を求めている。バックアップJSON（全state）とは
  別に、`genres`配列だけを抜き出したJSONとして出力する形にした（差分バック
  アップ・他ユーザーへの問題データ共有を想定）。
- **過去ステージ再挑戦の`initialProbability`**：仕様44章の式
  `retryProbability = max(0, initialProbability - lifetimeRetryCount×10)`
  における`initialProbability`の定義が明記されていない。復習を経ずに即座に
  挑戦できるショートカット機能である点を踏まえ、最も低い基本確率（1日後
  復習と同じ1%＝`RewardSystem.BASE_FRAGMENT_PROB["1day"]`）を採用した。
  カウンタはジャンル別ではなく仕様どおり**生涯累計**（`state.lifetimeRetryCount`、
  全ジャンル共通）とした。
- **過去ステージ再挑戦の実際の出題**：仕様44章は「過去にクリア済みのステージへ
  再挑戦可能」と書かれており、本来は問題に再度回答する体裁が想定されて
  いる可能性がある。今回は`quizSystem.js`/`resultSystem.js`（`stageProgress`の
  Perfect/Clear判定と密結合）に手を入れると影響範囲が大きく、ブラウザでの
  目視確認ができない中でのリスクが高いと判断し、**問題への再回答は行わず、
  20🧭を払ってその場で欠片抽選を1回行う**、独立したミニ機能として実装した。
  「学習し直す」という体験を重視するなら、次のセッションで
  `QuizSystem.startLevel()`をリトライモード付きで呼び出し、`ResultSystem`側で
  リトライ時は`stageProgress`を書き換えずに`RewardSystem.attemptStageRetry()`
  だけを呼ぶよう分岐させる形に拡張することを推奨する。

### 10.4 既存機能への影響

- 新規追加のみで、既存の`quizSystem.js`・`resultSystem.js`・`reviewSystem.js`・
  `mapSystem.js`・`buildingSystem.js`・`characterSystem.js`・`gachaSystem.js`・
  `diarySystem.js`・`readingSystem.js`・`titleSystem.js`・`worldPhaseSystem.js`
  は一切変更していない。
- `GameState.createDefaultState()` / `migrateIfNeeded()` の`state`構造は変更して
  いない（`lifetimeRetryCount`は既存フィールドをそのまま利用）。
- 19個の`.js`ファイルすべて`node --check`によるシンタックスチェック済み。
  ただし本セッションはブラウザ実行環境が無いため、**実機（ブラウザ）での
  目視確認は未実施**。次のセッションで必ず以下の動作確認を行うこと。

### 10.5 動作確認方法（次のAI/開発者が実施すること）

1. `project/`をローカルサーバーで開く（`index.html`を`file://`で直接開くと
   `fetch("data/initialData.json")`がCORSで失敗する場合があるため、
   `npx serve` 等の簡易サーバー経由を推奨）。
2. 設定画面 → 「ジャンル（エリア）を追加」で新規ジャンルを追加 → ホーム画面・
   探索画面に反映されることを確認。
3. 設定画面 → 「ジャンル別CSVエクスポート」で既存ジャンル（例：英語）を
   出力し、Excelやテキストエディタで内容を確認。
4. そのCSVを一部改変（idを変えるなど）して「ジャンル別CSVインポート」から
   同ジャンルに読み込み、新しいステージとして地図上に出現することを確認。
   わざと必須列を欠いたCSV・IDが重複したCSVも試し、エラーメッセージが
   画面に表示されることを確認。
5. 設定画面下部「現在の状況確認」で、土地解放状況％・所持キャラクター・
   所持建築物が実データと一致することを確認。
6. 探索画面 → 「過去ステージ再挑戦」で、クリア済みステージがあるジャンルが
   一覧に出ること、🧭20消費で欠片抽選が実行されること、コンパス不足時に
   エラートーストが出ることを確認。

### 10.6 次フェーズへの引き継ぎ事項

9.8節に記載の残課題（地図拡張・霧のシルエット演出・画像アップロード・称号
演出のキューイング）に加え、10.3節で述べた「過去ステージ再挑戦の再出題化」
の検討を次のセッションの候補とする。

以下をそのまま次のAIに渡してください。

---

> あなたは、シニアWebアプリケーションエンジニア／Vanilla JavaScriptエンジニア／Webゲーム開発者／UI-UXデザイナー／ゲームシステムデザイナー／行動経済学・心理学を理解したプロダクトデザイナーとして行動してください。
>
> 添付の `project/` フォルダは、行動経済学・心理学ベースの学習Webゲーム（HTML/CSS/Vanilla JavaScriptのみ、React/Vue/Node.js/外部バックエンド不使用）の実装で、Phase 1〜10がすべて実装済みです。加えて、CSVインポート/エクスポート・ジャンル追加・過去ステージ再挑戦・状況確認UIも実装済みです。同梱の `HANDOFF.md`（特に9.8節・10章）に、現在の実装状況・データ構造・既知の簡略化事項・未実装事項をまとめてあります。
>
> **重要**：GitHubリポジトリ（`https://github.com/ksp520290/StudyGame`）のmainブランチはPhase7の状態のままです。今回渡す`project/`フォルダの中身が最新なので、こちらを正として作業し、可能であればリポジトリへの反映（コミット・プッシュ）も行ってください。
>
> **作業を始める前に必ず `HANDOFF.md` を読み、実際にブラウザで動かして10.5節の動作確認を一通り行ってください（前セッションはブラウザ実行環境が無く目視確認ができていません）。**
>
> このゲームの根本方針は「学習行動を短期的な熱狂から長期的な習慣へ移行させること」であり、ガチャ・建築・キャラクター等のシステムはすべて学習を促す補助であって、それ自体が主目的になってはいけません。
>
> 次に着手すべき候補（優先度は要相談。ユーザーの希望を確認してから着手してください）：
> - 地図拡張（仕様45章）：`mapSystem.js`のレンダリングが`state.map[genreId].virtualSize`ではなく定数`VIRTUAL_SIZE`を直接参照している構造を、動的なvirtualSizeベースに安全にリファクタリングする。
> - 過去ステージ再挑戦を実際の再出題フローに統合する（10.3節参照）。
> - 霧の奥のシルエット演出（仕様48章）、キャラクター/建築物の画像アップロード（仕様64章）。
>
> 巨大な1ファイルへの実装、既存機能を確認せずの上書き、仕様の勝手な簡略化、外部フレームワークの導入は禁止です。仕様と矛盾する、または仕様に明記のない判断が必要な場合は、変更前に「問題点・現在の仕様・影響・推奨案」を提示してください。

---

## 11. 2026-09-08セッションでの追加実装（配色変更・エリア/問題セット/ステージ3階層化・設定アコーディオン化・CSV拡張・正答一覧の詳細表示）

### 11.1 実装目的

ユーザーからの追加要望に基づき、以下を実装した。

1. 配色を「グレー背景・黒文字・茶色ブロック・強調(URL)は水色」に変更。ボタン
   （`.btn-primary` / `.btn-secondary` / `.btn-moss` / `.icon-btn`）は従来の配色を維持。
2. エリア画面を1000×1000の画面にし、ジャンルを正方形ブロックとして配置。タイトルと
   解放率を表示する（ステージ地図とは別デザイン）。
3. エリアと問題セットの間に「問題セット画面」を新設（旧エリア一覧と同じカードデザイン）。
4. ステージ画面（旧・エリア地図）を問題セット単位にスコープを縮小し、ステージの位置が
   分かるよう常に不透明度100%の輪郭線を追加。
5. 設定画面：エリア名の変更、問題セットの追加・名前の編集・削除を追加。
6. 設定画面全体をアコーディオン（`<details>`）形式に変更（項目数が増えたため）。
7. CSVに「問題セット名(question_set)」「補足情報(note)」列を追加。行ごとに取り込み先の
   問題セットを指定できるようにした。
8. 正答一覧（クエスト失敗時・復習時の答え合わせ画面）の行をクリックすると、問題文・
   （誤答の場合）自分の回答と正答の比較・補足情報を表示するポップアップを追加。
9. 用語変更：「正しい/誤り」→「正答/誤答」（Lv1正誤問題の回答ボタン、正答一覧の表記）。

### 11.2 作成・変更したファイル一覧（新規ファイルは無し）

- `css/variables.css`：全面書き換え。配色トークンをグレー/茶色/黒/水色ベースに変更。
  ボタン専用に `--btn-secondary-bg` / `--btn-secondary-text` を新設し、他の配色変更の
  影響を受けないようにした。
- `css/layout.css`：nav-btn・toast・cutscene-fallbackの文字色調整、`a`タグの水色化。
- `css/style.css`：見出し・本文・設定行の文字色をink（黒）系に統一。`.settings-accordion`
  一式を追加。待受画面（`.title-heading`/`.title-sub`）は専用の暗い背景を維持するため
  意図的に対象外とした。
- `css/quiz.css`：`.answer-review-row` をクリック可能にし、詳細ポップアップ用の
  `.answer-detail-*` スタイルを追加。
- `css/map.css`：`.map-area-*`（エリア画面用の正方形ブロック）、`.map-stage-outline`
  （ステージの常時不透明度100%輪郭線）、建物系アイコンボタンをボタン専用配色に変更。
- `js/fogSystem.js`：`stagesProgressPercent` を共通化し、`questionSetProgressPercent` を追加。
- `js/mapSystem.js`：大幅書き換え。画面を「エリア画面(`fogStageSelect`)→問題セット画面
  (`questionSetSelect`、新規登録)→ステージ地図(`areaMap`、問題セット単位にスコープ変更)」
  の3階層に分割。`state.map`の永続化キーをジャンルIDから問題セットIDに変更（11.5節参照）。
- `js/router.js`：設定画面をアコーディオン化。「エリア名の変更」「問題セットの管理」を
  追加。CSVインポートを行ごとのquestion_set列でグループ化する処理に変更。
- `js/quizSystem.js`：Lv1回答ボタンを「正しい/誤り」→「正答/誤答」に変更。
  ユーザーの回答（`userAnswer`）をセッションに記録するよう変更。
- `js/questionSystem.js`：Lv1〜3すべての出題アイテムに `note`（補足情報）を通過させる
  ように変更。
- `js/utils.js`：`formatAnswerValue`（true/false→正答/誤答表記変換）と
  `showAnswerDetailPopup`（正答一覧の行クリック時の詳細ポップアップ）を追加。
- `js/resultSystem.js`：失敗画面の正答一覧行をクリック可能にし、詳細ポップアップと連携。
  表記を「正答/誤答」に統一。
- `js/reviewSystem.js`：タイピング復習・訂正問題solve側の結果行にユーザーの回答・
  補足情報を渡すよう変更し、クリックで詳細ポップアップを表示するようにした。
- `js/csvManager.js`：CSVヘッダーに `question_set` / `note` を追加。パース・エクスポート
  双方を対応させた。
- `js/gameState.js`：`state.map`のキー変更に関するコメントを更新（コードの変更なし）。

### 11.3 仕様に明記が無く判断した点（要レビュー）

1. **配色変更の適用範囲**：待受画面（ログイン画面）とキャラクター完成・称号獲得の
   全画面演出は、専用の暗い背景（ハードコードされたグラデーション／`rgba`値）を
   使った「特別な演出」であるため、今回の配色変更（グレー背景・黒文字）の対象外とした。
   これらの画面まで黒文字にすると、暗い背景の上で文字が読めなくなるため。
   ボタン（`.btn-secondary`・`.icon-btn`）も、既存の配色を保つために専用変数へ切り離した。
2. **「強調（URL）は水色」の適用箇所**：現状のアプリ内に実際のURL（`<a>`タグ）は
   存在しないため、`a, a:visited { color: var(--color-link); }` というCSSルールを追加し、
   将来URLを含むコンテンツが追加された際に自動的に水色になるようにした。加えて、
   任意のテキストに使える `.text-link` ユーティリティクラスも用意した。
3. **エリア画面のタイトル表示**：正方形ブロックの見出しには `genre.title`（称号用の
   長い呼び方、例：「英語のはじめの一歩」）ではなく `genre.name`（短い呼び方、例：「英語」）
   を採用した。正方形の限られたスペースに収まりやすく、地図上のラベルとして読みやすい
   ことを優先した判断。
4. **問題セット画面の建築物バッジ**：旧エリア一覧にあった「🏛 配置可能な建物：X件」の
   表示は、建築物がエリア（ジャンル）単位のデータであり問題セット単位ではないため、
   新しい問題セット画面（画面②）には表示しないこととした。ユーザーからは「タイトルと
   解放率」のみが要件として挙げられているため、エリア画面（画面①）にもこの数値は
   表示していない。将来的に必要であれば、エリア画面のブロック内に追加する形で対応可能。
5. **CSVのquestion_set列と手入力欄の優先順位**：CSVの行に`question_set`が指定されて
   いればそれを優先し、無い行は設定画面の「問題セット名」入力欄の値にフォールバックする
   方式にした。1つのCSVファイル内で複数の問題セットに振り分けられるようにするため。
   全ての行に`question_set`が指定されていれば、手入力欄は空でも取り込み可能。
6. **正答一覧の詳細ポップアップの「補足情報が無い場合」の表示**：補足情報（note）が
   無い問題では「補足情報はありません」という文言を表示することとした（無言で空欄に
   すると「読み込みに失敗したのでは」という誤解を招くと判断したため）。
7. **ステージの輪郭線の色**：霧の色（暗い紺）や背景（グレー系に変更後）のどちらの上でも
   視認できるよう、輪郭線の色は白（`#ffffff`）で固定した。

### 11.4 既存機能への影響

- 配色変更はCSSのみの変更であり、JavaScriptのロジック（確率計算・データ構造など）には
  一切影響しない。
- エリア／問題セット／ステージの3階層化に伴い、`state.map`の永続化キーをジャンルIDから
  問題セットIDに変更した（11.5節に詳細と対応方針を記載）。ステージの座標データ以外
  （`stageProgress`・`blueprints`・`buildings`など）のデータ構造・キーは一切変更していない。
- CSVヘッダーに列を2つ追加したが、`REQUIRED`（必須列）には含めていないため、旧形式
  （列が無い）CSVファイルも引き続きインポート可能（後方互換あり）。
- 設定画面のアコーディオン化はUIの見た目のみの変更であり、各セクション内の機能
  （ジャンル追加・CSVインポート等）のロジックには変更を加えていない（アコーディオンの
  開閉状態は保持しないが、次回描画時に「アカウント情報」のみ初期状態で開いた状態にした）。

### 11.5 【要レビュー】state.mapのキー変更について

ステージ地図を「ジャンル単位」から「問題セット単位」の画面に分割したことに伴い、
`state.map`の永続化キーを`genreId`から`questionSetId`に変更した。これにより、
**このセッションより前に保存された既存のセーブデータでは、ステージの座標（地図上の
位置）が新しいキーの下に存在しないため、初回アクセス時に自動的に再生成される**
（`mapSystem.js`の`ensureQuestionSetMap`が「無ければ生成する」設計になっているため、
エラーにはならず、単に配置が振り出しに戻るだけ）。ステージの座標はゲームプレイ上の
進捗データではなく見た目上のレイアウトに過ぎないため、実害は無いと判断した。
旧キー（ジャンルID）で保存されていたデータはstate内に残り続けるが、参照されなくなる
だけで害はない（今後のセッションで気になる場合は、`migrateIfNeeded()`に旧キーの
削除処理を追加してもよい）。

### 11.6 動作確認方法（次のAI/開発者が実施すること。本セッションはブラウザ実行環境が
無く目視確認ができていないため、必ず実施すること）

1. ローカルサーバーで配信して開く（`python3 -m http.server` 等）。
2. ログイン後、ホーム画面・探索画面・設定画面の配色が「グレー背景・黒文字・茶色の
   パネル」になっており、ボタン（オレンジ/緑/紺）の色が変わっていないことを確認する。
3. 探索画面→「未知の霧」→ **エリア画面が1000×1000のグリッドで、ジャンルが正方形の
   ブロックとして表示され、タイトルと解放率が読めること**を確認する。
4. ブロックをタップ→ **問題セット画面**（カード一覧）に遷移することを確認する。
5. カードをタップ→ **ステージ地図**（選んだ問題セットのステージのみ）に遷移し、
   霧が濃い状態でも**白い輪郭線でステージの位置が分かる**ことを確認する。
6. ステージをクリアして建物を配置→名前変更→拡張のフローが、問題セット単位の地図に
   戻ってきても壊れていないことを確認する（`questionSetId`が正しく引き継がれているか）。
7. 設定画面が**アコーディオン形式**になっており、「エリア名の変更」でジャンル名・
   称号用の呼び方を変更できること、「問題セットの管理」で追加・名前変更・削除が
   できることを確認する。
8. 設定画面→CSVエクスポートで出力したファイルに`question_set`・`note`列が含まれる
   ことを確認する。同ファイルを一部の行だけ`question_set`を変えてインポートし、
   **複数の問題セットに振り分けられる**ことを確認する。
9. Lv1（正誤問題）の回答ボタンが「正答/誤答」表記になっていることを確認する。
10. クエスト失敗時の答え合わせ画面・復習の答え合わせ画面で、行をクリックすると
    問題文・（誤答の場合のみ）自分の回答と正答の比較・補足情報がポップアップで
    表示されることを確認する（補足情報が無い問題では「補足情報はありません」と
    表示されることも確認する）。

### 11.7 次フェーズへの引き継ぎ事項

- 9.8節・10.6節の残課題（地図拡張の実装、霧の奥のシルエット演出、キャラクター/建築物
  画像のアップロード機能）は引き続き未着手。
- 問題セットの削除は、含まれるステージ・問題・関連する復習スケジュール等を一括で
  削除するが、**削除確認は`confirm()`（ブラウザ標準ダイアログ）のみ**であり、専用の
  確認モーダルは実装していない。個人利用アプリとして許容範囲と判断したが、誤操作が
  気になる場合は確認モーダルへの置き換えを推奨する。
- CSVインポートの`question_set`列によるグループ分けは、ステージ名（`stageNameInput`）は
  今回のインポート全体で共通のままとした（問題セットごとに異なるステージ名を
  1回のインポートで同時指定することはできない）。必要であれば、CSVに`stage_name`列を
  追加する形で拡張できる（`csvManager.js`のパース処理・`router.js`のグループ化処理を
  同様のパターンで拡張すればよい）。
- 本セッションはブラウザ実行環境が無く、Playwright等でのローカルサーバー起動・
  自動テストも試みたがネットワーク（localhost含む）がサンドボックス側で無効化されて
  おり実施できなかった。**次回セッションで必ず11.6節の目視確認を行うこと。**

---

## 12. 2026-09-09セッションでの追加実装（設定画面の再編・画像アップロード機能・GitHub自動保存）

### 12.1 目的

前回セッションまでの設定画面には、ジャンル追加／問題セット管理／仲間の誘致／
称号追加／バックアップ／問題データ管理…といった機能が個別のアコーディオンとして
並んでいたが、今回のユーザー要望により以下の再編を行った。

1. キャラクター追加時に画像をアップロードでき、それを自動でGitHubリポジトリの
   `assets/img/`に保存する仕組みを追加する。
2. 「アカウント情報」に「現在の状況確認」を統合する。
3. 「仲間の誘致」を「未開の情報」に改称し、ジャンル／問題セット／キャラクター／
   建築物／称号を切り替えて追加できるタブ形式にする。ジャンル・問題セットには
   背景画像アップロード、キャラクター・建築物には画像アップロードを追加する。
   建築物タブは、キャラクター追加と同じ入力内容・条件（🧭20消費）にする。
4. 「バックアップ画面」と「問題データ管理」を統合する。
5. 「認識改変」画面を新設し、ジャンル／問題セット／キャラクター／建築物／称号を
   選択して変更できるようにする。
6. GitHubにassetsフォルダを追加する権限がAIセッション側に無い（0章参照）ため、
   アプリ内から直接GitHub Contents APIを叩いて画像を保存する経路を実装しつつ、
   未設定時はブラウザ内（dataURL）に保存し、JSONバックアップ・IndexedDBの
   自動保存にも自然に乗るようにする。

### 12.2 実装内容

- **`js/assetManager.js`（新規）**：画像アップロードの一元窓口。
  `AssetManager.uploadImage(file, folderHint)`は、
  `state.user.settings.github`（owner/repo/branch/token）が設定済みなら
  GitHub Contents API（`PUT /repos/{owner}/{repo}/contents/assets/img/{filename}`）
  へ直接PUTし、成功すれば`raw.githubusercontent.com`のURLを返す。未設定、または
  通信失敗時はdataURL（Base64）にフォールバックする。トークンは
  `state.user.settings.github.token`としてIndexedDB/LocalStorageにのみ保存され、
  `api.github.com`以外には送信しない（Anthropic等の外部サーバーには一切送らない）。
  戻り値の`image`文字列は`<img src>`にも、SVGの`<image href>`にもそのまま使える。
- **`js/gameState.js`**：`state.buildingDefs`（建築物の「定義」。仲間の誘致と対になる
  仕組み）と`state.user.settings.github`のデフォルト値・マイグレーションを追加。
- **`js/buildingSystem.js`**：`recruitBuildingType()`（🧭20消費で建築物の名前・
  ジャンル・画像を登録し、即座に配置可能枠を1つ増やす）、`editBuildingDef()`、
  `setBuildingImage()`を追加。`placeBuilding()`は、未使用の`buildingDefs`が
  そのジャンルにあれば名前・画像を自動的に引き継ぐよう変更。
- **`js/characterSystem.js`** / **`js/titleSystem.js`**：それぞれ`editCharacterDef()`・
  `editCustomDef()`を追加（「認識改変」からの編集用）。
- **`js/utils.js`**：`Utils.iconOrImage(value, className)`を追加。値が
  dataURL/URLなら`<img>`、そうでなければ従来どおり絵文字の`<span>`を返す
  共通ヘルパー。
- **`js/gachaSystem.js`**：キャラクターカード・完成演出の画像表示を
  `Utils.iconOrImage()`経由に変更（アップロード画像にも対応）。
- **`js/mapSystem.js`**：
  - 建築物アイコンの表示を、`building.image`があればSVGの`<image>`要素、
    無ければ従来の絵文字テキストに切り替え。
  - エリア画面（画面①）の正方形ブロックに、ジャンルの`backgroundImage`が
    あれば重ねて表示。
  - 問題セット画面（画面②）のカードに、問題セットの`backgroundImage`が
    あれば背景画像として表示（`css/map.css`に`.area-list-card.has-bg-image`を追加）。
- **`js/router.js`**：`renderSettingsScreen()`を全面的に書き直し、以下の構成にした。
  1. 「アカウント情報」（旧・現在の状況確認を統合。累計/連続ログイン日数・
     保存方式・エリア進捗・所持キャラクター・所持建築物を1箇所で確認できる）
  2. 「バックアップ・問題データ管理」（バックアップJSON出力/読込・問題データ
     全出力・ジャンル別CSVエクスポート/インポートを統合）
  3. 「画像自動保存設定（GitHub連携）」（新規。owner/repo/branch/tokenの入力欄）
  4. 「未開の情報」（旧・仲間の誘致。タブでジャンル／問題セット／キャラクター／
     建築物／称号の追加フォームを切り替え。ジャンル・問題セットには背景画像、
     キャラクター・建築物には画像のアップロード欄を追加。建築物タブは
     キャラクタータブと同じ🧭20消費）
  5. 「認識改変」（新規。タブでジャンル／問題セット／キャラクター／建築物／称号を
     選択し、名前・画像・背景画像・称号条件などを編集できる。問題セットの削除も
     ここに統合した）
  - 上記に伴い、共通ヘルパー`buildTabPanel(tabs)`（タブ切り替えUI）と
    `buildImageUploadField(labelText, folderHint, initialValue)`
    （画像アップロード欄。内部で`AssetManager.uploadImage()`を呼ぶ）を追加した。
- **`css/style.css`**：`.settings-tabs` / `.settings-tab-btn` / `.settings-tab-content` /
  `.image-upload-field` / `.image-upload-preview`を追加。
- **`css/gacha.css`**：`.character-card-image.as-image` / `.character-complete-image.as-image`
  を追加（アップロード画像表示時のサイズ・角丸調整）。
- **`css/map.css`**：`.area-list-card.has-bg-image`を追加。

### 12.3 データモデル変更

```
state.buildingDefs = [
  { id, name, genreId, image, source: "custom" }
]
state.user.settings.github = { owner: "", repo: "", branch: "main", token: "" }

// 既存の building オブジェクトに以下を追加
building.defId  // buildingDefsのid（未使用の定義から引き継いだ場合のみ）
building.image  // dataURL または GitHubのURL

// 既存の genre / questionSet オブジェクトに以下を追加（任意項目）
genre.backgroundImage
questionSet.backgroundImage
```

いずれも新規の任意項目（オプショナル）として追加しており、旧セーブデータでは
単に`undefined`（＝画像なし＝従来どおり絵文字/無地表示）として扱われるため、
後方互換性の問題は無い。`buildingDefs`と`user.settings.github`は
`migrateIfNeeded()`で旧セーブへの補完処理を入れてある。

### 12.4 既知の簡略化・未解決事項（要レビュー）

- 「認識改変」のキャラクタータブ・建築物タブには、削除機能を実装していない
  （キャラクターは欠片収集の進行中データと紐付いており、建築物はマップ上の
  マスに配置済みのため、削除すると復習報酬の整合性が崩れる可能性がある。
  安全側に倒し、名前・画像の変更のみとした）。
- 「未開の情報」の建築物タブ（`recruitBuildingType`）は、仕様書には元々
  存在しない機能で、今回のユーザー要望により新設したもの。既存の「設計図
  9枚を集めて建築物を完成させる」フロー（仕様18〜22章）とは別の入手経路
  として、`state.blueprints[genreId].completedCount`を直接+1する形で
  実装した。設計図経由の完成とこの経路の建築物は、配置後は区別なく
  同じ`state.buildings`エントリとして扱われる。
- GitHub Contents APIへの自動保存は、ブラウザから直接`fetch()`する実装で
  あり、ユーザー自身が発行したPersonal Access Token（`repo`権限が必要）を
  設定画面に入力する運用を想定している。本セッションはネットワークが
  無効化されたサンドボックス環境のため、実際にGitHub APIへのPUTが成功する
  ことは**未検証**（コードレビューベースでは仕様どおりのリクエスト形式に
  なっている）。次回、実際のトークンで動作確認することを推奨する。
- 画像はdataURL（Base64）のまま`state`に保存されるため、大きな画像を
  多数登録するとIndexedDBの保存容量・バックアップJSONのファイルサイズが
  増大する。将来的に、アップロード時に画像を一定サイズへリサイズ/圧縮する
  処理を`assetManager.js`に追加することを推奨する（未実装）。
- 「認識改変」の称号タブは、仕様63章の「基本称号」（ビルトイン）は編集対象に
  含めていない（条件がコード側に埋め込まれているため）。ユーザーが
  「未開の情報」から追加した独自称号（`titleDefs`）のみが対象。

### 12.5 動作確認方法（次のAI/開発者が実施すること。本セッションはネットワークが
無効化されておりGitHub API呼び出しの実機確認ができていないため、必ず実施すること）

1. ローカルサーバーで配信して開く（`python3 -m http.server` 等）。
2. 設定画面を開き、「アカウント情報」に土地解放状況・所持キャラクター・
   所持建築物が表示されていることを確認する。
3. 「未開の情報」でタブが5つ（ジャンル/問題セット/キャラクター/建築物/称号）
   切り替えられることを確認する。
4. 「未開の情報」→キャラクタータブで画像ファイルを選択し、プレビューが
   表示されること、🧭20消費でガチャの排出対象に追加されることを確認する
   （GitHub連携が未設定の場合はdataURLとして保存され、ガチャ画面のカードに
   画像が表示されることを確認）。
5. 「未開の情報」→建築物タブで同様に登録し、その後「未知の霧」画面で
   クリア済みステージの空きマスに建築物を配置→登録した名前・画像が
   反映されることを確認する。
6. 「認識改変」で既存のジャンル名・問題セット名・キャラクター名・建築物名・
   独自称号の条件を変更し、保存後に画面へ反映されることを確認する。
7. 「画像自動保存設定（GitHub連携）」に実際のowner/repo/branch/Personal
   Access Tokenを入力して保存し、その後画像をアップロードして、
   実際にリポジトリの`assets/img/`にファイルが追加されることを確認する
   （**本セッション未検証**。最重要の確認事項）。
8. 「バックアップ・問題データ管理」が1つのアコーディオンに統合されており、
   従来のバックアップ出力/読込・CSV出力/取込が問題なく動作することを確認する。

### 12.6 次フェーズへの引き継ぎ事項

- 12.4節の「GitHub API呼び出しの実機未検証」が最優先の確認事項。トークンの
  権限不足時（403）やリポジトリ名の誤り時のエラーメッセージが分かりやすいかも
  合わせて確認すること。
- 画像の圧縮・リサイズ（12.4節）は今後の課題として残っている。
- 「認識改変」からのキャラクター/建築物の削除機能は未実装（12.4節参照）。
  要望があれば、進行中データが無いこと（欠片0個、未配置）を条件に削除を
  許可する形で追加できる。

---

## 13. 2026-09-09セッションでの追加実装（UI改修・データ管理タブ化・カード機能など）

このセッションでは、以下の個別要望対応を行った。コードの構造やデータモデルに
大きな変更はなく、既存の各システムへのピンポイントな追加・改修が中心。

### 13.1 名称変更

- 「画像自動保存設定（GitHub連携）」→「GitHub連携」（router.js）。
- 「問題セット」という表記を、ユーザー向けの文言（ボタン・ラベル・トースト・
  プレースホルダー）に限り「道」へ全面リネーム（router.js, mapSystem.js）。
  内部の変数名・関数名・screen名（questionSetSelect等）・CSVのquestion_set
  列名はそのまま維持し、表示文言のみを変更した。
- 地図画面のナビゲーション：「← 問題セット一覧」→「道の選択」、
  「← エリア画面」→「エリア選択」（矢印記号は要望どおり削除）。
- ホーム画面右上の保存ボタン：「💾 保存」→「終了」（絵文字を削除。処理内容＝
  バックアップJSON出力は変更していない）。

### 13.2 設定画面の並び順変更

`renderSettingsScreen`内の描画順を、要望どおり
アカウント情報→未開の情報→認識改変→GitHub連携→データ管理 に変更した。

### 13.3 「データ管理」タブ化（旧「バックアップ・問題データ管理」）

`renderBackupAndDataGroup`を全面書き換えし、`buildTabPanel`（既存の
「未開の情報」等で使っていたタブUIヘルパー）を再利用して5タブ構成にした：
バックアップ／全問題／エリア別／道別／ステージ別。

各タブで「JSON・CSVの形式選択（ラジオボタン）」と「出力・入力の両方」が
可能。実装のポイント：

- **csvManager.js**：CSVヘッダーに`stage`列を追加（`id,genre,question_set,
  stage,question,answer,antonym,synonyms,unrelated,generate_question,note`）。
  `toJSON()`（問題データのJSON出力）、`parseQuestionsJSON()`（JSON入力の
  検証・変換。parseQuestionsCSVと同じ戻り値の形）、`collectQuestions(state,
  filter)`（genreId/questionSetId/stageIdによる範囲抽出。エクスポート用）、
  `applyImportedQuestions(mutableState, questions, opts)`（インポートされた
  questionsを、scope（all/genre/questionset/stage）に応じて実際のGameStateへ
  配置する。道・ステージが無ければ自動作成。ジャンルもallスコープ時は
  genre列から自動解決・自動作成）を新規追加した。
- **importExport.js**：`exportBackupAsCSV()`（バックアップ全体を1セルの
  JSON文字列としてCSV化。表形式に馴染まないデータ全体をCSVとして出力する
  ための現実的な折衷案。列名は`backup_json`固定）、
  `importBackupFromCSVFile()`を追加。既存の`importBackupFromFile`（JSON）と
  共通のリストア処理（`restoreFromObject`）を経由するようリファクタリング
  した。
- **router.js**：`buildFormatSelector()`（JSON/CSVラジオボタン共通部品）、
  `renderDataMgmtBackupTab()`、`renderDataMgmtQuestionsTab(container, scope)`
  を新規追加。範囲選択（対象エリア／対象の道／対象ステージのプルダウン）は
  scopeに応じて必要な分だけ表示される。インポート時、行に道名・ステージ名の
  列が無い場合に使うフォールバック入力欄も用意した。

**既知の割り切り**：「バックアップ」タブのCSV形式は、建築物・キャラクター・
コンパス等の非表形式データを含む都合上、バックアップJSON全体を1セルに
格納したCSVとした（実用上はJSON形式での運用を推奨し、CSVは「要望に
CSV/JSONどちらも」とあったための対応という位置づけ）。

### 13.4 並び替え問題（Lv3）の「#...#」グルーピング

`questionSystem.js`の`buildLv3`に`tokenizeForReorder(answer)`を追加。
`answer`文字列を1文字ずつに分割する際、`#`で挟まれた区間は複数文字でも
1トークンとしてまとめる（例："ab#cde#fg" → ["a","b","cde","f","g"]）。
`#`自体はトークンに含めない。閉じ`#`が無い場合はその`#`を無視する。
`correctAnswer`もこのトークン列を`join("")`した値（`#`を含まない）に
変更したので、quizSystem.js側の正誤判定ロジックは変更不要だった。

### 13.5 結果画面（Fail時）の機能追加

`resultSystem.js`の`renderFailScreen`を改修：

- 「再挑戦する」に加えて「ステージへ」ボタンを追加。`GameState.
  findStageContext(stageId)`でジャンル・道を特定し、`areaMap`画面（該当の
  道のステージ地図）へ遷移する。
- 「再挑戦する」の上に「カード」ボタンを追加。押すと今回出題された問題を
  フラッシュカード形式で1問ずつ確認できる`renderFlashcardScreen`へ遷移する
  （新規追加関数）。カードをタップすると問題文⇔正答が切り替わり、
  「← 前へ／次へ →」で他のカードへ移動できる。「結果へ戻る」で
  Fail画面に戻る（状態はクロージャで保持）。

### 13.6 正答一覧ポップアップへの「補足追加」ボタン

`utils.js`の`showAnswerDetailPopup`を改修し、`questionId`を受け取れるように
した（`resultSystem.js`・`reviewSystem.js`の呼び出し元も対応済み）。
ポップアップ右上に「補足追加」ボタンを設置し、押すと`window.prompt`で
補足情報を入力できる。保存すると`GameState.findQuestionById(questionId)`
（gameState.jsに新規追加）経由で、GameState上の問題データ本体の`note`
フィールドを直接更新する（自動保存の対象）。

**既知の簡略化**：補足情報の入力に`window.prompt`（ブラウザ標準ダイアログ）
を使った。デザインの統一感という点では独自モーダル＋テキストエリアの方が
望ましいが、実装コストと動作確実性を優先した。要望があれば独自UIに
差し替え可能。

### 13.7 共通ナビゲーション・レイアウト

- `css/layout.css`：`.main-nav`を`flex:1`均等割りから`justify-content:
  center; gap: clamp(28px, 12vw, 96px);`へ変更し、ホーム/探索/設定の
  間隔を広げた。`.nav-label`に`white-space: nowrap;`を追加し、「ホーム」
  ラベルが折り返さず1行で表示されるようにした。

### 13.8 動作確認方法（このセッション分）

1. 設定画面を開き、上から アカウント情報→未開の情報→認識改変→
   GitHub連携→データ管理 の順に並んでいることを確認する。
2. 「データ管理」アコーディオンを開き、5つのタブ（バックアップ/全問題/
   エリア別/道別/ステージ別）が切り替えられること、各タブでJSON/CSVの
   選択・出力・入力（ファイル選択→取り込む）が一通り動作することを確認する
   （特に「全問題」でのJSON一括出力→別データへの取り込みが往復できるか）。
3. 「未開の情報」「認識改変」のタブラベルが「道」になっていることを確認する。
4. ホーム画面右上のボタンが絵文字なしの「終了」になっていることを確認する。
5. エリア→道→ステージの画面遷移で、ヘッダーのボタンが「エリア選択」
   「道の選択」になっていることを確認する。
6. CSVで並び替え問題(Lv3)のanswer列に`ab#cde#fg`のようなデータを入れて
   出題し、"cde"がバラバラの文字にならず1つの選択肢（チップ）として
   表示されることを確認する。
7. Lv1〜Lv3のいずれかでわざと誤答してFail画面を出し、「ステージへ」で
   地図へ戻ること、「カード」でフラッシュカード画面が開きタップで
   表裏が切り替わること、正答一覧の行をタップして開くポップアップ右上の
   「補足追加」から補足情報を保存できることを確認する。

### 13.9 次フェーズへの引き継ぎ事項

- 「補足追加」の入力UIをwindow.promptから専用モーダルに置き換えると
  UI/UXが向上する（13.6節参照）。
- 「データ管理」バックアップタブのCSV形式は現状「1セルJSON」という
  実用重視の折衷実装（13.3節）。将来的に本格的な表形式が必要になった
  場合は仕様の再検討が必要。
- GitHub連携の実機検証（12.6節から持ち越し）は依然未実施。

## 14. 2026-09-13セッションでの追加実装（7項目の機能追加要望）

このセッションでは、ユーザーから提示された7項目の追加要望に対応した。

### ①「全問題入力」のID重複解決機能
- 問題：CSV/JSON入力時、既存データとID重複する行は今までエラー扱いで無条件に
  スキップされていた（＝再インポートで内容更新ができず、実質「入力できない」状態だった）。
- 対応：`csvManager.js`の`parseQuestionsCSV`/`parseQuestionsJSON`を変更し、
  重複IDの行は`errors`ではなく`conflicts`配列（`{lineNo, id, incoming}`）に分離するようにした。
  非重複の行は今まで通り即座に取り込まれる。
- `router.js`のデータ管理タブ（全問題／エリア別／道別／ステージ別、共通）に、
  重複が見つかった場合の解決UIを追加。行ごとに「旧（既存）を残す」「新（取込データ）を
  採用する」のラジオボタン、および「すべて新を採用」「すべて旧を残す」の一括ボタンを表示し、
  「重複の解決を反映する」ボタンで確定する。
- `csvManager.js`に`applyConflictResolutions(state, resolutions)`を追加。
  「新」を選んだ場合、該当IDの問題データ（question/answer/note等）を新データで
  丸ごと上書きする。**配置場所（道・ステージ）は変更しない**（IDが同じ＝同一問題が
  更新されたとみなす設計。移動が必要な場合は別途「編集」機能を使う想定）。

### ②動画の縦横自動切り替え・再生中の切り替え防止
- `app.js`の`playCutscene(baseName, fallbackText)`のシグネチャを変更（以前は
  `playCutscene(src, fallbackText)`で直接パスを渡していた）。`baseName`（"open"や"gacha"）
  を渡すと、**再生開始の一瞬だけ**画面の縦横判定（`window.innerHeight >= innerWidth`で
  縦長と判定）を行い、縦長なら`_mobile`付きファイル（例：`open_mobile.mp4`）、横長なら
  通常ファイル（例：`open.mp4`）を選ぶ。判定は再生開始時の1回のみで、以後resizeイベント等
  では見ないため、再生中に画面が回転しても動画はそのまま最後まで再生される
  （要望通りの仕様）。呼び出し側（`gachaSystem.js`・`router.js`）も新シグネチャに変更済み。
- **要確認**：`open_mobile.mp4` / `gacha_mobile.mp4` は実ファイルとして
  `assets/video/`配下に別途配置する必要がある（存在しない場合は、動画読み込み失敗時の
  通常のフォールバック処理＝CSS/テキストフォールバックが働く。アプリは停止しない）。

### ③「☆フォルダ」（3回以上間違えた問題の翌日再出題・半額報酬）
- `gameState.js`に`state.questionMistakes`（問題IDごとの累計誤答回数）と
  `state.starQuestions`（☆フォルダのエントリ配列）を追加。
- `GameState.recordQuestionMistake(questionId, genreId, stageId, format)`を新設。
  誤答のたびに呼び、累計3回に達した**瞬間のみ**（4回目以降は再登録しない。既にpending中の
  場合も重複登録しない）、翌日（`scheduledDate = 今日+1日`）出題の☆フォルダへ登録する。
  `format`には誤答時の出題形式（`"lv1"|"lv2"|"lv3"|"typing"`）を保存し、翌日
  **同じ形式で単問再出題**するために使う。
- 誤答記録の呼び出し元：`quizSystem.js`の`submitAnswer()`（Lv1〜3の新規学習中）、および
  `reviewSystem.js`の`renderTypingReview`の採点ボタン（1日後・3日後の復習タイピング中）。
  **1週間後（訂正問題）・2週間後・1か月後（ワークシート）の復習は、そもそも「特定の1問に
  対する正誤」という形になっていない（ステージ単位の自己採点・作成問題のため）ので、
  今回は誤答カウントの対象に含めていない。** 対象を広げたい場合は次回セッションで要相談。
- `reviewSystem.js`に`getStarQuestionsDue()`を追加し、「知の探究」画面の最上部に
  ☆フォルダのセクションとして表示（他の復習カテゴリより先に表示）。
  ホーム画面の「残りクエスト数」表示にも☆フォルダの件数を合算した。
- 新画面`"starReviewPlay"`（`reviewSystem.js`内）：該当の問題を、誤答時と同じ形式
  （lv1〜3なら`QuestionSystem.buildQuestionsForLevel`＋`QuizSystem.renderQuestionItem`で
  単問再構築、typingなら簡易的な完全一致タイピング）で単問出題する。
  - 正答時：☆フォルダから外し（`status:"done"`）、誤答カウントを0にリセット。
    報酬は「通常の復習の半分」とし、**コンパスは`REVIEW_COMPLETION_COMPASS`(2)の半分＝1、
    設計図確率は「1日後」基本確率(1%)の半分＝0.5%**を採用した
    （仕様に明記が無いための判断。要レビュー）。
  - 誤答時：☆フォルダに残したまま、`scheduledDate`を翌日に更新し、正答するまで
    毎日出題され続ける。

### ④音読ディクテーション機能（新規モジュール `js/dictationSystem.js`）
- 「霧晴れの開拓日誌」画面に、「読書記録をつける」と並べて「音読ディクテーション」
  ボタンを追加（`diarySystem.js`）。ゲームの主目的・報酬経済（コンパス／ガチャ等）とは
  接続しない、読書記録と同格の任意機能として実装した。
- データ：`state.dictationSets`（1件＝1教材）。各教材は`sentences`（一文ごとの
  テキストと音声対応情報）と`audioFiles`（アップロードした音源。dataURLとして保存）を持つ。
- 実装した機能：
  - テキストの貼り付け／`.txt`ファイル読み込み → 「。！？.!?」および改行を区切りとする
    簡易的な一文分割（`splitTextToSentences`）。
  - 音源のフォルダ一括アップロード（`webkitdirectory`）または複数ファイル選択。
  - **自動での仮分割**：指定した音源1つの総再生時間を、各文の文字数比率で按分して
    開始・終了秒を仮に割り当てる（`autoSplitByCharCount`）。
  - **手動での音声カットと対応**：文ごとに対応する音源ファイル・開始秒・終了秒を指定でき、
    「今の位置を開始/終了にする」ボタンで実際に再生しながら微調整できる。「この範囲を
    試し再生」で確認可能。
  - 練習画面（`dictationPractice`）：一文ずつ音声を再生→聞き取り入力→答え合わせ、
    前後の文への移動、答えを先に見る、が可能。
- **重要な仕様判断（要レビュー）**：「理想は自動でテキストを参照して音声を分割」との
  要望に対し、本格的な音声認識・強制アラインメントはブラウザ内蔵APIの範囲を超えるため
  実装していない。文字数比率による按分という**簡易的な仮分割**にとどめ、その後の
  手動調整で実用精度に近づける設計とした。より高精度な自動分割が必要な場合は、
  Web Speech API（ブラウザ・言語依存で精度が不安定）の利用可否を含めて次回相談したい。
- 音声はdataURLでIndexedDBに保存するため、長時間・大量の音源を登録すると
  バックアップJSONの出力サイズが大きくなる点に注意（既存の画像アップロードと同じ
  トレードオフ）。

### ⑤読書記録のアコーディオン化
- `readingSystem.js`の「章ごとの要約」「抽象（本の要約）」「抽象⇄具体」
  「批判的読書テンプレート」の4セクションを、既存の`.settings-accordion`
  （`<details>`/`<summary>`、設定画面と同じ見た目）で開閉できるようにした。
  「本の要約」は今まで基本情報パネルの一部だったが、独立したアコーディオンとして
  切り出した（「抽象」という項目名との対応）。「引用」セクションは要望の4項目に
  含まれていなかったため、今まで通り常時表示のパネルのままにしてある。

### ⑥ログイン／終了のバックアップファイル方式への変更
- 待ち受け画面の「ログイン」ボタン：クリックすると非表示のファイル選択（`.json`）が開き、
  デバイス上のバックアップファイルを選ぶと、それを読み込んでログインする
  （`ImportExport.importBackupFromFile`を使用）。
- 初回利用やバックアップファイルが手元にない場合のために、「この端末の保存データで
  続ける」という2つ目のボタンを追加し、従来通りIndexedDB/LocalStorageの保存データ
  （無ければ初期データ）で開始できるようにしてある（**要望に無い部分を独自に補った
  箇所。不要であれば削除できる**）。
- ホーム画面の「終了」ボタン：`GameState.persist()`を明示的に呼んでDBへの保存を
  確定させてから、従来通りバックアップJSONを書き出すようにした（今まではpersistを
  明示的に呼んでいなかった。もっとも自動保存は各操作後に動いているため、実害としては
  「タブを閉じる直前の1操作分」程度だが、要望通り明示化した）。

### ⑦ホーム画面アイコン変更
- ホーム画面左上のガチャ導線ボタンの絵文字を🎰から📔に変更（`router.js`）。
  ボタンの遷移先ロジック（前日の日記が未記録なら日記画面、記録済みならガチャ画面）は
  変更していない。日記／ガチャ画面自体の🎰表記（`diarySystem.js`内）は要望が
  「ホーム画面の」と明記されていたため変更していない。

### 動作確認方法
全JSファイルで`node --check`、全CSSファイルで中括弧の対応数チェックを実施し、
いずれも問題なし。ブラウザでの実機能テスト（ファイル選択・音声アップロード・
動画切り替えなど）はサンドボックスのネットワーク制限により未実施。次回セッションで
実ブラウザでの動作確認を推奨（特に②の動画切り替えと④の音声アップロード・再生）。

### 次回セッションへの申し送り
- ③の誤答カウント対象を、1週間後以降の復習形式にも広げるかどうかの方針確認。
- ④の音声自動分割の精度向上要否（Web Speech API等の利用可否）。
- ⑥の「この端末の保存データで続ける」ボタンの要否確認（要望を厳密に読むと
  ログイン＝ファイル選択のみで良い可能性もある）。
