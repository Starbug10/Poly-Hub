import React, { useEffect, useMemo, useState } from 'react';
import './Transfers.css';

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [clipboardStatus, setClipboardStatus] = useState(null); // {type, message}

  const sortedTransfers = useMemo(() => {
    return [...transfers].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [transfers]);

  useEffect(() => {
    let mounted = true;

    const upsert = (transfer) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.transferId === transfer.transferId);
        if (idx === -1) return [transfer, ...prev];
        const next = [...prev];
        next[idx] = transfer;
        return next;
      });
    };

    const remove = (transferId) => {
      setTransfers((prev) => prev.filter((t) => t.transferId !== transferId));
    };

    async function init() {
      try {
        const list = await window.electronAPI.getActiveTransfers();
        if (!mounted) return;
        setTransfers(list || []);
      } catch (e) {
        console.error('[Transfers] Failed to load active transfers:', e);
      }
    }

    init();

    window.electronAPI.onTransferUpdated(upsert);
    window.electronAPI.onTransferRemoved(remove);

    return () => {
      mounted = false;
      window.electronAPI.removeAllListeners('transfer:updated');
      window.electronAPI.removeAllListeners('transfer:removed');
    };
  }, []);

  const handlePause = async (transferId) => {
    await window.electronAPI.pauseTransfer(transferId);
  };

  const handleResume = async (transferId) => {
    await window.electronAPI.resumeTransfer(transferId);
  };

  const handleCancel = async (transferId) => {
    await window.electronAPI.cancelTransfer(transferId);
  };

  const handleShareClipboard = async () => {
    setClipboardStatus(null);
    try {
      const result = await window.electronAPI.shareClipboard();
      if (result?.success) {
        const count = result.files?.length || 0;
        setClipboardStatus({ type: 'success', message: `Shared clipboard (${count} item${count === 1 ? '' : 's'})` });
      } else {
        setClipboardStatus({ type: 'error', message: result?.error || 'Failed to share clipboard' });
      }

      setTimeout(() => setClipboardStatus(null), 2500);
    } catch (e) {
      setClipboardStatus({ type: 'error', message: e.message || 'Failed to share clipboard' });
      setTimeout(() => setClipboardStatus(null), 2500);
    }
  };

  return (
    <div className="transfers">
      <header className="transfers-header">
        <div className="transfers-header-left">
          <h1 className="transfers-title">TRANSFERS</h1>
          <span className="transfers-subtitle">Pause/resume/cancel active transfers</span>
        </div>
        <div className="transfers-header-right">
          <button className="primary" onClick={handleShareClipboard}>
            SEND CLIPBOARD
          </button>
        </div>
      </header>

      {clipboardStatus && (
        <div className={`transfers-status transfers-status-${clipboardStatus.type}`}>
          {clipboardStatus.message}
        </div>
      )}

      {sortedTransfers.length === 0 ? (
        <div className="transfers-empty">
          <div className="transfers-empty-title">NO ACTIVE TRANSFERS</div>
          <div className="transfers-empty-subtitle">Drag & drop in Gallery or use “Send Clipboard”.</div>
        </div>
      ) : (
        <div className="transfers-list">
          {sortedTransfers.map((t) => {
            const percent = Math.max(0, Math.min(100, Number(t.progress) || 0));
            const isSending = t.direction === 'sending';
            const canControl = isSending && (t.status === 'sending' || t.status === 'paused');

            return (
              <div key={t.transferId} className={`transfer-card transfer-${t.direction}`}>
                <div className="transfer-main">
                  <div className="transfer-top">
                    <div className="transfer-name" title={t.fileName}>{t.fileName}</div>
                    <div className={`transfer-status badge badge-${t.status}`}>{(t.status || '').toUpperCase()}</div>
                  </div>

                  <div className="transfer-meta">
                    <span className="transfer-direction">{isSending ? 'Sending to' : 'Receiving from'}:</span>
                    <span className="transfer-peer">{t.peerName || t.peerIP || 'Unknown'}</span>
                    <span className="transfer-dot">•</span>
                    <span className="transfer-size">
                      {formatBytes(t.bytesTransferred)} / {formatBytes(t.totalBytes)}
                    </span>
                  </div>

                  <div className="transfer-progress">
                    <div className="transfer-progress-bar" style={{ width: `${percent}%` }} />
                  </div>
                </div>

                <div className="transfer-actions">
                  {canControl ? (
                    <>
                      {t.status === 'paused' ? (
                        <button className="secondary" onClick={() => handleResume(t.transferId)}>
                          RESUME
                        </button>
                      ) : (
                        <button className="secondary" onClick={() => handlePause(t.transferId)}>
                          PAUSE
                        </button>
                      )}
                      <button className="danger" onClick={() => handleCancel(t.transferId)}>
                        CANCEL
                      </button>
                    </>
                  ) : (
                    <span className="transfer-actions-hint">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Transfers;
