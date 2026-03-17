import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  HeartPulse,
  History,
  Microscope,
  Package,
  Play,
  Terminal as TerminalIcon,
  Trash2,
  Zap,
} from "lucide-react";
import ConfigHistoryPanel from "./ConfigHistoryPanel";
import DiagnosticDetailPanel from "./DiagnosticDetailPanel";
import type {
  ConfigRevision,
  DiagnosticAdvice,
  DiagnosticResult,
  DiffResult,
  ExportedDiagnosticBundle,
  McpServerConfig,
  ServerDiagnosticHistory,
  ToolInfo,
} from "./types";

type ToolFormState = {
  editingContent: string;
  newMcpName: string;
  newMcpCommand: string;
  newMcpArgs: string;
  newMcpEnv: string;
  isAddingMcp: boolean;
  editorMode: "code" | "form";
};

type ToolDiagnosticsState = {
  filteredMcp: Array<[string, McpServerConfig]>;
  diagnostics: Record<string, DiagnosticResult>;
  selectedDiagnosticServer: string | null;
  selectedDiagnosticConfig: McpServerConfig | null;
  selectedDiagnosticResult: DiagnosticResult | null;
  selectedDiagnosticHistory: ServerDiagnosticHistory | null;
  selectedDiagnosticAdvice: DiagnosticAdvice | null;
  selectedDiagnosticBundle: ExportedDiagnosticBundle | null;
  assistantEnabled: boolean;
  isLoadingDiagnosticContext: boolean;
  isExportingBundle: boolean;
  isCheckingHealth: boolean;
  installingRuntime: string | null;
  isDebugging: string | null;
  activeMcpLogs: string[];
};

type ToolHistoryState = {
  revisions: ConfigRevision[];
  showHistory: boolean;
  activeDiff: DiffResult | null;
  activeDiffRevision: string | null;
};

type ToolManagementActions = {
  onFindSkills: () => void;
  onHealthCheckAll: () => void;
  onShowHistory: () => void;
  onSetEditorMode: (mode: "code" | "form") => void;
  onNewMcpNameChange: (value: string) => void;
  onNewMcpCommandChange: (value: string) => void;
  onNewMcpArgsChange: (value: string) => void;
  onNewMcpEnvChange: (value: string) => void;
  onAddMcp: () => void;
  onSelectDiagnosticServer: (name: string) => void;
  onInstallRuntime: (runtime: string) => void;
  onTestMcp: (name: string, config: McpServerConfig) => void;
  onDebugMcp: (name: string, config: McpServerConfig) => void;
  onLaunchInspector: (serverName: string) => void;
  onSyncMcp: (name: string, config: { command: string; args: string[] }) => void;
  onDeleteMcp: (name: string) => void;
  onUninstallSkill: (id: string) => void;
  onToggleAssistant: () => void;
  onExportBundle: (name: string, server: McpServerConfig, result: DiagnosticResult) => void;
  onRepairAction: (
    name: string,
    server: McpServerConfig,
    kind: string,
    runtime?: string,
    revisionFilename?: string
  ) => void;
  onRestoreRevision: (revisionFilename: string) => void;
  onCloseDebug: () => void;
  onCloseHistory: () => void;
  onViewDiff: (revisionFilename: string) => void;
  onEditingContentChange: (value: string) => void;
  onSave: () => void;
};

type ToolManagementViewProps = {
  currentTool: ToolInfo;
  form: ToolFormState;
  diagnosticsState: ToolDiagnosticsState;
  historyState: ToolHistoryState;
  actions: ToolManagementActions;
  formatDiagnosticTimestamp: (timestamp: string) => string;
};

