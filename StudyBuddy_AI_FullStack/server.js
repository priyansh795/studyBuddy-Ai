const http = require("http");
const fs = require("fs");
const path = require("path");

// ==========================================
// LOAD .ENV
// ==========================================

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    return;
  }

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const index = trimmed.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// IMPORTANT: function ke baad call
loadEnv(path.join(__dirname, ".env"));

// ==========================================
// CONFIG
// ==========================================

const PORT = Number(process.env.PORT || 3000);

const MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const API_KEY =
  process.env.GEMINI_API_KEY || "";

// ==========================================
// JSON RESPONSE
// ==========================================

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

// ==========================================
// READ REQUEST BODY
// ==========================================

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1e6) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });

    req.on("error", reject);
  });
}

// ==========================================
// DEMO QUESTIONS
// ==========================================

function fallback(topic, difficulty, count) {
  const base = [
    {
      question: `Which statement best describes ${topic}?`,
      options: [
        `It is a core concept related to ${topic}`,
        "It is a type of computer hardware",
        "It is a file format",
        "It is a programming language"
      ],
      answer: 0,
      explanation:
        "Understanding the basic definition is the first step in learning a topic."
    },

    {
      question: `What is a good way to learn ${topic}?`,
      options: [
        "Understand fundamentals and practice",
        "Skip the basics",
        "Memorize random answers",
        "Avoid examples"
      ],
      answer: 0,
      explanation:
        "Fundamentals and regular practice improve understanding."
    },

    {
      question: `Which method helps improve knowledge of ${topic}?`,
      options: [
        "Practice questions",
        "Never revise",
        "Ignore mistakes",
        "Skip exercises"
      ],
      answer: 0,
      explanation:
        "Practice helps you identify and fix knowledge gaps."
    },

    {
      question: `What should you do after making a mistake in ${topic}?`,
      options: [
        "Understand why the answer was wrong",
        "Ignore the mistake",
        "Stop studying",
        "Memorize the wrong answer"
      ],
      answer: 0,
      explanation:
        "Reviewing mistakes helps improve understanding."
    },

    {
      question: `Which is useful for revising ${topic}?`,
      options: [
        "Self-testing and spaced revision",
        "Studying only once",
        "Never revisiting the topic",
        "Copying answers"
      ],
      answer: 0,
      explanation:
        "Self-testing and spaced revision support long-term learning."
    }
  ];

  return Array.from({ length: count }, (_, i) => {
    const q = base[i % base.length];

    return {
      question: `${q.question} (${difficulty})`,
      options: [...q.options],
      answer: q.answer,
      explanation: q.explanation
    };
  });
}

// ==========================================
// VALIDATE GEMINI QUESTIONS
// ==========================================

function cleanQuestions(parsed, count) {
  if (!Array.isArray(parsed?.questions)) {
    throw new Error(
      "Gemini returned an invalid quiz structure."
    );
  }

  const questions = parsed.questions
    .slice(0, count)
    .map(q => ({
      question: String(q.question || "").trim(),

      options: Array.isArray(q.options)
        ? q.options.slice(0, 4).map(String)
        : [],

      answer: Number(q.answer),

      explanation: String(q.explanation || "").trim()
    }))
    .filter(q =>
      q.question &&
      q.options.length === 4 &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer <= 3
    );

  if (questions.length !== count) {
    throw new Error(
      `Gemini returned ${questions.length} valid questions; expected ${count}.`
    );
  }

  return questions;
}

// ==========================================
// AI QUIZ
// ==========================================

