import React, { useEffect, useMemo, useState } from 'react';
import './Statistics.css';

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

function Statistics() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await window.electronAPI.getStats();
        setStats(data);
      } catch (e) {
        console.error('[Statistics] Error loading stats:', e);
      }
    }
    load();
  }, []);

  const heatmapData = useMemo(() => {
    if (!stats?.byDay) return [];

    // Get today's date
    const today = new Date();
    const days = [];

    // Build past 365 days
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;

      const dayData = stats.byDay[key] || {
        sentFiles: 0,
        sentBytes: 0,
        receivedFiles: 0,
        receivedBytes: 0,
      };

      days.push({
        date: key,
        totalFiles: (dayData.sentFiles || 0) + (dayData.receivedFiles || 0),
        totalBytes: (dayData.sentBytes || 0) + (dayData.receivedBytes || 0),
        sent: dayData.sentFiles || 0,
        received: dayData.receivedFiles || 0,
      });
    }

    return days;
  }, [stats]);

  const maxFilesInDay = useMemo(() => {
    return Math.max(...heatmapData.map((d) => d.totalFiles), 1);
  }, [heatmapData]);

  const topDays = useMemo(() => {
    const sorted = [...heatmapData].sort((a, b) => b.totalFiles - a.totalFiles);
    return sorted.slice(0, 5);
  }, [heatmapData]);

  if (!stats) {
    return (
      <div className="statistics">
        <header className="statistics-header">
          <div>
            <h1 className="statistics-title">STATISTICS</h1>
            <span className="statistics-subtitle">Transfer history & activity</span>
          </div>
        </header>
        <div className="statistics-loading">Loading...</div>
      </div>
    );
  }

  const totals = stats.totals || { sentFiles: 0, sentBytes: 0, receivedFiles: 0, receivedBytes: 0 };

  return (
    <div className="statistics">
      <header className="statistics-header">
        <div>
          <h1 className="statistics-title">STATISTICS</h1>
          <span className="statistics-subtitle">Transfer history & activity</span>
        </div>
      </header>

      {/* Totals */}
      <section className="statistics-section">
        <h2 className="statistics-section-title">LIFETIME TOTALS</h2>
        <div className="statistics-totals">
          <div className="statistics-total-card">
            <div className="statistics-total-label">FILES SENT</div>
            <div className="statistics-total-value">{totals.sentFiles.toLocaleString()}</div>
            <div className="statistics-total-size">{formatBytes(totals.sentBytes)}</div>
          </div>
          <div className="statistics-total-card">
            <div className="statistics-total-label">FILES RECEIVED</div>
            <div className="statistics-total-value">{totals.receivedFiles.toLocaleString()}</div>
            <div className="statistics-total-size">{formatBytes(totals.receivedBytes)}</div>
          </div>
          <div className="statistics-total-card">
            <div className="statistics-total-label">TOTAL FILES</div>
            <div className="statistics-total-value">
              {(totals.sentFiles + totals.receivedFiles).toLocaleString()}
            </div>
            <div className="statistics-total-size">
              {formatBytes(totals.sentBytes + totals.receivedBytes)}
            </div>
          </div>
        </div>
      </section>

      {/* Heatmap */}
      <section className="statistics-section">
        <h2 className="statistics-section-title">ACTIVITY HEATMAP (PAST 365 DAYS)</h2>
        <div className="statistics-heatmap-wrapper">
          <div className="statistics-heatmap">
            {heatmapData.map((day) => {
              const intensity = day.totalFiles > 0 ? Math.ceil((day.totalFiles / maxFilesInDay) * 4) : 0;
              const label = `${day.date}: ${day.totalFiles} file${day.totalFiles !== 1 ? 's' : ''} (${formatBytes(day.totalBytes)})`;

              return (
                <div
                  key={day.date}
                  className={`heatmap-cell heatmap-intensity-${intensity}`}
                  title={label}
                />
              );
            })}
          </div>
        </div>
        <div className="statistics-heatmap-legend">
          <span>Less</span>
          <div className="heatmap-cell heatmap-intensity-0" />
          <div className="heatmap-cell heatmap-intensity-1" />
          <div className="heatmap-cell heatmap-intensity-2" />
          <div className="heatmap-cell heatmap-intensity-3" />
          <div className="heatmap-cell heatmap-intensity-4" />
          <span>More</span>
        </div>
      </section>

      {/* Top Days */}
      <section className="statistics-section">
        <h2 className="statistics-section-title">TOP 5 MOST ACTIVE DAYS</h2>
        {topDays.length === 0 || topDays[0].totalFiles === 0 ? (
          <div className="statistics-empty">No activity yet</div>
        ) : (
          <div className="statistics-top-days">
            {topDays.map((day, idx) =>
              day.totalFiles > 0 ? (
                <div key={day.date} className="statistics-top-day">
                  <div className="statistics-top-day-rank">{idx + 1}</div>
                  <div className="statistics-top-day-date">{day.date}</div>
                  <div className="statistics-top-day-files">{day.totalFiles} file{day.totalFiles === 1 ? '' : 's'}</div>
                  <div className="statistics-top-day-size">{formatBytes(day.totalBytes)}</div>
                </div>
              ) : null
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default Statistics;
