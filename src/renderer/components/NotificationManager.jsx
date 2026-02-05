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
            console.log('[NotificationManager] Received file notification:', data);
            const notification = {
                id: `notif-${Date.now()}-${Math.random()}`,
                file: data.file,
                from: data.from,
                exceedsLimit: data.exceedsLimit,
                limitType: data.limitType,
                limitValue: data.limitValue,
            };

            console.log('[NotificationManager] Adding to queue:', notification);
            setQueue((prev) => [...prev, notification]);
        };

        window.electronAPI.onFileNotification(handleFileReceived);
        console.log('[NotificationManager] Event listener registered');

        return () => {
            console.log('[NotificationManager] Cleaning up...');
            window.electronAPI.removeAllListeners('file:notification');
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

    const handleAccept = async (notification) => {
        // Remove from visible
        setVisible((prev) => prev.filter((n) => n.id !== notification.id));

        // Send accept to main process
        await window.electronAPI.acceptFile({
            file: notification.file,
            from: notification.from,
        });
    };

    const handleDecline = async (notification) => {
        // Remove from visible
        setVisible((prev) => prev.filter((n) => n.id !== notification.id));

        // Send decline to main process
        await window.electronAPI.declineFile({
            file: notification.file,
            from: notification.from,
        });
    };

    return (
        <div className="notification-manager">
            {visible.map((notification, index) => (
                <FileNotification
                    key={notification.id}
                    notification={notification}
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                    position={index}
                />
            ))}
        </div>
    );
}

export default NotificationManager;
