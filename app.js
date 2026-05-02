import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    addDoc,
    collection,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const objectiveInput = document.getElementById("objectiveInput");
const generatePlanButton = document.getElementById("generatePlanButton");
const statusMessage = document.getElementById("statusMessage");
const signOutButton = document.getElementById("signOutButton");
const userDisplayName = document.getElementById("userDisplayName");
const userAvatarBadge = document.getElementById("userAvatarBadge");
const greetingHeading = document.getElementById("greetingHeading");
const todayDateLabel = document.getElementById("todayDateLabel");
const planSummaryTitle = document.getElementById("planSummaryTitle");
const planSummaryCopy = document.getElementById("planSummaryCopy");
const streakCount = document.getElementById("streakCount");
const streakBars = document.getElementById("streakBars");
const streakMessage = document.getElementById("streakMessage");
const analyticsLink = document.getElementById("analyticsLink");
const focusTodayValue = document.getElementById("focusTodayValue");
const sessionsTodayValue = document.getElementById("sessionsTodayValue");
const tasksDoneValue = document.getElementById("tasksDoneValue");
const scoreValue = document.getElementById("scoreValue");
const pendingObjectivesList = document.getElementById("pendingObjectivesList");
const nextUpTitle = document.getElementById("nextUpTitle");
const nextUpMeta = document.getElementById("nextUpMeta");
const startFocusLink = document.getElementById("startFocusLink");
const quoteText = document.getElementById("quoteText");

let currentUser = null;
let latestPlan = null;
let sessions = [];

const quotes = [
    "\"The secret of getting ahead is getting started. Break it into small steps.\"",
    "\"Focus is choosing what deserves your energy today.\"",
    "\"Small sessions repeated well become big results.\"",
    "\"Progress feels lighter when the next step is clear.\""
];

generatePlanButton.addEventListener("click", handleGeneratePlan);
objectiveInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        handleGeneratePlan();
    }
});
signOutButton.addEventListener("click", handleSignOut);

setGreeting();
quoteText.textContent = quotes[Math.floor(Math.random() * quotes.length)];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("/");
        return;
    }

    currentUser = user;
    const displayName = user.displayName || user.email || "FocusFlow User";
    userDisplayName.textContent = displayName;
    userAvatarBadge.textContent = displayName.trim().charAt(0).toUpperCase();
    await ensureUserProfile();
    await hydrateDashboard();
});

async function hydrateDashboard() {
    try {
        const [latestPlanSnapshot, sessionsSnapshot] = await Promise.all([
            getDocs(query(collection(db, "users", currentUser.uid, "plans"), orderBy("createdAt", "desc"), limit(1))),
            getDocs(query(collection(db, "users", currentUser.uid, "sessions"), orderBy("completedAt", "desc"), limit(60)))
        ]);

        latestPlan = latestPlanSnapshot.empty ? null : {
            id: latestPlanSnapshot.docs[0].id,
            ...latestPlanSnapshot.docs[0].data()
        };
        sessions = sessionsSnapshot.docs.map((entry) => entry.data());

        renderHomeDashboard();
    } catch (error) {
        showStatus("Your dashboard could not be loaded fully.", "error");
    }
}

async function handleGeneratePlan() {
    const objective = objectiveInput.value.trim();

    if (!objective) {
        showStatus("Type today’s objective first.", "error");
        return;
    }

    setLoadingState(true);
    showStatus("Designing your focus roadmap...", "loading");

    try {
        const response = await fetch("/api/plan-day", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ objective })
        });
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error || "Something went wrong while generating the plan.");
        }

        const plan = buildStoredPlan(payload.plan, objective);
        const planId = await savePlanForUser(plan);
        showStatus("Plan saved. Opening your focus workspace...", "success");
        window.location.href = `/focus.html?planId=${encodeURIComponent(planId)}`;
    } catch (error) {
        showStatus(error.message || "Unable to generate the plan right now.", "error");
    } finally {
        setLoadingState(false);
    }
}

function buildStoredPlan(plan, objective) {
    const tasks = plan.tasks.map((task, index) => ({
        ...task,
        order: index + 1,
        completed: false
    }));
    const totalPomodoroCount = tasks.reduce((sum, task) => sum + task.pomodoros, 0);

    return {
        ...plan,
        objective,
        tasks,
        totalPomodoroCount,
        totalFocusMinutes: totalPomodoroCount * 25,
        totalBreakMinutes: Math.max(totalPomodoroCount - 1, 0) * 5
    };
}

async function savePlanForUser(plan) {
    const planRef = await addDoc(collection(db, "users", currentUser.uid, "plans"), {
        ...plan,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", currentUser.uid), {
        latestPlanId: planRef.id,
        latestObjective: plan.objective,
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || "FocusFlow User",
        email: currentUser.email || "",
        updatedAt: serverTimestamp()
    }, { merge: true });

    return planRef.id;
}

