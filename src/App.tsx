import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { 
  DexData, 
  UsageStats, 
  ViewMode, 
  GlobalSkillSearchResult, 
  McpServerConfig,
  ProjectActivity
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
  History,
  MessageSquare,
  Terminal,
  Zap,
  Clock
} from "lucide-react";

function App() {
  const [dexData, setDexData] = useState<DexData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  
  // Navigation State
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("30d");
  
  // Editor State
  const [editingContent, setEditingContent] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Add Repo State
  const [repoUrl, setRepoUrl] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Global Search State
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSkillSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);

  // Create Skill State
  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [isClaudeSkill, setIsClaudeSkill] = useState(false);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);

  // MCP Server State
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [editorMode, setEditorMode] = useState<"code" | "form">("form");

  const fetchData = async () => {
    try {
      const data: DexData = await invoke("get_dex_data");
      setDexData(data);
      const usage: UsageStats = await invoke("get_usage_stats");
      setUsageStats(usage);
    } catch (err) {
      setError(`Connection Error: ${err}`);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (viewMode === "tools" && dexData?.tools[selectedIndex]) {
      setEditingContent(dexData.tools[selectedIndex].configContent || "");
      setStatus("");
      setError("");
    }
  }, [selectedIndex, viewMode, dexData]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && viewMode === "tools") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingContent, selectedIndex, viewMode, dexData]);

  const currentTool = viewMode === "tools" ? dexData?.tools[selectedIndex] : null;
  const currentRepo = viewMode === "repos" ? dexData?.repos[selectedIndex] : null;

  const currentSkills = currentTool ? currentTool.skills : currentRepo ? currentRepo.skills : [];

  const filteredSkills = useMemo(() => {
    if (!currentSkills) return [];
    return currentSkills.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (s.description?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [currentSkills, searchTerm]);

  const filteredMcp = useMemo(() => {
    if (!currentTool?.mcpServers) return [];
    return Object.entries(currentTool.mcpServers).filter(([name]) => 
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [currentTool, searchTerm]);

  // Filtered Daily Activity based on timeRange
  const filteredActivity = useMemo(() => {
    if (!usageStats) return [];
    const data = usageStats.dailyActivity;
    if (timeRange === "7d") return data.slice(-7);
    if (timeRange === "30d") return data.slice(-30);
    return data;
  }, [usageStats, timeRange]);

  const totalRequestsInRange = useMemo(() => {
    return filteredActivity.reduce((acc, curr) => acc + curr.count, 0);
  }, [filteredActivity]);

  const handleSave = async () => {
    if (!currentTool || !currentTool.configPath) return;

    try {
      JSON.parse(editingContent);
      await invoke("save_config", {
        path: currentTool.configPath,
        content: editingContent,
      });
      setStatus("Config saved successfully");
      setTimeout(() => setStatus(""), 3000);
      fetchData();
    } catch (err: any) {
      setError(`JSON Error: ${err.message || err}`);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard");
    setTimeout(() => setStatus(""), 2000);
  };

  const handleAddRepo = async () => {
    if (!repoUrl) return;
    setIsCloning(true);
    setStatus("Cloning repository...");
    setError("");
    try {
      await invoke("add_repo", { url: repoUrl });
      setStatus("Repository added successfully!");
      setRepoUrl("");
      await fetchData();
      setViewMode("repos");
      setSelectedIndex(dexData ? dexData.repos.length : 0);
    } catch (err: any) {
      setError(`Failed to clone: ${err}`);
    } finally {
      setIsCloning(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleCreateSkill = async () => {
    if (!skillName) return;
    setIsCreatingSkill(true);
    setStatus("Creating skill scaffold...");
    setError("");
    try {
      await invoke("create_skill", { name: skillName, description: skillDesc, isClaude: isClaudeSkill });
      setStatus(`Skill ${skillName} created successfully!`);
      setSkillName("");
      setSkillDesc("");
      await fetchData(); // Refresh to show the new skill
    } catch (err: any) {
      setError(`Failed to create skill: ${err}`);
    } finally {
      setIsCreatingSkill(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleSyncRepo = async (name: string) => {
    setIsSyncing(true);
    setStatus("Syncing repository...");
    setError("");
    try {
      await invoke("sync_repo", { name });
      setStatus("Repository synced successfully!");
      await fetchData();
    } catch (err: any) {
      setError(`Failed to sync: ${err}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleGlobalSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!globalQuery.trim()) return;
    
    setIsSearching(true);
    setError("");
    setSearchResults([]);
    
    try {
      const results: GlobalSkillSearchResult[] = await invoke("search_global_skills", { query: globalQuery });
      setSearchResults(results);
      if (results.length === 0) {
        setStatus("No skills found.");
      } else {
        setStatus("");
      }
    } catch (err: any) {
      setError(`Search failed: ${err}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInstallSkill = async (id: string) => {
    setInstallingSkill(id);
    setStatus(`Installing ${id}...`);
    setError("");
    try {
      await invoke("install_global_skill", { package: id });
      setStatus(`Successfully installed ${id}!`);
      await fetchData(); // Refresh local tools to show newly installed skill
    } catch (err: any) {
      setError(`Installation failed: ${err}`);
    } finally {
      setInstallingSkill(null);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const handleUninstallSkill = async (id: string) => {
    setStatus(`Uninstalling ${id}...`);
    setError("");
    try {
      await invoke("uninstall_global_skill", { package: id });
      setStatus(`Successfully uninstalled ${id}!`);
      await fetchData(); // Refresh local tools
    } catch (err: any) {
      setError(`Uninstallation failed: ${err}`);
    } finally {
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const handleTestMcp = async (command: string, args: string[]) => {
    setStatus(`Testing connection to ${command}...`);
    setError("");
    try {
      const result: string = await invoke("test_mcp_connection", { command, args });
      setStatus(`Success: ${result}`);
    } catch (err: any) {
      setError(`Connection failed: ${err}`);
    } finally {
      setTimeout(() => setStatus(""), 5000);
    }
  };

  const handleSyncMcpToAll = async (name: string, config: McpServerConfig) => {
    setStatus(`Syncing ${name} to all tools...`);
    setError("");
    try {
      const result: string = await invoke("sync_mcp_to_all_tools", { name, config });
      setStatus(result);
      await fetchData();
    } catch (err: any) {
      setError(`Sync failed: ${err}`);
    } finally {
      setTimeout(() => setStatus(""), 5000);
    }
  };

  const handleAddMcp = async () => {
    if (!currentTool || !currentTool.configPath || !newMcpName || !newMcpCommand) return;
    
    setIsAddingMcp(true);
    setStatus("Adding MCP server...");
    setError("");
    
    try {
      // 1. Parse current config
      const config = JSON.parse(editingContent || "{}");
      if (!config.mcpServers) config.mcpServers = {};
      
      // 2. Add new server
      config.mcpServers[newMcpName] = {
        command: newMcpCommand,
        args: newMcpArgs ? newMcpArgs.split(" ") : []
      };
      
      // 3. Save
      const updatedContent = JSON.stringify(config, null, 2);
      await invoke("save_config", {
        path: currentTool.configPath,
        content: updatedContent,
      });
      
      setNewMcpName("");
      setNewMcpCommand("");
      setNewMcpArgs("");
      setEditingContent(updatedContent);
      setStatus(`Added MCP server: ${newMcpName}`);
      await fetchData();
    } catch (err: any) {
      setError(`Failed to add MCP server: ${err}`);
    } finally {
      setIsAddingMcp(false);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  if (!dexData) return <div className="main-content" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>Initializing Dex...</div>;

  return (
    <div className="app-container">
      <aside className="sidebar">
        {/* Dashboard */}
        <div className="sidebar-header">Insights</div>
        <div 
          className={`sidebar-item ${viewMode === "dashboard" ? "active" : ""}`}
          onClick={() => { setViewMode("dashboard"); setSearchTerm(""); }}
        >
          <Activity size={16} />
          Usage Dashboard
        </div>

        {/* Core Tools */}
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Core Tools</div>
        {dexData.tools.map((tool, index) => (
          <div
            key={tool.name}
            className={`sidebar-item ${viewMode === "tools" && index === selectedIndex ? "active" : ""}`}
            onClick={() => { setViewMode("tools"); setSelectedIndex(index); setSearchTerm(""); }}
          >
            <Cpu size={16} />
            {tool.name}
          </div>
        ))}
        
        {/* Skill Repositories */}
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Skill Repositories</div>
        {dexData.repos.map((repo, index) => (
          <div
            key={repo.name}
            className={`sidebar-item ${viewMode === "repos" && index === selectedIndex ? "active" : ""}`}
            onClick={() => { setViewMode("repos"); setSelectedIndex(index); setSearchTerm(""); }}
          >
            <Layers size={16} />
            {repo.name}
          </div>
        ))}
        <div 
          className={`sidebar-item sidebar-item-add ${viewMode === "add_repo" ? "active" : ""}`}
          onClick={() => { setViewMode("add_repo"); setSearchTerm(""); setError(""); setStatus(""); }}
        >
          <Plus size={16} />
          Add Repository
        </div>

        <div className="sidebar-header" style={{ marginTop: "20px" }}>Create</div>
        <div 
          className={`sidebar-item sidebar-item-add ${viewMode === "create_skill" ? "active" : ""}`}
          onClick={() => { setViewMode("create_skill"); setSearchTerm(""); setError(""); setStatus(""); }}
          style={{ borderColor: "var(--text-main)", color: "var(--text-main)" }}
        >
          <Target size={16} />
          Create Skill
        </div>

        {/* Global Search */}
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Discover</div>
        <div 
          className={`sidebar-item ${viewMode === "global_search" ? "active" : ""}`}
          onClick={() => { setViewMode("global_search"); setSearchTerm(""); setError(""); setStatus(""); }}
        >
          <Search size={16} />
          Find Skills
        </div>

        <div style={{ marginTop: "auto", padding: "12px" }}>
          <div className="kb-hint">
            <span className="kb-key">⌘</span> <span className="kb-key">S</span> to Save Configs
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="search-bar-container">
          <input
            className="search-input"
            placeholder={
              viewMode === "dashboard" ? "Analyze your AI ecosystem..." :
              viewMode === "add_repo" ? "Adding new repository..." :
              viewMode === "global_search" ? "Search the open skills ecosystem..." :
              viewMode === "create_skill" ? "Scaffold a new skill..." :
              `Search ${currentTool?.name || currentRepo?.name || "Dex"}...`
            }
            value={viewMode === "global_search" ? globalQuery : searchTerm}
            onChange={(e) => {
              if (viewMode === "global_search") {
                setGlobalQuery(e.target.value);
              } else {
                setSearchTerm(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (viewMode === "global_search" && e.key === "Enter") {
                handleGlobalSearch();
              }
            }}
            disabled={viewMode === "add_repo"}
            autoFocus
          />
          {currentTool?.schemaContent && viewMode === "tools" && (
            <span className="badge-pill">Schema Verified</span>
          )}
        </header>

        <div className="content-scroll">

          {/* View: Dashboard */}
          {viewMode === "dashboard" && usageStats && (
            <section className="dashboard-view">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px" }}>
                <div>
                  <h2 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.02em" }}>AI Ecosystem Insights</h2>
                  <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Performance and activity overview across your local agents.</p>
                </div>
                
                <div style={{ display: "flex", gap: "8px", background: "var(--bg-card)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                  {(["7d", "30d", "all"] as const).map(range => (
                    <button 
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`mcp-action-btn ${timeRange === range ? "sync" : ""}`}
                      style={{ padding: "6px 12px", textTransform: "uppercase" }}
                    >
                      {range === "all" ? "All Time" : range}
                    </button>
                  ))}
                  <button className="mcp-action-btn test" onClick={fetchData} style={{ padding: "6px" }}><RefreshCw size={14} /></button>
                </div>
              </div>

              <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "32px" }}>
                <div className="stat-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="stat-label">Total Skills</span>
                    <Layers size={14} color="var(--accent)" />
                  </div>
                  <span className="stat-value">{usageStats.totalSkills}</span>
                </div>
                <div className="stat-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="stat-label">Avg Prompt</span>
                    <MessageSquare size={14} color="var(--accent)" />
                  </div>
                  <span className="stat-value" style={{ fontSize: "28px" }}>{usageStats.avgPromptLength}<span style={{fontSize: "12px", color: "var(--text-muted)", marginLeft: "4px"}}>chars</span></span>
                </div>
                <div className="stat-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="stat-label">Command Usage</span>
                    <Terminal size={14} color="var(--accent)" />
                  </div>
                  <span className="stat-value">{(usageStats.commandRatio * 100).toFixed(0)}%</span>
                </div>
                <div className="stat-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="stat-label">Requests</span>
                    <Zap size={14} color="var(--accent)" />
                  </div>
                  <span className="stat-value">{totalRequestsInRange}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "24px", marginBottom: "24px" }}>
                <div className="chart-container" style={{ height: "350px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 className="section-title" style={{ margin: 0 }}>Activity Intensity</h3>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><History size={12}/> {timeRange === "all" ? "Total History" : `Last ${timeRange}`}</div>
                  </div>
                  
                  <ResponsiveContainer width="100%" height="85%">
                    <AreaChart data={filteredActivity}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'var(--text-muted)', fontSize: 10}} 
                        minTickGap={30}
                      />
                      <YAxis 
                        hide={true} 
                        domain={['auto', 'auto']} 
                      />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: 'var(--accent)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="count" 
                        stroke="var(--accent)" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorCount)" 
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-container" style={{ height: "350px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 className="section-title" style={{ margin: 0 }}>Productivity Peak</h3>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><Clock size={12}/> Hourly Distribution</div>
                  </div>
                  
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={usageStats.hourlyActivity.map((count, hour) => ({ hour: `${hour}h`, count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="hour" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: 'var(--text-muted)', fontSize: 9}} 
                        interval={3}
                      />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px' }}
                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="var(--accent)" 
                        radius={[2, 2, 0, 0]}
                        opacity={0.8}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                <div className="chart-container">
                  <h3 className="section-title" style={{ marginTop: 0 }}>Tool Distribution</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "20px" }}>
                    {Object.entries(usageStats.skillDistribution).map(([name, count]) => {
                      const max = Math.max(...Object.values(usageStats.skillDistribution), 1);
                      const percentage = (count / max) * 100;
                      return (
                        <div key={name} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                            <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{name}</span>
                            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{count}</span>
                          </div>
                          <div style={{ height: "8px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div style={{ height: "100%", width: `${percentage}%`, background: "var(--accent)", borderRadius: "10px", transition: "width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="chart-container">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 className="section-title" style={{ margin: 0 }}>Top Active Projects</h3>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Interaction Volume</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {usageStats.topProjects.map((proj: ProjectActivity, i: number) => (
                      <div key={proj.name} className="project-item" style={{ border: "1px solid transparent", transition: "all 0.2s" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "var(--accent-glow)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800 }}>
                            {i + 1}
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>{proj.name}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--text-main)" }}>{proj.count}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "4px" }}>reqs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* View: Global Search */}
          {viewMode === "global_search" && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px" }}>Discover Skills</h2>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "4px" }}>
                    Search across the <a href="https://skills.sh" target="_blank" style={{ color: "var(--accent)", textDecoration: "none" }}>skills.sh</a> registry
                  </div>
                </div>
                <button
                  className="btn-modern"
                  onClick={handleGlobalSearch}
                  disabled={isSearching || !globalQuery.trim()}
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </div>

              {status && <div className="status-msg" style={{ marginBottom: "16px" }}>{status}</div>}
              {error && <div className="error-msg" style={{ marginBottom: "16px" }}>{error}</div>}

              {searchResults.length > 0 && (
                <div className="skills-grid">
                  {searchResults.map((skill) => (
                    <div key={skill.id} className="skill-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div className="skill-header">
                          <span className="skill-name" style={{ wordBreak: 'break-all' }}>{skill.id}</span>
                        </div>
                        <div className="skill-desc" style={{ marginBottom: '12px' }}>
                          <span style={{ color: "var(--accent)", fontWeight: "bold" }}>{skill.installs}</span> installs
                          <br />
                          <a href={skill.url} target="_blank" style={{ color: "var(--text-muted)", textDecoration: "underline", fontSize: "11px" }}>View on Registry</a>
                        </div>
                      </div>
                      <button
                        className="btn-modern"
                        style={{ width: "100%", background: installingSkill === skill.id ? "var(--border-subtle)" : "var(--accent)", color: installingSkill === skill.id ? "var(--text-muted)" : "#000" }}
                        onClick={() => handleInstallSkill(skill.id)}
                        disabled={installingSkill !== null}
                      >
                        {installingSkill === skill.id ? "Installing..." : "Install Globally"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* View: Add Repository */}
          {viewMode === "add_repo" && (
            <section>
              <h3 className="section-title">Add Git Repository</h3>
              <div className="repo-form-container">
                <input 
                  type="text" 
                  className="repo-input" 
                  placeholder="https://github.com/vercel-labs/skills.git"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {status && <span className="status-msg">{status}</span>}
                    {error && <span className="error-msg">{error}</span>}
                  </div>
                  <button 
                    className="btn-modern" 
                    onClick={handleAddRepo}
                    disabled={isCloning || !repoUrl.trim()}
                  >
                    {isCloning ? "Cloning..." : "Clone Repository"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* View: Create Skill */}
          {viewMode === "create_skill" && (
            <section>
              <h3 className="section-title">Create New Skill</h3>
              <div className="repo-form-container" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <input 
                  type="text" 
                  className="repo-input" 
                  placeholder="Skill Name (e.g. react-doctor)"
                  value={skillName}
                  onChange={e => setSkillName(e.target.value)}
                />
                <textarea 
                  className="repo-input" 
                  placeholder="Short Description..."
                  value={skillDesc}
                  onChange={e => setSkillDesc(e.target.value)}
                  style={{ minHeight: "80px", resize: "vertical", fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--text-main)", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={isClaudeSkill} 
                      onChange={e => setIsClaudeSkill(e.target.checked)} 
                    />
                    For Claude Code (creates in ~/.claude/skills)
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {status && <span className="status-msg">{status}</span>}
                    {error && <span className="error-msg">{error}</span>}
                  </div>
                  <button 
                    className="btn-modern" 
                    onClick={handleCreateSkill}
                    disabled={isCreatingSkill || !skillName.trim()}
                  >
                    {isCreatingSkill ? "Creating..." : "Scaffold Skill"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* View: Repositories */}
          {viewMode === "repos" && currentRepo && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "20px" }}>{currentRepo.name}</h2>
                  <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "4px" }}>
                    <code style={{ background: "transparent", padding: 0 }}>{currentRepo.url}</code>
                  </div>
                </div>
                <button 
                  className="btn-modern" 
                  onClick={() => handleSyncRepo(currentRepo.name)}
                  disabled={isSyncing}
                >
                  {isSyncing ? "Syncing..." : "Sync (git pull)"}
                </button>
              </div>
              
              {status && <div className="status-msg" style={{ marginBottom: "16px" }}>{status}</div>}
              {error && <div className="error-msg" style={{ marginBottom: "16px" }}>{error}</div>}

              {filteredSkills.length > 0 ? (
                <>
                  <h3 className="section-title">Provided Skills</h3>
                  <div className="skills-grid">
                    {filteredSkills.map((skill) => (
                      <div key={skill.name} className="skill-card">
                        <div className="skill-header">
                          <span className="skill-name">{skill.name}</span>
                          <button onClick={() => copy(skill.name)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "10px", fontWeight: 700 }}>COPY</button>
                        </div>
                        <div className="skill-desc">{skill.description || "No description provided."}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: "24px" }}>
                  No skills found in this repository.
                </div>
              )}
            </section>
          )}

          {/* View: Tools -> Skills Section */}
          {viewMode === "tools" && filteredSkills.length > 0 && (
            <section>
              <h3 className="section-title">Installed Agents</h3>
              <div className="skills-grid">
                {filteredSkills.map((skill) => (
                  <div key={skill.name} className="skill-card">
                    <div className="skill-header">
                      <span className="skill-name">{skill.name}</span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => copy(skill.name)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "10px", fontWeight: 700 }}>COPY</button>
                        <button onClick={() => handleUninstallSkill(skill.name)} style={{ background: "none", border: "none", color: "var(--error, #ff4d4d)", cursor: "pointer", fontSize: "10px", fontWeight: 700 }}>REMOVE</button>
                      </div>
                    </div>
                    <div className="skill-desc">{skill.description || "No description provided."}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* View: Tools -> MCP Section */}
          {viewMode === "tools" && currentTool?.configPath && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 className="section-title" style={{ margin: 0 }}>MCP Servers</h3>
                <div style={{ display: "flex", background: "var(--bg-card)", borderRadius: "4px", padding: "2px" }}>
                  <button 
                    onClick={() => setEditorMode("form")} 
                    style={{ background: editorMode === "form" ? "var(--bg-active)" : "transparent", border: "none", color: "var(--text-main)", padding: "4px 12px", fontSize: "11px", borderRadius: "3px", cursor: "pointer", fontWeight: editorMode === "form" ? 600 : 400 }}
                  >Form</button>
                  <button 
                    onClick={() => setEditorMode("code")} 
                    style={{ background: editorMode === "code" ? "var(--bg-active)" : "transparent", border: "none", color: "var(--text-main)", padding: "4px 12px", fontSize: "11px", borderRadius: "3px", cursor: "pointer", fontWeight: editorMode === "code" ? 600 : 400 }}
                  >JSON</button>
                </div>
              </div>

              {editorMode === "form" && (
                <div style={{ marginBottom: "24px" }}>
                  {/* Quick Add MCP Server */}
                  {!searchTerm && (
                    <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px dashed var(--border-subtle)", borderRadius: "8px", padding: "16px", marginBottom: "24px" }}>
                      <h4 style={{ margin: "0 0 12px 0", fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Quick Add Server</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: "10px", alignItems: "end" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600 }}>NAME</span>
                          <input className="repo-input" style={{ margin: 0, padding: "8px 12px", fontSize: "13px" }} placeholder="brave-search" value={newMcpName} onChange={e => setNewMcpName(e.target.value)} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600 }}>COMMAND</span>
                          <input className="repo-input" style={{ margin: 0, padding: "8px 12px", fontSize: "13px" }} placeholder="npx" value={newMcpCommand} onChange={e => setNewMcpCommand(e.target.value)} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 600 }}>ARGUMENTS</span>
                          <input className="repo-input" style={{ margin: 0, padding: "8px 12px", fontSize: "13px" }} placeholder="-y @modelcontextprotocol/server-brave-search" value={newMcpArgs} onChange={e => setNewMcpArgs(e.target.value)} />
                        </div>
                        <button className="btn-modern" style={{ padding: "10px 20px" }} disabled={!newMcpName || !newMcpCommand || isAddingMcp} onClick={handleAddMcp}>Add Server</button>
                      </div>
                    </div>
                  )}

                  {filteredMcp.length > 0 ? (
                    <div className="mcp-container">
                      <table className="mcp-table">
                        <thead>
                          <tr>
                            <th>Server</th>
                            <th>Command</th>
                            <th>Arguments</th>
                            <th style={{ textAlign: "right" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMcp.map(([name, config]) => (
                            <tr key={name}>
                              <td style={{ color: "var(--text-main)", fontWeight: 600 }}>{name}</td>
                              <td><code>{config.command}</code></td>
                              <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>{config.args.join(" ")}</td>
                              <td style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                  <button 
                                    onClick={() => handleTestMcp(config.command, config.args)}
                                    className="mcp-action-btn test"
                                  >TEST</button>
                                  <button 
                                    onClick={() => handleSyncMcpToAll(name, config)}
                                    className="mcp-action-btn sync"
                                  >SYNC ALL</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>No MCP servers configured.</div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* View: Tools -> Config Editor Section */}
          {viewMode === "tools" && currentTool?.configPath && !searchTerm && (editorMode === "code") && (
            <section>
              <h3 className="section-title">Global Configuration</h3>
              <div className="editor-wrapper">
                <textarea
                  className="config-editor"
                  value={editingContent}
                  onChange={(e) => {
                    setEditingContent(e.target.value);
                    setError("");
                  }}
                  spellCheck={false}
                />
              </div>
              
              <div className="footer-actions">
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {status && <div className="status-msg">{status}</div>}
                  {error && <div className="error-msg" style={{ marginTop: 0 }}>{error}</div>}
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{currentTool.configPath}</div>
                </div>
                
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn-modern" style={{ background: "var(--bg-card)", color: "var(--text-main)", border: "1px solid var(--border-subtle)" }} onClick={() => copy(editingContent)}>
                    Copy JSON
                  </button>
                  <button 
                    className="btn-modern" 
                    onClick={handleSave}
                    disabled={!!error}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
