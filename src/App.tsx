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
  Bar
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
  ChevronRight
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
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [editorMode, setEditorMode] = useState<"code" | "form">("form");

  const [mcpLogs, setMcpLogs] = useState<string[]>([]);
  const [isDebugging, setIsDebugging] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, DiagnosticResult>>({});

  const [dailyLimit] = useState(10.0);

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
    } catch (err: any) { alert(`JSON Error: ${err.message || err}`); }
  };

  const handleAddMcp = async (name?: string, cmd?: string, args?: string[]) => {
    const finalName = name || newMcpName;
    const finalCmd = cmd || newMcpCommand;
    const finalArgs = args || (newMcpArgs ? newMcpArgs.split(" ") : []);
    if (!currentTool || !currentTool.configPath || !finalName || !finalCmd) return;
    setIsAddingMcp(true);
    try {
      const config = JSON.parse(editingContent || "{}");
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers[finalName] = { command: finalCmd, args: finalArgs };
      const updatedContent = JSON.stringify(config, null, 2);
      await invoke("save_config", { path: currentTool.configPath, content: updatedContent });
      setNewMcpName(""); setNewMcpCommand(""); setNewMcpArgs(""); setEditingContent(updatedContent);
      fetchData();
    } catch (err: any) { console.error(`Failed: ${err}`); }
    finally { setIsAddingMcp(false); }
  };

  const handleTestMcp = async (name: string, command: string, args: string[]) => {
    try {
      const result: DiagnosticResult = await invoke("test_mcp_connection", { command, args });
      setDiagnostics(prev => ({ ...prev, [name]: result }));
    } catch (err: any) { console.error(`Connection failed: ${err}`); }
  };

  const handleDebugMcp = async (name: string, command: string, args: string[]) => {
    setIsDebugging(name); setMcpLogs([`>>> Debugging ${name}...`, `>>> Command: ${command} ${args.join(" ")}`]);
    try { await invoke("spawn_mcp_and_stream_logs", { command, args }); }
    catch (err: any) { setMcpLogs(prev => [...prev, `>>> ERROR: ${err}`]); }
  };

  const handleInstallMarketplace = async (server: MarketplaceServer) => {
    const tool = currentTool || dexData?.tools[0];
    if (!tool || !tool.configPath) return;
    if (!currentTool) { setViewMode("tools"); setSelectedIndex(0); }
    await handleAddMcp(server.name, server.command, server.args);
  };

  const handleAddRepo = async () => {
    if (!repoUrl) return;
    setIsCloning(true);
    try {
      await invoke("add_repo", { url: repoUrl });
      setRepoUrl(""); await fetchData();
      setViewMode("repos"); setSelectedIndex(dexData ? dexData.repos.length : 0);
    } catch (err: any) { console.error(`Failed: ${err}`); }
    finally { setIsCloning(false); }
  };

  const handleCreateSkill = async () => {
    if (!skillName) return;
    setIsCreatingSkill(true);
    try {
      await invoke("create_skill", { name: skillName, description: skillDesc, isClaude: isClaudeSkill });
      setSkillName(""); setSkillDesc(""); await fetchData();
    } catch (err: any) { console.error(`Failed: ${err}`); }
    finally { setIsCreatingSkill(false); }
  };

  const handleGlobalSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault(); if (!globalQuery.trim()) return;
    try {
      const results: GlobalSkillSearchResult[] = await invoke("search_global_skills", { query: globalQuery });
      setSearchResults(results);
    } catch (err: any) { console.error(`Search failed: ${err}`); }
  };

  const handleInstallSkill = async (id: string) => {
    try { await invoke("install_global_skill", { package: id }); await fetchData(); }
    catch (err: any) { console.error(`Failed: ${err}`); }
  };

  const limitProgress = usageStats ? (usageStats.estimatedCostToday / dailyLimit) * 100 : 0;

  if (!dexData) return <div className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>Initializing Dex...</div>;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">Insights</div>
        <div className={`sidebar-item ${viewMode === "dashboard" ? "active" : ""}`} onClick={() => { setViewMode("dashboard"); setSearchTerm(""); }}><Activity size={16} /> Usage Dashboard</div>
        <div className={`sidebar-item ${viewMode === "costs" ? "active" : ""}`} onClick={() => { setViewMode("costs"); setSearchTerm(""); }}><DollarSign size={16} /> AI Cost Center</div>
        <div className={`sidebar-item ${viewMode === "marketplace" ? "active" : ""}`} onClick={() => { setViewMode("marketplace"); setSearchTerm(""); }}><Store size={16} /> MCP Marketplace</div>
        
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Workspace</div>
        <div className={`sidebar-item ${viewMode === "memory" ? "active" : ""}`} onClick={() => { setViewMode("memory"); setSearchTerm(""); }}>
          <Brain size={16} /> Memory
        </div>

        <div className="sidebar-header" style={{ marginTop: "20px" }}>Core Tools</div>
        {dexData.tools.map((tool, index) => (
          <div key={tool.name} className={`sidebar-item ${viewMode === "tools" && index === selectedIndex ? "active" : ""}`} onClick={() => { setViewMode("tools"); setSelectedIndex(index); setSearchTerm(""); }}><Cpu size={16} /> {tool.name}</div>
        ))}
        
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Skill Repositories</div>
        {dexData.repos.map((repo, index) => (
          <div key={repo.name} className={`sidebar-item ${viewMode === "repos" && index === selectedIndex ? "active" : ""}`} onClick={() => { setViewMode("repos"); setSelectedIndex(index); setSearchTerm(""); }}><Layers size={16} /> {repo.name}</div>
        ))}
        <div className={`sidebar-item sidebar-item-add ${viewMode === "add_repo" ? "active" : ""}`} onClick={() => { setViewMode("add_repo"); setSearchTerm(""); }}><Plus size={16} /> Add Repository</div>
        
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Create</div>
        <div className={`sidebar-item sidebar-item-add ${viewMode === "create_skill" ? "active" : ""}`} onClick={() => { setViewMode("create_skill"); setSearchTerm(""); }}><Target size={16} /> Create Skill</div>
        
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Discover</div>
        <div className={`sidebar-item ${viewMode === "global_search" ? "active" : ""}`} onClick={() => { setViewMode("global_search"); setSearchTerm(""); }}><Search size={16} /> Find Skills</div>
      </aside>

      <main className="main-content">
        <header className="search-bar-container">
          <input className="search-input" placeholder="Search..." value={viewMode === "global_search" ? globalQuery : searchTerm} onChange={(e) => viewMode === "global_search" ? setGlobalQuery(e.target.value) : setSearchTerm(e.target.value)} onKeyDown={(e) => viewMode === "global_search" && e.key === "Enter" && handleGlobalSearch()} disabled={viewMode === "add_repo"} autoFocus />
          {currentTool?.schemaContent && viewMode === "tools" && <span className="badge-pill">Schema Verified</span>}
        </header>

        <div className="content-scroll">
          {viewMode === "dashboard" && usageStats && (
            <section className="dashboard-view">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px" }}>
                <div><h2 style={{ fontSize: "28px", fontWeight: 800 }}>AI Insights</h2><p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Performance overview.</p></div>
                <div style={{ display: "flex", gap: "8px", background: "var(--bg-card)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  {(["7d", "30d", "all"] as const).map(range => (
                    <button key={range} onClick={() => setTimeRange(range)} className={`mcp-action-btn ${timeRange === range ? "sync" : ""}`} style={{ padding: "6px 12px" }}>{range.toUpperCase()}</button>
                  ))}
                  <button className="mcp-action-btn test" onClick={fetchData}><RefreshCw size={14} /></button>
                </div>
              </div>
              <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "32px" }}>
                <div className="stat-card"><div><span className="stat-label">Total Skills</span><Layers size={14} color="var(--accent)" /></div><span className="stat-value">{usageStats.totalSkills}</span></div>
                <div className="stat-card"><div><span className="stat-label">Avg Prompt</span><MessageSquare size={14} color="var(--accent)" /></div><span className="stat-value" style={{ fontSize: "28px" }}>{usageStats.avgPromptLength}</span></div>
                <div className="stat-card"><div><span className="stat-label">Commands</span><TerminalIcon size={14} color="var(--accent)" /></div><span className="stat-value">{(usageStats.commandRatio * 100).toFixed(0)}%</span></div>
                <div className="stat-card"><div><span className="stat-label">Requests</span><Zap size={14} color="var(--accent)" /></div><span className="stat-value">{totalRequestsInRange}</span></div>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "24px", marginBottom: "24px" }}>
                <div className="chart-container" style={{ height: "350px" }}><h3 className="section-title">Intensity</h3><ResponsiveContainer width="100%" height="85%"><AreaChart data={filteredActivity}><defs><linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 10}} minTickGap={30} /><Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px' }} /><Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" animationDuration={1500} /></AreaChart></ResponsiveContainer></div>
                <div className="chart-container" style={{ height: "350px" }}><h3 className="section-title">Peak Distribution</h3><ResponsiveContainer width="100%" height="85%"><BarChart data={usageStats.hourlyActivity.map((count, hour) => ({ hour: `${hour}h`, count }))}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 9}} interval={3} /><Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} /><Bar dataKey="count" fill="var(--accent)" radius={[2, 2, 0, 0]} opacity={0.8} /></BarChart></ResponsiveContainer></div>
              </div>

              {/* Tool Sequences from screenshot */}
              <div className="chart-container">
                <h3 className="section-title" style={{ marginBottom: "20px" }}>Common Sequences</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {usageStats.commonSequences.map((seq, i) => {
                    const max = Math.max(...usageStats.commonSequences.map(s => s.count), 1);
                    const percentage = (seq.count / max) * 100;
                    return (
                      <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                          <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{seq.sequence}</span>
                          <span style={{ color: "var(--text-muted)" }}>{seq.count}</span>
                        </div>
                        <div style={{ height: "12px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${percentage}%`, background: "var(--accent)", borderRadius: "4px", opacity: 0.8 }} />
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
              <div style={{ marginBottom: "32px" }}>
                <h2 style={{ fontSize: "28px", fontWeight: 800 }}>AI Cost Center</h2>
                <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Real-time estimated spend across all agents.</p>
              </div>
              <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "32px" }}>
                <div className="stat-card"><div><span className="stat-label">Today</span><Clock size={14} color="var(--accent)" /></div><span className="stat-value">${usageStats.estimatedCostToday.toFixed(2)}</span></div>
                <div className="stat-card"><div><span className="stat-label">This Week</span><TrendingUp size={14} color="var(--accent)" /></div><span className="stat-value">${usageStats.estimatedCostWeek.toFixed(2)}</span></div>
                <div className="stat-card"><div><span className="stat-label">Projected Month</span><TrendingUp size={14} color="var(--accent)" /></div><span className="stat-value">${(usageStats.estimatedCostToday * 30).toFixed(2)}</span></div>
                <div className="stat-card"><div><span className="stat-label">All Time</span><History size={14} color="var(--accent)" /></div><span className="stat-value">${usageStats.estimatedCostAll_time.toFixed(2)}</span></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "24px" }}>
                <div className="chart-container"><h3 className="section-title">Cost by Model</h3><div style={{ height: "300px", marginTop: "20px" }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={Object.entries(usageStats.modelUsageStats).map(([name, stats]) => ({ name, cost: stats.estimatedCost }))}><XAxis type="number" hide /><YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: 'var(--text-main)', fontSize: 12}} width={120} /><Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} /><Bar dataKey="cost" fill="var(--accent)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></div>
                <div className="chart-container"><div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}><Lightbulb size={18} color="var(--accent)" /><h3 className="section-title" style={{ margin: 0 }}>Optimization</h3></div><div style={{ display: "flex", flexDirection: "column", gap: "12px" }}><div className="project-item" style={{ padding: "16px" }}><div style={{ fontSize: "13px", fontWeight: 600 }}>Mix in Sonnet</div><div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Save up to $12/mo by using Sonnet for simple tasks.</div></div></div></div>
              </div>
            </section>
          )}

          {viewMode === "memory" && (
            <section className="dashboard-view">
              <div style={{ marginBottom: "32px" }}>
                <h2 style={{ fontSize: "28px", fontWeight: 800 }}>Memory</h2>
                <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>{memories.reduce((acc, m) => acc + m.lineCount, 0)} lines of context across {memories.length} projects.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {memories.map((mem, i) => (
                  <div key={i} className="chart-container" style={{ padding: "0", overflow: "hidden" }}>
                    <div style={{ 
                      background: "rgba(255,255,255,0.02)", 
                      padding: "16px 24px", 
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>{mem.projectName}</span>
                          <ChevronRight size={14} color="var(--text-muted)" />
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{mem.lineCount} lines · {mem.path}</div>
                      </div>
                    </div>
                    <div style={{ padding: "20px 24px" }}>
                      <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "12px" }}>Project Memory</h4>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#ccc", lineHeight: "1.6" }}>
                        {mem.contentPreview.map((line, li) => (
                          <div key={li} style={{ 
                            whiteSpace: "pre-wrap",
                            marginBottom: line.startsWith('#') ? "8px" : "2px",
                            color: line.startsWith('#') ? "var(--text-main)" : line.startsWith('-') ? "#eee" : "#888",
                            fontWeight: line.startsWith('#') ? 700 : 400
                          }}>{line}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {viewMode === "marketplace" && (
            <section>
              <h2 style={{ fontSize: "28px", fontWeight: 800 }}>Marketplace</h2>
              <div className="skills-grid" style={{ marginTop: "24px" }}>
                {marketplaceServers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(server => (
                  <div key={server.name} className="skill-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '10px' }}>{server.category}</span></div>
                    <h3 style={{ fontSize: '16px', margin: '8px 0' }}>{server.name}</h3>
                    <p className="skill-desc">{server.description}</p>
                    <button className="btn-modern" style={{ background: 'var(--accent)', color: '#000', width: '100%', marginTop: '16px' }} onClick={() => handleInstallMarketplace(server)}>Add to Tools</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {viewMode === "global_search" && (
            <section>
              <h2 style={{ fontSize: "20px" }}>Discover</h2>
              <div className="skills-grid" style={{ marginTop: "24px" }}>
                {searchResults.map(skill => (
                  <div key={skill.id} className="skill-card">
                    <div className="skill-name">{skill.id}</div>
                    <button className="btn-modern" style={{ width: "100%", marginTop: "12px", background: "var(--accent)", color: "#000" }} onClick={() => handleInstallSkill(skill.id)}>Install</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {viewMode === "tools" && currentTool?.configPath && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 className="section-title">MCP Servers</h3>
                <div style={{ display: "flex", background: "var(--bg-card)", borderRadius: "4px", padding: "2px" }}>
                  <button onClick={() => setEditorMode("form")} style={{ background: editorMode === "form" ? "var(--bg-active)" : "transparent", border: "none", color: "var(--text-main)", padding: "4px 12px", fontSize: "11px", borderRadius: "3px" }}>Form</button>
                  <button onClick={() => setEditorMode("code")} style={{ background: editorMode === "code" ? "var(--bg-active)" : "transparent", border: "none", color: "var(--text-main)", padding: "4px 12px", fontSize: "11px", borderRadius: "3px" }}>JSON</button>
                </div>
              </div>
              {editorMode === "form" && (
                <>
                  <div className="repo-form-container" style={{ background: "rgba(255,255,255,0.02)", borderStyle: "dashed" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: "10px", alignItems: "end" }}>
                      <input className="repo-input" style={{ margin: 0 }} placeholder="Name" value={newMcpName} onChange={e => setNewMcpName(e.target.value)} />
                      <input className="repo-input" style={{ margin: 0 }} placeholder="Command" value={newMcpCommand} onChange={e => setNewMcpCommand(e.target.value)} />
                      <input className="repo-input" style={{ margin: 0 }} placeholder="Args" value={newMcpArgs} onChange={e => setNewMcpArgs(e.target.value)} />
                      <button className="btn-modern" disabled={isAddingMcp} onClick={() => handleAddMcp()}>Add</button>
                    </div>
                  </div>
                  <div className="mcp-container"><table className="mcp-table"><thead><tr><th>Server</th><th>Command</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead><tbody>
                    {filteredMcp.map(([name, config]) => (
                      <tr key={name}><td>{name}</td><td><code>{config.command}</code></td><td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <button onClick={() => handleTestMcp(name, config.command, config.args)} className="mcp-action-btn test"><Zap size={12} /></button>
                          <button onClick={() => handleDebugMcp(name, config.command, config.args)} className="mcp-action-btn test"><Play size={12} /></button>
                        </div>
                      </td></tr>
                    ))}
                  </tbody></table></div>
                  {(isDebugging || Object.keys(diagnostics).length > 0) && (
                    <div className="chart-container" style={{ background: '#000', border: '1px solid var(--accent)', padding: '0' }}>
                      <div style={{ background: 'var(--bg-card)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--accent)' }}><TerminalIcon size={14} /> {isDebugging ? `Logs: ${isDebugging}` : "Diagnostics"}</div>
                        <button onClick={() => { setIsDebugging(null); setDiagnostics({}); setMcpLogs([]); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>Close</button>
                      </div>
                      <div style={{ padding: '16px', maxHeight: '250px', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {isDebugging ? mcpLogs.map((log, i) => <div key={i}>{log}</div>) : Object.entries(diagnostics).map(([n, d]) => <div key={n}>{d.success ? <CheckCircle2 size={12}/> : <XCircle size={12}/>} {n}: {d.message}</div>)}
                      </div>
                    </div>
                  )}
                </>
              )}
              {editorMode === "code" && (
                <div>
                  <div className="editor-wrapper"><textarea className="config-editor" value={editingContent} onChange={(e) => setEditingContent(e.target.value)} /></div>
                  <div className="footer-actions"><button className="btn-modern" onClick={handleSave}>Save</button></div>
                </div>
              )}
            </section>
          )}

          {viewMode === "add_repo" && (
            <section><h3 className="section-title">Add Repo</h3><div className="repo-form-container">
              <input type="text" className="repo-input" placeholder="URL" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} />
              <button className="btn-modern" onClick={handleAddRepo} disabled={isCloning}>Clone</button>
            </div></section>
          )}

          {viewMode === "create_skill" && (
            <section><h3 className="section-title">Create Skill</h3><div className="repo-form-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" className="repo-input" placeholder="Name" value={skillName} onChange={e => setSkillName(e.target.value)} />
              <textarea className="repo-input" placeholder="Desc" value={skillDesc} onChange={e => setSkillDesc(e.target.value)} />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-main)" }}>
                <input type="checkbox" checked={isClaudeSkill} onChange={e => setIsClaudeSkill(e.target.checked)} />
                For Claude Code (~/.claude/skills)
              </label>
              <button className="btn-modern" onClick={handleCreateSkill} disabled={isCreatingSkill}>Scaffold</button>
            </div></section>
          )}

          {viewMode === "repos" && currentRepo && (
            <section><h2>{currentRepo.name}</h2><div className="skills-grid" style={{ marginTop: '24px' }}>
              {currentRepo.skills.map(s => <div key={s.name} className="skill-card"><div className="skill-name">{s.name}</div><div className="skill-desc">{s.description}</div></div>)}
            </div></section>
          )}
          <div style={{ height: "40px" }} />
        </div>
      </main>

      <footer className="status-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "20px", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className={`status-dot ${limitProgress > 90 ? 'alert' : 'active'}`} />
            <span style={{ fontSize: "11px", fontWeight: 700 }}>SYSTEM READY</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, maxWidth: "400px" }}>
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>DAILY BUDGET</span>
            <div style={{ height: "6px", flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(limitProgress, 100)}%`, background: limitProgress > 90 ? "#ff4d4d" : limitProgress > 70 ? "#fbbf24" : "var(--accent)", transition: "width 1s ease" }} />
            </div>
            <span style={{ fontSize: "10px", fontWeight: 700 }}>${usageStats?.estimatedCostToday.toFixed(2)} / ${dailyLimit.toFixed(0)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginLeft: "auto" }}>
            {limitProgress > 80 && <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#fbbf24" }}><ShieldAlert size={14} /><span style={{ fontSize: "10px", fontWeight: 700 }}>BUDGET WARNING</span></div>}
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>v0.1.0-alpha</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
