import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Key, Eye, EyeOff, Save, Download, Upload, Trash2, CheckCircle2, AlertCircle, Globe, Cpu, RefreshCw, Loader2 } from 'lucide-react';
import { AIService } from '../services/aiService';
import { Modal } from '../components/Modal';

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get()
  });

  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [embeddingModels, setEmbeddingModels] = useState<{id: string, name: string}[]>([]);
  const [fetchModelsStatus, setFetchModelsStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [fetchModelsError, setFetchModelsError] = useState('');
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    variant?: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    description: ''
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (updates: any) => api.settings.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  });

  const handleUpdateSettings = (updates: any) => {
    updateSettingsMutation.mutate({ ...settings, ...updates });
  };

  const fetchEmbeddingModels = async (provider?: string) => {
    if (!settings) return;
    const targetProvider = provider || settings.embeddingProvider;
    setFetchModelsStatus('loading');
    setFetchModelsError('');
    try {
      const response = await fetch(`/api/models/embeddings?provider=${targetProvider}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch models');
      }
      const data = await response.json();
      setEmbeddingModels(data.models);
      setFetchModelsStatus('success');
    } catch (err: any) {
      console.error("Fetch models error:", err);
      setFetchModelsStatus('error');
      setFetchModelsError(err.message);
      setEmbeddingModels([]);
    }
  };

  useEffect(() => {
    if (settings?.embeddingProvider) {
      fetchEmbeddingModels(settings.embeddingProvider);
    }
  }, [settings?.embeddingProvider]);

  const handleTestKey = async () => {
    if (!settings) return;
    
    if (settings.aiProvider === 'gemini' && !settings.geminiApiKey) {
      setTestStatus('error');
      setTestMessage('Please enter a Gemini API key.');
      return;
    }
    if (settings.aiProvider === 'openai' && !settings.openaiApiKey && !settings.openaiBaseUrl.includes('localhost') && !settings.openaiBaseUrl.includes('127.0.0.1')) {
      // Allow empty key for local llama if baseUrl is set
      // but let's just warn if both are empty
      if (!settings.openaiApiKey) {
        setTestStatus('error');
        setTestMessage('Please enter an API key or ensure no key is needed for local provider.');
      }
    }

    setTestStatus('loading');
    try {
      const ai = new AIService({
        provider: settings.aiProvider,
        geminiApiKey: settings.geminiApiKey,
        openaiApiKey: settings.openaiApiKey,
        openaiBaseUrl: settings.openaiBaseUrl,
        modelName: settings.selectedModel
      });

      const isValid = await ai.testConnection();
      if (isValid) {
        setTestStatus('success');
        setTestMessage(`${settings.aiProvider.toUpperCase()} Connectivity Verified!`);
      } else {
        throw new Error('Connection test failed. Check your credentials and endpoint.');
      }
    } catch (error: any) {
      setTestStatus('error');
      setTestMessage(error.message);
    }
  };

  const handleClearData = () => {
    setModalConfig({
      isOpen: true,
      title: 'Execute Factory Reset',
      description: 'Are you absolutely sure? This will delete all your workspaces and results. This cannot be undone.',
      confirmText: 'Reset Everything',
      variant: 'danger',
      onConfirm: () => {
        setModalConfig(prev => ({
          ...prev,
          title: 'Operation Restricted',
          description: 'Manual purging via individual workspace deletion is required in this terminal version.',
          confirmText: 'Dismiss',
          cancelText: '',
          onConfirm: () => setModalConfig({ ...modalConfig, isOpen: false })
        }));
      }
    });
  };

  const handleExportBackup = async () => {
    if (!settings) return;
    try {
      const workspaces = await api.workspaces.list();
      const backup = {
        workspaces,
        exportedAt: Date.now(),
        version: 1
      };

      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aura-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setModalConfig({
        isOpen: true,
        title: 'Export Failed',
        description: 'An error occurred while generating the archive backup.',
        confirmText: 'Dismiss',
        cancelText: '',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.workspaces || !backup.version) {
        throw new Error('Invalid backup file format.');
      }

      setModalConfig({
        isOpen: true,
        title: 'Import Archive',
        description: 'Importing will merge this data with your current library. This might duplicate existing records. Continue?',
        confirmText: 'Proceed with Import',
        onConfirm: () => {
          setModalConfig({
            isOpen: true,
            title: 'Operation Restricted',
            description: 'Bulk import is not yet supported in this version.',
            confirmText: 'Dismiss',
            cancelText: '',
            onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
          });
        }
      });
    } catch (err: any) {
      setModalConfig({
        isOpen: true,
        title: 'Import Failed',
        description: err.message,
        confirmText: 'Dismiss',
        cancelText: '',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  if (!settings) return null;

  return (
    <div className="max-w-4xl mx-auto py-10">
      <div className="mb-10">
        <h1 className="text-4xl font-serif text-white italic tracking-tight">Configuration</h1>
        <p className="text-[#71717A] mt-2 font-medium italic">Adjust protocol parameters and secure AI credentials.</p>
      </div>

      <div className="space-y-10 max-w-3xl">
        <section className="card-dark p-10 bg-[#111114]">
          <h2 className="text-xl font-serif text-white italic mb-8 flex items-center gap-3">
            <Cpu className="w-6 h-6 text-blue-400" />
            Neural Synthesis Provider
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-10">
            <button
              onClick={() => handleUpdateSettings({ aiProvider: 'gemini', selectedModel: 'gemini-1.5-flash' })}
              className={`p-6 rounded-xl border-2 text-left transition-all ${
                settings.aiProvider === 'gemini' 
                  ? 'border-white bg-white/5' 
                  : 'border-[#27272A] hover:border-[#3F3F46]'
              }`}
            >
              <h3 className="text-white font-bold mb-1">Google Gemini</h3>
              <p className="text-[10px] text-[#71717A] uppercase tracking-widest font-mono">Native Integration</p>
            </button>
            <button
              onClick={() => handleUpdateSettings({ aiProvider: 'openai', selectedModel: 'gpt-4o-mini' })}
              className={`p-6 rounded-xl border-2 text-left transition-all ${
                settings.aiProvider === 'openai' 
                  ? 'border-white bg-white/5' 
                  : 'border-[#27272A] hover:border-[#3F3F46]'
              }`}
            >
              <h3 className="text-white font-bold mb-1">OpenAI / Local</h3>
              <p className="text-[10px] text-[#71717A] uppercase tracking-widest font-mono">Compatible APIs</p>
            </button>
          </div>
          
          <div className="space-y-8">
            {settings.aiProvider === 'gemini' ? (
              <div>
                <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                  Gemini API Protocol Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.geminiApiKey}
                    onChange={(e) => handleUpdateSettings({ geminiApiKey: e.target.value })}
                    placeholder="Enter secure key..."
                    className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-mono tracking-tighter"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#52525B] hover:text-white transition-colors"
                  >
                    {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-3 text-xs text-[#71717A] italic">
                  Provision via <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-white underline hover:text-blue-400 decoration-white/20 transition-colors">Google AI Studio</a>.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                    OpenAI / Local API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={settings.openaiApiKey}
                      onChange={(e) => handleUpdateSettings({ openaiApiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-mono tracking-tighter"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#52525B] hover:text-white transition-colors"
                    >
                      {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                    API Base Endpoint
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={settings.openaiBaseUrl}
                      onChange={(e) => handleUpdateSettings({ openaiBaseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-mono"
                    />
                    <Globe className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3F3F46]" />
                  </div>
                  <p className="mt-3 text-xs text-[#71717A] italic">
                    Use <span className="text-white">http://localhost:8080/v1</span> for local llama.cpp or LM Studio.
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                Active Neural Architecture (Model)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.selectedModel}
                  onChange={(e) => handleUpdateSettings({ selectedModel: e.target.value })}
                  placeholder={settings.aiProvider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'}
                  className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-medium"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 p-1">
                  {settings.aiProvider === 'gemini' ? (
                    <>
                      <button onClick={() => handleUpdateSettings({ selectedModel: 'gemini-1.5-flash' })} className="text-[9px] px-2 py-1 bg-[#27272A] text-[#A1A1AA] rounded hover:text-white">FLASH</button>
                      <button onClick={() => handleUpdateSettings({ selectedModel: 'gemini-1.5-pro' })} className="text-[9px] px-2 py-1 bg-[#27272A] text-[#A1A1AA] rounded hover:text-white">PRO</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleUpdateSettings({ selectedModel: 'gpt-4o-mini' })} className="text-[9px] px-2 py-1 bg-[#27272A] text-[#A1A1AA] rounded hover:text-white">OAI-MINI</button>
                      <button onClick={() => handleUpdateSettings({ selectedModel: 'llama3' })} className="text-[9px] px-2 py-1 bg-[#27272A] text-[#A1A1AA] rounded hover:text-white">LLAMA</button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-6">
              <button
                onClick={handleTestKey}
                disabled={testStatus === 'loading'}
                className="btn-outline-v2 h-12 px-6"
              >
                {testStatus === 'loading' ? 'Verifying...' : 'Verify Connectivity'}
              </button>

              {testStatus === 'success' && (
                <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {testMessage}
                </span>
              )}
              {testStatus === 'error' && (
                <span className="text-rose-400 text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {testMessage}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="card-dark p-10 bg-[#111114]">
          <h2 className="text-xl font-serif text-white italic mb-8 flex items-center gap-3">
            <Cpu className="w-6 h-6 text-indigo-400" />
            Semantic Embedding Engine
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-10">
            <button
              onClick={() => handleUpdateSettings({ embeddingProvider: 'gemini', embeddingModel: 'gemini-embedding-2' })}
              className={`p-6 rounded-xl border-2 text-left transition-all ${
                settings.embeddingProvider === 'gemini' 
                  ? 'border-white bg-white/5' 
                  : 'border-[#27272A] hover:border-[#3F3F46]'
              }`}
            >
              <h3 className="text-white font-bold mb-1">Gemini Embed</h3>
              <p className="text-[10px] text-[#71717A] uppercase tracking-widest font-mono">Retrieval v1.0</p>
            </button>
            <button
              onClick={() => handleUpdateSettings({ embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small' })}
              className={`p-6 rounded-xl border-2 text-left transition-all ${
                settings.embeddingProvider === 'openai' 
                  ? 'border-white bg-white/5' 
                  : 'border-[#27272A] hover:border-[#3F3F46]'
              }`}
            >
              <h3 className="text-white font-bold mb-1">OpenAI Embed</h3>
              <p className="text-[10px] text-[#71717A] uppercase tracking-widest font-mono">Modern Vectors</p>
            </button>
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                Embedding API Key (Optional Override)
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={settings.embeddingApiKey || ''}
                  onChange={(e) => handleUpdateSettings({ embeddingApiKey: e.target.value })}
                  placeholder="Leave empty to use primary AI key"
                  className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all font-mono tracking-tighter"
                />
              </div>
              <p className="mt-3 text-xs text-[#71717A] italic">
                If left empty, system uses the relevant key from Neural Synthesis section above.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em]">
                  Embedding Vector Model
                </label>
                <button 
                  onClick={() => fetchEmbeddingModels()}
                  className="text-[10px] text-indigo-400 font-mono uppercase font-bold flex items-center gap-1 hover:text-indigo-300 transition-colors"
                >
                  {fetchModelsStatus === 'loading' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Refresh Models
                </button>
              </div>
              <div className="relative">
                <select
                  value={settings.embeddingModel}
                  onChange={(e) => handleUpdateSettings({ embeddingModel: e.target.value })}
                  className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white appearance-none transition-all font-medium"
                >
                  {embeddingModels.length > 0 ? (
                    embeddingModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))
                  ) : (
                    <option value={settings.embeddingModel}>{settings.embeddingModel} (Current)</option>
                  )}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#71717A]">
                  <Cpu className="w-4 h-4" />
                </div>
              </div>
              {fetchModelsStatus === 'error' && (
                <p className="mt-3 text-xs text-rose-400 font-mono uppercase tracking-widest">{fetchModelsError}</p>
              )}
              {fetchModelsStatus === 'success' && embeddingModels.length === 0 && (
                <p className="mt-3 text-xs text-[#71717A] italic">No compatible embedding models found with current key.</p>
              )}
            </div>
          </div>
        </section>

        <section className="card-dark p-10 bg-[#111114]">
          <h2 className="text-xl font-serif text-white italic mb-8 flex items-center gap-3">
            <Save className="w-6 h-6 text-blue-400" />
            Operational Parameters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                Proficiency Mark (%)
              </label>
              <input
                type="number"
                value={settings.defaultPassPercent}
                onChange={(e) => handleUpdateSettings({ defaultPassPercent: Number(e.target.value) })}
                className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-[#52525B] uppercase tracking-[0.2em] mb-3">
                Protocol Window (Min)
              </label>
              <input
                type="number"
                value={settings.defaultSessionDurationMinutes}
                onChange={(e) => handleUpdateSettings({ defaultSessionDurationMinutes: Number(e.target.value) })}
                className="w-full px-5 py-4 bg-[#18181B] border border-[#3F3F46] rounded-xl text-white outline-none focus:border-white transition-all"
              />
            </div>
          </div>
        </section>

        <section className="card-dark p-10 bg-[#111114]">
          <h2 className="text-xl font-serif text-white italic mb-6 flex items-center gap-3">
            <Download className="w-6 h-6 text-blue-400" />
            Archive Integrity
          </h2>
          <p className="text-sm text-[#71717A] mb-8 leading-relaxed font-medium italic">
            Intelligence is ephemeral. Storage relies on terminal-local SQLite persistence. Ensure redundant backups to prevent cognitive data loss during environment migrations.
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleExportBackup}
              className="btn-primary-v2 px-6 h-12"
            >
              <Download className="w-4 h-4 mr-2" /> Export Global Archive
            </button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <button className="btn-outline-v2 h-12 px-6">
                <Upload className="w-4 h-4 mr-2" /> Ingest Archive
              </button>
            </div>
          </div>
        </section>

        <section className="card-dark p-10 bg-[#111114] border-rose-400/20">
          <h2 className="text-xl font-serif text-rose-400 italic mb-6 flex items-center gap-3">
            <Trash2 className="w-6 h-6" />
            Terminal Reset
          </h2>
          <p className="text-sm text-[#71717A] mb-8 leading-relaxed font-medium italic">
            Deletes all local records, workspaces, and analytical history. This operation is non-reversible.
          </p>
          <button
            onClick={handleClearData}
            className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-widest px-6 py-4 border border-rose-400/20 rounded-xl hover:bg-rose-400/5 transition-all"
          >
            Execute Factory Data Reset
          </button>
        </section>
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        description={modalConfig.description}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        variant={modalConfig.variant}
      />
    </div>
  );
}
