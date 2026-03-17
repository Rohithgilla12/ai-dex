import { Brain, CheckCircle2, Download, RotateCcw, ShieldAlert } from "lucide-react";
import type {
  DiagnosticAdvice,
  DiagnosticResult,
  ExportedDiagnosticBundle,
  McpServerConfig,
  ServerDiagnosticHistory,
} from "./types";

type DiagnosticDetailPanelProps = {
  selectedServer: string;
  selectedConfig: McpServerConfig;
  selectedResult: DiagnosticResult | null;
  selectedHistory: ServerDiagnosticHistory | null;
  selectedAdvice: DiagnosticAdvice | null;
  selectedBundle: ExportedDiagnosticBundle | null;
  assistantEnabled: boolean;
  isLoading: boolean;
  isExporting: boolean;
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
  formatTimestamp: (timestamp: string) => string;
};

function getResultSubtitle(selectedResult: DiagnosticResult | null): string {
  if (!selectedResult) {
    return "Select a server and run a health check to populate diagnostics.";
  }

  return `${selectedResult.status} · ${selectedResult.message}`;
}

function getDiagnosticTone(isHealthy: boolean): "healthy" | "failed" {
  return isHealthy ? "healthy" : "failed";
}

function DiagnosticDetailPanel({
  selectedServer,
  selectedConfig,
  selectedResult,
  selectedHistory,
  selectedAdvice,
  selectedBundle,
  assistantEnabled,
  isLoading,
  isExporting,
  onToggleAssistant,
  onExportBundle,
  onRepairAction,
  onRestoreRevision,
  formatTimestamp,
}: DiagnosticDetailPanelProps) {
  const lastKnownGood = selectedHistory?.lastKnownGood ?? null;
  const lastKnownGoodRevision = lastKnownGood?.revisionFilename ?? null;
  const selectedResultTone = selectedResult ? getDiagnosticTone(selectedResult.success) : null;
  const subtitle = getResultSubtitle(selectedResult);

  return (
    <div className="diagnostic-detail-panel">
      <div className="diagnostic-detail-header">
        <div>
          <div className="diagnostic-detail-title">Diagnostics: {selectedServer}</div>
          <div className="diagnostic-detail-subtitle">{subtitle}</div>
        </div>
        <div className="diagnostic-detail-actions">
          <button className={`mcp-action-btn ${assistantEnabled ? "diagnostic-toggle-active" : ""}`} onClick={onToggleAssistant}>
            <Brain size={12} /> {assistantEnabled ? "Assistant On" : "Assistant Off"}
          </button>
          {selectedResult && (
            <button
              className="mcp-action-btn"
              disabled={isExporting}
              onClick={() => onExportBundle(selectedServer, selectedConfig, selectedResult)}
            >
              <Download size={12} /> {isExporting ? "Exporting..." : "Export Bundle"}
            </button>
          )}
        </div>
      </div>

      {isLoading && <div className="diagnostic-loading">Loading diagnostic context...</div>}

      <div className="diagnostic-detail-grid">
        <div className="diagnostic-card">
          <div className="diagnostic-card-label">Current Diagnosis</div>
          {selectedResult ? (
            <>
              <div className={`diagnostic-status-pill diagnostic-status-${selectedResultTone}`}>
                {selectedResult.success ? <CheckCircle2 size={12} /> : <ShieldAlert size={12} />}
                {selectedResult.status}
              </div>
              {selectedResult.failureKind && (
                <div className="diagnostic-card-copy">Failure kind: {selectedResult.failureKind.replace(/_/g, " ")}</div>
              )}
              {selectedResult.details.length > 0 && (
                <div className="diagnostic-list">
                  {selectedResult.details.map(detail => (
                    <div key={detail} className="diagnostic-list-item">{detail}</div>
                  ))}
                </div>
              )}
              {selectedResult.repairActions.length > 0 && (
                <div className="diagnostic-actions-wrap">
                  {selectedResult.repairActions.map(action => (
                    <button
                      key={`${action.kind}-${action.label}`}
                      className="mcp-action-btn"
                      onClick={() => onRepairAction(
                        selectedServer,
                        selectedConfig,
                        action.kind,
                        action.runtime,
                        action.revisionFilename
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="diagnostic-card-copy">No health probe has been run for this server yet.</div>
          )}
        </div>

        <div className="diagnostic-card">
          <div className="diagnostic-card-label">Evidence</div>
          {selectedResult?.evidence.length ? (
            <div className="diagnostic-list">
              {selectedResult.evidence.map(item => (
                <div key={`${item.label}-${item.value}`} className="diagnostic-evidence-item">
                  <span>{item.label}</span>
                  <code>{item.value}</code>
                </div>
              ))}
            </div>
          ) : (
            <div className="diagnostic-card-copy">Evidence appears after a diagnostic run.</div>
          )}
        </div>

        <div className="diagnostic-card">
          <div className="diagnostic-card-label">Recent Timeline</div>
          {selectedHistory?.runs.length ? (
            <div className="diagnostic-timeline">
              {selectedHistory.runs.slice(0, 6).map(run => (
                <div key={`${run.checkedAt}-${run.message}`} className="diagnostic-timeline-item">
                  <div className={`diagnostic-status-pill diagnostic-status-${getDiagnosticTone(run.status === "healthy")}`}>
                    {run.status}
                  </div>
                  <div>
                    <div className="diagnostic-card-copy">{run.message}</div>
                    <div className="diagnostic-muted">{formatTimestamp(run.checkedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="diagnostic-card-copy">No recorded diagnostic history yet.</div>
          )}
        </div>

        <div className="diagnostic-card">
          <div className="diagnostic-card-label">Last Known Good</div>
          {lastKnownGood ? (
            <>
              <div className="diagnostic-card-copy">
                Last pass: {formatTimestamp(lastKnownGood.checkedAt)}
              </div>
              {lastKnownGoodRevision && (
                <button
                  className="mcp-action-btn"
                  onClick={() => onRestoreRevision(lastKnownGoodRevision)}
                >
                  <RotateCcw size={12} /> Restore Last Known Good
                </button>
              )}
              {lastKnownGood.suspiciousChanges.length > 0 && (
                <div className="diagnostic-list">
                  {lastKnownGood.suspiciousChanges.map(change => (
                    <div key={`${change.label}-${change.currentValue}`} className="diagnostic-list-item">
                      <strong>{change.label}:</strong> {change.previousValue} {"->"} {change.currentValue}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="diagnostic-card-copy">No successful historical run has been recorded for this server yet.</div>
          )}
        </div>
      </div>

      {assistantEnabled && selectedAdvice && (
        <div className="diagnostic-advice-panel">
          <div className="diagnostic-card-label">Repair Assistant</div>
          <div className="diagnostic-advice-title">{selectedAdvice.title}</div>
          <div className="diagnostic-card-copy">{selectedAdvice.summary}</div>
          <div className="diagnostic-muted">Confidence: {selectedAdvice.confidence}</div>
          {selectedAdvice.reasons.length > 0 && (
            <div className="diagnostic-list">
              {selectedAdvice.reasons.map(reason => (
                <div key={reason} className="diagnostic-list-item">{reason}</div>
              ))}
            </div>
          )}
          {selectedAdvice.recommendedSteps.length > 0 && (
            <div className="diagnostic-list">
              {selectedAdvice.recommendedSteps.map(step => (
                <div key={step} className="diagnostic-list-item">{step}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedBundle && (
        <div className="diagnostic-bundle-preview">
          <div className="diagnostic-card-label">Latest Export</div>
          <div className="diagnostic-muted">{selectedBundle.path}</div>
          <pre>{selectedBundle.preview}</pre>
        </div>
      )}
    </div>
  );
}

export default DiagnosticDetailPanel;