function renderHomeDashboard() {
    renderPlanSummary();
    renderStats();
    renderPendingObjectives();
    renderNextUp();
    renderStreak();
    analyticsLink.href = "/analytics.html";
}

function renderPlanSummary() {
    if (!latestPlan) {
        planSummaryTitle.textContent = "No plan yet";
        planSummaryCopy.textContent = "Tell the AI what you want to achieve and it will build your full Pomodoro schedule.";
        return;
    }

    planSummaryTitle.textContent = latestPlan.title || "Today's saved plan";
    planSummaryCopy.textContent = latestPlan.objective || "Your latest AI plan is ready to focus on.";
    objectiveInput.value = latestPlan.objective || "";
}

function renderStats() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todaysSessions = sessions.filter((session) => asDateKey(session.completedAt) === todayKey);
    const focusMinutes = todaysSessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const totalTasks = latestPlan?.tasks?.length || 0;
    const doneTasks = latestPlan?.tasks?.filter((task) => task.completed).length || 0;
    const score = Math.min(100, todaysSessions.length * 12 + doneTasks * 10);

    focusTodayValue.textContent = `${(focusMinutes / 60).toFixed(1)}h`;
    sessionsTodayValue.textContent = String(todaysSessions.length);
    tasksDoneValue.textContent = `${doneTasks} / ${totalTasks}`;
    scoreValue.textContent = String(score);
}

function renderPendingObjectives() {
    if (!latestPlan?.tasks?.length) {
        pendingObjectivesList.innerHTML = '<p class="empty-state">Your saved task list will appear here after you generate a plan.</p>';
        return;
    }

    pendingObjectivesList.innerHTML = latestPlan.tasks.map((task, index) => `
        <article class="pending-row">
            <span class="pending-index">${index + 1}</span>
            <div class="pending-copy">
                <strong>${escapeHtml(task.title)}</strong>
                <p>${escapeHtml(task.description)}</p>
            </div>
            <span class="complexity-chip active">${escapeHtml(task.complexity)}</span>
            <span class="pending-meta">${task.pomodoros} Pomodoros</span>
        </article>
    `).join("");
}

function renderNextUp() {
    const nextTask = latestPlan?.tasks?.[0];

    if (!nextTask || !latestPlan?.id) {
        nextUpTitle.textContent = "Generate your first plan";
        nextUpMeta.textContent = "The top AI-priority task will appear here.";
        startFocusLink.classList.add("hidden");
        return;
    }

    nextUpTitle.textContent = nextTask.title;
    nextUpMeta.textContent = `${nextTask.pomodoros} pomodoros • ${nextTask.complexity}`;
    startFocusLink.href = `/focus.html?planId=${encodeURIComponent(latestPlan.id)}`;
    startFocusLink.classList.remove("hidden");
}

function renderStreak() {
    const uniqueDays = [...new Set(sessions.map((session) => asDateKey(session.completedAt)).filter(Boolean))].sort().reverse();
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (const day of uniqueDays) {
        const expectedKey = cursor.toISOString().slice(0, 10);

        if (day !== expectedKey) {
            if (streak === 0) {
                cursor.setDate(cursor.getDate() - 1);
                const yesterdayKey = cursor.toISOString().slice(0, 10);

                if (day !== yesterdayKey) {
                    break;
                }
            } else {
                break;
            }
        }

        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    streakCount.textContent = String(streak);
    streakBars.innerHTML = Array.from({ length: 5 }, (_, index) => {
        const active = index < Math.min(streak, 5) ? "streak-bar active" : "streak-bar";
        return `<span class="${active}"></span>`;
    }).join("");
    streakMessage.textContent = streak > 0
        ? `${Math.max(0, 7 - streak)} days to your weekly goal. Tap below for deeper patterns.`
        : "Start a focus session to begin your streak, then open your full analysis.";
}

function setGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const formatter = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long"
    });

    greetingHeading.textContent = greeting;
    todayDateLabel.textContent = `${formatter.format(now)}. Let's make today count.`;
}

function setLoadingState(isLoading) {
    generatePlanButton.disabled = isLoading;
    generatePlanButton.textContent = isLoading ? "Generating..." : "Plan my day with AI";
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}

async function handleSignOut() {
    await signOut(auth);
    window.location.replace("/");
}

async function ensureUserProfile() {
    await setDoc(doc(db, "users", currentUser.uid), {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || "FocusFlow User",
        email: currentUser.email || "",
        photoURL: currentUser.photoURL || "",
        updatedAt: serverTimestamp()
    }, { merge: true });
}

function asDateKey(timestamp) {
    if (!timestamp) {
        return "";
    }

    if (typeof timestamp.toDate === "function") {
        return timestamp.toDate().toISOString().slice(0, 10);
    }

    return "";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
