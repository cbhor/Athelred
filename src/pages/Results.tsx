import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { 
  Trophy, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  BarChart, 
  ChevronRight, 
  ArrowLeft,
  BookOpen,
  Play,
  TrendingUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import confetti from 'canvas-confetti';
import { useEffect } from 'react';

export default function Results() {
  const { sessionId: sId } = useParams();
  const navigate = useNavigate();
  const sessionId = sId ? Number(sId) : null;
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionId ? api.sessions.get(sessionId) : null,
    enabled: !!sessionId
  });

  const { data: allSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions.list(),
    select: (data) => data.filter(s => s.status === 'submitted')
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace', session?.workspaceId],
    queryFn: () => session ? api.workspaces.get(session.workspaceId) : null,
    enabled: !!session
  });

  const createSessionMutation = useMutation({
    mutationFn: (session: any) => api.sessions.create(session),
    onSuccess: (data) => {
      navigate(`/test/${data.id}`);
    }
  });

  useEffect(() => {
    if (session?.passed) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#818cf8', '#c7d2fe']
      });
    }
  }, [session?.passed]);

  if (sessionId && !session) return null;

  // Global results view if no specific sessionId
  if (!sessionId) {
    return (
      <div className="space-y-10 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-serif text-white italic">Historical Performance</h1>
            <p className="text-[#71717A] mt-2 font-medium italic">Comprehensive archive of all assessment protocols.</p>
          </div>
        </div>

        {!allSessions || allSessions.length === 0 ? (
          <div className="card-dark p-20 text-center bg-[#111114]">
            <div className="w-24 h-24 bg-[#18181B] text-[#3F3F46] rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
              <BarChart className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-serif text-white italic mb-3">No Records Found</h2>
            <p className="text-[#71717A] mb-10 font-medium max-w-md mx-auto italic">Complete your first session to initiate the performance tracking database.</p>
            <Link to="/" className="btn-primary-v2 px-10 py-4 text-lg">
              Return to Library
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {allSessions.map(s => (
              <Link 
                key={s.id} 
                to={`/results/${s.id}`}
                className="bg-[#111114] border border-[#27272A] rounded-2xl p-8 flex flex-col gap-6 hover:border-white/20 transition-all group"
              >
                <div className="flex items-start justify-between">
                   <div className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center border transition-colors",
                    s.passed ? "bg-emerald-400/5 text-emerald-400 border-emerald-400/20" : "bg-rose-400/5 text-rose-400 border-rose-400/20"
                   )}>
                    {s.passed ? <Trophy className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                   </div>
                   <div className="text-right">
                    <p className="text-[10px] text-[#52525B] font-bold uppercase tracking-[0.2em] mb-1 font-mono">Proficiency</p>
                    <p className={cn("text-3xl font-serif italic", s.passed ? "text-emerald-400" : "text-rose-400")}>
                      {s.scorePercent}%
                    </p>
                   </div>
                </div>
                <div>
                  <h3 className="font-serif italic text-white text-xl mb-2 group-hover:text-blue-400 transition-colors">{s.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-[#52525B] uppercase tracking-widest bg-[#1D1D21] px-2 py-1 rounded border border-white/5">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono uppercase tracking-widest",
                      s.passed ? "text-emerald-500/70" : "text-rose-500/70"
                    )}>
                      {s.passed ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                </div>
                <div className="mt-auto pt-6 border-t border-white/[0.03] flex items-center justify-between text-xs font-bold uppercase tracking-widest text-[#71717A] group-hover:text-white transition-colors">
                  Analyze Detailed Matrix
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Specific session result view
  const timeSpent = Math.max(0, (session?.submittedAt || 0) - (session?.startedAt || 0));
  const timeUsedMins = Math.floor(timeSpent / 60000);
  const timeUsedSecs = Math.floor((timeSpent % 60000) / 1000);

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-10 px-6">
      <div className="flex items-center justify-between">
        <Link to={`/workspace/${session!.workspaceId}`} className="btn-outline-v2 px-5 py-2.5 rounded-xl flex items-center gap-2 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
          <span className="font-medium italic">Back to Archive</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-[#52525B] uppercase tracking-widest font-bold">Session ID</span>
          <span className="text-[10px] font-mono text-white bg-[#111114] border border-white/5 px-2 py-1 rounded">#{sessionId}</span>
        </div>
      </div>

      <div className={cn(
        "card-dark bg-[#111114] p-16 text-center shadow-2xl relative overflow-hidden rounded-[2rem] border-2",
        session!.passed ? "border-emerald-400/20" : "border-rose-400/20"
      )}>
        {/* Background Accents */}
        <div className={cn(
          "absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[120px] opacity-10",
          session!.passed ? "bg-emerald-400" : "bg-rose-400"
        )} />
        <div className={cn(
          "absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-[120px] opacity-10",
          session!.passed ? "bg-emerald-400" : "bg-rose-400"
        )} />

        <div className="relative z-10 flex flex-col items-center">
          <div className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center mb-10 shadow-2xl border-2 transition-transform hover:scale-110 duration-500",
            session!.passed ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/40" : "bg-rose-400/10 text-rose-400 border-rose-400/40"
          )}>
            {session!.passed ? <Trophy className="w-12 h-12" /> : <XCircle className="w-12 h-12" />}
          </div>
          
          <h1 className="text-5xl font-serif italic text-white mb-4 tracking-tight">
            {session!.passed ? "Scholar Ascendant" : "Protocol Deficit"}
          </h1>
          <p className="text-xl text-[#71717A] font-medium mb-12 italic">
            You achieved a mastery level of <span className={cn("font-serif italic text-3xl ml-2", session!.passed ? "text-emerald-400" : "text-rose-400")}>{session!.scorePercent}%</span>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full">
            <div className="bg-[#18181B] p-8 rounded-2xl border border-white/[0.03]">
              <div className="flex flex-col items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525B]">Successful</span>
              </div>
              <p className="text-4xl font-serif italic text-white tracking-tighter">{session!.correctCount}</p>
            </div>
            <div className="bg-[#18181B] p-8 rounded-2xl border border-white/[0.03]">
              <div className="flex flex-col items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525B]">Erroneous</span>
              </div>
              <p className="text-4xl font-serif italic text-white tracking-tighter">{session!.incorrectCount}</p>
            </div>
            <div className="bg-[#18181B] p-8 rounded-2xl border border-white/[0.03]">
              <div className="flex flex-col items-center gap-2 mb-2">
                <BarChart className="w-4 h-4 text-[#71717A]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525B]">Inert</span>
              </div>
              <p className="text-4xl font-serif italic text-white tracking-tighter">{session!.unansweredCount}</p>
            </div>
            <div className="bg-[#18181B] p-8 rounded-2xl border border-white/[0.03]">
              <div className="flex flex-col items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#52525B]">Temporal</span>
              </div>
              <p className="text-4xl font-serif italic text-white tracking-tighter">{timeUsedMins}m {timeUsedSecs}s</p>
            </div>
          </div>

          <div className="mt-16 flex flex-col sm:flex-row items-center gap-6 w-full max-w-xl mx-auto">
            <Link
              to={`/review/${sessionId}`}
              className="btn-primary-v2 flex-1 h-16 text-lg bg-white shadow-xl flex items-center justify-center"
            >
              <BookOpen className="w-6 h-6 mr-3" />
              Analyze Matrix
            </Link>
            <button
               onClick={async () => {
                 createSessionMutation.mutate({
                   ...session!,
                   id: undefined,
                   name: `${session!.name} (Re-attempt)`,
                   status: 'draft',
                   answers: {},
                   scorePercent: 0,
                   correctCount: 0,
                   incorrectCount: 0,
                   unansweredCount: 0,
                   flaggedQuestionIds: [],
                   createdAt: Date.now(),
                   timeSpent: 0,
                   startedAt: undefined,
                   submittedAt: undefined
                 });
               }}
               className="btn-outline-v2 flex-1 h-16 text-lg flex items-center justify-center tracking-tight"
            >
              <Play className="w-6 h-6 mr-3" />
              Re-attempt
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#111114] rounded-2xl p-10 border border-[#27272A] flex items-center gap-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <TrendingUp className="w-32 h-32 text-white" />
        </div>
        <div className="w-20 h-20 bg-[#1D1D21] border border-white/5 rounded-2xl flex items-center justify-center text-blue-400 flex-shrink-0 shadow-2xl group-hover:scale-105 transition-transform">
          <TrendingUp className="w-10 h-10" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-serif italic text-2xl mb-2 tracking-tight">Post-Analytical Insight</h3>
          <p className="text-[#71717A] leading-relaxed italic font-medium">
             Highest cognitive density observed in <span className="text-white">"{workspace?.epubTitle}"</span>. Recommendation: Target flagged nodes in the next iteration to stabilize neural pathways.
          </p>
        </div>
      </div>
    </div>
  );
}
