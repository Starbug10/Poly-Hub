import React, { useState, useEffect } from 'react';
import FileNotification from './FileNotification';

function NotificationManager() {
    const [queue, setQueue] = useState([]);
    const [visible, setVisible] = useState([]);

    const MAX_VISIBLE = 2;

    useEffect(() => {
        console.log('[NotificationManager] Initializing...');

        // Listen for incoming file notifications
        const handleFileReceived = (data) => {
            try {
                console.log('[NotificationManager] Received file notification:', data);

                // Validate data structure
                if (!data || !data.file || !data.from) {
                    console.error('[NotificationManager] Invalid notification data:', data);
                    return;
                }

                const notification = {
                    id: `notif-${Date.now()}-${Math.random()}`,
                    file: data.file,
                    from: data.from,
                    exceedsLimit: data.exceedsLimit || false,
                    limitType: data.limitType || '',
                    limitValue: data.limitValue || 0,
                };

                console.log('[NotificationManager] Adding to queue:', notification);
                setQueue((prev) => [...prev, notification]);
            } catch (err) {
                console.error('[NotificationManager] Error handling file notification:', err);
            }
        };

        window.electronAPI.onFileNotification(handleFileReceived);
        console.log('[NotificationManager] Event listener registered');

        return () => {
            console.log('[NotificationManager] Cleaning up...');
            // Use try-catch to prevent cleanup errors from crashing
            try {
                window.electronAPI.removeAllListeners('file:notification');
            } catch (err) {
                console.error('[NotificationManager] Error during cleanup:', err);
            }
        };
    }, []);

    useEffect(() => {
        console.log('[NotificationManager] Queue/Visible changed. Queue:', queue.length, 'Visible:', visible.length);

        // Move notifications from queue to visible when space is available
        if (visible.length < MAX_VISIBLE && queue.length > 0) {
            const [next, ...rest] = queue;
            console.log('[NotificationManager] Moving notification to visible:', next);
            setQueue(rest);
            setVisible((prev) => [...prev, next]);
        }
    }, [queue, visible]);

    const handleAccept = React.useCallback(async (notification) => {
        console.log('[NotificationManager] Accepting file:', notification.file?.name);

        // Remove from visible
        setVisible((prev) => prev.filter((n) => n.id !== notification.id));

        // Send accept to main process
        try {
            await window.electronAPI.acceptFile({
                file: notification.file,
                from: notification.from,
            });
            console.log('[NotificationManager] File accepted successfully');
        } catch (err) {
            console.error('[NotificationManager] Error accepting file:', err);
        }
    }, []);

    const handleDecline = React.useCallback(async (notification) => {
        console.log('[NotificationManager] Declining file:', notification.file?.name);

        // Remove from visible
        setVisible((prev) => prev.filter((n) => n.id !== notification.id));

        // Send decline to main process
        try {
            await window.electronAPI.declineFile({
                file: notification.file,
                from: notification.from,
            });
            console.log('[NotificationManager] File declined successfully');
        } catch (err) {
            console.error('[NotificationManager] Error declining file:', err);
        }
    }, []);

    return (
        <div className="notification-manager">
            {console.log('[NotificationManager] Rendering', visible.length, 'visible notifications:', visible)}
            {visible.map((notification, index) => {
                console.log('[NotificationManager] Mapping notification:', notification.id, 'index:', index);
                return (
                    <FileNotification
                        key={notification.id}
                        notification={notification}
                        onAccept={handleAccept}
                        onDecline={handleDecline}
                        position={index}
                    />
                );
            })}
        </div>
    );
}

export default NotificationManager;
