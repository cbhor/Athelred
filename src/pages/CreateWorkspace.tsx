import React, { useState } from 'react';
import { api } from '../lib/api';
import { calculateHash, cn } from '../lib/utils';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import JSZip from 'jszip';
import { useQueryClient } from '@tanstack/react-query';

interface ParseStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  message?: string;
}

export default function CreateWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [steps, setSteps] = useState<ParseStep[]>([
    { id: 'file', label: 'Reading file & metadata', status: 'pending' },
    { id: 'extract', label: 'Extracting chapters', status: 'pending' },
    { id: 'chunk', label: 'Processing text chunks', status: 'pending' },
    { id: 'save', label: 'Saving to library', status: 'pending' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const updateStep = (id: string, status: ParseStep['status'], message?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, message } : s));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.name.endsWith('.epub')) {
      setFile(selected);
      if (!workspaceName) {
        setWorkspaceName(selected.name.replace('.epub', ''));
      }
      setError(null);
    } else {
      setError('Please select a valid .epub file.');
    }
  };

  async function parseEpub(file: File) {
    setIsParsing(true);
    setError(null);
    
    try {
      const hash = await calculateHash(file);
      const workspaces = await api.workspaces.list();
      const existing = workspaces.find(w => w.epubHash === hash);
      
      if (existing) {
        if (!confirm(`An EPUB with this content already exists (Workspace: ${existing.name}). Create a duplicate?`)) {
          navigate(`/workspace/${existing.id}`);
          return;
        }
      }

      updateStep('file', 'loading');
      const book = ePub(await file.arrayBuffer());
      const metadata = await book.loaded.metadata;
      
      updateStep('file', 'success');
      updateStep('extract', 'loading');

      const zip = await JSZip.loadAsync(file);
      const spine = (book as any).spine;
      const chapters: { title: string; text: string; index: number }[] = [];

      let totalWords = 0;
      let totalChars = 0;

      for (let i = 0; i < spine.items.length; i++) {
        const item = spine.items[i];
        const href = item.href;
        const zippedFile = zip.file(href.startsWith('/') ? href.slice(1) : href) || 
                          zip.file('OEBPS/' + href) || 
                          zip.file('OPS/' + href) ||
                          zip.file('EPUB/' + href);
        
        if (zippedFile) {
          const content = await zippedFile.async('text');
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          
          const body = doc.body;
          if (body) {
            body.querySelectorAll('script, style, nav, footer').forEach(e => e.remove());
            const text = body.textContent || '';
            const cleanText = text.replace(/\s+/g, ' ').trim();
            
            if (cleanText.length > 100) {
              const chapterTitle = doc.querySelector('h1, h2, h3, title')?.textContent || `Chapter ${i + 1}`;
              chapters.push({
                title: chapterTitle.trim(),
                text: cleanText,
                index: i
              });
              
              totalChars += cleanText.length;
              totalWords += cleanText.split(/\s+/).length;
            }
          }
        }
      }

      if (chapters.length === 0) {
        throw new Error('No readable text found in EPUB.');
      }

      updateStep('extract', 'success', `${chapters.length} sections found`);
      updateStep('chunk', 'loading');

      const chunksData: any[] = [];
      const CHUNK_SIZE = 2500;

      chapters.forEach((chapter, chapterIdx) => {
        const words = chapter.text.split(/\s+/);
        let chunkIdx = 0;
        
        for (let i = 0; i < words.length; i += CHUNK_SIZE) {
          const chunkWords = words.slice(i, i + CHUNK_SIZE);
          const chunkText = chunkWords.join(' ');
          
          chunksData.push({
            chapterTitle: chapter.title,
            chapterIndex: chapterIdx,
            chunkIndex: chunkIdx++,
            text: chunkText,
            wordCount: chunkWords.length,
            characterCount: chunkText.length,
            sourceLocator: `section-${chapterIdx}-chunk-${chunkIdx}`,
          });
        }
      });

      updateStep('chunk', 'success', `${chunksData.length} chunks created`);
      updateStep('save', 'loading');

      const { id: workspaceId } = await api.workspaces.create({
        name: workspaceName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        epubFileName: file.name,
        epubTitle: metadata.title || 'Unknown Title',
        epubAuthor: metadata.creator || 'Unknown Author',
        epubHash: hash,
        totalCharacters: totalChars,
        totalWords: totalWords,
        chapterCount: chapters.length,
        chunkCount: chunksData.length,
        status: 'ready',
        parseWarnings: []
      });

      const finalChunks = chunksData.map(c => ({ ...c, workspaceId }));
      await api.sourceChunks.bulkAdd(finalChunks);

      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      updateStep('save', 'success');
      setTimeout(() => navigate(`/workspace/${workspaceId}`), 1000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while parsing the EPUB.');
      setIsParsing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="mb-10">
        <button onClick={() => navigate(-1)} className="btn-outline-v2 px-3 py-1.5 mb-6">
          <ArrowLeft className="w-4 h-4" /> <span>Back</span>
        </button>
        <h1 className="text-4xl font-serif text-white italic">Initialize Workspace</h1>
        <p className="text-[#71717A] mt-2 font-medium italic">Upload scholarly material for intelligence mapping.</p>
      </div>

      <div className="card-dark p-10 bg-[#111114]">
        <div className="space-y-8">
          <div>
            <label className="block text-[11px] font-bold text-[#52525B] uppercase tracking-widest mb-3">Workspace Identity</label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g., Advanced Pathophysiology"
              className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-medium placeholder-[#3F3F46]"
              disabled={isParsing}
            />
          </div>

          {!file ? (
            <div className="border-2 border-dashed border-[#27272A] rounded-2xl p-14 text-center hover:border-white/20 hover:bg-white/[0.02] transition-all cursor-pointer group relative">
              <input
                type="file"
                accept=".epub"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="w-20 h-20 bg-[#1D1D21] rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform border border-white/5">
                <Upload className="w-10 h-10 text-[#71717A] group-hover:text-white transition-colors" />
              </div>
              <h3 className="font-serif italic text-white text-xl mb-2">Ingest EPUB Record</h3>
              <p className="text-sm text-[#71717A] font-medium leading-relaxed">
                Click or drag file into the secure buffer.<br/>
                <span className="text-[10px] uppercase tracking-widest opacity-50 mt-2 block font-mono">Format: .epub • Max 50MB</span>
              </p>
            </div>
          ) : (
            <div className="bg-[#1D1D21] rounded-2xl p-6 border border-white/5 flex items-center gap-5">
              <div className="w-14 h-14 bg-[#18181B] rounded-xl flex items-center justify-center text-blue-400 border border-white/5">
                <FileText className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-serif italic text-white text-lg truncate">{file.name}</h4>
                <p className="text-[10px] font-mono text-[#52525B] uppercase tracking-wider italic">{(file.size / 1024 / 1024).toFixed(2)} MB • READY FOR ANALYSIS</p>
              </div>
              <button 
                onClick={() => setFile(null)} 
                className="text-[11px] font-bold text-red-400/70 hover:text-red-400 uppercase tracking-widest px-3 py-1.5 border border-red-400/20 rounded hover:bg-red-400/10 transition-all"
                disabled={isParsing}
              >
                Clear
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-4 p-5 bg-red-400/5 text-red-400 rounded-xl border border-red-400/20">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {isParsing && (
            <div className="space-y-4 pt-8 border-t border-white/[0.03]">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center justify-between py-1 px-2 group">
                  <div className="flex items-center gap-4">
                    {step.status === 'loading' ? <Loader2 className="w-4 h-4 text-white animate-spin" /> :
                     step.status === 'success' ? <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5 text-black" /></div> :
                     step.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                     <div className="w-4 h-4 rounded-full border border-[#3F3F46]" />}
                    <span className={cn(
                      "text-xs font-mono tracking-widest uppercase",
                      step.status === 'loading' ? "text-white" :
                      step.status === 'pending' ? "text-[#3F3F46]" : "text-[#71717A]"
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {step.message && <span className="text-[10px] font-mono text-[#52525B] italic">{step.message}</span>}
                </div>
              ))}
            </div>
          )}

          {!isParsing && file && (
            <button
              onClick={() => parseEpub(file)}
              className="btn-primary-v2 w-full h-14 bg-white hover:bg-gray-200 shadow-2xl hover:shadow-white/5 text-lg"
            >
              Analyze & Construct Workspace
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
