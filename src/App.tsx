/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  LayoutGrid, 
  Settings as SettingsIcon, 
  FilePlus, 
  History, 
  BookOpen,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from './lib/utils';
import { useUIStore } from './store';

const queryClient = new QueryClient();

// Pages (will create these next)
import Home from './pages/Home';
import CreateWorkspace from './pages/CreateWorkspace';
import WorkspaceDetail from './pages/WorkspaceDetail';
import GenerateSession from './pages/GenerateSession';
import TestSession from './pages/TestSession';
import Results from './pages/Results';
import Review from './pages/Review';
import Settings from './pages/Settings';

function Sidebar() {
  const { isSidebarOpen, setSidebar } = useUIStore();
  const location = useLocation();

  const navItems = [
    { name: 'Workspaces', path: '/', icon: LayoutGrid },
    { name: 'Results', path: '/results', icon: History },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebar(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ 
          width: isSidebarOpen ? '288px' : '0px',
          x: isSidebarOpen ? 0 : -288
        }}
        className={cn(
          "fixed inset-y-0 left-0 bg-[#111114] border-r border-[#27272A] z-50 flex flex-col overflow-hidden lg:relative lg:translate-x-0"
        )}
      >
        <div className="p-8 pb-4">
          <h1 className="text-2xl font-serif italic text-white tracking-tight">Aethelred AI</h1>
          <p className="text-[10px] uppercase tracking-widest text-[#71717A] mt-1 font-semibold">Local-First Exam Intelligence</p>
        </div>

        <nav className="flex-1 px-4 mt-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg transition-all duration-200 group relative",
                  isActive 
                    ? "bg-[#1D1D21] text-white border border-white/5" 
                    : "text-[#71717A] hover:bg-white/5 hover:text-[#D4D4D8]"
                )}
              >
                <div className={cn(
                  "w-1 h-4 rounded-full transition-all",
                  isActive ? "bg-blue-500" : "bg-transparent group-hover:bg-[#3F3F46]"
                )}></div>
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 space-y-4 border-t border-[#27272A]">
          <Link 
            to="/create-workspace"
            className="btn-primary-v2"
          >
            <FilePlus className="w-4 h-4" />
            <span>+ Create Workspace</span>
          </Link>
          <div className="flex items-center justify-between text-[11px] text-[#52525B] px-2 font-mono">
            <span>v0.9.1-BETA</span>
            <div className="w-2 h-2 rounded-full bg-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.3)]"></div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { toggleSidebar } = useUIStore();
  const location = useLocation();
  
  return (
    <div className="flex h-screen bg-[#09090B] text-[#D4D4D8] overflow-hidden font-sans select-none">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 border-b border-[#27272A] bg-[#09090B] flex items-center justify-between px-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleSidebar}
              className="lg:hidden p-2 -ml-2 text-[#71717A] hover:bg-white/5 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-baseline space-x-2">
              <h2 className="text-xl font-serif text-white">
                {location.pathname === '/' ? 'Dashboard' : 
                 location.pathname.includes('/workspace') ? 'Workspace View' : 
                 location.pathname.includes('/test') ? 'Active Test' : 'Aethelred'}
              </h2>
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <div className="text-right">
              <p className="text-[10px] uppercase text-[#71717A] tracking-wider font-semibold">Storage Mode</p>
              <p className="text-xs font-mono text-[#A1A1AA]">SQLite + Vector</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-[#71717A] tracking-wider font-semibold">Privacy</p>
              <p className="text-xs font-mono text-green-500/80">End-to-End Local</p>
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-10">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
        
        <footer className="h-10 bg-[#111114] border-t border-[#27272A] px-10 flex items-center justify-between text-[10px] text-[#52525B] font-mono tracking-wider">
          <div className="flex space-x-6">
            <span className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              <span>AI Engine Active</span>
            </span>
            <span className="hidden sm:inline">Server Database Active</span>
          </div>
          <div className="hidden sm:inline uppercase">Aethelred Intelligence // Protocol v1.0</div>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create-workspace" element={<CreateWorkspace />} />
            <Route path="/workspace/:id" element={<WorkspaceDetail />} />
            <Route path="/generate/:workspaceId" element={<GenerateSession />} />
            <Route path="/test/:sessionId" element={<TestSession />} />
            <Route path="/results/:sessionId" element={<Results />} />
            <Route path="/results" element={<Results />} />
            <Route path="/review/:sessionId" element={<Review />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

