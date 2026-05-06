import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import cors from "cors";

// Initialize Database
const dbPath = path.join(process.cwd(), "data", "aethelred.db");
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    createdAt INTEGER,
    updatedAt INTEGER,
    epubFileName TEXT,
    epubTitle TEXT,
    epubAuthor TEXT,
    epubHash TEXT,
    totalCharacters INTEGER,
    totalWords INTEGER,
    chapterCount INTEGER,
    chunkCount INTEGER,
    status TEXT,
    parseWarnings TEXT
  );

  CREATE TABLE IF NOT EXISTS sourceChunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER,
    chapterTitle TEXT,
    chapterIndex INTEGER,
    chunkIndex INTEGER,
    text TEXT,
    wordCount INTEGER,
    characterCount INTEGER,
    sourceLocator TEXT,
    importanceScore REAL,
    createdAt INTEGER,
    FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER,
    sourceChunkIds TEXT, -- JSON array
    questionText TEXT,
    options TEXT, -- JSON array
    correctOptionId TEXT,
    explanation TEXT,
    difficulty TEXT,
    cognitiveLevel TEXT,
    topicTags TEXT, -- JSON array
    chapterTitle TEXT,
    sourceQuote TEXT,
    generatedAt INTEGER,
    generationBatchId TEXT,
    fingerprint TEXT,
    qualityFlags TEXT, -- JSON array
    usedInSessionIds TEXT, -- JSON array
    masteryScore INTEGER DEFAULT 0,
    nextReviewAt INTEGER,
    lastCorrectAt INTEGER,
    difficultyFactor REAL DEFAULT 2.5,
    FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS testSessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspaceId INTEGER,
    name TEXT,
    createdAt INTEGER,
    startedAt INTEGER,
    submittedAt INTEGER,
    expiresAt INTEGER,
    durationMinutes INTEGER,
    status TEXT,
    questionIds TEXT, -- JSON array
    answers TEXT, -- JSON object
    flaggedQuestionIds TEXT, -- JSON array
    currentQuestionIndex INTEGER,
    scorePercent REAL,
    correctCount INTEGER,
    incorrectCount INTEGER,
    unansweredCount INTEGER,
    passed INTEGER, -- Boolean (0 or 1)
    overlapPercentFromPreviousSessions REAL,
    generationSummary TEXT,
    timeSpent INTEGER,
    FOREIGN KEY(workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    aiProvider TEXT,
    geminiApiKey TEXT,
    openaiApiKey TEXT,
    openaiBaseUrl TEXT,
    selectedModel TEXT,
    defaultPassPercent INTEGER,
    defaultSessionDurationMinutes INTEGER,
    defaultQuestionCount INTEGER,
    allowedOverlapPercent INTEGER
  );
`);

// Default Settings
const checkSettings = db.prepare("SELECT * FROM settings WHERE id = 1").get();
if (!checkSettings) {
  db.prepare(`
    INSERT INTO settings (
      id, aiProvider, geminiApiKey, openaiApiKey, openaiBaseUrl, selectedModel, 
      defaultPassPercent, defaultSessionDurationMinutes, defaultQuestionCount, allowedOverlapPercent
    ) VALUES (1, 'gemini', '', '', 'https://api.openai.com/v1', 'gemini-1.5-flash', 60, 180, 100, 30)
  `).run();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API ROUTES
app.get("/api/settings", (req, res) => {
  const settings = db.prepare("SELECT * FROM settings WHERE id = 1").get();
  res.json(settings);
});

app.post("/api/settings", (req, res) => {
  const { 
    aiProvider, geminiApiKey, openaiApiKey, openaiBaseUrl, selectedModel, 
    defaultPassPercent, defaultSessionDurationMinutes, defaultQuestionCount, allowedOverlapPercent 
  } = req.body;
  
  db.prepare(`
    UPDATE settings SET 
      aiProvider = ?, geminiApiKey = ?, openaiApiKey = ?, openaiBaseUrl = ?, selectedModel = ?, 
      defaultPassPercent = ?, defaultSessionDurationMinutes = ?, defaultQuestionCount = ?, allowedOverlapPercent = ?
    WHERE id = 1
  `).run(
    aiProvider, geminiApiKey, openaiApiKey, openaiBaseUrl, selectedModel, 
    defaultPassPercent, defaultSessionDurationMinutes, defaultQuestionCount, allowedOverlapPercent
  );
  res.json({ success: true });
});

// Workspaces
app.get("/api/workspaces", (req, res) => {
  const rows = db.prepare("SELECT * FROM workspaces ORDER BY createdAt DESC").all();
  rows.forEach((r: any) => r.parseWarnings = JSON.parse(r.parseWarnings || '[]'));
  res.json(rows);
});

app.get("/api/workspaces/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(req.params.id) as any;
  if (row) {
    row.parseWarnings = JSON.parse(row.parseWarnings || '[]');
    res.json(row);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.post("/api/workspaces", (req, res) => {
  const { name, epubFileName, epubTitle, epubAuthor, epubHash, totalCharacters, totalWords, chapterCount, chunkCount, status, parseWarnings } = req.body;
  const result = db.prepare(`
    INSERT INTO workspaces (name, createdAt, updatedAt, epubFileName, epubTitle, epubAuthor, epubHash, totalCharacters, totalWords, chapterCount, chunkCount, status, parseWarnings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, Date.now(), Date.now(), epubFileName, epubTitle, epubAuthor, epubHash, totalCharacters, totalWords, chapterCount, chunkCount, status, JSON.stringify(parseWarnings || []));
  res.json({ id: result.lastInsertRowid });
});

