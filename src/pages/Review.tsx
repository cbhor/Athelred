import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Question } from '../db/db';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  Flag, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Info,
  AlertTriangle,
  Loader2
} from 'lucide-react';

export default function Review() {
  const { sessionId: sId } = useParams();
  const navigate = useNavigate();
  const sessionId = Number(sId);
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.sessions.get(sessionId)
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['sessionQuestions', session?.id],
    queryFn: async () => {
      if (!session) return [];
      const workspaceQuestions = await api.workspaces.getQuestions(session.workspaceId);
      return session.questionIds.map(id => workspaceQuestions.find(q => q.id === id)).filter(Boolean) as Question[];
    },
    enabled: !!session
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'correct' | 'flagged'>('all');
  const [isBadModalOpen, setIsBadModalOpen] = useState(false);

  const filteredQuestions = questions.filter((q) => {
    if (filter === 'all') return true;
    const userAnswer = session?.answers[q.id!];
    if (filter === 'incorrect') return userAnswer !== q.correctOptionId;
    if (filter === 'correct') return userAnswer === q.correctOptionId;
    if (filter === 'flagged') return session?.flaggedQuestionIds.includes(q.id!);
    return true;
  });

  const finalQuestions = filteredQuestions.length > 0 ? filteredQuestions : [];
  const currentQ = finalQuestions[currentIndex];

  const updateQuestionMutation = useMutation({
    mutationFn: ({ qId, updates }: { qId: number, updates: Partial<Question> }) => api.questions.update(qId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessionQuestions', session?.id] });
      setIsBadModalOpen(true);
    }
  });

  const handleMarkBad = async (qId: number) => {
    const q = questions.find(q => q.id === qId);
    if (!q) return;
    const newFlags = q.qualityFlags.includes('bad') ? q.qualityFlags : [...q.qualityFlags, 'bad'];
    updateQuestionMutation.mutate({ qId, updates: { qualityFlags: newFlags } });
  };

  if (!session || questions.length === 0) return (
    <div className="max-w-4xl mx-auto py-20 text-center text-[#71717A]">
      <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" />
      <p className="font-serif italic text-lg">Synchronizing performance data...</p>
    </div>
  );

  const userAnswer = session.answers[currentQ?.id!];
  const isCorrect = userAnswer === currentQ?.correctOptionId;
  const isFlagged = session.flaggedQuestionIds.includes(currentQ?.id!);

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-10 px-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 border-b border-white/[0.03] pb-10">
        <div className="flex items-center gap-6">
          <Link to={`/results/${sessionId}`} className="btn-outline-v2 p-4 rounded-2xl">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-4xl font-serif text-white italic tracking-tight">Analytical Review</h1>
            <p className="text-sm text-[#71717A] italic font-medium mt-1">Deep analysis of performance across {questions.length} cognitive nodes.</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-[#52525B] uppercase tracking-widest font-bold mb-1">Efficiency</span>
            <span className={cn("text-3xl font-serif italic", session.passed ? "text-emerald-400" : "text-rose-400")}>{session.scorePercent}%</span>
          </div>
          <div className="h-10 w-px bg-white/5" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-[#52525B] uppercase tracking-widest font-bold mb-1">Accuracy Index</span>
            <span className="text-3xl font-serif italic text-white">{session.correctCount} / {questions.length}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 bg-[#111114] border border-[#27272A] rounded-2xl p-1.5 shadow-xl">
          {(['all', 'incorrect', 'correct', 'flagged'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setCurrentIndex(0); }}
              className={cn(
                "px-6 py-3 rounded-xl text-[10px] font-bold uppercase transition-all tracking-[0.2em] font-mono",
                filter === f ? "bg-white text-black shadow-2xl" : "text-[#52525B] hover:text-[#D4D4D8] hover:bg-white/5"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {!currentQ ? (
        <div className="card-dark p-24 text-center bg-[#111114]">
          <div className="w-20 h-20 bg-[#18181B] text-[#3F3F46] rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
            <Filter className="w-10 h-10" />
          </div>
          <p className="text-[#71717A] font-medium italic">No cognitive nodes found for the selected filter.</p>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="card-dark p-10 bg-[#111114] shadow-2xl">
            <div className="flex items-center justify-between mb-10 border-b border-white/[0.03] pb-8">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.15em] bg-[#18181B] px-3 py-1.5 rounded border border-white/5">
                  Node {currentIndex + 1} // {finalQuestions.length}
                </span>
                <span className={cn(
                  "text-[10px] font-mono font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded border",
                  userAnswer ? (isCorrect ? "bg-emerald-400/5 text-emerald-400 border-emerald-400/20" : "bg-rose-400/5 text-rose-400 border-rose-400/20") : "bg-[#1D1D21] text-[#52525B] border-[#27272A]"
                )}>
                  {userAnswer ? (isCorrect ? "ACCURATE" : "ERRONEOUS") : "NULL_VALUE"}
                </span>
                {isFlagged && <span className="flex items-center gap-2 text-[10px] font-mono font-bold text-red-400 uppercase tracking-widest"><Flag className="w-3.5 h-3.5 fill-current" /> FLAGGED</span>}
              </div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525B]">
                {currentQ.chapterTitle}
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-serif text-white italic mb-12 leading-relaxed tracking-tight">
              {currentQ.questionText}
            </h2>

            <div className="grid grid-cols-1 gap-5">
              {currentQ.options.map(opt => {
                const isSelected = userAnswer === opt.id;
                const isCorrectOpt = currentQ.correctOptionId === opt.id;
                
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "p-6 rounded-xl border-2 flex items-center gap-6 transition-all",
                      isCorrectOpt ? "border-emerald-400/40 bg-emerald-400/[0.02]" :
                      isSelected && !isCorrectOpt ? "border-rose-400/40 bg-rose-400/[0.02]" :
                      "border-[#27272A] bg-transparent opacity-40"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-base border",
                      isCorrectOpt ? "bg-emerald-400 text-black border-emerald-400" :
                      isSelected && !isCorrectOpt ? "bg-rose-400 text-black border-rose-400" :
                      "bg-[#1D1D21] text-[#52525B] border-white/5"
                    )}>
                      {opt.id}
                    </div>
                    <span className={cn(
                      "flex-1 text-lg font-medium tracking-tight",
                      isCorrectOpt ? "text-white" : isSelected ? "text-[#D4D4D8]" : "text-[#71717A]"
                    )}>
                      {opt.text}
                    </span>
                    {isCorrectOpt && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                    {isSelected && !isCorrectOpt && <XCircle className="w-6 h-6 text-rose-400" />}
                  </div>
                );
              })}
            </div>

            <div className="mt-12 pt-10 border-t border-white/[0.03] space-y-8">
              <div className="bg-[#18181B] rounded-2xl p-8 border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5">
                  <Info className="w-24 h-24 text-white" />
                </div>
                <h4 className="flex items-center gap-3 font-serif italic text-white text-xl mb-3">
                  <Info className="w-5 h-5 text-blue-400" /> Synthesis Notes
                </h4>
                <p className="text-[#A1A1AA] leading-relaxed font-medium italic">
                  {currentQ.explanation}
                </p>
                {currentQ.sourceQuote && (
                  <div className="mt-6 pl-6 border-l-2 border-white/10 italic text-[#71717A] leading-relaxed">
                    "{currentQ.sourceQuote}"
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em]">
                <div className="flex items-center gap-10">
                  <span className="flex flex-col">Complexity <span className="text-[#A1A1AA] mt-1">{currentQ.difficulty}</span></span>
                  <span className="flex flex-col">Cognitive Level <span className="text-[#A1A1AA] mt-1">{currentQ.cognitiveLevel}</span></span>
                </div>
                <button 
                  onClick={() => handleMarkBad(currentQ.id!)}
                  className="flex items-center gap-2 text-rose-500/50 hover:text-rose-400 transition-colors bg-rose-400/5 px-4 py-2 rounded-lg border border-rose-400/10"
                >
                  <AlertTriangle className="w-4 h-4" /> <span>Mark Poor Synthesis</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pb-10">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="btn-outline-v2 h-12 px-6 disabled:opacity-10"
            >
              <ChevronLeft className="w-5 h-5 mr-1" /> Previous Node
            </button>
            <div className="text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.3em] font-serif italic text-base lowercase mt-2">
              Iterating {finalQuestions.length} nodes
            </div>
            <button
              onClick={() => setCurrentIndex(Math.min(finalQuestions.length - 1, currentIndex + 1))}
              disabled={currentIndex === finalQuestions.length - 1}
              className="btn-outline-v2 h-12 px-6 disabled:opacity-10"
            >
              Next Node <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          </div>
        </div>
      )}
      <Modal
        isOpen={isBadModalOpen}
        onClose={() => setIsBadModalOpen(false)}
        title="Quality Protocol"
        description="Question has been flagged as poor quality. The synthesis engine will avoid this node in future assessment generations."
        confirmText="Acknowledged"
        onConfirm={() => setIsBadModalOpen(false)}
      />
    </div>
  );
}
