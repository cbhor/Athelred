import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Question } from '../db/db';
import { AIService } from '../services/aiService';
import { generateFingerprint, cn } from '../lib/utils';
import { 
  Play, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  BrainCircuit, 
  Sparkles,
  BarChart,
  ArrowRight,
  Clock,
  Target
} from 'lucide-react';

interface GenStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message?: string;
}

export default function GenerateSession() {
  const { workspaceId: wsId } = useParams();
  const navigate = useNavigate();
  const workspaceId = Number(wsId);
  const queryClient = useQueryClient();

  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.workspaces.get(workspaceId)
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get()
  });

  const { data: sourceChunks } = useQuery({
    queryKey: ['chunks', workspaceId],
    queryFn: () => api.workspaces.getChunks(workspaceId)
  });

  const { data: existingQuestions } = useQuery({
    queryKey: ['questions', workspaceId],
    queryFn: () => api.workspaces.getQuestions(workspaceId)
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState({
    targetCount: 20,
    durationMinutes: 60,
    focusTopic: ''
  });

  const [steps, setSteps] = useState<GenStep[]>([
    { id: 'prep', label: 'Analyzing source content', status: 'pending' },
    { id: 'ai', label: 'Generating question batches', status: 'pending' },
    { id: 'validate', label: 'Validating & deduplicating', status: 'pending' },
    { id: 'assemble', label: 'Assembling test session', status: 'pending' },
  ]);

  const updateStep = (id: string, status: GenStep['status'], message?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, message } : s));
  };

  const handleGenerate = async () => {
    if (!settings) return;
    
    const apiConfig = {
      provider: settings.aiProvider,
      geminiApiKey: settings.geminiApiKey,
      openaiApiKey: settings.openaiApiKey,
      openaiBaseUrl: settings.openaiBaseUrl,
      modelName: settings.selectedModel
    };

    if (settings.aiProvider === 'gemini' && !settings.geminiApiKey) {
      setError('Gemini API key is missing. Please add it in Settings.');
      return;
    }

    if (!sourceChunks || sourceChunks.length === 0) {
      setError('No source content found in this workspace.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    updateStep('prep', 'loading');

    try {
      const ai = new AIService(apiConfig);
      const targetCount = config.targetCount;
      
      // Smart Chunk Selection logic
      updateStep('prep', 'loading', 'Analyzing knowledge gaps...');
      let selectedChunks = [];

      if (config.focusTopic.trim()) {
        // TOPIC FOCUS: Use semantic search
        updateStep('prep', 'loading', `Searching for "${config.focusTopic}"...`);
        const semanticResults = await api.search.semantic(workspaceId, config.focusTopic, targetCount * 2);
        selectedChunks = semanticResults;
      } else {
        // COVERAGE FOCUS: Prioritize weak chapters or random coverage
        const stats = await api.workspaces.getStats(workspaceId);
        const weakChapters = stats.chapters
          .filter((c: any) => c.mastery < 70)
          .map((c: any) => c.name);

        if (weakChapters.length > 0) {
          const priorityChunks = sourceChunks.filter(c => weakChapters.includes(c.chapterTitle));
          const otherChunks = sourceChunks.filter(c => !weakChapters.includes(c.chapterTitle));
          
          // Mix 70% weak chapters, 30% others for retention
          const pShuffled = priorityChunks.sort(() => Math.random() - 0.5);
          const oShuffled = otherChunks.sort(() => Math.random() - 0.5);
          
          selectedChunks = [
            ...pShuffled.slice(0, Math.ceil(targetCount * 1.5)),
            ...oShuffled.slice(0, Math.ceil(targetCount * 0.5))
          ];
        } else {
          selectedChunks = [...sourceChunks].sort(() => Math.random() - 0.5);
        }
      }

      const questionsPerBatch = 5;
      const batchesNeeded = Math.ceil(targetCount / questionsPerBatch);
      
      updateStep('prep', 'success', `Context map constructed (${selectedChunks.length} nodes)`);
      updateStep('ai', 'loading');

      const newQuestions: Question[] = [];
      const fingerprints = existingQuestions?.map(q => q.fingerprint) || [];

      // Difficulty distribution
      const difficultyOrder = ['easy', 'medium', 'hard'];
      // Cognitive distribution: recall, understanding, application, analysis
      const cognitiveLevels = ['recall', 'understanding', 'application', 'analysis'];

      for (let i = 0; i < batchesNeeded; i++) {
        updateStep('ai', 'loading', `Synthesizing batch ${i + 1} of ${batchesNeeded}`);
        
        const startIdx = (i * 2) % selectedChunks.length;
        const batchChunks = selectedChunks.slice(startIdx, Math.min(startIdx + 2, selectedChunks.length));
        const batchTexts = batchChunks.map(c => c.text);
        const chapterTitle = batchChunks[0]?.chapterTitle || "Multi-section Analysis";

        const targetDiff = difficultyOrder[i % difficultyOrder.length];
        const targetCognitive = cognitiveLevels[i % cognitiveLevels.length];

        try {
          const result = await ai.generateBatch(
            batchTexts, 
            chapterTitle, 
            questionsPerBatch, 
            fingerprints.slice(-20), 
            targetDiff,
            targetCognitive
          );

          updateStep('validate', 'loading', `Processing Batch ${i + 1}`);
          
          for (const qData of result.questions) {
            const fp = generateFingerprint(qData.questionText);
            if (!fingerprints.includes(fp)) {
              const q: Question = {
                workspaceId,
                sourceChunkIds: batchChunks.map(c => c.id!),
                questionText: qData.questionText,
                options: qData.options,
                correctOptionId: qData.correctOptionId,
                explanation: qData.explanation,
                difficulty: qData.difficulty as any,
                cognitiveLevel: qData.cognitiveLevel as any,
                topicTags: qData.topicTags,
                chapterTitle: qData.chapterTitle,
                sourceQuote: qData.sourceQuote,
                generatedAt: Date.now(),
                generationBatchId: `batch-${Date.now()}-${i}`,
                fingerprint: fp,
                qualityFlags: [],
                usedInSessionIds: []
              };
              newQuestions.push(q);
              fingerprints.push(fp);
            }
          }
          
          // Stop if we have enough new ones to fulfill the request potentially
          if (newQuestions.length >= targetCount) break;

        } catch (batchErr) {
          console.warn(`Batch ${i+1} failed, skipping...`, batchErr);
        }
      }

      updateStep('ai', 'success', `${newQuestions.length} questions synthesized`);
      updateStep('validate', 'success');
      updateStep('assemble', 'loading');

      const maxOverlap = settings.allowedOverlapPercent;
      const alreadyUsed = existingQuestions || [];
      
      let finalQuestionIds: number[] = [];
      
      const newQuestionIds = await api.questions.bulkAdd(newQuestions);
      
      const availableNew = [...newQuestionIds];
      const availableOld = alreadyUsed.map(q => q.id!).sort(() => Math.random() - 0.5);

      const overlapCount = Math.min(Math.floor(targetCount * (maxOverlap / 100)), availableOld.length);
      const newNeeded = targetCount - overlapCount;

      if (availableNew.length < newNeeded) {
        finalQuestionIds = [...availableNew, ...availableOld.slice(0, targetCount - availableNew.length)];
      } else {
        finalQuestionIds = [...availableNew.slice(0, newNeeded), ...availableOld.slice(0, overlapCount)];
      }

      finalQuestionIds.sort(() => Math.random() - 0.5);

      const { id: sessionId } = await api.sessions.create({
        workspaceId,
        name: `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        createdAt: Date.now(),
        durationMinutes: config.durationMinutes,
        status: 'draft',
        questionIds: finalQuestionIds,
        answers: {},
        flaggedQuestionIds: [],
        currentQuestionIndex: 0,
        overlapPercentFromPreviousSessions: (overlapCount / targetCount) * 100,
        generationSummary: `Generated ${newQuestions.length} new questions. Total session size: ${finalQuestionIds.length}.`
      });

      queryClient.invalidateQueries({ queryKey: ['sessions', workspaceId] });
      updateStep('assemble', 'success');
      setTimeout(() => navigate(`/test/${sessionId}`), 1000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Generation failed.');
      setIsGenerating(false);
    }
  };

  if (!workspace) return null;

  return (
    <div className="max-w-3xl mx-auto py-10">
      <div className="mb-10">
        <Link to={`/workspace/${workspaceId}`} className="btn-outline-v2 w-max px-4 py-2 mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Intelligence Workspace
        </Link>
        <h1 className="text-4xl font-serif text-white italic">Initialize Assessment</h1>
        <p className="text-[#71717A] mt-2 font-medium italic">Constructing a customized expert verification protocol.</p>
      </div>

      {!isGenerating ? (
        <div className="space-y-8">
          <div className="bg-[#18181B] border border-[#3F3F46] rounded-xl p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <BrainCircuit className="w-48 h-48 text-white" />
            </div>

            <div className="flex items-center gap-6 mb-10 relative z-10">
              <div className="w-16 h-16 bg-[#27272A] border border-white/5 rounded-full flex items-center justify-center shadow-xl">
                <BrainCircuit className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-serif italic text-white">Assessment Synthesis</h3>
                <p className="text-sm text-[#71717A] font-medium font-mono uppercase tracking-widest">{settings?.selectedModel || 'Neural Engine'}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 relative z-10">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-4">
                  Topic Focus (Optional Semantic Priority)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={config.focusTopic}
                    onChange={(e) => setConfig({ ...config, focusTopic: e.target.value })}
                    placeholder="e.g. neuroplasticity, supply side economics, cellular respiration"
                    className="w-full px-5 py-4 bg-[#111114] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-medium placeholder-[#3F3F46]"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Sparkles className={cn("w-5 h-5 transition-colors", config.focusTopic ? "text-blue-400" : "text-[#3F3F46]")} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-4">
                  Node Density (Question Count)
                </label>
                <div className="flex items-center gap-6">
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={config.targetCount}
                    onChange={(e) => setConfig({ ...config, targetCount: Number(e.target.value) })}
                    className="flex-1 accent-white"
                  />
                  <span className="text-2xl font-serif italic text-white w-12">{config.targetCount}</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-4">
                  Temporal Constraint (Minutes)
                </label>
                <div className="flex items-center gap-6">
                  <input
                    type="range"
                    min="5"
                    max="300"
                    step="5"
                    value={config.durationMinutes}
                    onChange={(e) => setConfig({ ...config, durationMinutes: Number(e.target.value) })}
                    className="flex-1 accent-white"
                  />
                  <span className="text-2xl font-serif italic text-white w-12">{config.durationMinutes}m</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10 relative z-10 border-t border-white/[0.03] pt-10">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/5">
                    <Clock className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">Active Window</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/5">
                    <Target className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">{settings?.defaultPassPercent}% Threshold</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/5">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">Novel Retrieval</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/5">
                    <BarChart className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-widest text-[#A1A1AA]">Cognitive Mapping</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-8 p-5 bg-red-400/5 border border-red-400/20 text-red-400 rounded-xl flex items-center gap-4">
                <AlertCircle className="w-6 h-6 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              className="btn-primary-v2 w-full h-16 text-lg tracking-tight bg-white hover:bg-gray-200 shadow-xl"
            >
              Construct & Initiate Assessment
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" />
            </button>
            <p className="text-[10px] text-[#52525B] text-center mt-4 italic">Estimated synthesis time: 30-90 seconds</p>
          </div>

          <div className="bg-[#111114] border border-[#27272A] rounded-xl p-8 flex items-start gap-4">
            <div className="p-2 bg-[#1D1D21] rounded border border-white/5">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm mb-1 uppercase tracking-wider font-mono">Neural Interface Note</h4>
              <p className="text-sm text-[#71717A] leading-relaxed font-medium italic">
                Aura utilizes {settings?.aiProvider === 'gemini' ? 'Google Gemini' : 'Custom OpenAI'} protocol to decompose EPUB segments into semantic chunks. Processing occurs in parallel clusters.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#111114] border border-[#27272A] rounded-xl p-16 text-center shadow-2xl">
          <div className="w-24 h-24 bg-[#18181B] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl relative">
            <div className="absolute inset-0 rounded-full border-t-2 border-white animate-spin"></div>
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
          <h2 className="text-3xl font-serif italic text-white mb-3 tracking-tight">Synthesizing Protocol</h2>
          <p className="text-[#71717A] mb-12 font-medium italic">Decomposing source clusters and mapping cognitive nodes...</p>

          <div className="max-w-md mx-auto space-y-4 text-left">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.03] bg-[#18181B]">
                <div className="flex items-center gap-4">
                  {step.status === 'loading' ? <Loader2 className="w-4 h-4 text-white animate-spin" /> :
                   step.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                   step.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                   <div className="w-4 h-4 rounded-full border border-[#3F3F46]" />}
                  <span className={cn(
                    "text-xs font-mono uppercase tracking-widest",
                    step.status === 'loading' ? "text-white" :
                    step.status === 'pending' ? "text-[#3F3F46]" : "text-[#71717A]"
                  )}>
                    {step.label}
                  </span>
                </div>
                {step.message && <span className="text-[10px] font-mono font-bold text-[#52525B] italic uppercase">{step.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
