import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import AppSidebar from "./AppSidebar";
import ToolManagementView from "./ToolManagementView";
import type {
  ConfigRevision,
  DexData,
  DiagnosticAdvice,
  DiagnosticResult,
  DiffResult,
  ExportedDiagnosticBundle,
  GlobalSkillSearchResult,
  MarketplaceServer,
  McpServerConfig,
  MemoryEntry,
  ServerDiagnosticHistory,
  UsageStats,
  ViewMode,
} from "./types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";
import {
  Layers,
  RefreshCw,
  Search,
  MessageSquare,
  Zap,
  Terminal as TerminalIcon,
  CheckCircle2,
  TrendingUp,
  Lightbulb,
  ShieldAlert,
  Clock,
  History,
  ChevronRight,
  GitPullRequest,
  FolderOpen,
} from "lucide-react";

const DAILY_LIMIT = 10;
const MAX_MCP_LOG_LINES = 100;
const CHART_GRID_STROKE = "rgba(255,255,255,0.04)";
const BASE_CHART_TOOLTIP_STYLE = {
  background: "#1a1a20",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
} as const;
const SMALL_CHART_TOOLTIP_STYLE = {
  ...BASE_CHART_TOOLTIP_STYLE,
  fontSize: "12px",
} as const;

function parseEnvString(input: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!input.trim()) {
    return env;
  }

  for (const pair of input.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      env[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
  }

  return env;
}

function getLogServerName(line: string): string | null {
  const structured = line.match(/^\[([^\]]+)\]\[(stdout|stderr)\]/);
  if (structured) {
    return structured[1];
  }

  const lifecycle = line.match(/^>>> \[([^\]]+)\]/);
  return lifecycle ? lifecycle[1] : null;
}

function appendMcpLogEntry(previousLogs: string[] | undefined, line: string): string[] {
  return [...(previousLogs ?? []).slice(-(MAX_MCP_LOG_LINES - 1)), line];
}

function formatDiagnosticTimestamp(timestamp: string): string {
  return timestamp.replace(/_/g, " at ").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

function getCurrentBillingCycleLabel(now: Date = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), 23);
  if (now.getDate() < 23) {
    start.setMonth(start.getMonth() - 1);
  }

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getMemoryLineClassName(line: string): string {
  if (line.startsWith("#")) {
    return "memory-line memory-line-heading";
  }

  if (line.startsWith("-")) {
    return "memory-line memory-line-item";
  }

  return "memory-line memory-line-dim";
}

function getStatusDotState(limitProgress: number): "active" | "alert" {
  return limitProgress > 90 ? "alert" : "active";
}

function getBudgetFillClassName(limitProgress: number): string {
  if (limitProgress > 90) {
    return "budget-bar-fill budget-bar-fill-danger";
  }

  if (limitProgress > 70) {
    return "budget-bar-fill budget-bar-fill-warn";
  }

  return "budget-bar-fill budget-bar-fill-safe";
}

