"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../utils/supabase";
import { useLiveSync } from "../utils/useLiveSync";
import {
  enablePushNotifications,
  isPushEnabledLocally,
  registerServiceWorker,
  sendTomorrowNotification,
} from "../utils/pushClient";
import {
  canInstallPwa,
  hasAndroidInstallPrompt,
  isIos,
  isStandaloneApp,
  promptAndroidInstall,
  setupInstallPrompt,
} from "../utils/installApp";
import DocumentScanner from "../components/DocumentScanner";

export default function AlNoorApp() {
  const [showSplash, setShowSplash] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  
  // Tabs Navigation State
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'clients', 'vault'

  // Data States
  const [clients, setClients] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [hearings, setHearings] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [clientsFocus, setClientsFocus] = useState<"client" | "case" | null>(null);
  
  // Modals & Form States
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
  const [selectedVaultCaseId, setSelectedVaultCaseId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [scannerCaseId, setScannerCaseId] = useState("");

  // Form Inputs
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [hearingDate, setHearingDate] = useState("");
  const [courtName, setCourtName] = useState("");
  const [judgeName, setJudgeName] = useState("");
  
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskCaseId, setTaskCaseId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState("");
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [androidInstallReady, setAndroidInstallReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const vaultCaseRef = useRef<string | null>(null);
  vaultCaseRef.current = selectedVaultCaseId;

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), 2500);
    const removeTimer = setTimeout(() => setShowSplash(false), 4000);
    fetchDashboardData();
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, []);

  useEffect(() => {
    if (showSplash) return;
    setPushEnabled(isPushEnabledLocally());
    registerServiceWorker();
    if (canInstallPwa()) setShowInstallBanner(true);
    return setupInstallPrompt(() => setAndroidInstallReady(true));
  }, [showSplash]);

  const handleInstallToHomeScreen = async () => {
    if (androidInstallReady || hasAndroidInstallPrompt()) {
      const ok = await promptAndroidInstall();
      if (ok) setShowInstallBanner(false);
    }
  };

  const dismissInstallBanner = () => setShowInstallBanner(false);

  useEffect(() => {
    if (activeTab !== "clients" || !clientsFocus) return;
    const id = clientsFocus === "client" ? "add-client-section" : "add-case-section";
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, clientsFocus]);

  async function fetchDashboardData() {
    // Fetch Clients
    const { data: clientsData } = await supabase.from('clients').select('*');
    if (clientsData) setClients(clientsData);

    // Fetch Cases
    const { data: casesData } = await supabase.from('cases').select('*, clients(full_name)').eq('status', 'Active');
    if (casesData) setCases(casesData);

    // Fetch Hearings
    const { data: hearingsData } = await supabase.from('hearings').select('*, cases(case_title)').order('hearing_date', { ascending: true });
    if (hearingsData) setHearings(hearingsData);

    const { data: tasksData } = await supabase.from('tasks').select('*, cases(case_title)').order('due_date', { ascending: true, nullsFirst: false });
    if (tasksData) setTasks(tasksData);
  }

  const syncAllData = useCallback(async () => {
    await fetchDashboardData();
    if (vaultCaseRef.current) await fetchDocumentsForCase(vaultCaseRef.current);
  }, []);

  const { isLive } = useLiveSync(() => { syncAllData(); }, !showSplash);

  const searchGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const groups: { client: { id: string; full_name: string; phone_number?: string } | null; cases: typeof cases }[] = [];
    const shownCaseIds = new Set<string>();

    for (const client of clients) {
      const nameMatch = client.full_name?.toLowerCase().includes(q);
      const phoneMatch = client.phone_number?.toLowerCase().includes(q);
      if (nameMatch || phoneMatch) {
        const clientCases = cases.filter((c) => c.client_id === client.id);
        clientCases.forEach((c) => shownCaseIds.add(c.id));
        groups.push({ client, cases: clientCases });
      }
    }

    const caseTitleMatches = cases.filter(
      (c) => c.case_title?.toLowerCase().includes(q) && !shownCaseIds.has(c.id)
    );
    if (caseTitleMatches.length > 0) {
      groups.push({ client: null, cases: caseTitleMatches });
    }

    return groups;
  }, [searchQuery, clients, cases]);

  const goToAddClient = () => {
    setActiveTab("clients");
    setClientsFocus("client");
  };

  const goToAddCase = () => {
    setActiveTab("clients");
    setClientsFocus("case");
  };

  const canGoBack =
    isDocViewerOpen ||
    isScannerOpen ||
    isScheduleModalOpen ||
    isTaskModalOpen ||
    !!clientsFocus ||
    activeTab !== "dashboard";

  const handleBack = () => {
    if (isDocViewerOpen) {
      closeDocViewer();
      return;
    }
    if (isScannerOpen) {
      setIsScannerOpen(false);
      return;
    }
    if (isScheduleModalOpen) {
      setIsScheduleModalOpen(false);
      return;
    }
    if (isTaskModalOpen) {
      setIsTaskModalOpen(false);
      return;
    }
    if (clientsFocus) {
      setClientsFocus(null);
      return;
    }
    if (activeTab !== "dashboard") {
      setActiveTab("dashboard");
      setClientsFocus(null);
    }
  };

  const navigateTab = (tab: "dashboard" | "clients" | "vault") => {
    setActiveTab(tab);
    if (tab !== "clients") setClientsFocus(null);
  };

  const handleEnableNotifications = async () => {
    if (isIos() && !isStandaloneApp()) {
      setPushStatus("Pehle Share → Add to Home Screen karein, phir app icon se kholein.");
      setShowInstallBanner(true);
      return;
    }
    setPushStatus("Enabling...");
    const result = await enablePushNotifications();
    if (result.ok) {
      setPushEnabled(true);
      setPushStatus("Notifications enabled on this device.");
    } else {
      setPushStatus(result.error || "Failed to enable.");
    }
  };

  const handleSendNotification = async () => {
    setPushStatus("Sending...");
    const result = await sendTomorrowNotification(true);
    if (result.ok) {
      setPushStatus(result.message || "Sent!");
      if (result.preview) console.info("Notification preview:\n", result.preview);
    } else {
      setPushStatus(result.error || "Send failed.");
    }
  };

  // --- FORM HANDLERS ---
  const handleScheduleHearing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.from('hearings').insert([{ case_id: selectedCaseId, hearing_date: new Date(hearingDate).toISOString(), court_name: courtName, judge_name: judgeName }]);
    if (!error) {
      setHearingDate(""); setCourtName(""); setJudgeName(""); setIsScheduleModalOpen(false);
      fetchDashboardData();
    }
    setIsSubmitting(false);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.from('clients').insert([{ full_name: clientName, phone_number: clientPhone }]);
    if (!error) {
      setClientName(""); setClientPhone("");
      fetchDashboardData();
      setClientsFocus(null);
      alert("Client Added Successfully!");
    }
    setIsSubmitting(false);
  };

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await supabase.from('cases').insert([{ client_id: selectedClientId, case_title: caseTitle }]);
    if (!error) {
      setCaseTitle(""); setSelectedClientId("");
      fetchDashboardData();
      setClientsFocus(null);
      alert("Case Added Successfully!");
    }
    setIsSubmitting(false);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload: { title: string; description: string | null; case_id?: string; due_date?: string } = {
      title: taskTitle,
      description: taskDescription.trim() || null,
    };
    if (taskCaseId) payload.case_id = taskCaseId;
    if (taskDueDate) payload.due_date = new Date(taskDueDate).toISOString();
    const { error } = await supabase.from('tasks').insert([payload]);
    if (error) {
      alert("Could not add task. Run supabase/setup-tasks.sql in your Supabase SQL Editor first.");
    } else {
      setTaskTitle(""); setTaskDescription(""); setTaskCaseId(""); setTaskDueDate("");
      setIsTaskModalOpen(false);
      fetchDashboardData();
    }
    setIsSubmitting(false);
  };

  const handleToggleTask = async (taskId: string, current: boolean) => {
    const { error } = await supabase.from('tasks').update({ is_completed: !current }).eq('id', taskId);
    if (!error) fetchDashboardData();
  };

  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!confirm(`Delete task "${title}"?`)) return;
    setIsSubmitting(true);
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) alert("Could not delete task: " + error.message);
    else fetchDashboardData();
    setIsSubmitting(false);
  };

  async function deleteDocumentsForCases(caseIds: string[]) {
    if (caseIds.length === 0) return;
    const { error } = await supabase.from('documents').delete().in('case_id', caseIds);
    if (error?.code === "PGRST205" || error?.message?.includes("documents")) return;
  }

  async function fetchDocumentsForCase(caseId: string) {
    const { data, error } = await supabase.from('documents').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
    if (error) {
      setDocuments([]);
      return;
    }
    setDocuments(data ?? []);
  }

  const openVaultCase = async (caseId: string) => {
    setSelectedVaultCaseId(caseId);
    setIsDocViewerOpen(true);
    await fetchDocumentsForCase(caseId);
  };

  const closeDocViewer = () => {
    setIsDocViewerOpen(false);
    setSelectedVaultCaseId(null);
    setDocuments([]);
  };

  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (!confirm(`Delete client "${clientName}"? All their cases, hearings, and documents will also be removed.`)) return;
    setIsSubmitting(true);
    const { data: clientCases } = await supabase.from('cases').select('id').eq('client_id', clientId);
    const caseIds = (clientCases ?? []).map((c) => c.id);
    if (caseIds.length > 0) {
      await supabase.from('hearings').delete().in('case_id', caseIds);
      await supabase.from('tasks').delete().in('case_id', caseIds);
      await deleteDocumentsForCases(caseIds);
      await supabase.from('cases').delete().in('id', caseIds);
    }
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    if (error) alert("Could not delete client: " + error.message);
    else {
      if (selectedClientId === clientId) setSelectedClientId("");
      fetchDashboardData();
      alert("Client deleted.");
    }
    setIsSubmitting(false);
  };

  const handleDeleteCase = async (caseId: string, title: string) => {
    if (!confirm(`Delete case "${title}"? Related hearings and documents will also be removed.`)) return;
    setIsSubmitting(true);
    await supabase.from('hearings').delete().eq('case_id', caseId);
    await supabase.from('tasks').delete().eq('case_id', caseId);
    await deleteDocumentsForCases([caseId]);
    const { error } = await supabase.from('cases').delete().eq('id', caseId);
    if (error) alert("Could not delete case: " + error.message);
    else {
      if (selectedCaseId === caseId) setSelectedCaseId("");
      if (selectedVaultCaseId === caseId) closeDocViewer();
      fetchDashboardData();
      alert("Case deleted.");
    }
    setIsSubmitting(false);
  };

  const handleDeleteDocument = async (docId: string, fileName: string) => {
    if (!confirm(`Delete document "${fileName}"?`)) return;
    setIsSubmitting(true);
    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) {
      alert("Could not delete document. If the documents table is missing, run supabase/setup-documents.sql in your Supabase SQL Editor.");
    } else if (selectedVaultCaseId) {
      await fetchDocumentsForCase(selectedVaultCaseId);
    }
    setIsSubmitting(false);
  };


  // ====== SPLASH SCREEN ======
  if (showSplash) {
    return (
      <div className={`bg-[#0a192f] min-h-screen flex items-center justify-center transition-opacity duration-1000 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}>
        <h1 className="font-serif text-[32px] md:text-[52px] font-bold text-[#e9c176] tracking-[0.15em] text-center px-4">AL NOOR LAW ASSOCIATES</h1>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F8F9FA] font-sans overflow-hidden">
      
      {/* ====== SIDEBAR (WORKING TABS) ====== */}
      <aside className="w-64 bg-[#0A192F] text-white flex flex-col shadow-2xl z-10 hidden md:flex">
        <div className="p-6 border-b border-[#e9c176]/20 flex flex-col items-center">
          <img src="/icon-192.png" alt="Al Noor" className="w-14 h-14 rounded-2xl mb-3" />
          <h2 className="text-xl text-[#e9c176] font-serif tracking-wider text-center">AL NOOR</h2>
          <p className="text-xs text-center text-gray-400 mt-1">LAW ASSOCIATES</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab("dashboard")} className={`w-full text-left px-4 py-3 rounded-lg transition ${activeTab === "dashboard" ? "bg-[#e9c176] text-[#0A192F] font-semibold" : "text-gray-300 hover:text-[#e9c176]"}`}>
            Dashboard
          </button>
          <button onClick={() => { setActiveTab("clients"); setClientsFocus(null); }} className={`w-full text-left px-4 py-3 rounded-lg transition ${activeTab === "clients" ? "bg-[#e9c176] text-[#0A192F] font-semibold" : "text-gray-300 hover:text-[#e9c176]"}`}>
            Clients & Cases
          </button>
          <button onClick={() => setActiveTab("vault")} className={`w-full text-left px-4 py-3 rounded-lg transition ${activeTab === "vault" ? "bg-[#e9c176] text-[#0A192F] font-semibold" : "text-gray-300 hover:text-[#e9c176]"}`}>
            Document Vault
          </button>
        </nav>

        <div className="p-4 border-t border-[#e9c176]/20 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            <span className="text-gray-400">{isLive ? "Live sync active" : "Connecting..."}</span>
          </div>
          {showInstallBanner && !isStandaloneApp() && (
            <button
              type="button"
              onClick={() => {
                if (androidInstallReady || hasAndroidInstallPrompt()) handleInstallToHomeScreen();
                else setShowInstallBanner(true);
              }}
              className="w-full text-left px-3 py-2 rounded-lg bg-[#e9c176] text-[#0A192F] text-sm font-semibold hover:bg-[#d4ad65]"
            >
              📲 Add to Home Screen
            </button>
          )}
          {!pushEnabled ? (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="w-full text-left px-3 py-2 rounded-lg bg-[#112a4f] text-[#e9c176] text-sm font-semibold hover:bg-[#1a3a5c]"
            >
              🔔 Enable Notifications
            </button>
          ) : (
            <p className="text-xs text-green-400 px-1">✓ This device receives alerts</p>
          )}
          <button
            type="button"
            onClick={handleSendNotification}
            disabled={!pushEnabled}
            className="w-full text-left px-3 py-2 rounded-lg border border-[#e9c176]/50 text-[#e9c176] text-sm font-semibold hover:bg-[#112a4f] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            📤 Send Tomorrow Reminder
          </button>
          {pushStatus && <p className="text-xs text-gray-400 leading-snug">{pushStatus}</p>}
        </div>
      </aside>

      {/* ====== MAIN CONTENT ====== */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto pb-20 md:pb-0">

        {showInstallBanner && !isStandaloneApp() && (
          <div className="bg-[#0A192F] text-white px-4 py-3 flex flex-wrap items-start gap-3 justify-between border-b border-[#e9c176]/30">
            <div className="flex gap-3 min-w-0 flex-1">
              <img src="/icon-192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
              <div className="text-sm min-w-0">
                <p className="font-semibold text-[#e9c176]">Home Screen par install karein</p>
                {isIos() ? (
                  <p className="text-gray-300 mt-1">Safari → Share <span className="text-[#e9c176]">→ Add to Home Screen</span> → Open app → Enable Notifications</p>
                ) : androidInstallReady ? (
                  <p className="text-gray-300 mt-1">Icon + notifications ke liye app install karein.</p>
                ) : (
                  <p className="text-gray-300 mt-1">Chrome menu → <span className="text-[#e9c176]">Install app</span> ya <span className="text-[#e9c176]">Add to Home screen</span>. Laptop: address bar install icon.</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {(androidInstallReady || hasAndroidInstallPrompt()) && (
                <button type="button" onClick={handleInstallToHomeScreen} className="bg-[#e9c176] text-[#0A192F] px-3 py-1.5 rounded text-sm font-semibold">
                  Install
                </button>
              )}
              <button type="button" onClick={dismissInstallBanner} className="text-gray-400 hover:text-white text-sm px-2">
                ✕
              </button>
            </div>
          </div>
        )}
        
        {/* Header */}
        <header className="bg-white p-4 md:p-6 shadow-sm flex flex-wrap justify-between items-center gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            {canGoBack && (
              <button
                type="button"
                onClick={handleBack}
                className="shrink-0 flex items-center gap-1 text-[#0A192F] font-semibold text-sm md:text-base px-2 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200"
                aria-label="Go back"
              >
                <span className="text-xl leading-none">←</span>
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            <h1 className="text-xl md:text-2xl font-serif text-[#0A192F] capitalize truncate">
              {clientsFocus === "client" ? "Add Client" : clientsFocus === "case" ? "Add Case" : activeTab.replace("-", " ")}
            </h1>
            <span className={`md:hidden flex items-center gap-1 text-xs ${isLive ? "text-green-600" : "text-gray-400"}`}>
              <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              Live
            </span>
          </div>
          <div className="flex flex-wrap gap-2 md:hidden">
            {!pushEnabled && (
              <button type="button" onClick={handleEnableNotifications} className="text-xs bg-[#0A192F] text-[#e9c176] px-3 py-1.5 rounded font-semibold">
                Enable Alerts
              </button>
            )}
            <button type="button" onClick={handleSendNotification} disabled={!pushEnabled} className="text-xs border border-[#0A192F] text-[#0A192F] px-3 py-1.5 rounded font-semibold disabled:opacity-40">
              Notify
            </button>
          </div>
          {activeTab === "dashboard" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setIsScheduleModalOpen(true)} className="bg-[#0A192F] text-[#e9c176] px-5 py-2 rounded-md font-semibold hover:bg-[#112a4f] transition shadow-md">
                + Schedule Hearing
              </button>
              <button onClick={() => setIsTaskModalOpen(true)} className="bg-[#e9c176] text-[#0A192F] px-5 py-2 rounded-md font-semibold hover:bg-[#d4ad65] transition shadow-md">
                + Add Task
              </button>
              <button
                onClick={handleSendNotification}
                disabled={!pushEnabled}
                title={pushEnabled ? "Notify all devices" : "Enable notifications first"}
                className="border border-[#0A192F] text-[#0A192F] px-5 py-2 rounded-md font-semibold hover:bg-gray-50 transition shadow-md disabled:opacity-40"
              >
                Send Notification
              </button>
            </div>
          )}
        </header>

        <div className="p-8">
          
          {/* ====== 1. DASHBOARD TAB ====== */}
          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-[#e9c176]">
                  <p className="text-sm text-gray-500 mb-1">Active Cases</p>
                  <p className="text-3xl font-serif text-[#0A192F]">{cases.length}</p>
                </div>
                <button
                  type="button"
                  onClick={goToAddClient}
                  className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-[#0A192F] text-left hover:bg-gray-50 hover:shadow-md transition group"
                >
                  <p className="text-sm text-gray-500 mb-1 group-hover:text-[#0A192F]">Quick Action</p>
                  <p className="text-xl font-serif font-bold text-[#0A192F] group-hover:text-[#e9c176]">+ ADD CLIENT</p>
                </button>
                <button
                  type="button"
                  onClick={goToAddCase}
                  className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-[#e9c176] text-left hover:bg-gray-50 hover:shadow-md transition group"
                >
                  <p className="text-sm text-gray-500 mb-1 group-hover:text-[#0A192F]">Quick Action</p>
                  <p className="text-xl font-serif font-bold text-[#0A192F] group-hover:text-[#e9c176]">+ ADD CASE</p>
                </button>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                <h3 className="text-lg font-serif text-[#0A192F] border-b pb-3 mb-4">Search Client or Case</h3>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type client name or case title..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-[#e9c176] focus:outline-none text-[#0A192F]"
                />
                {searchQuery.trim() && (
                  <div className="mt-4 space-y-4 max-h-[400px] overflow-y-auto pr-1">
                    {searchGroups.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-6">No client or case found for &quot;{searchQuery}&quot;</p>
                    ) : (
                      searchGroups.map((group, idx) => (
                        <div key={group.client?.id ?? `cases-${idx}`} className="rounded-lg border border-gray-200 overflow-hidden">
                          {group.client ? (
                            <div className="bg-[#0A192F] text-[#e9c176] px-4 py-3">
                              <p className="font-semibold">{group.client.full_name}</p>
                              {group.client.phone_number && (
                                <p className="text-xs text-gray-300 mt-0.5">{group.client.phone_number}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                {group.cases.length} active case{group.cases.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          ) : (
                            <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                              <p className="text-sm font-semibold text-[#0A192F]">Matching cases</p>
                            </div>
                          )}
                          <div className="p-3 space-y-2 bg-gray-50">
                            {group.cases.length === 0 ? (
                              <p className="text-sm text-gray-500 px-2 py-2">No active cases for this client.</p>
                            ) : (
                              group.cases.map((c) => (
                                <div
                                  key={c.id}
                                  className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex justify-between items-center gap-3"
                                >
                                  <div>
                                    <p className="font-semibold text-[#0A192F]">{c.case_title}</p>
                                    {!group.client && c.clients?.full_name && (
                                      <p className="text-xs text-gray-500 mt-0.5">Client: {c.clients.full_name}</p>
                                    )}
                                  </div>
                                  <span className="text-xs bg-[#e9c176]/20 text-[#0A192F] px-2 py-1 rounded font-medium shrink-0">
                                    Active
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                <h3 className="text-lg font-serif text-[#0A192F] border-b pb-3 mb-4">Upcoming Hearings</h3>
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                  {hearings.length === 0 ? <p className="text-gray-500 text-sm text-center py-4">No hearings scheduled yet.</p> : 
                    hearings.map((hearing) => (
                      <div key={hearing.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border-l-4 border-[#0A192F]">
                        <div>
                          <h4 className="font-semibold text-[#0A192F]">{hearing.cases?.case_title || "Unknown Case"}</h4>
                          <p className="text-xs text-gray-600 mt-1">🏛️ {hearing.court_name}</p>
                          <p className="text-xs text-gray-500">👨‍⚖️ Judge: {hearing.judge_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[#e9c176] font-bold text-sm bg-[#0A192F] px-2 py-1 rounded">
                            {new Date(hearing.hearing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <h3 className="text-lg font-serif text-[#0A192F]">Tasks</h3>
                  <button onClick={() => setIsTaskModalOpen(true)} className="text-sm bg-[#0A192F] text-[#e9c176] px-4 py-1.5 rounded font-semibold hover:bg-[#112a4f]">
                    + Add Task
                  </button>
                </div>
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                  {tasks.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No tasks yet. Click Add Task to create one.</p>
                  ) : (
                    tasks.map((task) => {
                      const isOverdue = task.due_date && !task.is_completed && new Date(task.due_date) < new Date(new Date().toDateString());
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition ${
                            task.is_completed ? "bg-gray-100 border-gray-200 opacity-75" : "bg-gray-50 border-gray-200 hover:border-[#e9c176]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!task.is_completed}
                            onChange={() => handleToggleTask(task.id, !!task.is_completed)}
                            className="mt-1 w-5 h-5 accent-[#0A192F] cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-[#0A192F] ${task.is_completed ? "line-through text-gray-500" : ""}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className={`text-sm mt-1 ${task.is_completed ? "text-gray-400 line-through" : "text-gray-600"}`}>
                                {task.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                              {task.cases?.case_title && <span>Case: {task.cases.case_title}</span>}
                              {task.due_date && (
                                <span className={isOverdue ? "text-red-600 font-semibold" : ""}>
                                  Due: {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {isOverdue ? " (Overdue)" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id, task.title)}
                            disabled={isSubmitting}
                            className="shrink-0 text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* ====== 2. CLIENTS & CASES TAB ====== */}
          {activeTab === "clients" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Add Client Form */}
              <div id="add-client-section" className={`bg-white rounded-xl shadow-sm p-6 transition ring-2 ${clientsFocus === "client" ? "ring-[#e9c176]" : "ring-transparent"}`}>
                <h3 className="text-lg font-serif text-[#0A192F] border-b pb-3 mb-4">Register New Client</h3>
                <form onSubmit={handleAddClient} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Full Name</label>
                    <input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Phone Number</label>
                    <input type="text" required value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-[#0A192F] text-[#e9c176] font-semibold py-2 rounded disabled:opacity-50">
                    Add Client
                  </button>
                </form>
              </div>

              {/* Add Case Form */}
              <div id="add-case-section" className={`bg-white rounded-xl shadow-sm p-6 transition ring-2 ${clientsFocus === "case" ? "ring-[#e9c176]" : "ring-transparent"}`}>
                <h3 className="text-lg font-serif text-[#0A192F] border-b pb-3 mb-4">Open New Case</h3>
                <form onSubmit={handleAddCase} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Select Client</label>
                    <select required value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]">
                      <option value="" disabled>-- Choose Client --</option>
                      {clients.map((c) => (<option key={c.id} value={c.id}>{c.full_name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Case Title</label>
                    <input type="text" required placeholder="e.g. State vs. Ali" value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
                  </div>
                  <button type="submit" disabled={isSubmitting} className="w-full bg-[#e9c176] text-[#0A192F] font-semibold py-2 rounded disabled:opacity-50">
                    Create Case
                  </button>
                </form>
              </div>

              {/* Clients List */}
              <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
                <h3 className="text-lg font-serif text-[#0A192F] border-b pb-3 mb-4">All Clients</h3>
                <div className="space-y-3">
                  {clients.length === 0 ? <p className="text-gray-500">No clients registered yet.</p> : clients.map((client) => (
                    <div key={client.id} className="flex justify-between items-center border border-gray-200 p-4 rounded-lg">
                      <div>
                        <h4 className="font-semibold text-[#0A192F]">{client.full_name}</h4>
                        <p className="text-sm text-gray-500">{client.phone_number}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteClient(client.id, client.full_name)}
                        disabled={isSubmitting}
                        className="text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Cases List */}
              <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
                <h3 className="text-lg font-serif text-[#0A192F] border-b pb-3 mb-4">All Active Cases</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cases.length === 0 ? <p className="text-gray-500">No cases found.</p> : cases.map((c) => (
                    <div key={c.id} className="border border-gray-200 p-4 rounded-lg flex justify-between items-start gap-3">
                      <div>
                        <h4 className="font-semibold text-[#0A192F]">{c.case_title}</h4>
                        <p className="text-sm text-gray-500">Client: {c.clients?.full_name || "—"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCase(c.id, c.case_title)}
                        disabled={isSubmitting}
                        className="shrink-0 text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ====== 3. DOCUMENT VAULT TAB ====== */}
          {activeTab === "vault" && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-center border-b pb-3 mb-6">
                <h3 className="text-lg font-serif text-[#0A192F]">Case Files & Evidence</h3>
                <button
                  onClick={() => {
                    setScannerCaseId(selectedVaultCaseId || "");
                    setIsScannerOpen(true);
                  }}
                  className="bg-[#0A192F] text-[#e9c176] px-4 py-2 font-bold rounded shadow-md hover:bg-[#112a4f]"
                >
                  📷 Scan Document
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cases.length === 0 ? <p className="text-gray-500">Add a case first to see its folder.</p> : cases.map((c) => (
                  <div key={c.id} onClick={() => openVaultCase(c.id)} className="border border-gray-200 p-6 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-[#e9c176] transition group">
                    <span className="text-5xl mb-3 group-hover:scale-110 transition-transform">📁</span>
                    <p className="font-semibold text-[#0A192F] text-center">{c.case_title}</p>
                    <p className="text-xs text-gray-500 mt-1">Click to view files</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ====== MODALS ====== */}
      
      {/* Add Task Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={() => setIsTaskModalOpen(false)} className="text-[#0A192F] font-semibold flex items-center gap-1 shrink-0">
                ← Back
              </button>
              <h2 className="text-xl md:text-2xl font-serif text-[#0A192F]">Add Task</h2>
            </div>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Task Title</label>
                <input type="text" required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. File reply in court" className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Description (optional)</label>
                <textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} rows={3} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Due Date (optional)</label>
                <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Link to Case (optional)</label>
                <select value={taskCaseId} onChange={(e) => setTaskCaseId(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]">
                  <option value="">-- No case --</option>
                  {cases.map((c) => (<option key={c.id} value={c.id}>{c.case_title}</option>))}
                </select>
              </div>
              <div className="flex justify-end space-x-3 mt-8">
                <button type="button" onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-[#0A192F] text-[#e9c176] font-semibold rounded disabled:opacity-50">Save Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0A192F] border-t border-[#e9c176]/30 z-30 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-3">
          {(
            [
              { id: "dashboard" as const, label: "Dashboard", icon: "🏠" },
              { id: "clients" as const, label: "Clients", icon: "👥" },
              { id: "vault" as const, label: "Vault", icon: "📁" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateTab(tab.id)}
              className={`flex flex-col items-center py-3 px-2 transition ${
                activeTab === tab.id && !clientsFocus && !isDocViewerOpen
                  ? "text-[#e9c176] bg-[#112a4f]"
                  : "text-gray-400"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[10px] font-semibold mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Schedule Hearing Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="text-[#0A192F] font-semibold flex items-center gap-1 shrink-0">
                ← Back
              </button>
              <h2 className="text-xl md:text-2xl font-serif text-[#0A192F]">Schedule Hearing</h2>
            </div>
            <form onSubmit={handleScheduleHearing} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Select Case</label>
                <select required value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]">
                  <option value="" disabled>-- Choose Case --</option>
                  {cases.map((c) => (<option key={c.id} value={c.id}>{c.case_title}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Date</label>
                <input type="date" required value={hearingDate} onChange={(e) => setHearingDate(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Court</label>
                <input type="text" required value={courtName} onChange={(e) => setCourtName(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Judge</label>
                <input type="text" required value={judgeName} onChange={(e) => setJudgeName(e.target.value)} className="w-full border border-gray-300 rounded p-2 focus:border-[#e9c176]" />
              </div>
              <div className="flex justify-end space-x-3 mt-8">
                <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-[#0A192F] text-[#e9c176] font-semibold rounded disabled:opacity-50">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {isDocViewerOpen && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-2 md:p-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-[#0A192F] text-[#e9c176] flex items-center gap-3">
              <button type="button" onClick={closeDocViewer} className="shrink-0 font-semibold text-sm flex items-center gap-1 hover:text-white">
                ← Back
              </button>
              <h2 className="font-serif text-base md:text-xl truncate flex-1">
                {cases.find((c) => c.id === selectedVaultCaseId)?.case_title || "Case"} — Documents
              </h2>
              <button
                type="button"
                onClick={() => {
                  setScannerCaseId(selectedVaultCaseId || "");
                  setIsScannerOpen(true);
                }}
                className="shrink-0 text-xs bg-[#e9c176] text-[#0A192F] px-3 py-1.5 rounded font-semibold"
              >
                + Scan
              </button>
            </div>
            <div className="flex-1 p-6 bg-gray-100 overflow-y-auto">
              {documents.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <span className="text-6xl block mb-4">📄</span>
                  <p>No documents in this case yet.</p>
                  <p className="text-sm mt-2">Use Scan Document to add files.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {documents.map((doc) => (
                    <li key={doc.id} className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-start gap-4">
                      <div className="min-w-0 flex-1">
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                            <img src={doc.file_url} alt={doc.file_name} className="max-h-40 rounded border border-gray-200 object-contain" />
                          </a>
                        )}
                        <p className="font-semibold text-[#0A192F] truncate">{doc.file_name}</p>
                        {doc.created_at && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.id, doc.file_name)}
                        disabled={isSubmitting}
                        className="shrink-0 text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <DocumentScanner
          cases={cases}
          defaultCaseId={scannerCaseId || selectedVaultCaseId || ""}
          onClose={() => setIsScannerOpen(false)}
          onSaved={() => {
            fetchDashboardData();
            if (selectedVaultCaseId) fetchDocumentsForCase(selectedVaultCaseId);
          }}
        />
      )}

    </div>
  );
}