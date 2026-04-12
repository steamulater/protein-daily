// Daily protein notifications via @capacitor/local-notifications
// Only active inside the native iOS/Android app (Capacitor bridge present).
// Safe no-op in the browser.

const ProteinNotifications = (() => {
    const STORAGE_KEY = 'proteindaily_notifications_scheduled';
    const NOTIFY_HOUR = 9; // 9am local time

    function isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform());
    }

    async function getPlugin() {
        if (!isNative()) return null;
        try {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            return LocalNotifications;
        } catch (e) {
            console.warn('LocalNotifications not available:', e);
            return null;
        }
    }

    async function requestPermission(plugin) {
        const { display } = await plugin.checkPermissions();
        if (display === 'granted') return true;
        const { display: result } = await plugin.requestPermissions();
        return result === 'granted';
    }

    // Schedule one notification per remaining day of the year.
    // We batch up to 64 at a time (iOS limit) then reschedule when needed.
    async function scheduleYear(plugin, proteins) {
        const today = new Date();
        const year = today.getFullYear();
        const notifications = [];

        for (let day = 1; day <= 365; day++) {
            const date = new Date(year, 0, day, NOTIFY_HOUR, 0, 0);
            if (date <= today) continue;

            const protein = proteins[day - 1];
            if (!protein) continue;

            notifications.push({
                id: day,
                title: "Today's Protein",
                body: `${protein.name} — tap to explore its 3D structure`,
                schedule: { at: date, allowWhileIdle: true },
                sound: null,
                smallIcon: 'ic_stat_protein',
                iconColor: '#8B1A1A'
            });

            if (notifications.length >= 64) break;
        }

        if (notifications.length > 0) {
            await plugin.schedule({ notifications });
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                scheduledAt: today.toISOString(),
                count: notifications.length
            }));
            console.log(`Scheduled ${notifications.length} protein notifications`);
        }
    }

    async function init(proteins) {
        const plugin = await getPlugin();
        if (!plugin) return; // browser — do nothing

        const granted = await requestPermission(plugin);
        if (!granted) return;

        // Only reschedule if not done yet this year or batch is running low
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const { scheduledAt, count } = JSON.parse(stored);
            const daysSince = (Date.now() - new Date(scheduledAt)) / 86400000;
            // Reschedule when we've used up ~half the batch or it's a new year
            if (daysSince < count / 2) return;
        }

        await scheduleYear(plugin, proteins);
    }

    return { init };
})();