function App() {
  const [dexData, setDexData] = useState<DexData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [marketplaceServers, setMarketplaceServers] = useState<MarketplaceServer[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("30d");

  const [editingContent, setEditingContent] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [repoUrl, setRepoUrl] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSkillSearchResult[]>([]);

  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [isClaudeSkill, setIsClaudeSkill] = useState(false);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);

  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [newMcpEnv, setNewMcpEnv] = useState("");
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [editorMode, setEditorMode] = useState<"code" | "form">("form");

  const [mcpLogsByServer, setMcpLogsByServer] = useState<Record<string, string[]>>({});
  const [isDebugging, setIsDebugging] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, DiagnosticResult>>({});
  const [selectedDiagnosticServer, setSelectedDiagnosticServer] = useState<string | null>(null);
  const [diagnosticHistories, setDiagnosticHistories] = useState<Record<string, ServerDiagnosticHistory>>({});
  const [diagnosticAdvice, setDiagnosticAdvice] = useState<Record<string, DiagnosticAdvice>>({});
  const [exportedBundles, setExportedBundles] = useState<Record<string, ExportedDiagnosticBundle>>({});
  const [isLoadingDiagnosticContext, setIsLoadingDiagnosticContext] = useState(false);
  const [isExportingBundle, setIsExportingBundle] = useState<string | null>(null);
  const [assistantEnabled, setAssistantEnabled] = useState(false);

  const fetchData = async () => {
    try {
      const data: DexData = await invoke("get_dex_data");
      setDexData(data);
      const usage: UsageStats = await invoke("get_usage_stats");
      setUsageStats(usage);
      const marketplace: MarketplaceServer[] = await invoke("get_marketplace_servers");
      setMarketplaceServers(marketplace);
      const mems: MemoryEntry[] = await invoke("get_memories");
      setMemories(mems);
    } catch (err) { console.error(`Connection Error: ${err}`); }
  };

  useEffect(() => {
    fetchData();
    const unlisten = listen("mcp-log", (event) => {
      const line = event.payload as string;
      const serverName = getLogServerName(line);
      if (!serverName) return;
      setMcpLogsByServer(prev => ({
        ...prev,
        [serverName]: appendMcpLogEntry(prev[serverName], line)
      }));
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    if (viewMode === "tools" && dexData?.tools[selectedIndex]) {
      setEditingContent(dexData.tools[selectedIndex].configContent || "");
    }
  }, [selectedIndex, viewMode, dexData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && viewMode === "tools") {
        e.preventDefault(); handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingContent, selectedIndex, viewMode, dexData]);

  const currentTool = viewMode === "tools" ? dexData?.tools[selectedIndex] : null;
  const currentRepo = viewMode === "repos" ? dexData?.repos[selectedIndex] : null;

  const resetDiagnosticStateForTool = useCallback((): void => {
    setDiagnostics({});
    setDiagnosticHistories({});
    setDiagnosticAdvice({});
    setExportedBundles({});
    setSelectedDiagnosticServer(null);
    setIsDebugging(null);
    setMcpLogsByServer({});
  }, []);

  useEffect(() => {
    resetDiagnosticStateForTool();
  }, [currentTool?.configPath]);

  useEffect(() => {
    if (!currentTool?.mcpServers) {
      setSelectedDiagnosticServer(null);
      return;
    }
    if (selectedDiagnosticServer && !currentTool.mcpServers[selectedDiagnosticServer]) {
      setSelectedDiagnosticServer(null);
    }
  }, [currentTool, selectedDiagnosticServer]);

  const filteredMcp = useMemo(() => {
    if (!currentTool?.mcpServers) return [];
    return Object.entries(currentTool.mcpServers).filter(([name]) =>
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [currentTool, searchTerm]);

  const selectedDiagnosticConfig = selectedDiagnosticServer && currentTool?.mcpServers
    ? currentTool.mcpServers[selectedDiagnosticServer] ?? null
    : null;
  const selectedDiagnosticResult = selectedDiagnosticServer ? diagnostics[selectedDiagnosticServer] ?? null : null;
  const selectedDiagnosticHistory = selectedDiagnosticServer ? diagnosticHistories[selectedDiagnosticServer] ?? null : null;
  const selectedDiagnosticAdvice = selectedDiagnosticServer ? diagnosticAdvice[selectedDiagnosticServer] ?? null : null;
  const selectedDiagnosticBundle = selectedDiagnosticServer ? exportedBundles[selectedDiagnosticServer] ?? null : null;
  const activeMcpLogs = isDebugging ? mcpLogsByServer[isDebugging] ?? [] : [];

  useEffect(() => {
    if (!assistantEnabled || !selectedDiagnosticServer || !selectedDiagnosticResult || !currentTool?.configPath) return;
    let cancelled = false;
    const loadAdvice = async () => {
      try {
        const advice: DiagnosticAdvice = await invoke("get_mcp_diagnostic_advice", {
          configPath: currentTool.configPath,
          serverName: selectedDiagnosticServer,
          result: selectedDiagnosticResult
        });
        if (!cancelled) {
          setDiagnosticAdvice(prev => ({ ...prev, [selectedDiagnosticServer]: advice }));
        }
      } catch (err) {
        console.error(`Diagnostic advice failed: ${err}`);
      }
    };
    loadAdvice();
    return () => { cancelled = true; };
  }, [assistantEnabled, currentTool?.configPath, selectedDiagnosticResult, selectedDiagnosticServer]);

  const filteredActivity = useMemo(() => {
    if (!usageStats) return [];
    if (timeRange === "7d") return usageStats.dailyActivity.slice(-7);
    if (timeRange === "30d") return usageStats.dailyActivity.slice(-30);
    return usageStats.dailyActivity;
  }, [usageStats, timeRange]);

  const modelUsageData = useMemo(() => {
    if (!usageStats) return [];
    return Object.entries(usageStats.modelUsageStats)
      .map(([name, stats]) => ({ name, cost: stats.estimatedCost }))
      .sort((a, b) => b.cost - a.cost);
  }, [usageStats]);

  const totalRequestsInRange = useMemo(() => filteredActivity.reduce((acc, curr) => acc + curr.count, 0), [filteredActivity]);
  const maxCommonSequenceCount = useMemo(
    () => Math.max(...usageStats?.commonSequences.map(sequence => sequence.count) ?? [], 1),
    [usageStats]
  );
  const totalMemoryLines = useMemo(
    () => memories.reduce((acc, memory) => acc + memory.lineCount, 0),
    [memories]
  );
  const activeSearchValue = viewMode === "global_search" ? globalQuery : searchTerm;
  const currentBillingCycleLabel = getCurrentBillingCycleLabel();

  const handleSave = async () => {
    if (!currentTool || !currentTool.configPath) return;
    try {
      JSON.parse(editingContent);
      await invoke("save_config", { path: currentTool.configPath, content: editingContent });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`JSON Error: ${message}`);
    }
  };

  const handleAddMcp = async (name?: string, cmd?: string, args?: string[], env?: Record<string, string>) => {
    const finalName = name || newMcpName;
    const finalCmd = cmd || newMcpCommand;
    const finalArgs = args || (newMcpArgs ? newMcpArgs.split(" ") : []);
    if (!currentTool || !currentTool.configPath || !finalName || !finalCmd) return;
    setIsAddingMcp(true);
    try {
      const config = JSON.parse(editingContent || "{}");
      if (!config.mcpServers) config.mcpServers = {};
      const serverEntry: Record<string, unknown> = { command: finalCmd, args: finalArgs };
      const finalEnv = env || parseEnvString(newMcpEnv);
      if (finalEnv && Object.keys(finalEnv).length > 0) serverEntry.env = finalEnv;
      config.mcpServers[finalName] = serverEntry;
      const updatedContent = JSON.stringify(config, null, 2);
      await invoke("save_config", { path: currentTool.configPath, content: updatedContent });
      setNewMcpName(""); setNewMcpCommand(""); setNewMcpArgs(""); setNewMcpEnv(""); setEditingContent(updatedContent);
      fetchData();
    } catch (err) { console.error(`Failed: ${err}`); }
    finally { setIsAddingMcp(false); }
  };

  const loadDiagnosticContext = async (name: string, result?: DiagnosticResult) => {
    if (!currentTool?.configPath) return;
    setIsLoadingDiagnosticContext(true);
    try {
      const history: ServerDiagnosticHistory = await invoke("get_mcp_diagnostic_history", {
        configPath: currentTool.configPath,
        serverName: name
      });
      setDiagnosticHistories(prev => ({ ...prev, [name]: history }));

      const resultToAnalyze = result || diagnostics[name];
      if (assistantEnabled && resultToAnalyze) {
        const advice: DiagnosticAdvice = await invoke("get_mcp_diagnostic_advice", {
          configPath: currentTool.configPath,
          serverName: name,
          result: resultToAnalyze
        });
        setDiagnosticAdvice(prev => ({ ...prev, [name]: advice }));
      }
    } catch (err) {
      console.error(`Diagnostic context failed: ${err}`);
    } finally {
      setIsLoadingDiagnosticContext(false);
    }
  };

  const handleSelectDiagnosticServer = async (name: string) => {
    setSelectedDiagnosticServer(name);
    await loadDiagnosticContext(name);
  };

  const handleTestMcp = async (name: string, server: McpServerConfig) => {
    if (!currentTool?.configPath) return;
    setSelectedDiagnosticServer(name);
    try {
      const result: DiagnosticResult = await invoke("test_mcp_connection", {
        serverName: name,
        configPath: currentTool.configPath,
        server
      });
      setDiagnostics(prev => ({ ...prev, [name]: result }));
      await loadDiagnosticContext(name, result);
    } catch (err) { console.error(`Connection failed: ${err}`); }
  };

  const handleDebugMcp = async (name: string, server: McpServerConfig) => {
    setSelectedDiagnosticServer(name);
    setIsDebugging(name);
    setMcpLogsByServer(prev => ({
      ...prev,
      [name]: [`>>> [${name}] starting manual debug`]
    }));
    try {
      await invoke("spawn_mcp_and_stream_logs", {
        serverName: name,
        command: server.command,
        args: server.args,
        env: server.env || null
      });
    }
    catch (err) {
      setMcpLogsByServer(prev => ({
        ...prev,
        [name]: [...(prev[name] ?? []), `>>> [${name}] ERROR: ${err}`]
      }));
    }
  };

  const handleInstallMarketplace = async (server: MarketplaceServer) => {
    const tool = currentTool || dexData?.tools.find(t => t.configPath);
    if (!tool || !tool.configPath) return;
    if (!currentTool) {
      const idx = dexData?.tools.indexOf(tool) ?? 0;
      setViewMode("tools");
      setSelectedIndex(idx);
    }
    await handleAddMcp(server.name, server.command, server.args);
  };

  const handleAddRepo = async () => {
    if (!repoUrl) return;
    setIsCloning(true);
    try {
      await invoke("add_repo", { url: repoUrl });
      setRepoUrl(""); await fetchData();
      setViewMode("repos"); setSelectedIndex(dexData ? dexData.repos.length : 0);
    } catch (err) { console.error(`Failed: ${err}`); }
    finally { setIsCloning(false); }
  };

  const handleCreateSkill = async () => {
    if (!skillName) return;
    setIsCreatingSkill(true);
    try {
      await invoke("create_skill", { name: skillName, description: skillDesc, isClaude: isClaudeSkill });
      setSkillName(""); setSkillDesc(""); await fetchData();
    } catch (err) { console.error(`Failed: ${err}`); }
    finally { setIsCreatingSkill(false); }
  };

  const handleGlobalSearch = async (e?: FormEvent) => {
    if (e) e.preventDefault(); if (!globalQuery.trim()) return;
    try {
      const results: GlobalSkillSearchResult[] = await invoke("search_global_skills", { query: globalQuery });
      setSearchResults(results);
    } catch (err) { console.error(`Search failed: ${err}`); }
  };

  const handleInstallSkill = async (id: string) => {
    try { await invoke("install_global_skill", { package: id }); await fetchData(); }
    catch (err) { console.error(`Failed: ${err}`); }
  };

  const handleSyncMcp = async (name: string, config: { command: string; args: string[] }) => {
    try {
      const result: string = await invoke("sync_mcp_to_all_tools", { name, config });
      alert(result);
      await fetchData();
    } catch (err) { console.error(`Sync failed: ${err}`); }
  };

  const handleDeleteMcp = async (name: string) => {
    if (!currentTool?.configPath) return;
    try {
      const config = JSON.parse(editingContent || "{}");
      if (config.mcpServers) {
        delete config.mcpServers[name];
        const updatedContent = JSON.stringify(config, null, 2);
        await invoke("save_config", { path: currentTool.configPath, content: updatedContent });
        setEditingContent(updatedContent);
        fetchData();
      }
    } catch (err) { console.error(`Failed: ${err}`); }
  };

  const handleUninstallSkill = async (id: string) => {
    try { await invoke("uninstall_global_skill", { package: id }); await fetchData(); }
    catch (err) { console.error(`Failed: ${err}`); }
  };

  const handleSyncRepo = async (name: string) => {
    try {
      await invoke("sync_repo", { name });
      await fetchData();
    } catch (err) { console.error(`Sync failed: ${err}`); }
  };

  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const handleHealthCheckAll = async () => {
    if (!currentTool?.configPath) return;
    setIsCheckingHealth(true);
    try {
      const results: Record<string, DiagnosticResult> = await invoke("check_all_mcp_health", {
        configPath: currentTool.configPath
      });
      setDiagnostics(results);
      const nextSelected = selectedDiagnosticServer && results[selectedDiagnosticServer]
        ? selectedDiagnosticServer
        : Object.entries(results).find(([, result]) => !result.success)?.[0] || Object.keys(results)[0] || null;
      if (nextSelected) {
        setSelectedDiagnosticServer(nextSelected);
        await loadDiagnosticContext(nextSelected, results[nextSelected]);
      }
    } catch (err) { console.error(`Health check failed: ${err}`); }
    finally { setIsCheckingHealth(false); }
  };

  const [installingRuntime, setInstallingRuntime] = useState<string | null>(null);

  const handleInstallRuntime = async (runtime: string) => {
    setInstallingRuntime(runtime);
    try {
      const result: string = await invoke("install_runtime", { runtime });
      alert(result);
      setDiagnostics({});
      await handleHealthCheckAll();
    } catch (err) {
      alert(String(err));
    }
    finally { setInstallingRuntime(null); }
  };

  const handleExportBundle = async (name: string, server: McpServerConfig, result: DiagnosticResult) => {
    if (!currentTool?.configPath) return;
    setIsExportingBundle(name);
    try {
      const bundle: ExportedDiagnosticBundle = await invoke("export_mcp_bug_bundle", {
        configPath: currentTool.configPath,
        serverName: name,
        server,
        result,
        recentLogs: mcpLogsByServer[name] || []
      });
      setExportedBundles(prev => ({ ...prev, [name]: bundle }));
      alert(`Diagnostic bundle exported to ${bundle.path}`);
    } catch (err) {
      alert(String(err));
    } finally {
      setIsExportingBundle(null);
    }
  };

  const handleRepairAction = async (name: string, server: McpServerConfig, kind: string, runtime?: string, revisionFilename?: string) => {
    if (kind === "install_runtime" && runtime) {
      await handleInstallRuntime(runtime);
      return;
    }
    if (kind === "debug_server") {
      await handleDebugMcp(name, server);
      return;
    }
    if (kind === "inspect_server") {
      await handleLaunchInspector(name);
      return;
    }
    if (kind === "restore_revision" && revisionFilename) {
      await handleRestoreRevision(revisionFilename);
      return;
    }
    if (kind === "rerun_check") {
      await handleTestMcp(name, server);
      return;
    }
  };

  const [revisions, setRevisions] = useState<ConfigRevision[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeDiff, setActiveDiff] = useState<DiffResult | null>(null);
  const [activeDiffRevision, setActiveDiffRevision] = useState<string | null>(null);

  const handleShowHistory = async () => {
    if (!currentTool?.configPath) return;
    const history: ConfigRevision[] = await invoke("get_config_history", { path: currentTool.configPath });
    setRevisions(history);
    setShowHistory(true);
    setActiveDiff(null);
    setActiveDiffRevision(null);
  };

  const handleViewDiff = async (revisionFilename: string) => {
    if (!currentTool?.configPath) return;
    const diff: DiffResult = await invoke("get_config_diff", { path: currentTool.configPath, revisionFilename });
    setActiveDiff(diff);
    setActiveDiffRevision(revisionFilename);
  };

  const handleRestoreRevision = async (revisionFilename: string) => {
    if (!currentTool?.configPath) return;
    await invoke("restore_config_revision", { path: currentTool.configPath, revisionFilename });
    await fetchData();
    setDiagnostics({});
    setDiagnosticHistories({});
    setDiagnosticAdvice({});
    setExportedBundles({});
    setShowHistory(false);
    setActiveDiff(null);
  };

  const handleLaunchInspector = async (serverName: string) => {
    if (!currentTool?.configPath) return;
    try {
      const result: string = await invoke("launch_mcp_inspector", { serverName, configPath: currentTool.configPath });
      alert(result);
    } catch (err) { alert(String(err)); }
  };

  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [isSearchingMarketplace, setIsSearchingMarketplace] = useState(false);

  const handleMarketplaceSearch = async () => {
    if (!marketplaceQuery.trim()) {
      const servers: MarketplaceServer[] = await invoke("get_marketplace_servers");
      setMarketplaceServers(servers);
      return;
    }
    setIsSearchingMarketplace(true);
    try {
      const servers: MarketplaceServer[] = await invoke("search_marketplace", { query: marketplaceQuery });
      setMarketplaceServers(servers);
    } catch (err) { console.error(`Search failed: ${err}`); }
    finally { setIsSearchingMarketplace(false); }
  };

  const limitProgress = usageStats ? (usageStats.estimatedCostToday / DAILY_LIMIT) * 100 : 0;
  const statusDotState = getStatusDotState(limitProgress);
  const budgetFillClassName = getBudgetFillClassName(limitProgress);

  const nav = (mode: ViewMode, index?: number) => {
    setViewMode(mode);
    if (index !== undefined) setSelectedIndex(index);
    setSearchTerm("");
  };

  if (!dexData) {
    return <div className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Initializing Dex...</div>;
  }

  return (
    <div className="app-container">
      <AppSidebar dexData={dexData} viewMode={viewMode} selectedIndex={selectedIndex} onNavigate={nav} />

      <main className="main-content">
        <header className="search-bar-container">
          <input
            className="search-input"
            placeholder="Search..."
            value={activeSearchValue}
            onChange={(e) => viewMode === "global_search" ? setGlobalQuery(e.target.value) : setSearchTerm(e.target.value)}
            onKeyDown={(e) => viewMode === "global_search" && e.key === "Enter" && handleGlobalSearch()}
            disabled={viewMode === "add_repo"}
          />
          {currentTool?.schemaContent && viewMode === "tools" && <span className="badge-pill">Schema Verified</span>}
        </header>

        <div className="content-scroll">

          {viewMode === "dashboard" && usageStats && (
            <section className="dashboard-view">
              <div className="page-header">
                <div>
                  <h2 className="page-title">AI Insights</h2>
                  <p className="page-subtitle">Performance overview across all tools.</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div className="time-toggle">
                    {(["7d", "30d", "all"] as const).map(range => (
                      <button key={range} onClick={() => setTimeRange(range)} className={`time-toggle-btn ${timeRange === range ? "active" : ""}`}>
                        {range.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <button className="refresh-btn" onClick={fetchData}><RefreshCw size={13} /></button>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">Total Skills</span><Layers size={14} color="var(--accent)" /></div>
                  <span className="stat-value">{usageStats.totalSkills}</span>
                </div>
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">Avg Prompt</span><MessageSquare size={14} color="var(--accent)" /></div>
                  <span className="stat-value">{usageStats.avgPromptLength}</span>
                </div>
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">Commands</span><TerminalIcon size={14} color="var(--accent)" /></div>
                  <span className="stat-value">{(usageStats.commandRatio * 100).toFixed(0)}%</span>
                </div>
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">Requests</span><Zap size={14} color="var(--accent)" /></div>
                  <span className="stat-value">{totalRequestsInRange}</span>
                </div>
              </div>

              <div className="charts-row charts-row-2">
                <div className="chart-container chart-container-tall">
                  <h3 className="section-title">Intensity</h3>
                  <ResponsiveContainer width="100%" height="85%">
                    <AreaChart data={filteredActivity}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 10}} minTickGap={30} />
                      <Tooltip contentStyle={SMALL_CHART_TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" animationDuration={1200} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-container chart-container-tall">
                  <h3 className="section-title">Peak Distribution</h3>
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={usageStats.hourlyActivity.map((count, hour) => ({ hour: `${hour}h`, count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 9}} interval={3} />
                      <Tooltip contentStyle={SMALL_CHART_TOOLTIP_STYLE} cursor={{fill: 'rgba(255,255,255,0.03)'}} />
                      <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-container">
                <h3 className="section-title" style={{ marginBottom: "18px" }}>Common Sequences</h3>
                <div className="sequence-list">
                  {usageStats.commonSequences.map((seq) => {
                    const percentage = (seq.count / maxCommonSequenceCount) * 100;
                    return (
                      <div key={seq.sequence} className="sequence-item">
                        <div className="sequence-meta">
                          <span className="sequence-name">{seq.sequence}</span>
                          <span className="sequence-count">{seq.count}</span>
                        </div>
                        <div className="sequence-bar-track">
                          <div className="sequence-bar-fill" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {viewMode === "costs" && usageStats && (
            <section className="dashboard-view">
              <div className="page-header">
                <div>
                  <h2 className="page-title">AI Cost Center</h2>
                  <p className="page-subtitle">Precise spend based on real Claude pricing data.</p>
                </div>
                <div className="cost-header-stats">
                  <div className="stat-card stat-card-compact">
                    <div>
                      <div className="stat-label">Total Tokens</div>
                      <div className="stat-value-sm fw-800">{(usageStats.totalTokens / 1_000_000).toFixed(1)}M</div>
                    </div>
                  </div>
                  <div className="stat-card stat-card-compact">
                    <div>
                      <div className="stat-label">Cache Efficiency</div>
                      <div className="stat-value-sm fw-800 text-success">
                        {usageStats.totalTokens > 0 ? ((usageStats.cacheReadTokens / usageStats.totalTokens) * 100).toFixed(1) : "0.0"}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">Today</span><Clock size={14} color="var(--accent)" /></div>
                  <span className="stat-value">${usageStats.estimatedCostToday.toFixed(2)}</span>
                </div>
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">This Week</span><TrendingUp size={14} color="var(--accent)" /></div>
                  <span className="stat-value">${usageStats.estimatedCostWeek.toFixed(2)}</span>
                </div>
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">Projected Month</span><TrendingUp size={14} color="var(--accent)" /></div>
                  <span className="stat-value">${(usageStats.estimatedCostToday * 30).toFixed(2)}</span>
                </div>
                <div className="stat-card">
                  <div className="stat-card-header"><span className="stat-label">All Time</span><History size={14} color="var(--accent)" /></div>
                  <span className="stat-value">${usageStats.estimatedCostAllTime.toFixed(2)}</span>
                </div>
              </div>

              <div className="charts-row charts-row-equal">
                <div className="chart-container chart-container-md">
                  <h3 className="section-title">Spend by Model</h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart layout="vertical" data={modelUsageData}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-main)', fontSize: 11}} width={140} />
                      <Tooltip
                        contentStyle={BASE_CHART_TOOLTIP_STYLE}
                        formatter={(value: unknown) => [`$${Number(value).toFixed(3)}`, 'Cost']}
                      />
                      <Bar dataKey="cost" fill="var(--accent)" radius={[0, 4, 4, 0]}>
                        {modelUsageData.map(({ name }, index) => (
                          <Cell key={name} fillOpacity={1 - (index * 0.15)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-container chart-container-md">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
                    <Lightbulb size={16} color="var(--accent)" />
                    <h3 className="section-title" style={{ margin: 0 }}>Optimization Center</h3>
                  </div>
                  <div className="optimization-section">
                    <div className="optimization-card optimization-card-success">
                      <div className="optimization-card-header">
                        <span className="optimization-card-title">High Cache Usage Detected</span>
                        <CheckCircle2 size={14} color="var(--success)" />
                      </div>
                      <div className="optimization-card-body">
                        You've saved approximately <span className="text-success fw-700">${(usageStats.cacheReadTokens * 0.00003).toFixed(2)}</span> this month by utilizing Claude's prompt caching.
                      </div>
                    </div>

                    <div className="optimization-card">
                      <div className="optimization-card-title">Model Mix Strategy</div>
                      <div className="optimization-card-body">
                        Sonnet is 5x cheaper than Opus. Consider using it for small files and UI tweaks.
                      </div>
                    </div>

                    <div className="billing-block">
                      <div className="billing-label">Current Billing Cycle</div>
                      <div className="billing-value">{currentBillingCycleLabel}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {viewMode === "memory" && (
            <section className="dashboard-view">
              <div className="page-header">
                <div>
                  <h2 className="page-title">Memory</h2>
                  <p className="page-subtitle">{totalMemoryLines} lines of context across {memories.length} projects.</p>
                </div>
              </div>

              <div className="memory-list">
                {memories.map((mem) => {
                  const lineOccurrences = new Map<string, number>();
                  return (
                    <div key={mem.path} className="memory-card">
                      <div className="memory-card-header">
                        <div>
                          <div className="memory-project-name">
                            <span className="memory-project-label">{mem.projectName}</span>
                            <ChevronRight size={14} color="var(--text-muted)" />
                          </div>
                          <div className="memory-project-meta">{mem.lineCount} lines &middot; {mem.path}</div>
                        </div>
                      </div>
                      <div className="memory-card-body">
                        <h4 className="memory-section-label">Project Memory</h4>
                        <div className="memory-content">
                          {mem.contentPreview.map((line) => {
                            const occurrence = (lineOccurrences.get(line) ?? 0) + 1;
                            lineOccurrences.set(line, occurrence);
                            return (
                              <div key={`${mem.path}-${line}-${occurrence}`} className={getMemoryLineClassName(line)}>
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {viewMode === "marketplace" && (
            <section className="dashboard-view">
              <div className="page-header">
                <div>
                  <h2 className="page-title">MCP Marketplace</h2>
                  <p className="page-subtitle">Powered by Smithery Registry &middot; {marketplaceServers.length} servers</p>
                </div>
              </div>
              <div className="marketplace-search">
                <input
                  className="repo-input repo-input-inline"
                  placeholder="Search MCP servers (e.g. github, slack, database...)"
                  value={marketplaceQuery}
                  onChange={e => setMarketplaceQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleMarketplaceSearch()}
                />
                <button className="btn-modern" onClick={handleMarketplaceSearch} disabled={isSearchingMarketplace}>
                  {isSearchingMarketplace ? "Searching..." : "Search"}
                </button>
              </div>
              <div className="skills-grid">
                {marketplaceServers.map((server, i) => (
                  <div key={server.qualifiedName || `${server.name}-${i}`} className="skill-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="skill-category">{server.category}</span>
                      {server.useCount > 0 && <span className="marketplace-installs">{server.useCount.toLocaleString()} installs</span>}
                    </div>
                    <h3 className="skill-name">{server.name}</h3>
                    <p className="skill-desc">{server.description}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                      <span className="marketplace-author">{server.author}</span>
                    </div>
                    <button className="btn-modern btn-accent btn-full" onClick={() => handleInstallMarketplace(server)}>Add to Tools</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {viewMode === "global_search" && (
            <section className="dashboard-view">
              <h2 className="page-title">Discover</h2>
              {searchResults.length > 0 ? (
                <div className="skills-grid" style={{ marginTop: "20px" }}>
                  {searchResults.map(skill => (
                    <div key={skill.id} className="skill-card">
                      <div className="skill-name">{skill.id}</div>
                      <button className="btn-modern btn-accent btn-full" onClick={() => handleInstallSkill(skill.id)}>Install</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={40} strokeWidth={1} />
                  <p>Search for skills using the search bar above.</p>
                </div>
              )}
            </section>
          )}

          {viewMode === "tools" && currentTool && (
            <ToolManagementView
              currentTool={currentTool}
              form={{
                editingContent,
                newMcpName,
                newMcpCommand,
                newMcpArgs,
                newMcpEnv,
                isAddingMcp,
                editorMode,
              }}
              diagnosticsState={{
                filteredMcp,
                diagnostics,
                selectedDiagnosticServer,
                selectedDiagnosticConfig,
                selectedDiagnosticResult,
                selectedDiagnosticHistory,
                selectedDiagnosticAdvice,
                selectedDiagnosticBundle,
                assistantEnabled,
                isLoadingDiagnosticContext,
                isExportingBundle: isExportingBundle === selectedDiagnosticServer,
                isCheckingHealth,
                installingRuntime,
                isDebugging,
                activeMcpLogs,
              }}
              historyState={{
                revisions,
                showHistory,
                activeDiff,
                activeDiffRevision,
              }}
              actions={{
                onFindSkills: () => nav("global_search"),
                onHealthCheckAll: handleHealthCheckAll,
                onShowHistory: handleShowHistory,
                onSetEditorMode: setEditorMode,
                onNewMcpNameChange: setNewMcpName,
                onNewMcpCommandChange: setNewMcpCommand,
                onNewMcpArgsChange: setNewMcpArgs,
                onNewMcpEnvChange: setNewMcpEnv,
                onAddMcp: () => { void handleAddMcp(); },
                onSelectDiagnosticServer: (name) => { void handleSelectDiagnosticServer(name); },
                onInstallRuntime: (runtime) => { void handleInstallRuntime(runtime); },
                onTestMcp: (name, config) => { void handleTestMcp(name, config); },
                onDebugMcp: (name, config) => { void handleDebugMcp(name, config); },
                onLaunchInspector: (serverName) => { void handleLaunchInspector(serverName); },
                onSyncMcp: (name, config) => { void handleSyncMcp(name, config); },
                onDeleteMcp: (name) => { void handleDeleteMcp(name); },
                onUninstallSkill: (id) => { void handleUninstallSkill(id); },
                onToggleAssistant: () => setAssistantEnabled(prev => !prev),
                onExportBundle: (name, server, result) => { void handleExportBundle(name, server, result); },
                onRepairAction: (name, server, kind, runtime, revisionFilename) => {
                  void handleRepairAction(name, server, kind, runtime, revisionFilename);
                },
                onRestoreRevision: (revisionFilename) => { void handleRestoreRevision(revisionFilename); },
                onCloseDebug: () => { setIsDebugging(null); },
                onCloseHistory: () => { setShowHistory(false); setActiveDiff(null); },
                onViewDiff: (revisionFilename) => { void handleViewDiff(revisionFilename); },
                onEditingContentChange: setEditingContent,
                onSave: () => { void handleSave(); },
              }}
              formatDiagnosticTimestamp={formatDiagnosticTimestamp}
            />
          )}

          {viewMode === "add_repo" && (
            <section className="dashboard-view">
              <h3 className="section-title">Add Repository</h3>
              <div className="form-container">
                <input type="text" className="repo-input" placeholder="https://github.com/user/repo" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} />
                <button className="btn-modern" onClick={handleAddRepo} disabled={isCloning}>{isCloning ? "Cloning..." : "Clone"}</button>
              </div>
            </section>
          )}

          {viewMode === "create_skill" && (
            <section className="dashboard-view">
              <h3 className="section-title">Create Skill</h3>
              <div className="form-container form-stack">
                <input type="text" className="repo-input repo-input-inline" placeholder="Skill name" value={skillName} onChange={e => setSkillName(e.target.value)} />
                <textarea className="repo-input repo-input-inline" placeholder="Description" value={skillDesc} onChange={e => setSkillDesc(e.target.value)} />
                <label className="checkbox-label">
                  <input type="checkbox" checked={isClaudeSkill} onChange={e => setIsClaudeSkill(e.target.checked)} />
                  For Claude Code (~/.claude/skills)
                </label>
                <button className="btn-modern" onClick={handleCreateSkill} disabled={isCreatingSkill}>{isCreatingSkill ? "Creating..." : "Scaffold"}</button>
              </div>
            </section>
          )}

          {viewMode === "repos" && currentRepo && (
            <section className="dashboard-view">
              <div className="page-header">
                <div>
                  <h2 className="page-title">{currentRepo.name}</h2>
                  <p className="page-subtitle">{currentRepo.skills.length} skill{currentRepo.skills.length !== 1 ? "s" : ""} &middot; {currentRepo.url}</p>
                </div>
                <button className="btn-modern" onClick={() => handleSyncRepo(currentRepo.name)}>
                  <GitPullRequest size={13} style={{ marginRight: "6px", verticalAlign: "middle" }} /> Pull Updates
                </button>
              </div>
              {currentRepo.skills.length > 0 ? (
                <div className="skills-grid">
                  {currentRepo.skills.map(s => (
                    <div key={s.name} className="skill-card">
                      <div className="skill-name">{s.name}</div>
                      {s.description && <div className="skill-desc">{s.description}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <FolderOpen size={40} strokeWidth={1} />
                  <p>No skills found in this repository.</p>
                </div>
              )}
            </section>
          )}

          <div className="spacer" />
        </div>
      </main>

      <footer className="status-bar">
        <div className="status-bar-inner">
          <div className="status-indicator">
            <div className={`status-dot ${statusDotState}`} />
            <span className="status-label">SYSTEM READY</span>
          </div>
          <div className="budget-section">
            <span className="budget-label">DAILY BUDGET</span>
            <div className="budget-bar-track">
              <div
                className={budgetFillClassName}
                style={{ width: `${Math.min(limitProgress, 100)}%` }}
              />
            </div>
            <span className="budget-amount">${usageStats?.estimatedCostToday.toFixed(2)} / ${DAILY_LIMIT.toFixed(0)}</span>
          </div>
          <div className="status-right">
            {limitProgress > 80 && (
              <div className="budget-warning">
                <ShieldAlert size={13} />
                <span>BUDGET WARNING</span>
              </div>
            )}
            <span className="version-label">v0.1.0-alpha</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
