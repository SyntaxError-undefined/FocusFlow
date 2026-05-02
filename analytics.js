import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, limit, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const periodSelector = document.getElementById("periodSelector");
const totalFocus = document.getElementById("analyticsTotalFocus");
const focusDelta = document.getElementById("analyticsFocusDelta");
const sessionsEl = document.getElementById("analyticsSessions");
const sessionsDelta = document.getElementById("analyticsSessionsDelta");
const tasksDone = document.getElementById("analyticsTasksDone");
const tasksDelta = document.getElementById("analyticsTasksDelta");
const avgSession = document.getElementById("analyticsAvgSession");
const avgDelta = document.getElementById("analyticsAvgDelta");
const streakCount = document.getElementById("analyticsStreakCount");
const bestStreak = document.getElementById("analyticsBestStreak");
const calendarLabels = document.getElementById("calendarLabels");
const analyticsCalendar = document.getElementById("analyticsCalendar");
const focusBars = document.getElementById("focusBars");
const productivityScore = document.getElementById("productivityScore");
const productivityTier = document.getElementById("productivityTier");
const scoreRows = document.getElementById("scoreRows");
const heatmapGrid = document.getElementById("heatmapGrid");
const peakHourMessage = document.getElementById("peakHourMessage");
const analyticsTaskRows = document.getElementById("analyticsTaskRows");
const aiReportText = document.getElementById("aiReportText");

let currentUser = null;
let allSessions = [];
let allPlans = [];
let activePeriod = "week";

periodSelector.addEventListener("click", (event) => {
    const button = event.target.closest(".period-button");

    if (!button) {
        return;
    }

    activePeriod = button.dataset.period;
    document.querySelectorAll(".period-button").forEach((entry) => {
        entry.classList.toggle("active", entry === button);
    });
    renderAnalytics();
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("/");
        return;
    }

    currentUser = user;
    await hydrateAnalytics();
});

async function hydrateAnalytics() {
    const [sessionsSnapshot, plansSnapshot] = await Promise.all([
        getDocs(query(collection(db, "users", currentUser.uid, "sessions"), orderBy("completedAt", "desc"), limit(300))),
        getDocs(query(collection(db, "users", currentUser.uid, "plans"), orderBy("createdAt", "desc"), limit(60)))
    ]);

    allSessions = sessionsSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    allPlans = plansSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    renderAnalytics();
}

function renderAnalytics() {
    const periodData = getPeriodData(activePeriod);
    const previousData = getPreviousPeriodData(activePeriod);
    const totalMinutes = sumSessionMinutes(periodData.sessions);
    const previousMinutes = sumSessionMinutes(previousData.sessions);
    const completedTasks = countCompletedTasks(periodData.plans);
    const plannedTasks = countPlannedTasks(periodData.plans);
    const completionRate = plannedTasks === 0 ? 0 : Math.round((completedTasks / plannedTasks) * 100);
    const averageMinutes = periodData.sessions.length === 0 ? 0 : Math.round(totalMinutes / periodData.sessions.length);

    totalFocus.textContent = `${(totalMinutes / 60).toFixed(1)}h`;
    focusDelta.textContent = buildDeltaText(totalMinutes, previousMinutes, "focus");
    sessionsEl.textContent = String(periodData.sessions.length);
    sessionsDelta.textContent = buildDeltaText(periodData.sessions.length, previousData.sessions.length, "sessions");
    tasksDone.textContent = `${completedTasks} / ${plannedTasks}`;
    tasksDelta.textContent = plannedTasks === 0 ? "No planned tasks yet" : `${completionRate}% completion`;
    avgSession.textContent = `${averageMinutes}m`;
    avgDelta.textContent = buildDeltaText(averageMinutes, previousData.sessions.length === 0 ? 0 : Math.round(sumSessionMinutes(previousData.sessions) / previousData.sessions.length), "avg");

    renderStreakCalendar();
    renderFocusBars(periodData.sessions);
    renderProductivityScore(periodData, completionRate, averageMinutes);
    renderHeatmap(periodData.sessions);
    renderTaskBreakdown(periodData.plans);
    renderAiReport(periodData, completionRate);
}

function getPeriodData(period) {
    const now = new Date();
    const start = new Date(now);

    if (period === "today") {
        start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
    } else {
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
    }

    return {
        sessions: allSessions.filter((session) => toDate(session.completedAt) >= start),
        plans: allPlans.filter((plan) => toDate(plan.createdAt) >= start)
    };
}

function getPreviousPeriodData(period) {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);

    if (period === "today") {
        end.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
        end.setDate(end.getDate() - 7);
        end.setHours(23, 59, 59, 999);
        start.setDate(start.getDate() - 13);
        start.setHours(0, 0, 0, 0);
    } else {
        end.setDate(end.getDate() - 30);
        end.setHours(23, 59, 59, 999);
        start.setDate(start.getDate() - 59);
        start.setHours(0, 0, 0, 0);
    }

    return {
        sessions: allSessions.filter((session) => {
            const date = toDate(session.completedAt);
            return date >= start && date <= end;
        }),
        plans: allPlans.filter((plan) => {
            const date = toDate(plan.createdAt);
            return date >= start && date <= end;
        })
    };
}