function ToolManagementView({
  currentTool,
  form,
  diagnosticsState,
  historyState,
  actions,
  formatDiagnosticTimestamp,
}: ToolManagementViewProps) {
  const {
    editingContent,
    newMcpName,
    newMcpCommand,
    newMcpArgs,
    newMcpEnv,
    isAddingMcp,
    editorMode,
  } = form;
  const {
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
    isExportingBundle,
    isCheckingHealth,
    installingRuntime,
    isDebugging,
    activeMcpLogs,
  } = diagnosticsState;
  const {
    revisions,
    showHistory,
    activeDiff,
    activeDiffRevision,
  } = historyState;
  const {
    onFindSkills,
    onHealthCheckAll,
    onShowHistory,
    onSetEditorMode,
    onNewMcpNameChange,
    onNewMcpCommandChange,
    onNewMcpArgsChange,
    onNewMcpEnvChange,
    onAddMcp,
    onSelectDiagnosticServer,
    onInstallRuntime,
    onTestMcp,
    onDebugMcp,
    onLaunchInspector,
    onSyncMcp,
    onDeleteMcp,
    onUninstallSkill,
    onToggleAssistant,
    onExportBundle,
    onRepairAction,
    onRestoreRevision,
    onCloseDebug,
    onCloseHistory,
    onViewDiff,
    onEditingContentChange,
    onSave,
  } = actions;

  return (
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
            {currentTool.skills.map((skill) => (
              <div key={skill.name} className="skill-card">
                <div className="skill-name">{skill.name}</div>
                {skill.description && <p className="skill-desc">{skill.description}</p>}
                <button className="mcp-action-btn mcp-action-btn-danger" style={{ marginTop: "10px" }} onClick={() => onUninstallSkill(skill.name)}>
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
          <button className="btn-modern btn-accent" onClick={onFindSkills}>Find Skills</button>
        </div>
      ) : null}

      {currentTool.configPath && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>MCP Servers</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button className="mcp-action-btn" onClick={onHealthCheckAll} disabled={isCheckingHealth}>
                <HeartPulse size={12} /> {isCheckingHealth ? "Checking..." : "Health Check All"}
              </button>
              <button className="mcp-action-btn" onClick={onShowHistory}>
                <History size={12} /> History
              </button>
              <div className="editor-toggle">
                <button onClick={() => onSetEditorMode("form")} className={`editor-toggle-btn ${editorMode === "form" ? "active" : ""}`}>Form</button>
                <button onClick={() => onSetEditorMode("code")} className={`editor-toggle-btn ${editorMode === "code" ? "active" : ""}`}>JSON</button>
              </div>
            </div>
          </div>

          {editorMode === "form" && (
            <>
              <div className="form-container form-container-dashed">
                <div className="form-grid-mcp-2">
                  <input className="repo-input repo-input-inline" placeholder="Name" value={newMcpName} onChange={(event) => onNewMcpNameChange(event.target.value)} />
                  <input className="repo-input repo-input-inline" placeholder="Command (npx, uvx, ...)" value={newMcpCommand} onChange={(event) => onNewMcpCommandChange(event.target.value)} />
                  <input className="repo-input repo-input-inline" placeholder="Args (space separated)" value={newMcpArgs} onChange={(event) => onNewMcpArgsChange(event.target.value)} />
                  <input className="repo-input repo-input-inline" placeholder="Env (KEY=val, KEY2=val2)" value={newMcpEnv} onChange={(event) => onNewMcpEnvChange(event.target.value)} />
                  <button className="btn-modern" disabled={isAddingMcp} onClick={onAddMcp}>Add</button>
                </div>
              </div>

              <div className="mcp-container">
                <table className="mcp-table">
                  <thead>
                    <tr><th>Server</th><th>Command</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredMcp.map(([name, config]) => {
                      const diagnostic = diagnostics[name];
                      return (
                        <tr
                          key={name}
                          className={selectedDiagnosticServer === name ? "mcp-row-selected" : ""}
                          onClick={() => onSelectDiagnosticServer(name)}
                        >
                          <td>{name}</td>
                          <td><code>{config.command}</code></td>
                          <td>
                            {diagnostic ? (
                              <div className="diag-inline">
                                {diagnostic.success
                                  ? <span className="diag-ok"><CheckCircle2 size={12} /> {diagnostic.status}</span>
                                  : <span className="diag-fail">
                                      <AlertTriangle size={12} /> {diagnostic.message}
                                      {diagnostic.missingRuntime && (
                                        <button
                                          className="mcp-action-btn diag-install-btn"
                                          disabled={installingRuntime === diagnostic.missingRuntime}
                                          onClick={() => onInstallRuntime(diagnostic.missingRuntime!)}
                                        >
                                          <Download size={11} /> {installingRuntime === diagnostic.missingRuntime ? "Installing..." : `Install ${diagnostic.missingRuntime}`}
                                        </button>
                                      )}
                                    </span>
                                }
                                {diagnostic.failureKind && !diagnostic.success && <span className="diag-suggestion">Why: {diagnostic.failureKind.replace(/_/g, " ")}</span>}
                                {diagnostic.suggestion && !diagnostic.success && <span className="diag-suggestion">{diagnostic.suggestion}</span>}
                              </div>
                            ) : (
                              <span className="text-muted" style={{ fontSize: "11px" }}>Not checked</span>
                            )}
                          </td>
                          <td>
                            <div className="mcp-actions">
                              <button onClick={() => onTestMcp(name, config)} className="mcp-action-btn"><Zap size={12} /> Test</button>
                              <button onClick={() => onDebugMcp(name, config)} className="mcp-action-btn"><Play size={12} /> Debug</button>
                              <button onClick={() => onLaunchInspector(name)} className="mcp-action-btn"><Microscope size={12} /> Inspect</button>
                              <button onClick={() => onSyncMcp(name, config)} className="mcp-action-btn"><Copy size={12} /> Sync</button>
                              <button onClick={() => onDeleteMcp(name)} className="mcp-action-btn mcp-action-btn-danger"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isDebugging && (
                <div className="debug-panel">
                  <div className="debug-panel-header">
                    <div className="debug-panel-label">
                      <TerminalIcon size={14} /> Logs: {isDebugging}
                    </div>
                    <button className="debug-close-btn" onClick={onCloseDebug}>Close</button>
                  </div>
                  <div className="debug-panel-body">
                    {activeMcpLogs.map((log, index) => <div key={`${isDebugging}-${index}-${log}`}>{log}</div>)}
                  </div>
                </div>
              )}

              {selectedDiagnosticServer && selectedDiagnosticConfig && (
                <DiagnosticDetailPanel
                  selectedServer={selectedDiagnosticServer}
                  selectedConfig={selectedDiagnosticConfig}
                  selectedResult={selectedDiagnosticResult}
                  selectedHistory={selectedDiagnosticHistory}
                  selectedAdvice={selectedDiagnosticAdvice}
                  selectedBundle={selectedDiagnosticBundle}
                  assistantEnabled={assistantEnabled}
                  isLoading={isLoadingDiagnosticContext}
                  isExporting={isExportingBundle}
                  onToggleAssistant={onToggleAssistant}
                  onExportBundle={onExportBundle}
                  onRepairAction={onRepairAction}
                  onRestoreRevision={onRestoreRevision}
                  formatTimestamp={formatDiagnosticTimestamp}
                />
              )}
            </>
          )}

          {editorMode === "code" && (
            <div>
              <div className="editor-wrapper">
                <textarea className="config-editor" value={editingContent} onChange={(event) => onEditingContentChange(event.target.value)} />
              </div>
              <div className="footer-actions">
                <button className="btn-modern" onClick={onSave}>Save</button>
              </div>
            </div>
          )}
        </>
      )}

      {showHistory && (
        <ConfigHistoryPanel
          revisions={revisions}
          activeDiff={activeDiff}
          activeDiffRevision={activeDiffRevision}
          onClose={onCloseHistory}
          onViewDiff={onViewDiff}
          onRestoreRevision={onRestoreRevision}
        />
      )}
    </section>
  );
}

export default ToolManagementView;