app.delete("/api/workspaces/:id", (req, res) => {
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Chunks
app.get("/api/workspaces/:id/chunks", (req, res) => {
  const rows = db.prepare("SELECT * FROM sourceChunks WHERE workspaceId = ?").all(req.params.id);
  res.json(rows);
});

app.post("/api/sourceChunks/bulk", (req, res) => {
  const chunks = req.body;
  const insert = db.prepare(`
    INSERT INTO sourceChunks (workspaceId, chapterTitle, chapterIndex, chunkIndex, text, wordCount, characterCount, sourceLocator, importanceScore, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction((data) => {
    for (const chunk of data) {
      insert.run(chunk.workspaceId, chunk.chapterTitle, chunk.chapterIndex, chunk.chunkIndex, chunk.text, chunk.wordCount, chunk.characterCount, chunk.sourceLocator, chunk.importanceScore, Date.now());
    }
  });
  
  transaction(chunks);
  res.json({ success: true });
});

// Questions
app.get("/api/workspaces/:id/questions", (req, res) => {
  const rows = db.prepare("SELECT * FROM questions WHERE workspaceId = ?").all(req.params.id);
  rows.forEach((r: any) => {
    r.sourceChunkIds = JSON.parse(r.sourceChunkIds || '[]');
    r.options = JSON.parse(r.options || '[]');
    r.topicTags = JSON.parse(r.topicTags || '[]');
    r.qualityFlags = JSON.parse(r.qualityFlags || '[]');
    r.usedInSessionIds = JSON.parse(r.usedInSessionIds || '[]');
  });
  res.json(rows);
});

app.post("/api/questions/bulk", (req, res) => {
  const questions = req.body;
  const insert = db.prepare(`
    INSERT INTO questions (
      workspaceId, sourceChunkIds, questionText, options, 
      correctOptionId, explanation, difficulty, cognitiveLevel, 
      topicTags, chapterTitle, sourceQuote, generatedAt, 
      generationBatchId, fingerprint, qualityFlags, usedInSessionIds,
      masteryScore, nextReviewAt, lastCorrectAt, difficultyFactor
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const transaction = db.transaction((data) => {
    const ids: number[] = [];
    for (const q of data) {
      const result = insert.run(
        q.workspaceId, 
        JSON.stringify(q.sourceChunkIds || []), 
        q.questionText, 
        JSON.stringify(q.options || []), 
        q.correctOptionId, 
        q.explanation, 
        q.difficulty, 
        q.cognitiveLevel, 
        JSON.stringify(q.topicTags || []), 
        q.chapterTitle, 
        q.sourceQuote, 
        q.generatedAt || Date.now(), 
        q.generationBatchId, 
        q.fingerprint, 
        JSON.stringify(q.qualityFlags || []), 
        JSON.stringify(q.usedInSessionIds || []),
        q.masteryScore || 0,
        q.nextReviewAt || null,
        q.lastCorrectAt || null,
        q.difficultyFactor || 2.5
      );
      ids.push(Number(result.lastInsertRowid));
    }
    return ids;
  });
  
  const ids = transaction(questions);
  res.json(ids);
});

app.get("/api/workspaces/:id/stats", (req, res) => {
  const { id } = req.params;
  
  const questions = db.prepare("SELECT * FROM questions WHERE workspaceId = ?").all(id);
  const sessions = db.prepare("SELECT * FROM testSessions WHERE workspaceId = ? AND status = 'submitted'").all(id);

  const chapterMap: Record<string, any> = {};
  questions.forEach((q: any) => {
    const chapter = q.chapterTitle || "General";
    if (!chapterMap[chapter]) {
      chapterMap[chapter] = { total: 0, masterySum: 0, count: 0 };
    }
    chapterMap[chapter].total++;
    chapterMap[chapter].masterySum += q.masteryScore || 0;
    chapterMap[chapter].count++;
  });

  const chapters = Object.keys(chapterMap).map(name => ({
    name,
    mastery: Math.round(chapterMap[name].masterySum / chapterMap[name].count) || 0,
    questionCount: chapterMap[name].total
  }));

  const cognitiveLevels: Record<string, number> = {
    recall: 0,
    understanding: 0,
    application: 0,
    analysis: 0
  };
  questions.forEach((q: any) => {
    if (cognitiveLevels[q.cognitiveLevel] !== undefined) {
      cognitiveLevels[q.cognitiveLevel]++;
    }
  });

  res.json({
    chapters,
    cognitiveLevels,
    totalQuestions: questions.length,
    sessionsCount: sessions.length
  });
});

app.put("/api/questions/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const current = db.prepare("SELECT * FROM questions WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Question not found" });

  const final = {
    ...current,
    ...updates,
    sourceChunkIds: JSON.stringify(updates.sourceChunkIds !== undefined ? updates.sourceChunkIds : JSON.parse(current.sourceChunkIds || '[]')),
    options: JSON.stringify(updates.options !== undefined ? updates.options : JSON.parse(current.options || '[]')),
    topicTags: JSON.stringify(updates.topicTags !== undefined ? updates.topicTags : JSON.parse(current.topicTags || '[]')),
    qualityFlags: JSON.stringify(updates.qualityFlags !== undefined ? updates.qualityFlags : JSON.parse(current.qualityFlags || '[]')),
    usedInSessionIds: JSON.stringify(updates.usedInSessionIds !== undefined ? updates.usedInSessionIds : JSON.parse(current.usedInSessionIds || '[]'))
  };

  db.prepare(`
    UPDATE questions SET 
      sourceChunkIds = ?, questionText = ?, options = ?, correctOptionId = ?, 
      explanation = ?, difficulty = ?, cognitiveLevel = ?, topicTags = ?, 
      chapterTitle = ?, sourceQuote = ?, fingerprint = ?, qualityFlags = ?, usedInSessionIds = ?,
      masteryScore = ?, nextReviewAt = ?, lastCorrectAt = ?, difficultyFactor = ?
    WHERE id = ?
  `).run(
    final.sourceChunkIds, final.questionText, final.options, final.correctOptionId,
    final.explanation, final.difficulty, final.cognitiveLevel, final.topicTags,
    final.chapterTitle, final.sourceQuote, final.fingerprint, final.qualityFlags, final.usedInSessionIds,
    final.masteryScore, final.nextReviewAt, final.lastCorrectAt, final.difficultyFactor,
    id
  );
  res.json({ success: true });
});

// Sessions
app.get("/api/sessions", (req, res) => {
  const rows = db.prepare("SELECT * FROM testSessions ORDER BY createdAt DESC").all();
  rows.forEach((r: any) => {
    r.questionIds = JSON.parse(r.questionIds || '[]');
    r.answers = JSON.parse(r.answers || '{}');
    r.flaggedQuestionIds = JSON.parse(r.flaggedQuestionIds || '[]');
    r.passed = !!r.passed;
  });
  res.json(rows);
});

app.get("/api/sessions/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM testSessions WHERE id = ?").get(req.params.id) as any;
  if (row) {
    row.questionIds = JSON.parse(row.questionIds || '[]');
    row.answers = JSON.parse(row.answers || '{}');
    row.flaggedQuestionIds = JSON.parse(row.flaggedQuestionIds || '[]');
    row.passed = !!row.passed;
    res.json(row);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.post("/api/sessions", (req, res) => {
  const s = req.body;
  const result = db.prepare(`
    INSERT INTO testSessions (workspaceId, name, createdAt, startedAt, submittedAt, expiresAt, durationMinutes, status, questionIds, answers, flaggedQuestionIds, currentQuestionIndex, scorePercent, correctCount, incorrectCount, unansweredCount, passed, overlapPercentFromPreviousSessions, generationSummary, timeSpent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    s.workspaceId, s.name, s.createdAt || Date.now(), s.startedAt, s.submittedAt, s.expiresAt, s.durationMinutes, s.status, 
    JSON.stringify(s.questionIds || []), JSON.stringify(s.answers || {}), JSON.stringify(s.flaggedQuestionIds || []), 
    s.currentQuestionIndex || 0, s.scorePercent || 0, s.correctCount || 0, s.incorrectCount || 0, s.unansweredCount || 0, 
    s.passed ? 1 : 0, s.overlapPercentFromPreviousSessions || 0, s.generationSummary, s.timeSpent || 0
  );
  res.json({ id: result.lastInsertRowid });
});

app.put("/api/sessions/:id", (req, res) => {
  const { id } = req.params;
  const s = req.body;
  
  // Get existing session state for transition detection
  const existing = db.prepare("SELECT * FROM testSessions WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "Session not found" });

  db.prepare(`
    UPDATE testSessions SET 
      startedAt = ?, submittedAt = ?, expiresAt = ?, status = ?, answers = ?, 
      flaggedQuestionIds = ?, currentQuestionIndex = ?, scorePercent = ?, 
      correctCount = ?, incorrectCount = ?, unansweredCount = ?, passed = ?, timeSpent = ?
    WHERE id = ?
  `).run(
    s.startedAt !== undefined ? s.startedAt : existing.startedAt,
    s.submittedAt !== undefined ? s.submittedAt : existing.submittedAt,
    s.expiresAt !== undefined ? s.expiresAt : existing.expiresAt,
    s.status !== undefined ? s.status : existing.status,
    JSON.stringify(s.answers || JSON.parse(existing.answers || '{}')), 
    JSON.stringify(s.flaggedQuestionIds || JSON.parse(existing.flaggedQuestionIds || '[]')), 
    s.currentQuestionIndex !== undefined ? s.currentQuestionIndex : existing.currentQuestionIndex,
    s.scorePercent !== undefined ? s.scorePercent : existing.scorePercent, 
    s.correctCount !== undefined ? s.correctCount : existing.correctCount,
    s.incorrectCount !== undefined ? s.incorrectCount : existing.incorrectCount,
    s.unansweredCount !== undefined ? s.unansweredCount : existing.unansweredCount,
    (s.passed !== undefined ? s.passed : existing.passed) ? 1 : 0,
    s.timeSpent !== undefined ? s.timeSpent : existing.timeSpent,
    id
  );

  // If session just finished, update question mastery (SRS)
  if (existing.status !== 'submitted' && s.status === 'submitted') {
    const sessionQuestionsIds = JSON.parse(existing.questionIds || '[]');
    const answers = s.answers || {};
    
    sessionQuestionsIds.forEach((qId: number) => {
      const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(qId) as any;
      if (!q) return;

      const isCorrect = answers[qId] === q.correctOptionId;
      let mastery = q.masteryScore || 0;
      let factor = q.difficultyFactor || 2.5;

      if (isCorrect) {
        mastery = Math.min(100, mastery + 20);
        factor = Math.max(1.3, factor + 0.1);
      } else {
        mastery = Math.max(0, mastery - 10);
        factor = Math.max(1.3, factor - 0.2);
      }

      // Simple interval: factor * (level + 1) days
      const days = Math.round(factor * (mastery / 20 + 1));
      const nextReview = Date.now() + days * 24 * 60 * 60 * 1000;

      db.prepare(`
        UPDATE questions SET 
          masteryScore = ?, nextReviewAt = ?, difficultyFactor = ?, lastCorrectAt = ?
        WHERE id = ?
      `).run(mastery, nextReview, factor, isCorrect ? Date.now() : q.lastCorrectAt, qId);
    });
  }

  res.json({ success: true });
});

// Vite Middleware
async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
