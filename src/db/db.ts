import Dexie, { type Table } from 'dexie';

export type WorkspaceStatus = 'processing' | 'ready' | 'error';
export type TestSessionStatus = 'draft' | 'active' | 'submitted' | 'expired';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type CognitiveLevel = 'recall' | 'understanding' | 'application' | 'analysis';

export interface Workspace {
  id?: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  epubFileName: string;
  epubTitle: string;
  epubAuthor: string;
  epubHash: string;
  totalCharacters: number;
  totalWords: number;
  chapterCount: number;
  chunkCount: number;
  status: WorkspaceStatus;
  parseWarnings: string[];
}

export interface SourceChunk {
  id?: number;
  workspaceId: number;
  chapterTitle: string;
  chapterIndex: number;
  chunkIndex: number;
  text: string;
  wordCount: number;
  characterCount: number;
  sourceLocator: string;
  importanceScore?: number;
  createdAt: number;
}

export interface Question {
  id?: number;
  workspaceId: number;
  sourceChunkIds: number[];
  questionText: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  difficulty: Difficulty;
  cognitiveLevel: CognitiveLevel;
  topicTags: string[];
  chapterTitle: string;
  sourceQuote?: string;
  generatedAt: number;
  generationBatchId: string;
  fingerprint: string;
  qualityFlags: string[];
  usedInSessionIds: number[];
}

export interface TestSession {
  id?: number;
  workspaceId: number;
  name: string;
  createdAt: number;
  startedAt?: number;
  submittedAt?: number;
  expiresAt?: number;
  durationMinutes: number;
  status: TestSessionStatus;
  questionIds: number[];
  answers: Record<number, string>; // questionId -> optionId
  flaggedQuestionIds: number[];
  currentQuestionIndex: number;
  scorePercent?: number;
  correctCount?: number;
  incorrectCount?: number;
  unansweredCount?: number;
  passed?: boolean;
  overlapPercentFromPreviousSessions?: number;
  generationSummary?: string;
}

export type AIProvider = 'gemini' | 'openai';

export interface Settings {
  id: number;
  aiProvider: AIProvider;
  geminiApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  selectedModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingApiKey: string;
  defaultPassPercent: number;
  defaultSessionDurationMinutes: number;
  defaultQuestionCount: number;
  allowedOverlapPercent: number;
}

export class AuraDB extends Dexie {
  workspaces!: Table<Workspace>;
  sourceChunks!: Table<SourceChunk>;
  questions!: Table<Question>;
  testSessions!: Table<TestSession>;
  settings!: Table<Settings>;

  constructor() {
    super('AuraDatabase');
    this.version(1).stores({
      workspaces: '++id, name, epubHash, status, createdAt',
      sourceChunks: '++id, workspaceId, chapterIndex, chunkIndex',
      questions: '++id, workspaceId, difficulty, cognitiveLevel, fingerprint, *sourceChunkIds, *topicTags',
      testSessions: '++id, workspaceId, status, createdAt',
      settings: 'id'
    });
  }
}

export const db = new AuraDB();

// Initialize default settings if not exists
export async function initializeSettings() {
  try {
    const currentSettings = await db.settings.get(1);
    if (!currentSettings) {
      await db.settings.add({
        id: 1,
        aiProvider: 'gemini',
        geminiApiKey: '',
        openaiApiKey: '',
        openaiBaseUrl: 'https://api.openai.com/v1',
        selectedModel: 'gemini-1.5-flash',
        embeddingProvider: 'gemini',
        embeddingModel: 'text-embedding-004',
        embeddingApiKey: '',
        defaultPassPercent: 60,
        defaultSessionDurationMinutes: 180,
        defaultQuestionCount: 100,
        allowedOverlapPercent: 30
      });
    }
  } catch (error: any) {
    // If it's a constraint error, it means another call already added it
    if (error.name === 'ConstraintError') {
      console.log('Settings already initialized');
    } else {
      console.error('Failed to initialize settings:', error);
    }
  }
}
