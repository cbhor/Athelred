import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { Book, Plus, Calendar, ChevronRight, Trash2 } from 'lucide-react';
import React from 'react';
import { Modal } from '../components/Modal';

export default function Home() {
  const queryClient = useQueryClient();
  const [workspaceToDelete, setWorkspaceToDelete] = React.useState<any>(null);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.workspaces.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.workspaces.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setWorkspaceToDelete(null);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-[#111114] border border-[#27272A] text-white rounded-2xl flex items-center justify-center mb-6 shadow-xl">
          <Book className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-serif italic text-white mb-3">No workspaces yet</h2>
        <p className="text-[#71717A] max-w-md mb-8 leading-relaxed">
          Create your first intelligent workspace by uploading an EPUB. Aethelred analyzes content via Local Gemini APIs to generate expert-level assessments.
        </p>
        <Link
          to="/create-workspace"
          className="btn-primary-v2 w-64 h-12 shadow-lg hover:shadow-white/5"
        >
          <Plus className="w-5 h-5 mr-1" />
          Create Study Workspace
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-serif text-white">Your Intelligence Workspaces</h1>
          <p className="text-[#71717A] mt-1 font-medium italic">Manage active research documents and generated banks.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="relative group">
            <Link
              to={`/workspace/${workspace.id}`}
              className="block bg-[#111114] border border-[#27272A] rounded-xl p-8 hover:border-[#3F3F46] hover:bg-[#18181B] transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <Book className="w-16 h-16 text-white transform rotate-12" />
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#52525B] mb-6">
                <Calendar className="w-3 h-3" />
                <span>Created {new Date(workspace.createdAt).toLocaleDateString()}</span>
              </div>

              <h3 className="font-serif italic text-xl text-white mb-2 group-hover:translate-x-1 transition-transform">{workspace.name}</h3>
              <p className="text-xs text-[#71717A] font-medium leading-relaxed mb-8 pr-10">
                {workspace.epubTitle} • {workspace.epubAuthor}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="bg-[#1D1D21] border border-white/5 p-3 rounded-lg">
                  <span className="block text-[9px] text-[#52525B] uppercase font-bold tracking-widest mb-1">Sections</span>
                  <span className="text-sm font-mono text-white">{workspace.chapterCount} Chs</span>
                </div>
                <div className="bg-[#1D1D21] border border-white/5 p-3 rounded-lg">
                  <span className="block text-[9px] text-[#52525B] uppercase font-bold tracking-widest mb-1">Scale</span>
                  <span className="text-sm font-mono text-white">{(workspace.totalWords / 1000).toFixed(1)}k Words</span>
                </div>
              </div>

              <div className="flex items-center text-xs font-bold uppercase tracking-widest text-[#D4D4D8] group-hover:text-white transition-colors pt-4 border-t border-white/[0.03]">
                Access Environment
                <ChevronRight className="w-4 h-4 ml-1 transform group-hover:translate-x-2 transition-transform" />
              </div>
            </Link>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setWorkspaceToDelete(workspace);
              }}
              className="absolute top-6 right-6 p-2 rounded-lg bg-red-400/5 text-red-400 opacity-0 group-hover:opacity-100 transition-all border border-red-400/10 hover:bg-red-400 hover:text-white z-10"
              title="Delete workspace"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!workspaceToDelete}
        onClose={() => setWorkspaceToDelete(null)}
        onConfirm={() => deleteMutation.mutate(workspaceToDelete?.id)}
        title="Delete Workspace"
        description={`Are you sure you want to delete "${workspaceToDelete?.name}"? All associated data will be merged into oblivion.`}
        confirmText="Confirm Purge"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
