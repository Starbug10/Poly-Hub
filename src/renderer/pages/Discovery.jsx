import React, { useState, useEffect } from 'react';
import './Discovery.css';

function Discovery({ profile }) {
  const [pairingLink, setPairingLink] = useState('');
  const [inputLink, setInputLink] = useState('');
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadData();

    // Listen for incoming peer additions (reverse-add)
    window.electronAPI.onPeerAdded((peer) => {
      setPeers((prev) => {
        if (prev.some((p) => p.ip === peer.ip)) return prev;
        return [...prev, peer];
      });
      setStatus({ type: 'success', message: `${peer.name} connected to you!` });
    });

    return () => {
      window.electronAPI.removeAllListeners('peer:added');
    };
  }, []);

  async function loadData() {
    const link = await window.electronAPI.generatePairingLink();
    setPairingLink(link);

    const peerList = await window.electronAPI.getPeers();
    setPeers(peerList);
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pairingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleConnect = async () => {
    if (!inputLink.trim()) return;

    setStatus(null);
    setConnecting(true);

    // Parse the incoming link
    const peerData = await window.electronAPI.parsePairingLink(inputLink.trim());

    if (!peerData) {
      setStatus({ type: 'error', message: 'Invalid pairing link' });
      setConnecting(false);
      return;
    }

    // Check if it's not our own link
    if (peerData.ip === profile.ip) {
      setStatus({ type: 'error', message: "You can't pair with yourself" });
      setConnecting(false);
      return;
    }

    // Add the peer locally
    const result = await window.electronAPI.addPeer({
      name: peerData.name,
      ip: peerData.ip,
    });

    if (result.success) {
      setPeers(result.peers);

      // Send our profile to the peer (reverse-add)
      const connectResult = await window.electronAPI.connectToPeer(peerData.ip);

      if (connectResult.success) {
        setStatus({ type: 'success', message: `Connected to ${peerData.name}!` });
      } else {
        setStatus({ 
          type: 'warning', 
          message: `Added ${peerData.name}, but couldn't notify them (they may be offline)` 
        });
      }

      setInputLink('');
    } else {
      setStatus({ type: 'error', message: result.reason || 'Failed to add peer' });
    }

    setConnecting(false);
  };

  return (
    <div className="discovery">
      <header className="discovery-header">
        <h1 className="discovery-title">DISCOVER</h1>
        <span className="discovery-subtitle">Connect with other Poly-Hub users</span>
      </header>

      <div className="discovery-content">
        {/* Generate Link Section */}
        <section className="discovery-section">
          <div className="section-header">
            <span className="section-number">01</span>
            <h2 className="section-title">SHARE YOUR LINK</h2>
          </div>
          <p className="section-description">
            Send this link to someone you want to connect with
          </p>
          <div className="link-box">
            <input
              type="text"
              value={pairingLink}
              readOnly
              className="link-input"
            />
            <button
              onClick={handleCopyLink}
              className={`link-copy-btn ${copied ? 'copied' : ''}`}
            >
              {copied ? 'COPIED!' : 'COPY'}
            </button>
          </div>
        </section>

        {/* Divider */}
        <div className="discovery-divider">
          <span className="divider-text">OR</span>
        </div>

        {/* Receive Link Section */}
        <section className="discovery-section">
          <div className="section-header">
            <span className="section-number">02</span>
            <h2 className="section-title">PASTE A LINK</h2>
          </div>
          <p className="section-description">
            Paste a link you received from another user
          </p>
          <div className="link-box">
            <input
              type="text"
              value={inputLink}
              onChange={(e) => setInputLink(e.target.value)}
              placeholder="polyhub://pair/..."
              className="link-input"
            />
            <button
              onClick={handleConnect}
              className="primary"
              disabled={!inputLink.trim() || connecting}
            >
              {connecting ? 'CONNECTING...' : 'CONNECT'}
            </button>
          </div>
          {status && (
            <div className={`status-message status-${status.type}`}>
              {status.message}
            </div>
          )}
        </section>

        {/* Connected Peers */}
        {peers.length > 0 && (
          <section className="discovery-section">
            <div className="section-header">
              <span className="section-number">03</span>
              <h2 className="section-title">CONNECTED PEERS</h2>
            </div>
            <div className="peers-list">
              {peers.map((peer) => (
                <div key={peer.ip} className="peer-card">
                  <div className="peer-status-dot" />
                  <div className="peer-info">
                    <span className="peer-name">{peer.name}</span>
                    <span className="peer-ip">{peer.ip}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default Discovery;