function renderStreakCalendar() {
    const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
    calendarLabels.innerHTML = dayLabels.map((label) => `<span class="calendar-label">${label}</span>`).join("");

    const last14Days = [];
    const activeDays = new Set(allSessions.map((session) => toDateKey(session.completedAt)));
    const todayKey = toDateKey(new Date());

    for (let index = 13; index >= 0; index -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - index);
        const key = toDateKey(date);
        last14Days.push({ key, date });
    }

    analyticsCalendar.innerHTML = last14Days.map(({ key, date }) => {
        let className = "calendar-day off";

        if (key === todayKey) {
            className = "calendar-day today";
        } else if (activeDays.has(key)) {
            className = "calendar-day on";
        }

        return `<span class="${className}">${date.getDate()}</span>`;
    }).join("");

    const streak = calculateStreak(allSessions);
    streakCount.textContent = String(streak.current);
    bestStreak.textContent = `Best: ${streak.best} days`;
}

function renderFocusBars(sessions) {
    const labels = activePeriod === "today"
        ? Array.from({ length: 6 }, (_, index) => `${6 + index * 3}:00`)
        : buildRecentDayLabels(activePeriod === "week" ? 7 : 10);
    const values = labels.map((label) => getBarValueForLabel(label, sessions));
    const maxValue = Math.max(...values, 1);

    focusBars.innerHTML = labels.map((label, index) => {
        const hours = values[index];
        const height = Math.max((hours / maxValue) * 100, hours > 0 ? 12 : 6);

        return `
            <div class="focus-bar-column">
                <span class="focus-bar-value">${hours.toFixed(1)}h</span>
                <span class="focus-bar" style="height:${height}%"></span>
                <span class="focus-bar-label">${label}</span>
            </div>
        `;
    }).join("");
}

function renderProductivityScore(periodData, completionRate, averageMinutes) {
    const consistency = buildConsistencyScore(periodData.sessions);
    const streak = calculateStreak(allSessions).current;
    const sessionQuality = Math.min(100, Math.round((averageMinutes / 25) * 100));
    const streakBonus = Math.min(100, streak * 10);
    const totalScore = Math.round((completionRate * 0.4) + (consistency * 0.25) + (sessionQuality * 0.2) + (streakBonus * 0.15));

    productivityScore.textContent = String(totalScore || 0);
    productivityTier.textContent = totalScore >= 80 ? "Excellent rhythm" : totalScore >= 60 ? "Good momentum" : "Building momentum";

    const rows = [
        { label: "Task completion", value: completionRate, suffix: "%" },
        { label: "Focus consistency", value: consistency, suffix: "%" },
        { label: "Streak bonus", value: streakBonus, suffix: "%" },
        { label: "Session quality", value: sessionQuality, suffix: "%" }
    ];

    scoreRows.innerHTML = rows.map((row) => `
        <div class="score-row">
            <span class="score-row-label">${row.label}</span>
            <div class="score-row-metric">
                <div class="score-row-track"><span class="score-row-fill" style="width:${row.value}%"></span></div>
                <span class="score-row-value">${row.value}${row.suffix}</span>
            </div>
        </div>
    `).join("");
}

function renderHeatmap(sessions) {
    const hourBuckets = [6, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19, 21];
    const counts = hourBuckets.map((hour) => sessions.filter((session) => toDate(session.completedAt).getHours() === hour).length);
    const maxCount = Math.max(...counts, 1);
    const peakIndex = counts.indexOf(maxCount);

    heatmapGrid.innerHTML = hourBuckets.map((hour, index) => {
        const count = counts[index];
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4));
        const hourLabel = formatHour(hour);

        return `
            <div class="heat-cell level-${level}">
                <span class="heat-label">${hourLabel}</span>
                <strong class="heat-value">${count}</strong>
            </div>
        `;
    }).join("");

    peakHourMessage.textContent = maxCount > 0
        ? `Peak: ${formatHour(hourBuckets[peakIndex])}. Schedule hard tasks there.`
        : "Complete more sessions to reveal your peak hour.";
}

function renderTaskBreakdown(plans) {
    const tasks = plans.flatMap((plan) => plan.tasks || []).slice(0, 6);

    if (tasks.length === 0) {
        analyticsTaskRows.innerHTML = '<p class="empty-state">Your recent tasks will appear here once you generate plans.</p>';
        return;
    }

    analyticsTaskRows.innerHTML = tasks.map((task) => `
        <div class="analytics-task-row">
            <span class="analytics-task-status ${task.completed ? "done" : "pending"}"></span>
            <span class="analytics-task-name ${task.completed ? "" : "dim"}">${escapeHtml(task.title)}</span>
            <span class="analytics-task-poms ${task.completed ? "" : "dim"}">${task.pomodoros} Pomodoros</span>
        </div>
    `).join("");
}

