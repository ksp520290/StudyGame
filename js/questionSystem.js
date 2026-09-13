/**
 * questionSystem.js
 * -----------------------------------------
 * 生の問題データからLv1/Lv2/Lv3それぞれの出題形式を組み立てる。
 */

const QuestionSystem = (() => {

  function buildLv1(questions) {
    return questions.map((q) => {
      const showCorrect = Math.random() < 0.5;
      let shownAnswer = stripReorderMarkers(q.answer);
      if (!showCorrect) {
        shownAnswer = pickWrongAnswer(q, questions);
      }
      return {
        questionId: q.id,
        type: "true_false",
        prompt: q.question,
        shownAnswer,
        correctAnswer: showCorrect,
        note: q.note || "",
      };
    });
  }

  function pickWrongAnswer(q, pool) {
    if (q.antonym) return stripReorderMarkers(q.antonym);
    if (q.unrelated && q.unrelated.length > 0) return stripReorderMarkers(Utils.shuffle(q.unrelated)[0]);
    const others = pool.filter((o) => o.id !== q.id);
    if (others.length > 0) return stripReorderMarkers(Utils.shuffle(others)[0].answer);
    return "（不明）";
  }

  function buildLv2(questions) {
    return questions.map((q) => {
      const choices = new Set();
      choices.add(stripReorderMarkers(q.answer));
      if (q.synonyms && q.synonyms.length > 0) choices.add(stripReorderMarkers(Utils.shuffle(q.synonyms)[0]));
      if (q.antonym) choices.add(stripReorderMarkers(q.antonym));
      if (q.unrelated && q.unrelated.length > 0) choices.add(stripReorderMarkers(Utils.shuffle(q.unrelated)[0]));

      const others = Utils.shuffle(questions.filter((o) => o.id !== q.id));
      let i = 0;
      while (choices.size < 4 && i < others.length) {
        choices.add(stripReorderMarkers(others[i].answer));
        i++;
      }

      return {
        questionId: q.id,
        type: "multiple_choice",
        prompt: q.question,
        choices: Utils.shuffle([...choices]).slice(0, 4),
        correctAnswer: stripReorderMarkers(q.answer),
        note: q.note || "",
      };
    });
  }

  /**
   * 【追加要望対応】並び替え問題(Lv3)以外（正誤・四択・タイピング等）で答えを表示・照合する際、
   * グループ化記号"*"が残って表示されないよう取り除くためのヘルパー。
   */
  function stripReorderMarkers(text) {
    return String(text == null ? "" : text).split("*").join("");
  }

  /**
   * 【追加要望対応】並び替え問題(Lv3)のトークン分割。
   * answer文字列を1文字ずつのトークンに分割するが、"*"で囲まれた範囲は
   * 複数文字（矢印などの記号を含む）であっても1つのトークン（選択肢）としてまとめて扱う
   * （例："*古代→**中世→**近世→**近代→*" → ["古代→","中世→","近世→","近代→"]）。
   * "*"自体は出力トークンに含めない。閉じ"*"が見つからない場合は、その"*"は
   * 単なる区切り忘れとみなして無視する。
   */
  function tokenizeForReorder(answer) {
    const tokens = [];
    let i = 0;
    while (i < answer.length) {
      if (answer[i] === "*") {
        const end = answer.indexOf("*", i + 1);
        if (end !== -1) {
          const group = answer.slice(i + 1, end);
          if (group.length > 0) tokens.push(group);
          i = end + 1;
          continue;
        }
        i++; // 閉じ"*"が無い場合はこの"*"を読み飛ばす
        continue;
      }
      tokens.push(answer[i]);
      i++;
    }
    return tokens;
  }

  function buildLv3(questions) {
    return questions.map((q) => {
      const tokens = tokenizeForReorder(q.answer);
      let shuffled = Utils.shuffle(tokens);
      if (tokens.length > 1) {
        let guard = 0;
        while (shuffled.join("") === tokens.join("") && guard < 5) {
          shuffled = Utils.shuffle(tokens);
          guard++;
        }
      }
      return {
        questionId: q.id,
        type: "reorder",
        prompt: q.question,
        scrambled: shuffled,
        correctAnswer: tokens.join(""),
        note: q.note || "",
      };
    });
  }

  function buildQuestionsForLevel(level, questions) {
    if (level === "lv1") return buildLv1(questions);
    if (level === "lv2") return buildLv2(questions);
    if (level === "lv3") return buildLv3(questions);
    throw new Error("不明なレベルです: " + level);
  }

  return { buildQuestionsForLevel, stripReorderMarkers };
})();
