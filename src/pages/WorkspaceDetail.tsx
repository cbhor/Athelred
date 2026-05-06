import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { 
  Play, 
  Trash2, 
  ArrowLeft, 
  TrendingUp,
  BookOpen,
  BrainCircuit,
  Target,
  Clock,
  Activity,
  BarChart as BarChartIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Modal } from '../components/Modal';
import { 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function WorkspaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workspaceId = Number(id);
  const queryClient = useQueryClient();

  const { data: workspace, isLoading: isLoadingWorkspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.workspaces.get(workspaceId)
  });

  const { data: sessions, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['sessions', workspaceId],
    queryFn: async () => {
      const all = await api.sessions.list();
      return all.filter(s => s.workspaceId === workspaceId);
    }
  });

  const { data: questions, isLoading: isLoadingQuestions } = useQuery({
    queryKey: ['questions', workspaceId],
    queryFn: () => api.workspaces.getQuestions(workspaceId)
  });

  const { data: stats } = useQuery({
    queryKey: ['workspaceStats', workspaceId],
    queryFn: () => api.workspaces.getStats(workspaceId)
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.workspaces.delete(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate('/');
    }
  });

  const createSessionMutation = useMutation({
    mutationFn: (session: any) => api.sessions.create(session),
    onSuccess: (data) => {
      navigate(`/test/${data.id}`);
    }
  });

  const chapterMap = questions?.reduce((acc, q) => {
    acc[q.chapterTitle] = (acc[q.chapterTitle] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const handleDelete = () => {
    setIsDeleteModalOpen(true);
  };

  if (isLoadingWorkspace || !workspace) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  const averageScore = sessions?.length 
    ? (sessions.reduce((acc, s) => acc + (s.scorePercent || 0), 0) / sessions.filter(s => s.status === 'submitted').length).toFixed(1)
    : 'N/A';

  const passRate = sessions?.length
    ? ((sessions.filter(s => s.passed).length / sessions.filter(s => s.status === 'submitted').length) * 100).toFixed(0)
    : 'N/A';

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="btn-outline-v2 w-12 h-12 p-0 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-serif text-white italic">{workspace.name}</h1>
              {workspace.status === 'ready' ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 border border-green-500/30 bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-wider rounded">
                  <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse"></div> Ready
                </span>
              ) : (
                <span className="px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider rounded">
                  Processing
                </span>
              )}
            </div>
            <p className="text-[#71717A] flex items-center gap-2 text-sm italic font-medium">
              {workspace.epubTitle} • {workspace.epubAuthor}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleDelete}
            className="btn-outline-v2 w-12 h-12 p-0 text-red-400/70 hover:text-red-400 hover:border-red-400/50"
            title="Purge Workspace"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <Link
            to={`/generate/${workspaceId}`}
            className="btn-primary-v2 px-8 h-12"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Generate New Assessment</span>
          </Link>
        </div>
      </div>

      {/* Dashboard Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Stats */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <div className="card-dark p-6 bg-[#111114]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/5">
                <BrainCircuit className="w-4 h-4 text-[#A1A1AA]" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#52525B] font-bold">Knowledge Nodes</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-serif italic text-white">{workspace.chunkCount}</span>
              <span className="text-[10px] font-mono text-[#52525B]">CHUNKS</span>
            </div>
          </div>

          <div className="card-dark p-6 bg-[#111114]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/5">
                <Target className="w-4 h-4 text-[#A1A1AA]" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-[#52525B] font-bold">Mastery Level</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-serif italic text-white">
                {stats ? Math.round(stats.chapters.reduce((a: any, b: any) => a + b.mastery, 0) / (stats.chapters.length || 1)) : 0}%
              </span>
              <span className="text-[10px] font-mono text-emerald-500">AGGREGATE</span>
            </div>
          </div>

          {/* Mastery Heatmap */}
          <div className="col-span-full card-dark p-8 bg-[#111114] h-[300px]">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#52525B] mb-6 flex items-center gap-3 font-mono">
              <TrendingUp className="w-4 h-4" /> Chapter Proficiency Index
            </h3>
            <div className="w-full h-[200px]">
              {stats && (
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={stats.chapters}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#52525B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tick={{ fill: '#52525B' }}
                    />
                    <YAxis 
                      stroke="#52525B" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181B', border: '1px solid #3F3F46', color: '#D4D4D8', fontSize: '11px' }}
                      itemStyle={{ color: '#FFFFFF' }}
                    />
                    <Bar dataKey="mastery" fill="#FFFFFF" radius={[4, 4, 0, 0]} barSize={40} />
                  </ReBarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Cognitive Depth */}
        <div className="card-dark p-8 bg-[#111114] flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#52525B] mb-8 flex items-center gap-3 font-mono">
            <BarChartIcon className="w-4 h-4" /> Cognitive Bias Mapping
          </h3>
          <div className="flex-1 min-h-[250px]">
             {stats && (
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={Object.entries(stats.cognitiveLevels).map(([name, value]) => ({ name, value }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {Object.entries(stats.cognitiveLevels).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#3F3F46', '#71717A', '#A1A1AA', '#FFFFFF'][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181B', border: '1px solid #3F3F46', fontSize: '10px' }}
                    />
                 </PieChart>
               </ResponsiveContainer>
             )}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/[0.03]">
             {['Recall', 'Understanding', 'Application', 'Analysis'].map((level, i) => (
               <div key={level} className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#3F3F46', '#71717A', '#A1A1AA', '#FFFFFF'][i] }}></div>
                 <span className="text-[10px] font-mono text-[#71717A] uppercase tracking-wider">{level}</span>
               </div>
             ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
        <div className="lg:col-span-2 flex flex-col min-w-0">
          {/* Test Sessions Table */}
          <div className="card-dark flex-1 flex flex-col">
            <div className="px-6 py-4 border-b border-[#27272A] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#71717A] uppercase tracking-wider">Assessment History</h2>
              <span className="text-[10px] font-mono text-[#52525B]">{sessions?.length || 0} Records</span>
            </div>

            {!sessions || sessions.length === 0 ? (
              <div className="p-20 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-[#1D1D21] border border-white/5 text-[#52525B] rounded-full flex items-center justify-center mb-6">
                  <Play className="w-8 h-8 ml-1" />
                </div>
                <p className="text-[#71717A] font-medium italic">Repository empty. Initiate first generation.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[11px] text-[#52525B] border-b border-[#27272A] font-mono tracking-widest">
                    <tr>
                      <th className="px-6 py-4 font-medium uppercase">Assessment Identity</th>
                      <th className="px-6 py-4 font-medium uppercase text-center">Score</th>
                      <th className="px-6 py-4 font-medium uppercase text-center">Status</th>
                      <th className="px-6 py-4 font-medium uppercase text-right">Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {sessions.map((session) => (
                      <tr key={session.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-[#D4D4D8] mb-0.5">{session.name}</div>
                          <div className="text-[10px] text-[#52525B] font-mono">{new Date(session.createdAt).toLocaleDateString()} • {session.questionIds.length} Nodes</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {session.status === 'submitted' ? (
                            <div className={cn(
                              "font-mono font-bold text-base",
                              session.passed ? "text-green-400" : "text-red-400"
                            )}>
                              {session.scorePercent}%
                            </div>
                          ) : (
                            <span className="text-[#3F3F46]">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                            session.status === 'submitted' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                            session.status === 'active' ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" :
                            "bg-[#1D1D21] text-[#71717A] border-[#27272A]"
                          )}>
                            {session.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-3">
                            {session.status === 'submitted' ? (
                              <>
                                <button 
                                  onClick={async () => {
                                    createSessionMutation.mutate({
                                      ...session,
                                      id: undefined,
                                      name: `${session.name} (Re-attempt)`,
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
                                  className="p-1.5 hover:bg-white/5 rounded text-[#71717A] hover:text-white transition-colors"
                                  title="Re-attempt Protocol"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                                <Link 
                                  to={`/results/${session.id}`}
                                  className="text-white hover:underline font-bold tracking-tight mt-0.5"
                                >
                                  Results
                                </Link>
                              </>
                            ) : (
                              <Link
                                to={session.status === 'active' ? `/test/${session.id}` : `/test/${session.id}`}
                                className="text-white hover:underline font-bold tracking-tight"
                              >
                                {session.status === 'active' ? 'Resume' : 'Initiate'}
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-dark p-6">
             <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-500" />
              Coverage Map
             </h3>
             <div className="space-y-6">
                {Object.entries(chapterMap).length === 0 ? (
                  <p className="text-xs text-[#52525B] italic">Awaiting source analysis results...</p>
                ) : (
                  Object.entries(chapterMap).map(([title, count]) => (
                    <div key={title} className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-medium">
                        <span className="text-[#D4D4D8] truncate max-w-[160px] italic">{title}</span>
                        <span className="text-blue-400 font-mono">{count} Qs</span>
                      </div>
                      <div className="w-full h-1 bg-[#1D1D21] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-white rounded-full opacity-80" 
                          style={{ width: `${Math.min(100, (count / 50) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
             </div>
          </div>
          
          <div className="bg-[#18181B] border border-[#3F3F46] rounded-xl p-8 text-center shadow-2xl">
            <div className="w-12 h-12 bg-[#27272A] rounded-full mx-auto mb-4 flex items-center justify-center border border-white/5">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h4 className="font-serif italic text-white text-lg mb-2">Pro Protocol</h4>
            <p className="text-sm text-[#71717A] leading-relaxed font-medium">
              Regular assessment identifies weak neural links. Aethelred prioritizes unexplored content for complete mastery.
            </p>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Purge Workspace"
        description="Are you sure you want to delete this workspace and all associated questions and sessions? This operation is non-reversible."
        confirmText="Purge"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
