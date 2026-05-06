import { Workspace, SourceChunk, Question, TestSession, Settings } from '../db/db';

const BASE_URL = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  settings: {
    get: () => request<Settings>('/settings'),
    update: (settings: Partial<Settings>) => request<void>('/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  },

  workspaces: {
    list: () => request<Workspace[]>('/workspaces'),
    get: (id: number) => request<Workspace>(`/workspaces/${id}`),
    create: (workspace: Workspace) => request<{ id: number }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(workspace),
    }),
    delete: (id: number) => request<void>(`/workspaces/${id}`, {
      method: 'DELETE',
    }),
    getChunks: (id: number) => request<SourceChunk[]>(`/workspaces/${id}/chunks`),
    getQuestions: (id: number) => request<Question[]>(`/workspaces/${id}/questions`),
    getStats: (id: number) => request<any>(`/workspaces/${id}/stats`),
  },

  sourceChunks: {
    bulkAdd: (chunks: SourceChunk[]) => request<void>('/sourceChunks/bulk', {
      method: 'POST',
      body: JSON.stringify(chunks),
    }),
  },

  search: {
    semantic: (workspaceId: number, query: string, limit?: number) => request<any[]>('/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, query, limit }),
    }),
  },

  embeddings: {
    batch: (texts: string[]) => request<{ embeddings: number[][] }>('/embeddings/batch', {
      method: 'POST',
      body: JSON.stringify({ texts }),
    }),
  },

  questions: {
    bulkAdd: (questions: Question[]) => request<number[]>('/questions/bulk', {
      method: 'POST',
      body: JSON.stringify(questions),
    }),
    update: (id: number, question: Partial<Question>) => request<void>(`/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(question),
    }),
  },

  sessions: {
    list: () => request<TestSession[]>('/sessions'),
    get: (id: number) => request<TestSession>(`/sessions/${id}`),
    create: (session: Partial<TestSession>) => request<{ id: number }>('/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    }),
    update: (id: number, session: Partial<TestSession>) => request<void>(`/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(session),
    }),
  },
};
