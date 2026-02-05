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

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function Statistics() {
  const [stats, setStats] = useState(null);
  const [heatmapPage, setHeatmapPage] = useState(0);

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
    if (!stats?.byDay) return { allMonths: [], displayMonths: [], canGoBack: false, canGoForward: false, currentPage: 0, totalPages: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate full range: go back as far as data exists, plus 2 future months
    const startDate = new Date(today);
    startDate.setMonth(today.getMonth() - 50); // Go back far enough to capture all historical data
    startDate.setDate(1);

    const endDate = new Date(today);
    endDate.setMonth(today.getMonth() + 2);
    endDate.setDate(new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate());

    // Build all days grouped by month
    const monthsMap = new Map();
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      const monthKey = `${yyyy}-${mm}`;

      const dayData = stats.byDay[key] || {
        sentFiles: 0,
        sentBytes: 0,
        receivedFiles: 0,
        receivedBytes: 0,
      };

      const isToday = currentDate.toDateString() === today.toDateString();
      const isFuture = currentDate > today;

      const dayInfo = {
        date: key,
        dateObj: new Date(currentDate),
        totalFiles: (dayData.sentFiles || 0) + (dayData.receivedFiles || 0),
        totalBytes: (dayData.sentBytes || 0) + (dayData.receivedBytes || 0),
        sent: dayData.sentFiles || 0,
        received: dayData.receivedFiles || 0,
        isToday,
        isFuture,
      };

      if (!monthsMap.has(monthKey)) {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthsMap.set(monthKey, {
          key: monthKey,
          label: monthName,
          weeks: [],
          days: []
        });
      }

      monthsMap.get(monthKey).days.push(dayInfo);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Convert to array and organize into weeks for each month
    const allMonths = Array.from(monthsMap.values()).map(month => {
      const firstDay = month.days[0];
      const firstDayOfWeek = firstDay.dateObj.getDay(); // 0 = Sunday

      // Add empty cells for days before the first day of the month
      const weeks = [];
      let currentWeek = new Array(firstDayOfWeek).fill(null);

      for (const day of month.days) {
        currentWeek.push(day);

        // Start new week on Sunday (except for the first week)
        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }
      }

      // Add remaining days to last week
      if (currentWeek.length > 0) {
        // Fill remaining days with null
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
      }

      return { ...month, weeks };
    });

    // Filter out months with no activity (except current and future months)
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // Find the index of the current month in all months
    const currentMonthIndex = allMonths.findIndex(m => m.key === currentMonthKey);

    // Filter: keep months with activity OR within the default view range (5 months before current to 2 months after)
    const filteredMonths = allMonths.filter((month, idx) => {
      const hasActivity = month.days.some(d => d.totalFiles > 0);

      // Always include months in the default view range (current month ± range)
      const isInDefaultRange = currentMonthIndex >= 0 &&
        idx >= currentMonthIndex - 5 &&
        idx <= currentMonthIndex + 2;

      return hasActivity || isInDefaultRange;
    });

    // Calculate pagination: 8 months per page (5 past + current + 2 future)
    const monthsPerPage = 8;

    // Find the index of the current month in filtered list
    const currentMonthFilteredIndex = filteredMonths.findIndex(m => m.key === currentMonthKey);

    // Calculate which page should show the current month
    // We want current month to be at position 5 (0-indexed), so 5 months back are shown
    let defaultPage = 0;
    if (currentMonthFilteredIndex >= 0) {
      // Calculate page so that current month appears at position 5 (6th position)
      // This means we want to start the page 5 positions before the current month
      const idealStartIdx = currentMonthFilteredIndex - 5;
      defaultPage = Math.max(0, Math.floor(idealStartIdx / monthsPerPage));
    }

    const totalPages = Math.ceil(filteredMonths.length / monthsPerPage);
    const currentPage = Math.min(heatmapPage, Math.max(0, totalPages - 1));
    const startIdx = currentPage * monthsPerPage;
    const endIdx = Math.min(startIdx + monthsPerPage, filteredMonths.length);
    const displayMonths = filteredMonths.slice(startIdx, endIdx);

    return {
      allMonths: filteredMonths,
      displayMonths,
      canGoBack: currentPage > 0,
      canGoForward: currentPage < totalPages - 1,
      currentPage,
      totalPages,
      defaultPage
    };
  }, [stats, heatmapPage]);

  // Auto-navigate to the page with current month on initial load
  useEffect(() => {
    if (heatmapData.defaultPage !== undefined && heatmapPage === 0 && heatmapData.defaultPage !== 0) {
      setHeatmapPage(heatmapData.defaultPage);
    }
  }, [heatmapData.defaultPage]);

  const topDays = useMemo(() => {
    const allDays = heatmapData.allMonths.flatMap(m => m.days).filter(d => !d.isFuture);
    const sorted = [...allDays].sort((a, b) => b.totalFiles - a.totalFiles);
    return sorted.slice(0, 5);
  }, [heatmapData]);

  const userStats = useMemo(() => {
    if (!stats?.byUser) return [];

    return Object.entries(stats.byUser).map(([userId, data]) => ({
      userId,
      name: data.name || userId,
      sentFiles: data.sentFiles || 0,
      sentBytes: data.sentBytes || 0,
      receivedFiles: data.receivedFiles || 0,
      receivedBytes: data.receivedBytes || 0,
      totalFiles: (data.sentFiles || 0) + (data.receivedFiles || 0),
      totalBytes: (data.sentBytes || 0) + (data.receivedBytes || 0),
    })).sort((a, b) => b.totalFiles - a.totalFiles);
  }, [stats]);

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
        <div className="statistics-section-header">
          <h2 className="statistics-section-title">ACTIVITY HEATMAP</h2>
          <div className="statistics-heatmap-controls">
            <button
              className="heatmap-nav-button"
              onClick={() => setHeatmapPage(p => Math.max(0, p - 1))}
              disabled={!heatmapData.canGoBack}
              title="Previous months"
            >
              ←
            </button>
            <span className="heatmap-page-indicator">
              {heatmapData.currentPage + 1} / {heatmapData.totalPages}
            </span>
            <button
              className="heatmap-nav-button"
              onClick={() => setHeatmapPage(p => p + 1)}
              disabled={!heatmapData.canGoForward}
              title="Next months"
            >
              →
            </button>
          </div>
        </div>
        <div className="statistics-heatmap-wrapper">
          <div className="statistics-heatmap-months-container">
            {heatmapData.displayMonths.map((month) => (
              <div key={month.key} className="statistics-heatmap-month">
                <div className="heatmap-month-header">{month.label}</div>
                <div className="heatmap-month-grid">
                  {month.weeks.map((week, weekIdx) => (
                    <div key={weekIdx} className="heatmap-week">
                      {week.map((day, dayIdx) => {
                        if (!day) {
                          return <div key={`empty-${dayIdx}`} className="heatmap-cell-empty" />;
                        }

                        const intensity = day.isFuture ? -1 : (() => {
                          if (day.totalFiles === 0) return 0;
                          if (day.totalFiles < 10) return 1;
                          if (day.totalFiles >= 100) return 4;
                          // Scale: 10 files = intensity 1 (25%), 40 files = intensity 2.5 (middle), 100 files = intensity 4 (100%)
                          const scaled = ((day.totalFiles - 10) / (100 - 10)) * 3 + 1;
                          return Math.ceil(scaled);
                        })();
                        const label = day.isFuture
                          ? `${formatDate(day.date)} (future)`
                          : `${formatDate(day.date)}: ${day.totalFiles} file${day.totalFiles !== 1 ? 's' : ''} (${formatBytes(day.totalBytes)})`;

                        return (
                          <div
                            key={day.date}
                            className={`heatmap-cell ${day.isToday ? 'heatmap-cell-today' : ''} ${day.isFuture ? 'heatmap-cell-future' : `heatmap-intensity-${intensity}`}`}
                            title={label}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
                  <div className="statistics-top-day-date">{formatDate(day.date)}</div>
                  <div className="statistics-top-day-files">{day.totalFiles} file{day.totalFiles === 1 ? '' : 's'}</div>
                  <div className="statistics-top-day-size">{formatBytes(day.totalBytes)}</div>
                </div>
              ) : null
            )}
          </div>
        )}
      </section>

      {/* Per-User Statistics */}
      {userStats.length > 0 && (
        <section className="statistics-section">
          <h2 className="statistics-section-title">STATISTICS BY USER</h2>
          <div className="statistics-user-list">
            {userStats.map((user) => (
              <div key={user.userId} className="statistics-user-card">
                <div className="statistics-user-name">{user.name}</div>
                <div className="statistics-user-stats">
                  <div className="statistics-user-stat">
                    <span className="statistics-user-stat-label">Sent:</span>
                    <span className="statistics-user-stat-value">
                      {user.sentFiles} file{user.sentFiles !== 1 ? 's' : ''} ({formatBytes(user.sentBytes)})
                    </span>
                  </div>
                  <div className="statistics-user-stat">
                    <span className="statistics-user-stat-label">Received:</span>
                    <span className="statistics-user-stat-value">
                      {user.receivedFiles} file{user.receivedFiles !== 1 ? 's' : ''} ({formatBytes(user.receivedBytes)})
                    </span>
                  </div>
                  <div className="statistics-user-stat statistics-user-stat-total">
                    <span className="statistics-user-stat-label">Total:</span>
                    <span className="statistics-user-stat-value">
                      {user.totalFiles} file{user.totalFiles !== 1 ? 's' : ''} ({formatBytes(user.totalBytes)})
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default Statistics;
