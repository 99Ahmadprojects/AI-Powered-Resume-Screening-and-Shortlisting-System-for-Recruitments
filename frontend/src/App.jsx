import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Settings, CheckCircle2, XCircle, Clock, FileText, Download, Bot, Sparkles } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    role: 'AI / Machine Learning Engineer',
    skills: 'Python, Machine Learning, Deep Learning, PyTorch, LLM, Agentic AI',
    minScore: 60,
  });
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [taskId, setTaskId] = useState(null);

  // Progress & Streaming State
  const [progress, setProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [waitTimer, setWaitTimer] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Awaiting initialization...');
  const [results, setResults] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  const intervalRef = useRef(null);

  const handleConfigChange = (e) => setConfig({ ...config, [e.target.name]: e.target.value });

  // File Upload Handlers
  const handleFileChange = (e) => {
    if (e.target.files?.length > 0) setFiles(Array.from(e.target.files));
  };
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) setFiles(Array.from(e.dataTransfer.files));
  };

  const startScreening = async () => {
    if (files.length === 0) return alert("Please upload at least one CV!");

    setStep(3);
    setProgress(0);
    setResults([]);
    setElapsedTime(0);

    const formData = new FormData();
    formData.append('role', config.role);
    formData.append('skills', config.skills);
    formData.append('min_score', config.minScore);
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
      setStep(1);
    }
  };

  // Handle SSE
  useEffect(() => {
    if (!taskId) return;

    const eventSource = new EventSource(`${API_BASE_URL}/api/stream/${taskId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          setTotalFiles(data.total);
          setStatusMsg(`Initializing Gemini AI (Auto-Detected Quota: ${data.rpm} RPM)...`);
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
              if (prev <= 1) {
                clearInterval(intervalRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          break;
        case 'complete':
          setElapsedTime(data.elapsed || 0);
          setStatusMsg('Screening Complete!');
          setTimeout(() => setStep(4), 1500);
          eventSource.close();
          break;
        case 'error':
          alert('Backend Error: ' + data.msg);
          eventSource.close();
          setStep(1);
          break;
        default:
          break;
      }
    };

    return () => {
      eventSource.close();
      clearInterval(intervalRef.current);
    };
  }, [taskId]);

  const exportCSV = () => {
    if(results.length === 0) return;
    const header = Object.keys(results[0]).join(",");
    const rows = results.map(row =>
      Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "nexus_ats_report.csv";
    a.click();
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-slate-950 font-sans text-slate-100 flex items-center justify-center p-4 lg:p-8">

      {/* Dynamic Abstract Tech Background Image */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-30 mix-blend-screen"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')` }}
      />
      {/* Gradient Overlay for Readability */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950" />

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-6xl flex flex-col gap-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20 mb-2">
            <Bot className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Nexus <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">AI ATS</span>
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base">
            Upload candidate resumes in bulk and let our Agentic AI rapidly screen, score, and shortlist the top talent based on your precise parameters.
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          layout
          className="bg-slate-900/60 backdrop-blur-2xl border border-white/5 rounded-[2rem] shadow-2xl shadow-blue-900/20 overflow-hidden relative"
        >
          {/* Subtle top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          <div className="p-6 md:p-10">
            <AnimatePresence mode="wait">

              {/* STEP 1: CONFIGURATION & UPLOAD */}
              {step === 1 && (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-10"
                >

                  {/* Left Column: Settings */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                      <Settings className="text-blue-400 w-5 h-5" />
                      <h2 className="text-xl font-semibold">AI Parameters</h2>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Target Role</label>
                        <input type="text" name="role" value={config.role} onChange={handleConfigChange}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Required Skills</label>
                        <textarea name="skills" value={config.skills} onChange={handleConfigChange} rows="3"
                          className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none leading-relaxed"
                        />
                      </div>

                      <div className="space-y-2 pt-2">
                         <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex justify-between">
                           Min Score <span className="text-emerald-400 font-bold">{config.minScore}</span>
                         </label>
                         <input type="range" name="minScore" min="0" max="100" value={config.minScore} onChange={handleConfigChange}
                           className="w-full accent-emerald-500 cursor-pointer"
                         />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Upload */}
                  <div className="lg:col-span-7 flex flex-col">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6">
                      <UploadCloud className="text-emerald-400 w-5 h-5" />
                      <h2 className="text-xl font-semibold">Candidate Resumes</h2>
                    </div>

                    <div className="flex-1 flex flex-col">
                      <label
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                        className={`flex-1 flex flex-col items-center justify-center w-full min-h-[250px] border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 relative overflow-hidden group
                          ${isDragging ? 'border-emerald-500 bg-emerald-500/5' : files.length > 0 ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 bg-slate-950/30 hover:bg-slate-800/50 hover:border-white/20'}`}
                      >
                        <input type="file" multiple accept=".pdf" className="hidden" onChange={handleFileChange} />

                        <div className="flex flex-col items-center justify-center p-6 text-center z-10">
                          <motion.div animate={isDragging ? { y: -10, scale: 1.1 } : { y: 0, scale: 1 }} className="mb-4 text-slate-400 group-hover:text-blue-400 transition-colors">
                            {files.length > 0 ? <FileText className="w-12 h-12 text-blue-400" /> : <UploadCloud className="w-12 h-12" />}
                          </motion.div>

                          {files.length > 0 ? (
                            <>
                              <p className="text-lg font-bold text-white mb-1">{files.length} PDF{files.length > 1 ? 's' : ''} Ready</p>
                              <p className="text-sm text-slate-400">Click or drag to replace files</p>
                            </>
                          ) : (
                            <>
                              <p className="text-lg font-medium text-white mb-1"><span className="text-blue-400 font-bold group-hover:underline">Click to browse</span> or drag and drop</p>
                              <p className="text-sm text-slate-500">Upload multiple PDF files</p>
                            </>
                          )}
                        </div>
                      </label>

                      <button
                        onClick={startScreening}
                        className="w-full mt-6 py-4 px-6 bg-white text-slate-950 hover:bg-blue-50 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] group"
                      >
                        <Sparkles className="w-5 h-5 text-blue-600 group-hover:animate-pulse" />
                        Commence AI Screening
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: PROCESSING & ANIMATIONS */}
              {step === 3 && (
                <motion.div
                  key="processing"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
                  className="py-16 flex flex-col items-center justify-center min-h-[400px]"
                >

                  {/* Status Visualizer */}
                  <div className="relative w-48 h-48 mb-10">
                    <AnimatePresence mode="wait">
                      {waitTimer > 0 ? (
                        /* Quota Limit Timer Animation */
                        <motion.div key="timer" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute inset-0">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Background track */}
                            <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
                            {/* Animated countdown stroke */}
                            <motion.circle
                              cx="50" cy="50" r="45" stroke="#f59e0b" strokeWidth="6" fill="none" strokeLinecap="round"
                              strokeDasharray="283" // 2 * PI * 45
                              initial={{ strokeDashoffset: 0 }}
                              animate={{ strokeDashoffset: 283 - (283 * waitTimer) / 60 }}
                              transition={{ duration: 1, ease: "linear" }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                            <Clock className="w-6 h-6 mb-1" />
                            <span className="text-3xl font-black tabular-nums">{waitTimer}s</span>
                          </div>
                        </motion.div>
                      ) : (
                        /* Normal Processing Animation */
                        <motion.div key="spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center">
                          {/* Outer rotating ring */}
                          <div className="absolute inset-0 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin-slow"></div>
                          {/* Inner pulsing ring */}
                          <div className="absolute inset-4 border-2 border-emerald-500/20 border-b-emerald-500 rounded-full animate-[spin_4s_linear_reverse_infinite]"></div>
                          {/* Core Icon */}
                          <div className="bg-slate-900 border border-white/10 w-24 h-24 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.3)] z-10 animate-pulse-slow">
                            <Bot className="w-10 h-10 text-white" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Status Text & Progress Bar */}
                  <div className="w-full max-w-lg text-center">
                    <h3 className={`text-xl font-bold mb-6 transition-colors duration-500 ${waitTimer > 0 ? 'text-amber-400' : 'text-white'}`}>
                      {statusMsg}
                    </h3>

                    <div className="w-full bg-slate-950 rounded-full h-3 mb-3 p-0.5 border border-white/5 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full relative transition-colors duration-500 ${waitTimer > 0 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-emerald-400'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(progress / Math.max(totalFiles, 1)) * 100}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      >
                         <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}></div>
                      </motion.div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <span>Progress</span>
                      <span>{progress} / {totalFiles} Completed</span>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Time Taken: {elapsedTime.toFixed(2)}s
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 4: RESULTS DASHBOARD */}
              {step === 4 && (
                <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full">

                  {/* Results Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-white/10">
                    <div>
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <CheckCircle2 className="text-emerald-400 w-6 h-6" /> Screening Complete
                      </h2>
                      <p className="text-slate-400 text-sm mt-1">Analyzed {totalFiles} candidates in {elapsedTime.toFixed(2)} seconds.</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setStep(1); setResults([]); setProgress(0); setFiles([]); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors">
                        New Batch
                      </button>
                      <button onClick={exportCSV} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 text-sm font-semibold shadow-lg shadow-blue-500/25 transition-all">
                        <Download size={16} /> Export CSV
                      </button>
                    </div>
                  </div>

                  {/* Results Table Container */}
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/50 shadow-inner">
                    <div className="overflow-x-auto max-h-[500px]">
                      <table className="w-full text-left text-sm text-slate-300 border-collapse">
                        <thead className="text-xs uppercase bg-slate-900 text-slate-400 sticky top-0 z-20 border-b border-white/10 shadow-md">
                          <tr>
                            <th className="px-6 py-4 font-semibold tracking-wider">Candidate</th>
                            <th className="px-6 py-4 font-semibold tracking-wider">ATS Score</th>
                            <th className="px-6 py-4 font-semibold tracking-wider">Decision</th>
                            <th className="px-6 py-4 font-semibold tracking-wider">AI Exp.</th>
                            <th className="px-6 py-4 font-semibold tracking-wider w-1/3">Reasoning</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {results.map((res, idx) => (
                            <motion.tr
                              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                              key={idx} className="hover:bg-white/[0.02] transition-colors group"
                            >
                              <td className="px-6 py-4 font-medium text-white whitespace-nowrap">
                                {res.candidate_name || res.file}
                                <div className="text-[10px] text-slate-500 font-normal truncate max-w-[150px]">{res.file}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div className={`h-full ${res.ats_score >= config.minScore ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${res.ats_score}%` }}></div>
                                  </div>
                                  <span className={`font-bold tabular-nums ${res.ats_score >= config.minScore ? 'text-emerald-400' : 'text-rose-400'}`}>{res.ats_score}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                {res.decision === "SHORTLIST"
                                  ? <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/20 flex items-center gap-1.5 w-fit shadow-[0_0_10px_rgba(16,185,129,0.1)]"><CheckCircle2 size={14}/> Shortlisted</span>
                                  : <span className="bg-rose-500/10 text-rose-400 px-3 py-1 rounded-full text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 w-fit"><XCircle size={14}/> Rejected</span>
                                }
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-slate-400">{res.ai_experience_years} yrs</td>
                              <td className="px-6 py-4 text-xs text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">
                                <div className="line-clamp-2" title={res.decision_reason}>{res.decision_reason}</div>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}