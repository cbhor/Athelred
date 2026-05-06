import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Question } from '../db/db';
import { cn, formatTimeRemaining } from '../lib/utils';
import { 
  ChevronLeft, 
  ChevronRight, 
  Flag, 
  Timer, 
  CheckCircle2, 
  AlertCircle,
  Menu,
  X,
  Send,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function TestSession() {
  const { sessionId: sId } = useParams();
  const navigate = useNavigate();
  const sessionId = Number(sId);
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.sessions.get(sessionId),
    refetchInterval: 10000 // Poll occasionally as fallback
  });

  const { data: questions } = useQuery({
    queryKey: ['sessionQuestions', session?.id],
    queryFn: async () => {
      if (!session) return [];
      const workspaceQuestions = await api.workspaces.getQuestions(session.workspaceId);
      return session.questionIds.map(id => workspaceQuestions.find(q => q.id === id)).filter(Boolean) as Question[];
    },
    enabled: !!session
  });

  const updateSessionMutation = useMutation({
    mutationFn: (updates: any) => api.sessions.update(sessionId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    }
  });

  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Handle Session Start
  useEffect(() => {
    if (session && session.status === 'draft') {
      const now = Date.now();
      const expiresAt = now + session.durationMinutes * 60 * 1000;
      updateSessionMutation.mutate({
        status: 'active',
        startedAt: now,
        expiresAt: expiresAt
      });
    }
  }, [session?.status]);

  // Timer logic
  useEffect(() => {
    if (session?.status === 'active' && session.expiresAt) {
      const interval = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((session.expiresAt! - now) / 1000));
        setTimeLeft(diff);

        if (diff <= 0) {
          clearInterval(interval);
          handleSubmit();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [session?.status, session?.expiresAt]);

  const handleSubmit = async () => {
    if (!session || !questions.length) return;

    const answers = session.answers;
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    questions.forEach(q => {
      const answer = answers[q.id!];
      if (!answer) {
        unanswered++;
      } else if (answer === q.correctOptionId) {
        correct++;
      } else {
        incorrect++;
      }
    });

    const scorePercent = Math.round((correct / questions.length) * 100);
    const passed = scorePercent >= 60; // Default pass mark

    await api.sessions.update(sessionId, {
      status: 'submitted',
      submittedAt: Date.now(),
      scorePercent,
      correctCount: correct,
      incorrectCount: incorrect,
      unansweredCount: unanswered,
      passed
    });

    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    navigate(`/results/${sessionId}`);
  };

  const handleAnswerSelect = async (optionId: string) => {
    if (!session || !questions) return;
    const newAnswers = { ...session.answers, [questions[session.currentQuestionIndex].id!]: optionId };
    updateSessionMutation.mutate({ answers: newAnswers });
  };

  const toggleFlag = async () => {
    if (!session || !questions) return;
    const qId = questions[session.currentQuestionIndex].id!;
    const newFlags = session.flaggedQuestionIds.includes(qId)
      ? session.flaggedQuestionIds.filter(id => id !== qId)
      : [...session.flaggedQuestionIds, qId];
    updateSessionMutation.mutate({ flaggedQuestionIds: newFlags });
  };

  const setIndex = async (idx: number) => {
    updateSessionMutation.mutate({ currentQuestionIndex: idx });
  };

  if (!session || !questions || questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Entering secure exam environment...</p>
        </div>
      </div>
    );
  }

  const currentQ = questions[session.currentQuestionIndex];
  const selectedOption = session.answers[currentQ?.id!];
  const isFlagged = session.flaggedQuestionIds.includes(currentQ?.id!);

  return (
    <div className="fixed inset-0 bg-[#09090B] text-[#D4D4D8] flex z-50 overflow-hidden font-sans select-none">
      {/* Sidebar Navigator */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              className="fixed inset-y-0 left-0 w-80 bg-[#111114] border-r border-[#27272A] z-[70] flex flex-col"
            >
              <div className="p-8 border-b border-[#27272A] flex items-center justify-between">
                <div>
                  <h3 className="font-serif italic text-white text-lg tracking-tight">Question Map</h3>
                  <p className="text-[10px] uppercase tracking-widest text-[#52525B] font-bold">100 Protocol Units</p>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-[#71717A]">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-5 gap-3">
                {questions.map((q, idx) => {
                  const isAnswered = !!session.answers[q.id!];
                  const isCurrent = idx === session.currentQuestionIndex;
                  const isFlaggedLoc = session.flaggedQuestionIds.includes(q.id!);
                  
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        setIndex(idx);
                        setIsSidebarOpen(false);
                      }}
                      className={cn(
                        "h-11 w-full rounded-lg text-[11px] font-mono font-bold transition-all relative border",
                        isCurrent ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.1)]" :
                        isAnswered ? "bg-[#1D1D21] text-white border-white/20" :
                        "bg-transparent text-[#52525B] border-[#27272A] hover:border-[#3F3F46]"
                      )}
                    >
                      {idx + 1}
                      {isFlaggedLoc && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-400 rounded-full border-2 border-[#111114]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full items-center relative min-w-0">
        {/* Exam Header */}
        <header className="w-full h-20 bg-[#09090B] border-b border-[#27272A] px-10 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-3 border border-[#27272A] rounded-lg text-[#71717A] hover:bg-white/5 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:block">
              <h2 className="font-serif italic text-white text-lg truncate max-w-[240px] tracking-tight">{session.name}</h2>
              <div className="text-[10px] text-[#52525B] uppercase font-bold tracking-widest font-mono">
                Protocol {session.currentQuestionIndex + 1} // {questions.length} Units
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className={cn(
              "flex items-center gap-3 px-5 py-2.5 rounded-lg border transition-all font-mono",
              timeLeft < 300 
                ? "bg-red-400/10 text-red-400 border-red-400/30 animate-pulse" 
                : "bg-[#111114] text-[#A1A1AA] border-[#27272A]"
            )}>
              <Timer className="w-4 h-4" />
              <span className="font-bold text-xl tracking-tight">{formatTimeRemaining(timeLeft)}</span>
            </div>
            
            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn-primary-v2 h-12 px-8 shadow-xl"
            >
              <Send className="w-4 h-4 mr-2" />
              Finish
            </button>
          </div>
        </header>

        {/* Question Area */}
        <div className="flex-1 w-full overflow-y-auto p-10 flex flex-col items-center">
          <div className="w-full max-w-4xl space-y-12 py-10">
            <div className="flex items-center justify-between border-b border-white/[0.03] pb-6">
               <div className="flex items-center gap-3">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                 <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525B]">
                  Node Coverage: {currentQ.chapterTitle}
                 </span>
               </div>
               <button 
                onClick={toggleFlag}
                className={cn(
                  "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all px-4 py-1.5 rounded border",
                  isFlagged 
                    ? "bg-red-400/10 text-red-400 border-red-400/30" 
                    : "bg-[#111114] text-[#52525B] border-[#27272A] hover:text-[#71717A] hover:border-[#3F3F46]"
                )}
               >
                <Flag className={cn("w-3 h-3", isFlagged && "fill-current")} />
                {isFlagged ? 'Review Flagged' : 'Flag Protocol'}
               </button>
            </div>

            <div className="space-y-6">
              <h2 className="text-2xl md:text-3xl font-serif text-white italic leading-relaxed tracking-tight">
                {currentQ.questionText}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {currentQ.options.map((option) => {
                const isSelected = selectedOption === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleAnswerSelect(option.id)}
                    className={cn(
                      "group p-6 rounded-xl border-2 text-left transition-all relative overflow-hidden flex items-center gap-6",
                      isSelected 
                        ? "border-white bg-[#111114] shadow-[0_0_30px_rgba(255,255,255,0.05)]" 
                        : "border-[#27272A] bg-transparent hover:border-[#3F3F46] hover:bg-white/[0.02]"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 flex-shrink-0 rounded-lg flex items-center justify-center font-mono font-bold transition-all text-lg",
                      isSelected 
                        ? "bg-white text-black" 
                        : "bg-[#1D1D21] text-[#52525B] group-hover:text-[#A1A1AA] border border-white/5"
                    )}>
                      {option.id}
                    </div>
                    <span className={cn(
                      "flex-1 text-lg font-medium tracking-tight",
                      isSelected ? "text-white" : "text-[#71717A] group-hover:text-[#D4D4D8]"
                    )}>
                      {option.text}
                    </span>
                    {isSelected && (
                      <div className="absolute right-6 opacity-20">
                        <CheckCircle2 className="w-12 h-12 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <footer className="w-full max-w-4xl px-10 py-10 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setIndex(Math.max(0, session.currentQuestionIndex - 1))}
            disabled={session.currentQuestionIndex === 0}
            className="btn-outline-v2 h-12 px-6 disabled:opacity-10"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            <span>Previous Node</span>
          </button>

          <div className="hidden sm:flex items-center gap-10 font-mono text-[10px] text-[#52525B] uppercase tracking-[0.2em] font-bold">
            <div className="flex flex-col items-center">
              <span>Sync Status</span>
              <span className="text-green-500/50">Encrypted</span>
            </div>
            <div className="flex flex-col items-center">
              <span>Answered</span>
              <span className="text-white">{Object.keys(session.answers).length} / {questions.length}</span>
            </div>
          </div>

          <button
            onClick={() => setIndex(Math.min(questions.length - 1, session.currentQuestionIndex + 1))}
            disabled={session.currentQuestionIndex === questions.length - 1}
            className="btn-outline-v2 h-12 px-6 disabled:opacity-10"
          >
            <span>Next Node</span>
            <ChevronRight className="w-5 h-5 ml-1" />
          </button>
        </footer>
      </div>

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubmitModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card-dark bg-[#111114] p-10 max-w-lg w-full relative shadow-[0_0_100px_rgba(0,0,0,0.5)] border-[#3F3F46]"
            >
              <div className="w-20 h-20 bg-[#1D1D21] border border-white/5 text-white rounded-full flex items-center justify-center mb-8 mx-auto shadow-2xl">
                <Send className="w-10 h-10 ml-1" />
              </div>
              <h3 className="text-3xl font-serif italic text-white mb-3 text-center tracking-tight">Finalize Assessment?</h3>
              <p className="text-[#71717A] mb-10 text-center leading-relaxed font-medium">
                Node analysis currently at <span className="text-white font-mono">{Object.keys(session.answers).length}%</span>. Submission will lock all values and initiate evaluation protocol.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="btn-outline-v2 h-14"
                >
                  Return to Nodes
                </button>
                <button
                  onClick={handleSubmit}
                  className="btn-primary-v2 h-14 bg-white text-black hover:bg-gray-200 shadow-xl"
                >
                  Execute Protocol
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
