import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { 
  DexData, 
  UsageStats, 
  ViewMode, 
  GlobalSkillSearchResult, 
  McpServerConfig,
  ActivityPoint,
  ProjectActivity
} from "./types";

function App() {
  const [dexData, setDexData] = useState<DexData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  
  // Navigation State
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedIndex, setSelectedIndex] = useState(0);
  
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
          <div className="sidebar-item-icon" style={{ background: "var(--accent)" }} />
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
            <div className="sidebar-item-icon" />
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
            <div className="sidebar-item-icon" />
            {repo.name}
          </div>
        ))}
        <div 
          className={`sidebar-item sidebar-item-add ${viewMode === "add_repo" ? "active" : ""}`}
          onClick={() => { setViewMode("add_repo"); setSearchTerm(""); setError(""); setStatus(""); }}
        >
          + Add Repository
        </div>

        <div className="sidebar-header" style={{ marginTop: "20px" }}>Create</div>
        <div 
          className={`sidebar-item sidebar-item-add ${viewMode === "create_skill" ? "active" : ""}`}
          onClick={() => { setViewMode("create_skill"); setSearchTerm(""); setError(""); setStatus(""); }}
          style={{ borderColor: "var(--text-main)", color: "var(--text-main)" }}
        >
          + Create Skill
        </div>

        {/* Global Search */}
        <div className="sidebar-header" style={{ marginTop: "20px" }}>Discover</div>
        <div 
          className={`sidebar-item ${viewMode === "global_search" ? "active" : ""}`}
          onClick={() => { setViewMode("global_search"); setSearchTerm(""); setError(""); setStatus(""); }}
        >
          <div className="sidebar-item-icon" style={{ background: "var(--accent)" }} />
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
              viewMode === "add_repo" ? "Adding new repository..." :
              viewMode === "global_search" ? "Search the open skills ecosystem..." :
              viewMode === "dashboard" ? "AI Dexterity Usage Insights" :
              `Search ${currentTool?.name || currentRepo?.name}...`
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
            disabled={viewMode === "add_repo" || viewMode === "dashboard"}
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
              <h2 style={{ fontSize: "24px", marginBottom: "24px" }}>AI Ecosystem Insights</h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "32px" }}>
                <div className="stat-card">
                  <span className="stat-label">Total Skills</span>
                  <span className="stat-value">{usageStats.totalSkills}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Active Days (Claude)</span>
                  <span className="stat-value">{usageStats.dailyActivity.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Top Tool</span>
                  <span className="stat-value" style={{ fontSize: "20px" }}>
                   {(Object.entries(usageStats.skillDistribution) as [string, number][]).sort((a,b) => b[1]-a[1])[0]?.[0] || "None"}
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
                <div className="mcp-container" style={{ padding: "24px" }}>
                  <h3 className="section-title" style={{ marginTop: 0 }}>Daily Activity (Last 30 Days)</h3>
                  <div style={{ height: "150px", width: "100%", marginTop: "20px", display: "flex", alignItems: "flex-end", gap: "4px" }}>
                    {usageStats.dailyActivity.slice(-30).map((day: ActivityPoint) => {
                      const max = Math.max(...usageStats.dailyActivity.map((d: ActivityPoint) => d.count), 1);
                      const height = (day.count / max) * 100;
                      return (
                        <div 
                          key={day.date} 
                          style={{ 
                            flex: 1, 
                            height: `${height}%`, 
                            background: "var(--accent)", 
                            borderRadius: "2px 2px 0 0",
                            opacity: 0.5 + (height/200),
                            transition: "height 0.3s ease"
                          }} 
                          title={`${day.date}: ${day.count} requests`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="mcp-container" style={{ padding: "24px" }}>
                  <h3 className="section-title" style={{ marginTop: 0 }}>Top AI Projects</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
                    {usageStats.topProjects.map((proj: ProjectActivity, i: number) => (
                      <div key={proj.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", color: "var(--text-main)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {i+1}. {proj.name}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--bg-active)", padding: "2px 6px", borderRadius: "4px" }}>
                          {proj.count}
                        </span>
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
