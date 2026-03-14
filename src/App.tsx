import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import {
  DexData,
  UsageStats,
  ViewMode,
  GlobalSkillSearchResult,
  MarketplaceServer,
  DiagnosticResult,
  MemoryEntry
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
  Activity,
  Layers,
  Cpu,
  Target,
  RefreshCw,
  Plus,
  Search,
  MessageSquare,
  Zap,
  Store,
  Terminal as TerminalIcon,
  Play,
  CheckCircle2,
  XCircle,
  DollarSign,
  TrendingUp,
  Lightbulb,
  ShieldAlert,
  Clock,
  History,
  Brain,
  ChevronRight,
  Copy,
  Trash2,
  GitPullRequest,
  Package,
  FolderOpen
} from "lucide-react";

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

  const [mcpLogs, setMcpLogs] = useState<string[]>([]);
  const [isDebugging, setIsDebugging] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, DiagnosticResult>>({});

  const [dailyLimit] = useState(10.0);

  const parseEnvString = (s: string): Record<string, string> => {
    const env: Record<string, string> = {};
    if (!s.trim()) return env;
    for (const pair of s.split(",")) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) env[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
    return env;
  };

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
      setMcpLogs(prev => [...prev.slice(-100), event.payload as string]);
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

  const filteredMcp = useMemo(() => {
    if (!currentTool?.mcpServers) return [];
    return Object.entries(currentTool.mcpServers).filter(([name]) =>
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [currentTool, searchTerm]);

  const filteredActivity = useMemo(() => {
    if (!usageStats) return [];
    if (timeRange === "7d") return usageStats.dailyActivity.slice(-7);
    if (timeRange === "30d") return usageStats.dailyActivity.slice(-30);
    return usageStats.dailyActivity;
  }, [usageStats, timeRange]);

  const totalRequestsInRange = useMemo(() => filteredActivity.reduce((acc, curr) => acc + curr.count, 0), [filteredActivity]);

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

  const handleTestMcp = async (name: string, command: string, args: string[]) => {
    try {
      const result: DiagnosticResult = await invoke("test_mcp_connection", { command, args });
      setDiagnostics(prev => ({ ...prev, [name]: result }));
    } catch (err) { console.error(`Connection failed: ${err}`); }
  };

  const handleDebugMcp = async (name: string, command: string, args: string[]) => {
    setIsDebugging(name); setMcpLogs([`>>> Debugging ${name}...`, `>>> Command: ${command} ${args.join(" ")}`]);
    try { await invoke("spawn_mcp_and_stream_logs", { command, args }); }
    catch (err) { setMcpLogs(prev => [...prev, `>>> ERROR: ${err}`]); }
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

  const handleGlobalSearch = async (e?: React.FormEvent) => {
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

  const limitProgress = usageStats ? (usageStats.estimatedCostToday / dailyLimit) * 100 : 0;

  const nav = (mode: ViewMode, index?: number) => {
    setViewMode(mode);
    if (index !== undefined) setSelectedIndex(index);
    setSearchTerm("");
  };

  if (!dexData) return <div className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Initializing Dex...</div>;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">Insights</div>
        <div className={`sidebar-item ${viewMode === "dashboard" ? "active" : ""}`} onClick={() => nav("dashboard")}>
          <Activity size={15} /> Usage Dashboard
        </div>
        <div className={`sidebar-item ${viewMode === "costs" ? "active" : ""}`} onClick={() => nav("costs")}>
          <DollarSign size={15} /> AI Cost Center
        </div>
        <div className={`sidebar-item ${viewMode === "marketplace" ? "active" : ""}`} onClick={() => nav("marketplace")}>
          <Store size={15} /> MCP Marketplace
        </div>

        <div className="sidebar-header">Workspace</div>
        <div className={`sidebar-item ${viewMode === "memory" ? "active" : ""}`} onClick={() => nav("memory")}>
          <Brain size={15} /> Memory
        </div>

        <div className="sidebar-header">Core Tools</div>
        {dexData.tools.map((tool, index) => (
          <div key={tool.name} className={`sidebar-item ${viewMode === "tools" && index === selectedIndex ? "active" : ""}`} onClick={() => nav("tools", index)}>
            <Cpu size={15} /> {tool.name}
          </div>
        ))}

        <div className="sidebar-header">Skill Repositories</div>
        {dexData.repos.map((repo, index) => (
          <div key={repo.name} className={`sidebar-item ${viewMode === "repos" && index === selectedIndex ? "active" : ""}`} onClick={() => nav("repos", index)}>
            <Layers size={15} /> {repo.name}
          </div>
        ))}
        <div className={`sidebar-item sidebar-item-add ${viewMode === "add_repo" ? "active" : ""}`} onClick={() => nav("add_repo")}>
          <Plus size={15} /> Add Repository
        </div>

        <div className="sidebar-header">Create</div>
        <div className={`sidebar-item sidebar-item-add ${viewMode === "create_skill" ? "active" : ""}`} onClick={() => nav("create_skill")}>
          <Target size={15} /> Create Skill
        </div>

        <div className="sidebar-header">Discover</div>
        <div className={`sidebar-item ${viewMode === "global_search" ? "active" : ""}`} onClick={() => nav("global_search")}>
          <Search size={15} /> Find Skills
        </div>
      </aside>

      <main className="main-content">
        <header className="search-bar-container">
          <input
            className="search-input"
            placeholder="Search..."
            value={viewMode === "global_search" ? globalQuery : searchTerm}
            onChange={(e) => viewMode === "global_search" ? setGlobalQuery(e.target.value) : setSearchTerm(e.target.value)}
            onKeyDown={(e) => viewMode === "global_search" && e.key === "Enter" && handleGlobalSearch()}
            disabled={viewMode === "add_repo"}
            autoFocus
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
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 10}} minTickGap={30} />
                      <Tooltip contentStyle={{ background: '#1a1a20', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }} />
                      <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" animationDuration={1200} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-container chart-container-tall">
                  <h3 className="section-title">Peak Distribution</h3>
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={usageStats.hourlyActivity.map((count, hour) => ({ hour: `${hour}h`, count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 9}} interval={3} />
                      <Tooltip contentStyle={{ background: '#1a1a20', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }} cursor={{fill: 'rgba(255,255,255,0.03)'}} />
                      <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-container">
                <h3 className="section-title" style={{ marginBottom: "18px" }}>Common Sequences</h3>
                <div className="sequence-list">
                  {usageStats.commonSequences.map((seq, i) => {
                    const max = Math.max(...usageStats.commonSequences.map(s => s.count), 1);
                    const percentage = (seq.count / max) * 100;
                    return (
                      <div key={i} className="sequence-item">
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
                    <BarChart layout="vertical" data={Object.entries(usageStats.modelUsageStats).map(([name, stats]) => ({ name, cost: stats.estimatedCost })).sort((a,b) => b.cost - a.cost)}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-main)', fontSize: 11}} width={140} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a20', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                        formatter={(value: unknown) => [`$${Number(value).toFixed(3)}`, 'Cost']}
                      />
                      <Bar dataKey="cost" fill="var(--accent)" radius={[0, 4, 4, 0]}>
                        {Object.entries(usageStats.modelUsageStats).map((_, index) => (
                          <Cell key={`cell-${index}`} fillOpacity={1 - (index * 0.15)} />
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
                      <div className="billing-value">
                        {(() => {
                          const now = new Date();
                          const start = new Date(now.getFullYear(), now.getMonth(), 23);
                          if (now.getDate() < 23) start.setMonth(start.getMonth() - 1);
                          const end = new Date(start);
                          end.setMonth(end.getMonth() + 1);
                          return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                        })()}
                      </div>
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
                  <p className="page-subtitle">{memories.reduce((acc, m) => acc + m.lineCount, 0)} lines of context across {memories.length} projects.</p>
                </div>
              </div>

              <div className="memory-list">
                {memories.map((mem, i) => (
                  <div key={i} className="memory-card">
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
                        {mem.contentPreview.map((line, li) => (
                          <div key={li} className={`memory-line ${line.startsWith('#') ? 'memory-line-heading' : line.startsWith('-') ? 'memory-line-item' : 'memory-line-dim'}`}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {viewMode === "marketplace" && (
            <section className="dashboard-view">
              <h2 className="page-title">Marketplace</h2>
              <div className="skills-grid" style={{ marginTop: "20px" }}>
                {marketplaceServers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(server => (
                  <div key={server.name} className="skill-card">
                    <span className="skill-category">{server.category}</span>
                    <h3 className="skill-name">{server.name}</h3>
                    <p className="skill-desc">{server.description}</p>
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
            <section className="dashboard-view">
              <div className="page-header">
                <div>
                  <h2 className="page-title">{currentTool.name}</h2>
                  <p className="page-subtitle">
                    {currentTool.skills.length} skill{currentTool.skills.length !== 1 ? "s" : ""}
                    {currentTool.mcpServers ? ` · ${Object.keys(currentTool.mcpServers).length} MCP server${Object.keys(currentTool.mcpServers).length !== 1 ? "s" : ""}` : ""}
                  </p>
                </div>
              </div>

              {currentTool.skills.length > 0 ? (
                <>
                  <h3 className="section-title">Installed Skills</h3>
                  <div className="skills-grid" style={{ marginBottom: "28px" }}>
                    {currentTool.skills.map(s => (
                      <div key={s.name} className="skill-card">
                        <div className="skill-name">{s.name}</div>
                        {s.description && <p className="skill-desc">{s.description}</p>}
                        <button className="mcp-action-btn mcp-action-btn-danger" style={{ marginTop: "10px" }} onClick={() => handleUninstallSkill(s.name)}>
                          <Trash2 size={11} /> Uninstall
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : !currentTool.configPath ? (
                <div className="empty-state">
                  <Package size={40} strokeWidth={1} />
                  <p>No skills installed for {currentTool.name}.</p>
                  <button className="btn-modern btn-accent" onClick={() => nav("global_search")}>Find Skills</button>
                </div>
              ) : null}

              {currentTool.configPath && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 className="section-title" style={{ marginBottom: 0 }}>MCP Servers</h3>
                    <div className="editor-toggle">
                      <button onClick={() => setEditorMode("form")} className={`editor-toggle-btn ${editorMode === "form" ? "active" : ""}`}>Form</button>
                      <button onClick={() => setEditorMode("code")} className={`editor-toggle-btn ${editorMode === "code" ? "active" : ""}`}>JSON</button>
                    </div>
                  </div>
                  {editorMode === "form" && (
                    <>
                      <div className="form-container form-container-dashed">
                        <div className="form-grid-mcp-2">
                          <input className="repo-input repo-input-inline" placeholder="Name" value={newMcpName} onChange={e => setNewMcpName(e.target.value)} />
                          <input className="repo-input repo-input-inline" placeholder="Command (npx, uvx, ...)" value={newMcpCommand} onChange={e => setNewMcpCommand(e.target.value)} />
                          <input className="repo-input repo-input-inline" placeholder="Args (space separated)" value={newMcpArgs} onChange={e => setNewMcpArgs(e.target.value)} />
                          <input className="repo-input repo-input-inline" placeholder="Env (KEY=val, KEY2=val2)" value={newMcpEnv} onChange={e => setNewMcpEnv(e.target.value)} />
                          <button className="btn-modern" disabled={isAddingMcp} onClick={() => handleAddMcp()}>Add</button>
                        </div>
                      </div>
                      <div className="mcp-container">
                        <table className="mcp-table">
                          <thead>
                            <tr><th>Server</th><th>Command</th><th style={{ textAlign: "right" }}>Actions</th></tr>
                          </thead>
                          <tbody>
                            {filteredMcp.map(([name, config]) => (
                              <tr key={name}>
                                <td>{name}</td>
                                <td><code>{config.command}</code></td>
                                <td>
                                  <div className="mcp-actions">
                                    <button onClick={() => handleTestMcp(name, config.command, config.args)} className="mcp-action-btn"><Zap size={12} /> Test</button>
                                    <button onClick={() => handleDebugMcp(name, config.command, config.args)} className="mcp-action-btn"><Play size={12} /> Debug</button>
                                    <button onClick={() => handleSyncMcp(name, config)} className="mcp-action-btn"><Copy size={12} /> Sync</button>
                                    <button onClick={() => handleDeleteMcp(name)} className="mcp-action-btn mcp-action-btn-danger"><Trash2 size={12} /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {(isDebugging || Object.keys(diagnostics).length > 0) && (
                        <div className="debug-panel">
                          <div className="debug-panel-header">
                            <div className="debug-panel-label">
                              <TerminalIcon size={14} /> {isDebugging ? `Logs: ${isDebugging}` : "Diagnostics"}
                            </div>
                            <button className="debug-close-btn" onClick={() => { setIsDebugging(null); setDiagnostics({}); setMcpLogs([]); }}>Close</button>
                          </div>
                          <div className="debug-panel-body">
                            {isDebugging
                              ? mcpLogs.map((log, i) => <div key={i}>{log}</div>)
                              : Object.entries(diagnostics).map(([n, d]) => (
                                  <div key={n} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                    {d.success ? <CheckCircle2 size={12} color="var(--success)" /> : <XCircle size={12} color="var(--danger)" />}
                                    <span>{n}: {d.message}</span>
                                  </div>
                                ))
                            }
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {editorMode === "code" && (
                    <div>
                      <div className="editor-wrapper">
                        <textarea className="config-editor" value={editingContent} onChange={(e) => setEditingContent(e.target.value)} />
                      </div>
                      <div className="footer-actions">
                        <button className="btn-modern" onClick={handleSave}>Save</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
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
            <div className={`status-dot ${limitProgress > 90 ? 'alert' : 'active'}`} />
            <span className="status-label">SYSTEM READY</span>
          </div>
          <div className="budget-section">
            <span className="budget-label">DAILY BUDGET</span>
            <div className="budget-bar-track">
              <div
                className={`budget-bar-fill ${limitProgress > 90 ? 'budget-bar-fill-danger' : limitProgress > 70 ? 'budget-bar-fill-warn' : 'budget-bar-fill-safe'}`}
                style={{ width: `${Math.min(limitProgress, 100)}%` }}
              />
            </div>
            <span className="budget-amount">${usageStats?.estimatedCostToday.toFixed(2)} / ${dailyLimit.toFixed(0)}</span>
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