async function aiQuiz(body) {
  const topic = String(
    body.topic || "General Studies"
  ).slice(0, 200);

  const difficulty =
    ["Easy", "Medium", "Hard"].includes(body.difficulty)
      ? body.difficulty
      : "Medium";

  const count = Math.min(
    15,
    Math.max(1, Number(body.count) || 5)
  );

  // ========================================
  // NO API KEY
  // ========================================

  if (!API_KEY) {
    return {
      source: "demo",
      model: "demo",
      questions: fallback(
        topic,
        difficulty,
        count
      )
    };
  }

  // ========================================
  // PROMPT
  // ========================================

  const prompt = `
Create an educational multiple-choice quiz.

Topic: ${topic}

Difficulty: ${difficulty}

Course:
${String(body.course || "").slice(0, 100)}

Subjects:
${
  Array.isArray(body.subjects)
    ? body.subjects.slice(0, 15).join(", ")
    : ""
}

Study goal:
${String(body.goal || "").slice(0, 250)}

Number of questions: ${count}

Rules:

- Create exactly ${count} questions.
- Each question must have exactly 4 options.
- Only one option should be correct.
- "answer" must be the zero-based index.
- answer must be 0, 1, 2, or 3.
- Include a short explanation.
- Questions must be accurate.
- Questions should be suitable for students.
- Avoid duplicate questions.
- Return JSON only.
`;

  // ========================================
  // GEMINI REQUEST
  // ========================================

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      MODEL
    )}:generateContent?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
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
                    question: {
                      type: "STRING"
                    },

                    options: {
                      type: "ARRAY",

                      items: {
                        type: "STRING"
                      },

                      minItems: 4,
                      maxItems: 4
                    },

                    answer: {
                      type: "INTEGER"
                    },

                    explanation: {
                      type: "STRING"
                    }
                  },

                  required: [
                    "question",
                    "options",
                    "answer",
                    "explanation"
                  ]
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

  // ========================================
  // API ERROR
  // ========================================

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini API request failed with status ${response.status}.`
    );
  }

  // ========================================
  // GET RESPONSE TEXT
  // ========================================

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  // ========================================
  // PARSE JSON
  // ========================================

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }

  // ========================================
  // RETURN RESULT
  // ========================================

  return {
    source: "ai",
    model: MODEL,
    questions: cleanQuestions(
      parsed,
      count
    )
  };
}

// ==========================================
// MIME TYPES
// ==========================================

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// ==========================================
// SERVER
// ==========================================

const server = http.createServer(
  async (req, res) => {
    try {
      const url = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );

      // ======================================
      // HEALTH CHECK
      // ======================================

      if (
        req.method === "GET" &&
        url.pathname === "/api/health"
      ) {
        return json(res, 200, {
          ok: true,
          aiConfigured: Boolean(API_KEY),
          provider: "Google Gemini",
          model: MODEL
        });
      }

      // ======================================
      // GENERATE QUIZ
      // ======================================

      if (
        req.method === "POST" &&
        url.pathname === "/api/generate-quiz"
      ) {
        const body = await readBody(req);

        try {
          const result = await aiQuiz(body);

          return json(res, 200, result);
        } catch (err) {
          console.error(
            "Quiz generation error:",
            err.message
          );

          return json(res, 502, {
            error:
              err.message ||
              "Gemini API request failed."
          });
        }
      }

      // ======================================
      // STATIC FILES ONLY GET
      // ======================================

      if (req.method !== "GET") {
        return json(res, 405, {
          error: "Method not allowed"
        });
      }

      let pathname =
        decodeURIComponent(url.pathname);

      if (pathname === "/") {
        pathname = "/index.html";
      }

      const relativePath =
        pathname.replace(/^[/\\]+/, "");

      const root =
        path.resolve(__dirname);

      const file =
        path.resolve(root, relativePath);

      // Prevent directory traversal
      if (
        file !== root &&
        !file.startsWith(root + path.sep)
      ) {
        return json(res, 403, {
          error: "Forbidden"
        });
      }

      if (
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      ) {
        return json(res, 404, {
          error: "Not found"
        });
      }

      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(file)] ||
          "application/octet-stream"
      });

      fs.createReadStream(file).pipe(res);

    } catch (err) {
      console.error(
        "Server error:",
        err
      );

      if (!res.headersSent) {
        json(res, 500, {
          error: "Server error"
        });
      }
    }
  }
);

// ==========================================
// START
// ==========================================

server.listen(PORT, () => {
  console.log("");
  console.log("================================");
  console.log("       STUDYBUDDY AI");
  console.log("================================");
  console.log(
    `Server: http://localhost:${PORT}`
  );
  console.log(
    `Gemini: ${
      API_KEY
        ? "configured"
        : "NOT configured (demo mode)"
    }`
  );
  console.log(`Model: ${MODEL}`);
  console.log("================================");
  console.log("");
});