function renderAiReport(periodData, completionRate) {
    const streak = calculateStreak(allSessions).current;
    const totalFocusHours = (sumSessionMinutes(periodData.sessions) / 60).toFixed(1);
    const peakHour = inferPeakHour(periodData.sessions);
    const weakestDay = inferWeakestDay(periodData.sessions);

    aiReportText.textContent = periodData.sessions.length === 0
        ? "Generate plans and finish a few sessions to unlock a richer weekly report."
        : `Strong work. You logged ${totalFocusHours}h of focus, kept a ${streak}-day streak, and completed ${completionRate}% of planned tasks. Your best window is ${peakHour}, so keep hard tasks there. ${weakestDay ? `${weakestDay} was your lightest day — protect that slot next time.` : ""}`;
}

function sumSessionMinutes(sessions) {
    return sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
}

function countCompletedTasks(plans) {
    return plans.flatMap((plan) => plan.tasks || []).filter((task) => task.completed).length;
}

function countPlannedTasks(plans) {
    return plans.flatMap((plan) => plan.tasks || []).length;
}

function buildDeltaText(current, previous, mode) {
    if (!previous) {
        return "No previous data yet";
    }

    const delta = current - previous;
    const sign = delta >= 0 ? "+" : "";
    const suffix = mode === "focus" ? "m" : mode === "avg" ? "m" : "";

    if (mode === "focus") {
        return `${sign}${(delta / 60).toFixed(1)}h vs previous period`;
    }

    return `${sign}${delta}${suffix} vs previous period`;
}

function calculateStreak(sessions) {
    const sortedDays = [...new Set(sessions.map((session) => toDateKey(session.completedAt)).filter(Boolean))].sort();
    let current = 0;
    let best = 0;
    let run = 0;
    let previousDate = null;

    sortedDays.forEach((dayKey) => {
        const date = new Date(dayKey);

        if (!previousDate) {
            run = 1;
        } else {
            const diffDays = Math.round((date - previousDate) / 86400000);
            run = diffDays === 1 ? run + 1 : 1;
        }

        best = Math.max(best, run);
        previousDate = date;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cursor = new Date(today);

    while (sortedDays.includes(toDateKey(cursor))) {
        current += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    if (current === 0) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        while (sortedDays.includes(toDateKey(yesterday))) {
            current += 1;
            yesterday.setDate(yesterday.getDate() - 1);
        }
    }

    return { current, best };
}

function buildRecentDayLabels(count) {
    const labels = [];
    for (let index = count - 1; index >= 0; index -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - index);
        labels.push(date.toLocaleDateString("en-US", { weekday: "short" }));
    }
    return labels;
}

function getBarValueForLabel(label, sessions) {
    if (activePeriod === "today") {
        const hour = Number(label.split(":")[0]);
        const minutes = sessions
            .filter((session) => {
                const sessionHour = toDate(session.completedAt).getHours();
                return sessionHour >= hour && sessionHour < hour + 3;
            })
            .reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
        return minutes / 60;
    }

    const matchingDate = sessions.filter((session) => {
        const weekday = toDate(session.completedAt).toLocaleDateString("en-US", { weekday: "short" });
        return weekday === label;
    });

    return sumSessionMinutes(matchingDate) / 60;
}

function buildConsistencyScore(sessions) {
    if (sessions.length === 0) {
        return 0;
    }

    const activeDays = new Set(sessions.map((session) => toDateKey(session.completedAt))).size;
    const totalDays = activePeriod === "today" ? 1 : activePeriod === "week" ? 7 : 30;
    return Math.min(100, Math.round((activeDays / totalDays) * 100));
}

function inferPeakHour(sessions) {
    if (sessions.length === 0) {
        return "not enough data yet";
    }

    const bucket = {};
    sessions.forEach((session) => {
        const hour = toDate(session.completedAt).getHours();
        bucket[hour] = (bucket[hour] || 0) + 1;
    });

    const [peakHour] = Object.entries(bucket).sort((left, right) => right[1] - left[1])[0];
    return formatHour(Number(peakHour));
}

function inferWeakestDay(sessions) {
    if (sessions.length === 0) {
        return "";
    }

    const dailyMinutes = {};
    sessions.forEach((session) => {
        const label = toDate(session.completedAt).toLocaleDateString("en-US", { weekday: "long" });
        dailyMinutes[label] = (dailyMinutes[label] || 0) + (session.durationMinutes || 0);
    });

    const sorted = Object.entries(dailyMinutes).sort((left, right) => left[1] - right[1]);
    return sorted.length ? sorted[0][0] : "";
}

function toDate(value) {
    if (!value) {
        return new Date(0);
    }

    if (typeof value.toDate === "function") {
        return value.toDate();
    }

    return new Date(value);
}

function toDateKey(value) {
    return toDate(value).toISOString().slice(0, 10);
}

function formatHour(hour) {
    const suffix = hour >= 12 ? "PM" : "AM";
    const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${formattedHour} ${suffix}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
