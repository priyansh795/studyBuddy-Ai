const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY || "";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function fallback(topic, difficulty, count) {
  const base = [
    {
      question: `Which statement best describes the main idea of ${topic}?`,
      options: [
        "A core concept used to understand the topic",
        "A type of computer hardware",
        "A file format",
        "A programming language"
      ],
      answer: 0,
      explanation: "Start by connecting the topic to its core definition and purpose."
    },
    {
      question: `What is a useful first step when learning ${topic}?`,
      options: [
        "Understand the fundamentals",
        "Skip to the hardest problem",
        "Memorize random answers",
        "Avoid examples"
      ],
      answer: 0,
      explanation: "Fundamentals provide the base for solving more advanced questions."
    },
    {
      question: `Which method can improve understanding of ${topic}?`,
      options: [
        "Practice with examples",
        "Read once and never revise",
        "Ignore mistakes",
        "Skip exercises"
      ],
      answer: 0,
      explanation: "Active practice and reviewing errors strengthen understanding."
    },
    {
      question: `If you make a mistake while studying ${topic}, what should you do?`,
      options: [
        "Review why it was wrong",
        "Ignore it",
        "Stop studying",
        "Memorize the wrong answer"
      ],
      answer: 0,
      explanation: "Error review helps reveal and fix gaps in understanding."
    },
    {
      question: `Which is a useful revision method for ${topic}?`,
      options: [
        "Self-testing and spaced revision",
        "One session only",
        "Never revisit the topic",
        "Copying answers"
      ],
      answer: 0,
      explanation: "Self-testing and spaced revision support long-term learning."
    }
  ];

  return Array.from({ length: count }, (_, i) => ({
    ...base[i % base.length],
    question: `${base[i % base.length].question} (${difficulty})`
  }));
}

function cleanQuestions(parsed, count) {
  if (!Array.isArray(parsed?.questions)) {
    throw new Error("Gemini returned an invalid quiz structure.");
  }

  const questions = parsed.questions
    .slice(0, count)
    .map(q => ({
      question: String(q.question || ""),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      answer: Number(q.answer),
      explanation: String(q.explanation || "")
    }))
    .filter(q =>
      q.question &&
      q.options.length === 4 &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < 4
    );

  if (questions.length !== count) {
    throw new Error(`Gemini returned ${questions.length} valid questions; expected ${count}.`);
  }

  return questions;
}

async function aiQuiz(body) {
  const topic = String(body.topic || "General Studies").slice(0, 200);
  const difficulty = ["Easy", "Medium", "Hard"].includes(body.difficulty)
    ? body.difficulty
    : "Medium";
  const count = Math.min(15, Math.max(1, Number(body.count) || 5));

  if (!API_KEY) {
    return {
      source: "demo",
      questions: fallback(topic, difficulty, count)
    };
  }

  const prompt = `Create a multiple-choice educational quiz.

Topic: ${topic}
Difficulty: ${difficulty}
Student course: ${String(body.course || "").slice(0, 100)}
Subjects: ${Array.isArray(body.subjects) ? body.subjects.slice(0, 15).join(", ") : ""}
Study goal: ${String(body.goal || "").slice(0, 250)}
Number of questions: ${count}

Create exactly ${count} questions.
Each question must have exactly 4 options.
The answer field must be the zero-based index (0, 1, 2, or 3) of the correct option.
Keep explanations short and useful.
Questions should be educational, accurate, and appropriate for a student.
Return JSON only.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.5,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              questions: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    question: { type: "STRING" },
                    options: {
                      type: "ARRAY",
                      items: { type: "STRING" },
                      minItems: 4,
                      maxItems: 4
                    },
                    answer: { type: "INTEGER" },
                    explanation: { type: "STRING" }
                  },
                  required: ["question", "options", "answer", "explanation"]
                },
                minItems: count,
                maxItems: count
              }
            },
            required: ["questions"]
          }
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini API request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  return {
    source: "ai",
    model: MODEL,
    questions: cleanQuestions(parsed, count)
  };
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        aiConfigured: Boolean(API_KEY),
        provider: "Google Gemini",
        model: MODEL
      });
    }

    if (req.method === "POST" && url.pathname === "/api/generate-quiz") {
      const body = await readBody(req);

      try {
        return json(res, 200, await aiQuiz(body));
      } catch (err) {
        console.error("Quiz generation error:", err.message);
        return json(res, 502, {
          error: err.message || "Gemini API request failed."
        });
      }
    }

    if (req.method !== "GET") {
      return json(res, 405, { error: "Method not allowed" });
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";

    const file = path.join(__dirname, pathname);

    if (
      !file.startsWith(__dirname) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      return json(res, 404, { error: "Not found" });
    }

    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream"
    });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`StudyBuddy running at http://localhost:${PORT}`);
  console.log(`Gemini AI: ${API_KEY ? "configured" : "not configured (demo mode)"}`);
});
