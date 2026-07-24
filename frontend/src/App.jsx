import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, Settings, CheckCircle2, XCircle, Clock, FileText,
  Download, Bot, Sparkles, Eye, FileArchive, Key, ExternalLink,
  ArrowRight, ShieldCheck, Mail, Lock, FolderTree, Check, LayoutDashboard, Home, LogOut, FileDown
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// --- MAIN WRAPPER ---
export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

// --- APP CONTENT & STATE MANAGEMENT ---
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // STATE PERSISTENCE: Check sessionStorage on load so refreshes don't kick users out
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('nexus_auth') === 'true');
  const [config, setConfig] = useState(() => {
    const saved = sessionStorage.getItem('nexus_config');
    return saved ? JSON.parse(saved) : {
      email: '',
      password: '',
      apiKey: '',
      role: 'AI / Machine Learning Engineer',
      jobDescription: 'Seeking an expert in Agentic workflows and LLM deployment. Must have hands-on experience with vector databases, RAG architectures, and scalable AI infrastructure.',
      skills: 'Python, Machine Learning, Deep Learning, PyTorch, LLM, Agentic AI',
      rejectThreshold: 60,
      shortlistThreshold: 80,
    };
  });

  // Save config to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('nexus_config', JSON.stringify(config));
  }, [config]);

  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [downloadId, setDownloadId] = useState(null);

  const [progress, setProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [waitTimer, setWaitTimer] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Awaiting initialization...');
  const [results, setResults] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const intervalRef = useRef(null);

  const handleConfigChange = (e) => {
    let { name, value } = e.target;
    if (name === "rejectThreshold" || name === "shortlistThreshold") value = parseInt(value, 10);

    setConfig(prev => {
      const next = { ...prev, [name]: value };
      if (name === "rejectThreshold" && next.rejectThreshold > next.shortlistThreshold) next.shortlistThreshold = next.rejectThreshold;
      if (name === "shortlistThreshold" && next.shortlistThreshold < next.rejectThreshold) next.rejectThreshold = next.shortlistThreshold;
      return next;
    });
  };

  const handleFileChange = (e) => { if (e.target.files?.length > 0) setFiles(Array.from(e.target.files)); };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) setFiles(Array.from(e.dataTransfer.files));
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email);
  const pwdReqs = {
    length: config.password.length >= 8,
    upper: /[A-Z]/.test(config.password),
    lower: /[a-z]/.test(config.password),
    number: /[0-9]/.test(config.password),
    special: /[@$!%*?&#]/.test(config.password)
  };
  const isPasswordStrong = Object.values(pwdReqs).every(Boolean);
  const canLogin = isEmailValid && isPasswordStrong && config.apiKey.trim() !== '';

  const handleLogin = () => {
    setIsAuthenticated(true);
    sessionStorage.setItem('nexus_auth', 'true');
    navigate('/dashboard');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('nexus_auth');
    sessionStorage.removeItem('nexus_config');
    setFiles([]);
    setResults([]);
    setDownloadId(null);
    setConfig({
      email: '', password: '', apiKey: '', role: 'AI / Machine Learning Engineer',
      jobDescription: '', skills: '', rejectThreshold: 60, shortlistThreshold: 80,
    });
    navigate('/');
  };

  const startScreening = async () => {
    if (files.length === 0) return alert("Please upload at least one document or archive!");

    setIsProcessing(true);
    setProgress(0);
    setResults([]);
    setDownloadId(null);
    setElapsedTime(0);

    const formData = new FormData();
    formData.append('api_key', config.apiKey);
    formData.append('role', config.role);
    formData.append('job_description', config.jobDescription);
    formData.append('skills', config.skills);
    formData.append('reject_threshold', config.rejectThreshold);
    formData.append('shortlist_threshold', config.shortlistThreshold);
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch(`${API_BASE_URL}/api/start-screening`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Unable to start screening.');
      }

      const data = await response.json();
      setTaskId(data.task_id);
    } catch (error) {
      alert(error.message || `Error connecting to backend. Ensure the server at ${API_BASE_URL} is running.`);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!taskId) return;
    const eventSource = new EventSource(`${API_BASE_URL}/api/stream/${taskId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'start':
          setTotalFiles(data.total);
          setStatusMsg(`Initializing Gemini AI (Quota: ${data.rpm} RPM)...`);
          setElapsedTime(0);
          break;
        case 'info':
          setStatusMsg(data.msg);
          break;
        case 'progress':
          setProgress(data.completed);
          setElapsedTime(data.elapsed || 0);
          setResults(prev => [...prev, data.result]);
          setStatusMsg(`Analyzing document: ${data.result.file}`);
          break;
        case 'wait':
          setWaitTimer(data.seconds);
          setStatusMsg('Rate Limit Reached. AI is cooling down...');
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(() => {
            setWaitTimer((prev) => {
              if (prev <= 1) { clearInterval(intervalRef.current); return 0; }
              return prev - 1;
            });
          }, 1000);
          break;
        case 'complete':
          setElapsedTime(data.elapsed || 0);
          setStatusMsg('Screening Complete! Preparing Archives...');
          setDownloadId(data.download_id);
          setTimeout(() => {
            setIsProcessing(false);
            setTaskId(null);
            navigate('/results');
          }, 1500);
          eventSource.close();
          break;
        case 'error':
          alert('Backend Error: ' + data.msg);
          eventSource.close();
          setIsProcessing(false);
          setTaskId(null);
          break;
        default:
          break;
      }
    };

    return () => {
      eventSource.close();
      clearInterval(intervalRef.current);
    };
  }, [taskId, navigate]);

  const exportCSV = () => {
    if(results.length === 0) return;
    const header = Object.keys(results[0]).join(",");
    const rows = results.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + "\n" + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "nexus_ats_report.csv";
    a.click();
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-slate-950 font-sans text-slate-100 flex flex-col">

      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=2070&auto=format&fit=crop')` }}
        />
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[3px]" />
      </div>

      {/* TOP NAVIGATION BAR */}
      <nav className="relative z-20 w-full border-b border-white/10 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg hover:opacity-80 transition-opacity">
            <img src="/favicon.png" alt="Nexus ATS Logo" className="w-7 h-7 object-contain" />
            Nexus ATS
          </Link>
          <div className="flex gap-1 md:gap-4 items-center">
            <Link to="/" className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <span className="flex items-center gap-2"><Home size={16}/> Home</span>
            </Link>
            {isAuthenticated && (
              <>
                <Link to="/dashboard" className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/dashboard' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                  <span className="flex items-center gap-2"><LayoutDashboard size={16}/> Dashboard</span>
                </Link>
                <Link to="/results" className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/results' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                  <span className="flex items-center gap-2"><FileText size={16}/> Results</span>
                </Link>
                <button onClick={handleLogout} className="ml-2 px-4 py-2 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2 border border-rose-500/20">
                  <LogOut size={16}/> Logout
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-7xl mx-auto flex-1 flex flex-col p-4 lg:p-8 justify-center">
        <motion.div layout className="bg-slate-900/70 backdrop-blur-2xl border border-white/5 rounded-[2rem] shadow-2xl shadow-blue-900/20 overflow-hidden relative w-full">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          <div className="p-6 md:p-10 lg:p-12 relative">

            {/* OVERLAY: PROCESSING MODAL */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 rounded-[2rem]"
                >
                  <div className="relative w-56 h-56 mb-12">
                    {waitTimer > 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                          <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
                            <circle cx="50" cy="50" r="45" stroke="#f59e0b" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - (283 * waitTimer) / 60} style={{ transition: 'stroke-dashoffset 1s linear' }} />
                          </svg>
                          <Clock className="w-8 h-8 mb-2" />
                          <span className="text-4xl font-black tabular-nums">{waitTimer}s</span>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="absolute inset-0 border-[3px] border-blue-500/20 border-t-blue-500 rounded-full animate-spin-slow"></div>
                          <div className="absolute inset-5 border-[3px] border-emerald-500/20 border-b-emerald-500 rounded-full animate-[spin_4s_linear_reverse_infinite]"></div>
                          <div className="bg-slate-900 border border-white/10 w-32 h-32 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.4)] z-10 animate-pulse-slow">
                            <Bot className="w-14 h-14 text-white" />
                          </div>
                        </div>
                      )}
                  </div>

                  <div className="w-full max-w-xl text-center">
                    <h3 className={`text-2xl font-bold mb-8 transition-colors ${waitTimer > 0 ? 'text-amber-400' : 'text-white'}`}>{statusMsg}</h3>
                    <div className="w-full bg-slate-950 rounded-full h-4 mb-4 p-1 border border-white/5 shadow-inner">
                      <div className={`h-full rounded-full relative transition-all duration-500 ${waitTimer > 0 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-emerald-400'}`} style={{ width: `${(progress / Math.max(totalFiles, 1)) * 100}%` }}>
                         <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}></div>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-slate-400 uppercase tracking-widest px-1">
                      <span>Progress</span><span className="text-white">{progress} / {totalFiles}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ROUTES */}
            <Routes>

              {/* ROUTE 1: LANDING & LOGIN */}
              <Route path="/" element={
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-10">
                  <div className="text-center space-y-4">
                      <div className="inline-flex items-center justify-center p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20 mb-2">
                        <img
                          src="/favicon.png"
                          alt="Nexus ATS Logo"
                          className="w-15 h-15 object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                        />
                      </div>
                      <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight">
                        Nexus <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">AI ATS Engine</span>
                      </h1>
                      <p className="text-slate-300 max-w-2xl mx-auto text-lg">Automated Bulk Resume Screening & Categorization Pipeline</p>
                </div>

                  <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 mt-4 items-stretch">
                    <div className="lg:col-span-7 flex flex-col justify-between">
                      <div className="space-y-6">
                        <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">Transform Your Hiring Workflow.</h3>
                        <p className="text-slate-400 leading-relaxed text-lg">Upload candidate resumes in bulk (PDF, DOCX, or ZIP). Our custom LLM agent reads, evaluates, and scores candidates against your specific job description, completely eliminating manual screening time.</p>

                        <div className="grid sm:grid-cols-2 gap-6 mt-6">
                          <div className="flex items-start gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20"><FolderTree className="text-emerald-400 w-6 h-6"/></div>
                            <div>
                              <h4 className="font-semibold text-slate-200">Physical Auto-Sort</h4>
                              <p className="text-sm text-slate-500 mt-1 leading-relaxed">Files are automatically packaged into a downloadable ZIP archive containing Shortlisted, Review, and Rejected directories.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                            <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20"><ShieldCheck className="text-blue-400 w-6 h-6"/></div>
                            <div>
                              <h4 className="font-semibold text-slate-200">100% Free & Secure</h4>
                              <p className="text-sm text-slate-500 mt-1 leading-relaxed">Operates locally using your own API key. Data is securely processed and never stored externally.</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-10 pt-8 border-t border-white/10">
                        <h4 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Key className="text-amber-400 w-6 h-6" /> How to get your free Gemini API Key</h4>
                        <div className="space-y-5">
                          <div className="flex gap-4 items-start"><div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold border border-blue-500/30 text-sm">1</div><div className="pt-1"><p className="text-slate-300 text-sm leading-relaxed">Navigate to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-blue-500/30 transition-colors">Google AI Studio <ExternalLink size={14} className="inline mb-1"/></a> and sign in.</p></div></div>
                          <div className="flex gap-4 items-start"><div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold border border-blue-500/30 text-sm">2</div><div className="pt-1"><p className="text-slate-300 text-sm leading-relaxed">Click the prominent <strong className="text-white bg-white/10 px-2 py-0.5 rounded ml-1 text-sm font-medium">Create API key</strong> button.</p></div></div>
                          <div className="flex gap-4 items-start"><div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold border border-blue-500/30 text-sm">3</div><div className="pt-1"><p className="text-slate-300 text-sm leading-relaxed">Select <strong className="text-white">"Create API key in new project"</strong>.</p></div></div>
                          <div className="flex gap-4 items-start"><div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30 text-sm shadow-[0_0_10px_rgba(245,158,11,0.2)]">4</div><div className="pt-1"><p className="text-slate-300 text-sm leading-relaxed">Copy the key (<code className="bg-slate-900 border border-white/10 px-1.5 py-0.5 rounded text-amber-400 font-mono text-xs">AIzaSy</code>) and paste it into the authentication panel.</p></div></div>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-5">
                      <div className="bg-slate-950/70 p-8 lg:p-10 rounded-[2rem] border border-white/10 shadow-2xl relative h-full flex flex-col justify-center">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 blur-[60px] rounded-full pointer-events-none"></div>
                        <div className="mb-8 relative z-10"><h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3"><Lock className="w-6 h-6 text-blue-400" /> Authentication</h3><p className="text-slate-400">Secure your session to access the dashboard.</p></div>
                        <div className="space-y-5 relative z-10">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-slate-500" /></div>
                              <input type="email" name="email" placeholder="name@company.com" value={config.email} onChange={handleConfigChange} className="w-full bg-slate-900/80 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Strong Password</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-slate-500" /></div>
                              <input type="password" name="password" placeholder="Enter your password" value={config.password} onChange={handleConfigChange} className="w-full bg-slate-900/80 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-3 px-1 text-xs">
                              <div className={`flex items-center gap-1.5 ${pwdReqs.length ? 'text-emerald-400' : 'text-slate-500'}`}><Check size={12} className={pwdReqs.length ? 'opacity-100' : 'opacity-30'}/> 8+ characters</div>
                              <div className={`flex items-center gap-1.5 ${pwdReqs.upper ? 'text-emerald-400' : 'text-slate-500'}`}><Check size={12} className={pwdReqs.upper ? 'opacity-100' : 'opacity-30'}/> Uppercase letter</div>
                              <div className={`flex items-center gap-1.5 ${pwdReqs.lower ? 'text-emerald-400' : 'text-slate-500'}`}><Check size={12} className={pwdReqs.lower ? 'opacity-100' : 'opacity-30'}/> Lowercase letter</div>
                              <div className={`flex items-center gap-1.5 ${pwdReqs.number ? 'text-emerald-400' : 'text-slate-500'}`}><Check size={12} className={pwdReqs.number ? 'opacity-100' : 'opacity-30'}/> Number</div>
                              <div className={`flex items-center gap-1.5 ${pwdReqs.special ? 'text-emerald-400' : 'text-slate-500'} col-span-2`}><Check size={12} className={pwdReqs.special ? 'opacity-100' : 'opacity-30'}/> Special character (@$!%*?&#)</div>
                            </div>
                          </div>
                          <div className="space-y-1.5 pt-4">
                            <label className="text-xs font-semibold text-amber-400 uppercase tracking-widest pl-1 flex items-center gap-1.5">Gemini API Key <Sparkles size={12}/></label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Key className="h-5 w-5 text-amber-500/70" /></div>
                              <input type="password" name="apiKey" placeholder="AIzaSy..." value={config.apiKey} onChange={handleConfigChange} className="w-full bg-slate-900/80 border border-amber-500/30 rounded-2xl pl-12 pr-4 py-3.5 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono placeholder:text-slate-600" />
                            </div>
                          </div>
                          <button onClick={handleLogin} disabled={!canLogin} className="w-full py-4 px-6 mt-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-[0_0_20px_rgba(37,99,235,0.25)]">
                            Authenticate & Launch <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              } />

              {/* ROUTE 2: DASHBOARD (UPLOAD) */}
              <Route path="/dashboard" element={
                isAuthenticated ? (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
                    <div className="lg:col-span-6 space-y-6">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-4"><Settings className="text-blue-400 w-6 h-6" /><h2 className="text-2xl font-bold tracking-tight">AI Evaluation Parameters</h2></div>
                      <div className="space-y-5">
                        <div className="space-y-2"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Target Role</label><input type="text" name="role" value={config.role} onChange={handleConfigChange} className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" /></div>
                        <div className="space-y-2"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Job Description</label><textarea name="jobDescription" value={config.jobDescription} onChange={handleConfigChange} rows="4" className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none leading-relaxed" /></div>
                        <div className="space-y-2"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Required Skills</label><textarea name="skills" value={config.skills} onChange={handleConfigChange} rows="2" className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none leading-relaxed" /></div>
                        <div className="grid grid-cols-2 gap-8 pt-4">
                           <div className="space-y-3"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex justify-between pl-1">Reject Below <span className="text-rose-400 font-bold text-sm bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">{config.rejectThreshold}</span></label><input type="range" name="rejectThreshold" min="0" max="100" value={config.rejectThreshold} onChange={handleConfigChange} className="w-full accent-rose-500 cursor-pointer" /></div>
                           <div className="space-y-3"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex justify-between pl-1">Shortlist Above <span className="text-emerald-400 font-bold text-sm bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{config.shortlistThreshold}</span></label><input type="range" name="shortlistThreshold" min="0" max="100" value={config.shortlistThreshold} onChange={handleConfigChange} className="w-full accent-emerald-500 cursor-pointer" /></div>
                        </div>
                      </div>
                    </div>
                    <div className="lg:col-span-6 flex flex-col">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6"><UploadCloud className="text-emerald-400 w-6 h-6" /><h2 className="text-2xl font-bold tracking-tight">Candidate Resumes</h2></div>
                      <div className="flex-1 flex flex-col h-full">
                        <label onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`flex-1 flex flex-col items-center justify-center w-full min-h-[300px] border-2 border-dashed rounded-[2rem] cursor-pointer transition-all duration-300 relative overflow-hidden group ${isDragging ? 'border-emerald-500 bg-emerald-500/5' : files.length > 0 ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 bg-slate-950/30 hover:bg-slate-800/50 hover:border-white/20'}`}>
                          <input type="file" multiple accept=".pdf,.docx,.doc,.zip" className="hidden" onChange={handleFileChange} />
                          <div className="flex flex-col items-center justify-center p-6 text-center z-10">
                            <motion.div animate={isDragging ? { y: -10, scale: 1.1 } : { y: 0, scale: 1 }} className="mb-5 text-slate-400 group-hover:text-blue-400 transition-colors">
                              {files.length > 0 ? <FileArchive className="w-16 h-16 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" /> : <UploadCloud className="w-16 h-16" />}
                            </motion.div>
                            {files.length > 0 ? (
                              <><p className="text-2xl font-bold text-white mb-2">{files.length} File{files.length > 1 ? 's' : ''} Ready</p><p className="text-sm text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">Click or drag to replace files</p></>
                            ) : (
                              <><p className="text-xl font-medium text-white mb-2"><span className="text-blue-400 font-bold group-hover:underline">Click to browse</span> or drag and drop</p><p className="text-sm text-slate-500 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 mt-2">Accepts PDF, DOCX, or ZIP batches</p></>
                            )}
                          </div>
                        </label>
                        <button onClick={startScreening} className="w-full mt-6 py-4 px-6 bg-white text-slate-950 hover:bg-blue-50 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] group">
                          <Sparkles className="w-6 h-6 text-blue-600 group-hover:animate-pulse" /> Commence AI Screening
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : <Navigate to="/" replace />
              } />

              {/* ROUTE 3: RESULTS */}
              <Route path="/results" element={
                isAuthenticated ? (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-white/10">
                      <div>
                        <h2 className="text-3xl font-bold text-white flex items-center gap-3"><CheckCircle2 className="text-emerald-400 w-8 h-8" /> Screening Complete</h2>
                        <p className="text-slate-400 text-base mt-2">Successfully analyzed <strong className="text-white">{totalFiles}</strong> candidates in <strong className="text-white">{elapsedTime.toFixed(2)}</strong> seconds.</p>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors border border-white/5">
                          New Batch
                        </button>
                        <button onClick={exportCSV} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center gap-2 text-sm font-bold transition-all border border-white/5">
                          <Download size={16} /> Export CSV
                        </button>
                        {downloadId && (
                          <a href={`${API_BASE_URL}/api/download/${downloadId}`} download className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl flex items-center gap-2 text-sm font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all">
                            <FileDown size={18} /> Download Categorized CVs (ZIP)
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 shadow-inner">
                      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left text-sm text-slate-300 border-collapse">
                          <thead className="text-xs uppercase bg-slate-900 text-slate-400 sticky top-0 z-20 shadow-md">
                            <tr>
                              <th className="px-6 py-5 font-bold tracking-wider border-b border-white/10">Candidate</th>
                              <th className="px-6 py-5 font-bold tracking-wider border-b border-white/10">ATS Score</th>
                              <th className="px-6 py-5 font-bold tracking-wider border-b border-white/10">Decision</th>
                              <th className="px-6 py-5 font-bold tracking-wider border-b border-white/10">AI Exp.</th>
                              <th className="px-6 py-5 font-bold tracking-wider border-b border-white/10 w-1/3">Reasoning</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {results.length === 0 && <tr><td colSpan="5" className="text-center py-10 text-slate-500">No results found. Run a screening batch first.</td></tr>}
                            {results.map((res, idx) => {
                               let barColor = 'bg-rose-500'; let textColor = 'text-rose-400';
                               if (res.ats_score > config.shortlistThreshold) { barColor = 'bg-emerald-500'; textColor = 'text-emerald-400'; }
                               else if (res.ats_score >= config.rejectThreshold) { barColor = 'bg-amber-500'; textColor = 'text-amber-400'; }
                               return (
                                <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} key={idx} className="hover:bg-white/[0.03] transition-colors group">
                                  <td className="px-6 py-5 font-medium text-white whitespace-nowrap">{res.candidate_name || res.file}<div className="text-[11px] text-slate-500 font-normal truncate max-w-[180px] mt-0.5">{res.file}</div></td>
                                  <td className="px-6 py-5"><div className="flex items-center gap-3"><div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden border border-white/5"><div className={`h-full ${barColor}`} style={{ width: `${res.ats_score}%` }}></div></div><span className={`font-bold tabular-nums text-base ${textColor}`}>{res.ats_score}</span></div></td>
                                  <td className="px-6 py-5">
                                    {res.decision === "SHORTLIST" && <span className="bg-emerald-500/10 text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 w-fit shadow-[0_0_10px_rgba(16,185,129,0.15)]"><CheckCircle2 size={16}/> Shortlisted</span>}
                                    {res.decision === "REVIEW" && <span className="bg-amber-500/10 text-amber-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-amber-500/20 flex items-center gap-1.5 w-fit shadow-[0_0_10px_rgba(245,158,11,0.15)]"><Eye size={16}/> Manual Review</span>}
                                    {res.decision === "REJECT" && <span className="bg-rose-500/10 text-rose-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 w-fit"><XCircle size={16}/> Rejected</span>}
                                  </td>
                                  <td className="px-6 py-5 whitespace-nowrap text-slate-300 font-medium">{res.ai_experience_years} yrs</td>
                                  <td className="px-6 py-5 text-sm text-slate-400 leading-relaxed group-hover:text-slate-200 transition-colors"><div className="line-clamp-3" title={res.decision_reason}>{res.decision_reason}</div></td>
                                </motion.tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                ) : <Navigate to="/" replace />
              } />

            </Routes>
          </div>
        </motion.div>
      </main>

      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      `}</style>
    </div>
  );
}