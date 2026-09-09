/**
 * questionSystem.js
 * -----------------------------------------
 * 生の問題データからLv1/Lv2/Lv3それぞれの出題形式を組み立てる。
 */

const QuestionSystem = (() => {

  function buildLv1(questions) {
    return questions.map((q) => {
      const showCorrect = Math.random() < 0.5;
      let shownAnswer = q.answer;
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
    if (q.antonym) return q.antonym;
    if (q.unrelated && q.unrelated.length > 0) return Utils.shuffle(q.unrelated)[0];
    const others = pool.filter((o) => o.id !== q.id);
    if (others.length > 0) return Utils.shuffle(others)[0].answer;
    return "（不明）";
  }

  function buildLv2(questions) {
    return questions.map((q) => {
      const choices = new Set();
      choices.add(q.answer);
      if (q.synonyms && q.synonyms.length > 0) choices.add(Utils.shuffle(q.synonyms)[0]);
      if (q.antonym) choices.add(q.antonym);
      if (q.unrelated && q.unrelated.length > 0) choices.add(Utils.shuffle(q.unrelated)[0]);

      const others = Utils.shuffle(questions.filter((o) => o.id !== q.id));
      let i = 0;
      while (choices.size < 4 && i < others.length) {
        choices.add(others[i].answer);
        i++;
      }

      return {
        questionId: q.id,
        type: "multiple_choice",
        prompt: q.question,
        choices: Utils.shuffle([...choices]).slice(0, 4),
        correctAnswer: q.answer,
        note: q.note || "",
      };
    });
  }

  /**
   * 【追加要望対応】並び替え問題(Lv3)のトークン分割。
   * answer文字列を1文字ずつのトークンに分割するが、"#"で挟まれた範囲は
   * 複数文字であっても1つのトークンとしてまとめて扱う（例："ab#cde#fg" →
   * ["a","b","cde","f","g"]）。"#"自体は出力トークンに含めない。
   * 閉じ"#"が見つからない場合は、その"#"は単なる区切り忘れとみなして無視する。
   */
  function tokenizeForReorder(answer) {
    const tokens = [];
    let i = 0;
    while (i < answer.length) {
      if (answer[i] === "#") {
        const end = answer.indexOf("#", i + 1);
        if (end !== -1) {
          const group = answer.slice(i + 1, end);
          if (group.length > 0) tokens.push(group);
          i = end + 1;
          continue;
        }
        i++; // 閉じ"#"が無い場合はこの"#"を読み飛ばす
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

  return { buildQuestionsForLevel };
})();
