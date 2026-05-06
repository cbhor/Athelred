import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { z } from "zod";
import { AIProvider } from "../db/db";

export const MCQSchema = z.object({
  questions: z.array(z.object({
    questionText: z.string().min(10),
    options: z.array(z.object({
      id: z.enum(['A', 'B', 'C', 'D']),
      text: z.string().min(1)
    })).length(4),
    correctOptionId: z.enum(['A', 'B', 'C', 'D']),
    explanation: z.string().min(10),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    cognitiveLevel: z.enum(['recall', 'understanding', 'application', 'analysis']),
    topicTags: z.array(z.string()),
    chapterTitle: z.string(),
    sourceQuote: z.string().optional()
  }))
});

export type GeneratedMCQBatch = z.infer<typeof MCQSchema>;

export interface AIServiceConfig {
  provider: AIProvider;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  modelName: string;
}

export class AIService {
  private config: AIServiceConfig;
  private geminiAi?: GoogleGenAI;
  private openaiAi?: OpenAI;

  constructor(config: AIServiceConfig) {
    this.config = config;
    if (config.provider === 'gemini') {
      this.geminiAi = new GoogleGenAI({ apiKey: config.geminiApiKey! });
    } else {
      this.openaiAi = new OpenAI({
        apiKey: config.openaiApiKey || 'not-needed',
        baseURL: config.openaiBaseUrl,
        dangerouslyAllowBrowser: true
      });
    }
  }

  async generateBatch(
    chunks: string[], 
    chapterTitle: string, 
    count: number, 
    existingFingerprints: string[],
    targetDifficulty: string,
    targetCognitive: string
  ): Promise<GeneratedMCQBatch> {
    const prompt = `
      You are an expert academic examiner. Generate exactly ${count} multiple-choice questions (MCQs) based ONLY on the provided source text from the chapter "${chapterTitle}".
      
      SOURCE TEXT:
      ${chunks.join("\n\n---\n\n")}
      
      CONSTRAINTS:
      - Every fact must be grounded in the source text.
      - Each question must have exactly 4 unique options (A, B, C, D).
      - Exactly one correct answer.
      - Provide a detailed explanation for the correct answer.
      - Target difficulty: ${targetDifficulty}.
      - Target cognitive level: ${targetCognitive}.
      - Avoid "all of the above" or "none of the above".
      - Avoid duplicate questions or fingerprints similar to: ${existingFingerprints.slice(0, 20).join(", ")}.
      
      Return ONLY a JSON object matching this schema:
      {
        "questions": [
          {
            "questionText": "string",
            "options": [{ "id": "A", "text": "string" }, ...],
            "correctOptionId": "A",
            "explanation": "string",
            "difficulty": "easy | medium | hard",
            "cognitiveLevel": "recall | understanding | application | analysis",
            "topicTags": ["string"],
            "chapterTitle": "${chapterTitle}",
            "sourceQuote": "short relevant quote"
          }
        ]
      }
    `;

    try {
      let text = "";
      if (this.config.provider === 'gemini') {
        const response = await this.geminiAi!.models.generateContent({
          model: this.config.modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          }
        });
        text = response.text;
      } else {
        const response = await this.openaiAi!.chat.completions.create({
          model: this.config.modelName,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });
        text = response.choices[0].message.content || "";
      }
      
      if (!text) throw new Error("Empty response from AI");
      
      // Clean text if it has markdown code blocks
      const cleaned = text.replace(/```json\n/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      return MCQSchema.parse(parsed);
    } catch (err: any) {
      console.error(`${this.config.provider} Generation Error:`, err);
      throw err;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.config.provider === 'gemini') {
        // Simple test call
        await this.geminiAi!.models.generateContent({
          model: this.config.modelName,
          contents: "hi",
          config: { maxOutputTokens: 1 }
        });
      } else {
        await this.openaiAi!.chat.completions.create({
          model: this.config.modelName,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1
        });
      }
      return true;
    } catch (err) {
      console.error("Connection test failed:", err);
      return false;
    }
  }
}
