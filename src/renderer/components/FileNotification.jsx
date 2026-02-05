import React, { useState, useEffect } from 'react';
import './FileNotification.css';

function FileNotification({ notification, onAccept, onDecline, position }) {
    console.log('[FileNotification] Component called with:', { notification, position });
    const [countdown, setCountdown] = useState(5);
    const [isVisible, setIsVisible] = useState(false);

    console.log('[FileNotification] Rendering notification:', notification.file?.name, 'position:', position, 'isVisible:', isVisible);

    // Define callbacks BEFORE they're used in useEffect
    const handleAccept = React.useCallback(() => {
        setIsVisible(false);
        setTimeout(() => onAccept(notification), 300);
    }, [notification, onAccept]);

    const handleDecline = React.useCallback(() => {
        setIsVisible(false);
        setTimeout(() => onDecline(notification), 300);
    }, [notification, onDecline]);

    useEffect(() => {
        // Trigger animation
        setTimeout(() => setIsVisible(true), 10);
    }, []);

    useEffect(() => {
        if (countdown <= 0) {
            handleAccept();
            return;
        }

        const timer = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [countdown, handleAccept]);

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getFileIcon = (type) => {
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
        const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'];
        const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'];
        const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
        const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

        if (imageExts.includes(type?.toLowerCase())) return '🖼️';
        if (videoExts.includes(type?.toLowerCase())) return '🎬';
        if (audioExts.includes(type?.toLowerCase())) return '🎵';
        if (docExts.includes(type?.toLowerCase())) return '📄';
        if (archiveExts.includes(type?.toLowerCase())) return '📦';
        return '📁';
    };

    return (
        <div
            className={`file-notification ${isVisible ? 'visible' : ''}`}
            style={{ top: `${20 + position * 160}px` }}
        >
            <div className="notification-header">
                <div className="notification-title">INCOMING FILE</div>
                <div className="notification-countdown">
                    <svg className="countdown-ring" width="24" height="24">
                        <circle
                            cx="12"
                            cy="12"
                            r="10"
                            fill="none"
                            stroke="var(--color-border)"
                            strokeWidth="2"
                        />
                        <circle
                            cx="12"
                            cy="12"
                            r="10"
                            fill="none"
                            stroke="var(--color-accent)"
                            strokeWidth="2"
                            strokeDasharray={`${(countdown / 5) * 62.83} 62.83`}
                            strokeDashoffset="0"
                            transform="rotate(-90 12 12)"
                            style={{ transition: 'stroke-dasharray 1s linear' }}
                        />
                    </svg>
                    <span className="countdown-text">{countdown}</span>
                </div>
            </div>

            <div className="notification-body">
                <div className="sender-info">
                    <div className="sender-avatar">
                        {notification.from?.profilePicture ? (
                            <img src={notification.from.profilePicture} alt="" />
                        ) : (
                            <span>{((notification.from?.name || '?')[0] || '?').toUpperCase()}</span>
                        )}
                    </div>
                    <div className="sender-details">
                        <div className="sender-name">{notification.from?.name || 'Unknown'}</div>
                        <div className="sender-ip">{notification.from?.ip || ''}</div>
                    </div>
                </div>

                <div className="file-info">
                    <div className="file-icon">{getFileIcon(notification.file?.type)}</div>
                    <div className="file-details">
                        <div className="file-name" title={notification.file?.name || 'Unknown'}>
                            {notification.file?.name || 'Unknown File'}
                        </div>
                        <div className="file-meta">
                            {formatBytes(notification.file?.size || 0)} • {(notification.file?.type || 'FILE').toUpperCase()}
                        </div>
                    </div>
                </div>

                {notification.exceedsLimit && (
                    <div className="notification-warning">
                        ⚠ File exceeds {notification.limitType} limit ({notification.limitValue} GB)
                    </div>
                )}
            </div>

            <div className="notification-actions">
                <button className="notification-btn btn-decline" onClick={handleDecline}>
                    DECLINE
                </button>
                <button className="notification-btn btn-accept" onClick={handleAccept}>
                    ACCEPT ({countdown}s)
                </button>
            </div>
        </div>
    );
}

export default FileNotification;
