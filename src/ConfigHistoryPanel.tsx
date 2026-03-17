import { History, RotateCcw } from "lucide-react";
import type { ConfigRevision, DiffResult } from "./types";

const EMPTY_DIFF_LINE = "\u00A0";

function formatRevisionTimestamp(timestamp: string): string {
  return timestamp.replace(/_/g, " at ").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

function getDiffLineMarker(kind: DiffResult["hunks"][number]["kind"]): string {
  switch (kind) {
    case "add":
      return "+";
    case "remove":
      return "-";
    default:
      return " ";
  }
}

type ConfigHistoryPanelProps = {
  revisions: ConfigRevision[];
  activeDiff: DiffResult | null;
  activeDiffRevision: string | null;
  onClose: () => void;
  onViewDiff: (revisionFilename: string) => void;
  onRestoreRevision: (revisionFilename: string) => void;
};

function ConfigHistoryPanel({
  revisions,
  activeDiff,
  activeDiffRevision,
  onClose,
  onViewDiff,
  onRestoreRevision,
}: ConfigHistoryPanelProps) {
  const activeDiffLabel = activeDiffRevision?.replace(".snapshot", "") ?? "current";

  return (
    <div className="history-panel">
      <div className="history-panel-header">
        <h3 className="section-title" style={{ marginBottom: 0 }}>
          <History size={14} /> Config History
        </h3>
        <button className="debug-close-btn" onClick={onClose}>Close</button>
      </div>
      <div className="history-panel-body">
        <div className="history-list">
          {revisions.length === 0 && <p className="text-muted" style={{ padding: "20px", textAlign: "center" }}>No revisions yet. Changes are tracked automatically on save.</p>}
          {revisions.map(rev => {
            const ts = formatRevisionTimestamp(rev.timestamp);
            return (
              <div key={rev.filename} className={`history-item ${activeDiffRevision === rev.filename ? "active" : ""}`}>
                <div className="history-item-info">
                  <span className="history-item-time">{ts}</span>
                  <span className="history-item-size">{(rev.size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="history-item-actions">
                  <button className="mcp-action-btn" onClick={() => onViewDiff(rev.filename)}>Diff</button>
                  <button className="mcp-action-btn" onClick={() => onRestoreRevision(rev.filename)}>
                    <RotateCcw size={11} /> Restore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {activeDiff && (
          <div className="diff-viewer">
            <div className="diff-viewer-header">
              <span>Changes from {activeDiffLabel} to current</span>
            </div>
            <div className="diff-viewer-body">
              {activeDiff.hunks.map((hunk, index) => (
                <div key={`${activeDiffRevision}-${index}-${hunk.kind}`} className={`diff-line diff-line-${hunk.kind}`}>
                  <span className="diff-line-marker">{getDiffLineMarker(hunk.kind)}</span>
                  <span>{hunk.content || EMPTY_DIFF_LINE}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfigHistoryPanel;
