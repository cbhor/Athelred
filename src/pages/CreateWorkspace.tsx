import React, { useState } from 'react';
import { api } from '../lib/api';
import { calculateHash, cn } from '../lib/utils';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import JSZip from 'jszip';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../components/Modal';

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
  const [showReview, setShowReview] = useState(false);
  const [extractedChapters, setExtractedChapters] = useState<{ title: string; text: string; index: number }[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [parseContext, setParseContext] = useState<{
    file: File;
    metadata: any;
    hash: string;
    totalChars: number;
    totalWords: number;
  } | null>(null);

  const [steps, setSteps] = useState<ParseStep[]>([
    { id: 'file', label: 'Reading file & metadata', status: 'pending' },
    { id: 'extract', label: 'Extracting chapters', status: 'pending' },
    { id: 'review', label: 'Reviewing detected chapters', status: 'pending' },
    { id: 'chunk', label: 'Processing text chunks', status: 'pending' },
    { id: 'embedding', label: 'Generating semantic vectors', status: 'pending' },
    { id: 'save', label: 'Saving to library', status: 'pending' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWorkspace, setDuplicateWorkspace] = useState<any>(null);

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
        setDuplicateWorkspace(existing);
        setIsParsing(false);
        return;
      }

      await executeParse(file);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while parsing the EPUB.');
      setIsParsing(false);
    }
  }

  async function executeParse(file: File) {
    setIsParsing(true);
    setError(null);
    try {
      const hash = await calculateHash(file);
      updateStep('file', 'loading');
      const book = ePub(await file.arrayBuffer());
      const metadata = await book.loaded.metadata;
      
      updateStep('file', 'success');
      updateStep('extract', 'loading');

      const zip = await JSZip.loadAsync(file);
      const spine = (book as any).spine;
      const toc = await book.loaded.navigation;
      
      // Map TOC entries to their respective spine indices and anchors
      const spineToTocEntries = new Map<number, { label: string; anchor: string | null; depth: number }[]>();
      
      const flattenToc = (items: any[], depth: number = 0) => {
        items.forEach(item => {
          const parts = item.href.split('#');
          const anchor = parts[1] || null;
          
          // Use epubjs native resolution to find the spine item for this TOC entry
          const spineItem = book.spine.get(item.href);
          if (spineItem) {
            const index = spineItem.index;
            if (!spineToTocEntries.has(index)) {
              spineToTocEntries.set(index, []);
            }
            spineToTocEntries.get(index)?.push({ label: item.label, anchor, depth });
          }
          
          if (item.subitems && item.subitems.length > 0) {
            flattenToc(item.subitems, depth + 1);
          }
        });
      };
      
      if (toc && toc.toc) {
        flattenToc(toc.toc);
      }

      const segments: { title: string; text: string; href: string; isTocStart: boolean; depth: number }[] = [];
      let totalWords = 0;
      let totalChars = 0;

      // Iterate through the spine
      for (let i = 0; i < spine.items.length; i++) {
        const item = spine.items[i];
        
        // Skip common metadata files unless they are explicitly in TOC
        const isMetadataPath = /cover|title|copyright|dedication|acknowledgments|author|preface|contents|toc|nav|about|license|jacket/i.test(item.href);
        const entries = spineToTocEntries.get(i) || [];
        
        if (isMetadataPath && entries.length === 0) {
          continue;
        }

        try {
          let content = '';
          
          // Strategy 1: Look in ZIP (usually most reliable for raw content)
          // Try multiple path variations
          const possiblePaths = [
            item.href,
            item.path,
            item.href.replace(/^\//, ''),
            'OEBPS/' + item.href.replace(/^\//, ''),
            'OPS/' + item.href.replace(/^\//, ''),
            'EPUB/' + item.href.replace(/^\//, ''),
          ].filter(Boolean);

          let zipFile = null;
          for (const p of possiblePaths) {
            zipFile = zip.file(p!);
            if (zipFile) break;
          }

          if (zipFile) {
            content = await zipFile.async('text');
          } else {
            // Strategy 2: Fallback to epubjs load
            const doc = await item.load(book.load.bind(book));
            content = doc.body.innerHTML;
          }

          if (!content) continue;

          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const body = doc.body;

          if (body) {
            // Clean undesirable elements
            body.querySelectorAll('script, style, nav, footer, head').forEach(e => e.remove());
            
            if (entries.length > 1 && entries.some(e => e.anchor)) {
              // Internal splitting based on anchors
              const anchorPoints = entries.map(e => ({
                label: e.label,
                element: e.anchor ? doc.getElementById(e.anchor) || doc.querySelector(`[name="${e.anchor}"]`) : body,
                depth: e.depth,
                anchor: e.anchor
              })).filter(ap => ap.element);

              const sortedAnchors = anchorPoints.sort((a, b) => {
                if (a.element === b.element) return 0;
                return (a.element!.compareDocumentPosition(b.element!) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
              });

              for (let j = 0; j < sortedAnchors.length; j++) {
                const current = sortedAnchors[j];
                const next = sortedAnchors[j + 1];
                
                const container = doc.createElement('div');
                let node: Node | null = current.element;
                
                if (node && node !== body) {
                  container.appendChild(node.cloneNode(true));
                  let nextSib: Node | null = node.nextSibling;
                  while (nextSib && nextSib !== next?.element) {
                    container.appendChild(nextSib.cloneNode(true));
                    nextSib = nextSib.nextSibling;
                  }
                } else {
                  container.textContent = body.textContent;
                }

                const text = container.textContent || '';
                const cleanText = text.replace(/\s+/g, ' ').trim();
                
                if (cleanText.length > 30) {
                  segments.push({
                    title: current.label,
                    text: cleanText,
                    href: `${item.href}${current.anchor ? '#' + current.anchor : ''}`,
                    isTocStart: true,
                    depth: current.depth
                  });
                  totalChars += cleanText.length;
                  totalWords += cleanText.split(/\s+/).length;
                }
              }
            } else {
              // Single segment file
              const text = body.textContent || '';
              const cleanText = text.replace(/\s+/g, ' ').trim();
              
              if (cleanText.length > 30) {
                const isTocStart = entries.length > 0;
                
                // Smarter title selection
                const bookTitle = metadata.title?.trim();
                let title = entries[0]?.label;
                
                const isValidTitle = (t?: string) => {
                  if (!t) return false;
                  const clean = t.trim();
                  // More rigorous check: avoid titles that match book title EXACTLY or are contained in it too simply
                  if (!clean || clean.length < 2 || clean.length > 150) return false;
                  if (clean.toLowerCase() === bookTitle?.toLowerCase()) return false;
                  
                  // Ignore common generic page labels like "Page 1", "Untitled"
                  if (/^(page|section|chapter)\s+\d+$/i.test(clean)) return true; // keep these as fallbacks
                  
                  return true;
                };

                if (!isValidTitle(title)) {
                  // Fallback to headers in the document, but avoid the book title
                  const headers = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5'));
                  for (const h of headers) {
                    const hText = h.textContent?.trim();
                    if (isValidTitle(hText)) {
                      title = hText;
                      break;
                    }
                  }
                }
                
                // Final fallbacks - avoid using the book title as a segment title
                if (!isValidTitle(title)) {
                  // Try first substantive paragraph if it looks like a sub-header (e.g. bold or all caps)
                  const p = doc.querySelector('p b, p strong, p.chapter-title, p.section-title');
                  if (p && isValidTitle(p.textContent?.trim())) {
                    title = p.textContent?.trim();
                  } else if (isValidTitle(entries[0]?.label)) {
                    title = entries[0]?.label;
                  } else {
                    const docTitle = doc.querySelector('title')?.textContent?.trim();
                    if (isValidTitle(docTitle)) {
                      title = docTitle;
                    } else {
                      title = `Section ${i + 1}`;
                    }
                  }
                }
                
                segments.push({
                  title: title || `Section ${i + 1}`,
                  text: cleanText,
                  href: item.href,
                  isTocStart,
                  depth: entries[0]?.depth ?? 99
                });
                
                totalChars += cleanText.length;
                totalWords += cleanText.split(/\s+/).length;
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to load spine item ${item.href}:`, err);
          continue;
        }
      }

      // Merge segments into actual chapters
      const chapters: { title: string; text: string; index: number }[] = [];
      
      segments.forEach((segment, idx) => {
        const isMetadataTitle = /cover|title|copyright|dedication|acknowledgments|author|preface|contents|toc|about|license|jacket|jacket/i.test(segment.title);
        const isNewFile = idx > 0 && segments[idx-1].href.split('#')[0] !== segment.href.split('#')[0];
        
        // A segment starts a new chapter if:
        // 1. It's the first segment
        // 2. It's a TOC start at a reasonable depth (0, 1, or 2)
        // 3. It's a new file with significant content that isn't metadata
        let isRealNewChapter = false;
        
        if (chapters.length === 0) {
          isRealNewChapter = true;
        } else if (segment.isTocStart) {
          // If it's in the TOC, we generally want it as a chapter boundary unless it's deep metadata
          if (segment.depth <= 2) {
            isRealNewChapter = true;
          } else if (segment.text.length > 800 && !isMetadataTitle) {
            isRealNewChapter = true;
          }
        } else if (isNewFile && segment.text.length > 2000 && !isMetadataTitle) {
          // Substantial new file without a TOC entry - likely a chapter the TOC missed or grouped
          isRealNewChapter = true;
        }

        if (isRealNewChapter) {
          chapters.push({
            title: segment.title,
            text: segment.text,
            index: chapters.length
          });
        } else {
          const last = chapters[chapters.length - 1];
          if (last) {
            last.text += "\n\n" + segment.text;
          } else {
            chapters.push({
              title: segment.title,
              text: segment.text,
              index: 0
            });
          }
        }
      });

      // Cleanup: Final pass to ensure titles are clean and non-chapters are filtered
      let finalChapters = chapters.map((c, i) => {
        let cleanTitle = c.title.replace(/\s+/g, ' ').trim();
        // If title is just a number or too long, format it
        if (!cleanTitle || cleanTitle.length > 100 || /^\d+$/.test(cleanTitle)) {
          cleanTitle = cleanTitle ? `Chapter ${cleanTitle}` : `Chapter ${i + 1}`;
        }
        return {
          ...c,
          title: cleanTitle
        };
      }).filter(c => {
        const wordCount = c.text.split(/\s+/).length;
        const isMetadata = /cover|title|copyright|dedication|acknowledgments|author|preface|contents|toc|about|license|jacket/i.test(c.title);
        // We keep it if it's substantive (> 200 words)
        // OR if it's a medium-sized real content section (> 50 words and not metadata)
        return wordCount > 200 || (wordCount > 50 && !isMetadata);
      });

      // Deduplicate titles if the logic yielded identical names for multiple chapters
      const titleCounts = new Map<string, number>();
      finalChapters.forEach(c => {
        titleCounts.set(c.title, (titleCounts.get(c.title) || 0) + 1);
      });

      const seenSoFar = new Map<string, number>();
      finalChapters = finalChapters.map((c) => {
        const count = titleCounts.get(c.title) || 0;
        if (count > 1) {
          const seen = (seenSoFar.get(c.title) || 0) + 1;
          seenSoFar.set(c.title, seen);
          return { ...c, title: `${c.title} (Part ${seen})` };
        }
        return c;
      });

      if (finalChapters.length === 0) {
        throw new Error('No readable text found in EPUB.');
      }

      updateStep('extract', 'success', `${finalChapters.length} chapters identified`);
      
      setExtractedChapters(finalChapters);
      setSelectedIndices(new Set(finalChapters.map((_, i) => i)));
      setParseContext({
        file,
        metadata,
        hash,
        totalChars,
        totalWords
      });
      setShowReview(true);
      updateStep('review', 'loading');

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while parsing the EPUB.');
      setIsParsing(false);
    }
  }

  async function finalizeWorkspace() {
    if (!parseContext) return;
    
    setError(null);
    updateStep('review', 'success', `${selectedIndices.size} selected`);
    updateStep('chunk', 'loading');

    try {
      const filteredChapters = extractedChapters.filter((_, i) => selectedIndices.has(i));
      
      if (filteredChapters.length === 0) {
        throw new Error('Please select at least one chapter.');
      }

      const chunksData: any[] = [];
      const CHUNK_SIZE = 2500;

      filteredChapters.forEach((chapter, chapterIdx) => {
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
      updateStep('embedding', 'loading');

      // Batch generate embeddings
      const textsToEmbed = chunksData.map(c => `${c.chapterTitle}\n${c.text}`);
      const { embeddings } = await api.embeddings.batch(textsToEmbed);
      
      const chunksWithEmbeddings = chunksData.map((c, i) => ({
        ...c,
        embedding: embeddings[i]
      }));

      updateStep('embedding', 'success', `${embeddings.length} vectors generated`);
      updateStep('save', 'loading');

      const { id: workspaceId } = await api.workspaces.create({
        name: workspaceName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        epubFileName: parseContext.file.name,
        epubTitle: parseContext.metadata.title || 'Unknown Title',
        epubAuthor: parseContext.metadata.creator || 'Unknown Author',
        epubHash: parseContext.hash,
        totalCharacters: parseContext.totalChars,
        totalWords: parseContext.totalWords,
        chapterCount: filteredChapters.length,
        chunkCount: chunksData.length,
        status: 'ready',
        parseWarnings: []
      });

      const finalChunks = chunksWithEmbeddings.map(c => ({ ...c, workspaceId }));
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

  if (showReview) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-serif text-white italic">Knowledge Selection</h1>
            <p className="text-[#71717A] mt-2 font-medium italic">Select the segments to include in the intelligence mapping.</p>
          </div>
          <div className="bg-[#1D1D21] px-5 py-3 rounded-xl border border-white/5">
            <span className="text-[10px] font-mono text-[#52525B] uppercase tracking-[0.2em] block mb-1">Targeting</span>
            <span className="text-xl font-serif text-white italic">{selectedIndices.size} / {extractedChapters.length} Clusters</span>
          </div>
        </div>

        <div className="card-dark p-0 bg-[#111114] overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto p-8 space-y-3">
            {extractedChapters.map((chapter, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                  const s = new Set(selectedIndices);
                  if (s.has(idx)) s.delete(idx);
                  else s.add(idx);
                  setSelectedIndices(s);
                }}
                className={cn(
                  "flex items-center gap-6 p-5 rounded-xl border transition-all cursor-pointer group",
                  selectedIndices.has(idx) 
                    ? "bg-white/[0.03] border-white/10" 
                    : "bg-transparent border-[#27272A] opacity-50 grayscale hover:grayscale-0 hover:opacity-100"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded flex items-center justify-center border transition-colors",
                  selectedIndices.has(idx) ? "bg-white border-white" : "border-[#3F3F46]"
                )}>
                  {selectedIndices.has(idx) && <CheckCircle2 className="w-4 h-4 text-black" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-serif italic text-white text-lg">{chapter.title}</h4>
                  <p className="text-[10px] font-mono text-[#52525B] uppercase tracking-wider mt-1 italic">
                    {chapter.text.split(/\s+/).length} Words • {chapter.text.length} Characters
                  </p>
                </div>
                <span className="text-[10px] font-mono text-[#3F3F46] group-hover:text-[#52525B] transition-colors uppercase tracking-widest font-bold">
                  Cluster {idx + 1}
                </span>
              </div>
            ))}
          </div>

          <div className="p-8 bg-[#18181B] border-t border-white/[0.03] flex items-center justify-between gap-6">
            <div className="flex gap-4">
              <button 
                onClick={() => setSelectedIndices(new Set(extractedChapters.map((_, i) => i)))}
                className="text-[11px] font-bold text-[#A1A1AA] hover:text-white uppercase tracking-widest"
              >
                Select All
              </button>
              <button 
                onClick={() => setSelectedIndices(new Set())}
                className="text-[11px] font-bold text-[#A1A1AA] hover:text-white uppercase tracking-widest"
              >
                Deselect All
              </button>
            </div>
            {error && <p className="text-xs text-red-400 font-medium italic">{error}</p>}
            <button
              onClick={() => {
                setShowReview(false);
                finalizeWorkspace();
              }}
              disabled={selectedIndices.size === 0}
              className="btn-primary-v2 px-10 h-14 bg-white hover:bg-gray-200 disabled:opacity-50"
            >
              Analyze Selection & Construct
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        </div>
      </div>
    );
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

      <Modal
        isOpen={!!duplicateWorkspace}
        onClose={() => {
          const id = duplicateWorkspace?.id;
          setDuplicateWorkspace(null);
          if (id) navigate(`/workspace/${id}`);
        }}
        onConfirm={() => {
          const f = file;
          setDuplicateWorkspace(null);
          if (f) executeParse(f);
        }}
        title="Duplicate Found"
        description={`An EPUB with this content already exists in workspace "${duplicateWorkspace?.name}". Would you like to create a duplicate workspace or navigate to the existing one?`}
        confirmText="Create Duplicate"
        cancelText="View Existing"
      />
    </div>
  );
}
