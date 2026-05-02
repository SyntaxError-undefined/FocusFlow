import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const statusMessage = document.getElementById("statusMessage");
const planTitle = document.getElementById("planTitle");
const focusPageTitle = document.getElementById("focusPageTitle");
const strategyReason = document.getElementById("strategyReason");
const totalFocusHours = document.getElementById("totalFocusHours");
const tasksPlanned = document.getElementById("tasksPlanned");
const totalPomodoros = document.getElementById("totalPomodoros");
const estimatedBreakTime = document.getElementById("estimatedBreakTime");
const taskList = document.getElementById("taskList");
const currentTaskHint = document.getElementById("currentTaskHint");
const planProgressLabel = document.getElementById("planProgressLabel");
const planProgressFill = document.getElementById("planProgressFill");
const timerText = document.getElementById("timerText");
const timerDurationLabel = document.getElementById("timerDurationLabel");
const startTimerButton = document.getElementById("startTimerButton");
const resetTimerButton = document.getElementById("resetTimerButton");
const signOutButton = document.getElementById("signOutButton");
const modeTabs = document.querySelectorAll(".mode-tab");

const COMPLEXITY_LEVELS = ["Easy", "Normal", "Hard", "Lengthy"];
const TIMER_MODES = {
    pomodoro: { minutes: 25 },
    shortBreak: { minutes: 5 },
    longBreak: { minutes: 15 }
};

let activeMode = "pomodoro";
let remainingSeconds = TIMER_MODES[activeMode].minutes * 60;
let timerInterval = null;
let currentPlan = null;
let currentUser = null;
let selectedTaskIndex = 0;

startTimerButton.addEventListener("click", toggleTimer);
resetTimerButton.addEventListener("click", resetTimer);
signOutButton.addEventListener("click", handleSignOut);
modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => setTimerMode(tab.dataset.mode));
});

renderTimer();

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("/");
        return;
    }

    currentUser = user;
    await hydrateFocusPage();
});

async function hydrateFocusPage() {
    try {
        const planId = new URLSearchParams(window.location.search).get("planId");
        let planDoc = null;

        if (planId) {
            const planSnapshot = await getDoc(doc(db, "users", currentUser.uid, "plans", planId));
            if (planSnapshot.exists()) {
                planDoc = { id: planSnapshot.id, ...planSnapshot.data() };
            }
        }

        if (!planDoc) {
            const latestPlanQuery = query(
                collection(db, "users", currentUser.uid, "plans"),
                orderBy("createdAt", "desc"),
                limit(1)
            );
            const latestPlanSnapshot = await getDocs(latestPlanQuery);
            if (!latestPlanSnapshot.empty) {
                planDoc = {
                    id: latestPlanSnapshot.docs[0].id,
                    ...latestPlanSnapshot.docs[0].data()
                };
            }
        }

        if (!planDoc) {
            showStatus("No saved plan found yet. Create one from Home.", "error");
            return;
        }

        currentPlan = planDoc;
        selectedTaskIndex = 0;
        renderPlan(planDoc);
    } catch (error) {
        showStatus("The focus workspace could not load your plan.", "error");
    }
}

function renderPlan(plan) {
    focusPageTitle.textContent = plan.title;
    planTitle.textContent = plan.title;
    strategyReason.textContent = plan.overallStrategy;
    totalFocusHours.textContent = `${(plan.totalFocusMinutes / 60).toFixed(1)}h`;
    tasksPlanned.textContent = String(plan.tasks.length);
    totalPomodoros.textContent = String(plan.totalPomodoroCount);
    estimatedBreakTime.textContent = `${plan.totalBreakMinutes} min`;
    taskList.innerHTML = "";
    renderPlanProgress(plan);
    updateCurrentTaskHint();

    plan.tasks.forEach((task, index) => {
        const article = document.createElement("article");
        const isSelected = index === selectedTaskIndex;
        article.className = `task-card ${isSelected ? "priority" : ""} ${task.completed ? "completed" : ""}`;
        article.addEventListener("click", () => {
            selectedTaskIndex = index;
            renderPlan(plan);
        });

        const complexityBadges = COMPLEXITY_LEVELS.map((level) => {
            const selectedClass = level === task.complexity ? "complexity-chip active" : "complexity-chip";
            return `<span class="${selectedClass}">${level}</span>`;
        }).join("");

        article.innerHTML = `
            <div class="task-main">
                <div class="task-index">0${index + 1}</div>
                <div class="task-copy">
                    <div class="task-topline">
                        <h4>${escapeHtml(task.title)}</h4>
                        <span class="task-pomodoros">${task.pomodoros} Pomodoros</span>
                    </div>
                    <p class="task-description">${escapeHtml(task.description)}</p>
                    <div class="complexity-row">${complexityBadges}</div>
                </div>
            </div>
            <div class="task-footer">
                <p><span class="mini-label">Why first:</span> ${escapeHtml(task.orderReason)}</p>
                <div class="task-footer-action">
                    <p><span class="mini-label">Focus estimate:</span> ${escapeHtml(task.pomodoroReason)}</p>
                    <button class="task-start-button" type="button" data-task-index="${index}">
                        ${task.completed ? "Review Task" : "Start This Task"}
                    </button>
                </div>
            </div>
        `;

        const startButton = article.querySelector(".task-start-button");
        startButton.addEventListener("click", (event) => {
            event.stopPropagation();
            startTask(index);
        });

        taskList.appendChild(article);
    });
}

function renderPlanProgress(plan) {
    const completedCount = plan.tasks.filter((task) => task.completed).length;
    const totalCount = plan.tasks.length;
    const progressPercent = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

    planProgressLabel.textContent = `${completedCount} of ${totalCount} tasks complete`;
    planProgressFill.style.width = `${progressPercent}%`;
}

function updateCurrentTaskHint() {
    if (!currentPlan?.tasks?.[selectedTaskIndex]) {
        currentTaskHint.textContent = "Choose a task to start your focus session.";
        return;
    }

    const selectedTask = currentPlan.tasks[selectedTaskIndex];
    currentTaskHint.textContent = selectedTask.completed
        ? `Completed task selected: ${selectedTask.title}`
        : `Selected task: ${selectedTask.title}`;
}

function startTask(index) {
    selectedTaskIndex = index;
    setTimerMode("pomodoro");
    resetTimer();
    renderPlan(currentPlan);
    document.querySelector(".timer-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setTimerMode(mode) {
    if (!TIMER_MODES[mode]) {
        return;
    }

    activeMode = mode;
    stopTimer();
    remainingSeconds = TIMER_MODES[mode].minutes * 60;
    renderTimer();
    modeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
}

function toggleTimer() {
    if (timerInterval) {
        stopTimer();
        startTimerButton.textContent = "Start";
        return;
    }

    startTimerButton.textContent = "Pause";
    timerInterval = window.setInterval(async () => {
        if (remainingSeconds <= 1) {
            stopTimer();
            remainingSeconds = 0;
            renderTimer();
            startTimerButton.textContent = "Start";
            await handleTimerFinished();
            return;
        }

        remainingSeconds -= 1;
        renderTimer();
    }, 1000);
}

async function handleTimerFinished() {
    if (!currentUser || activeMode !== "pomodoro" || !currentPlan?.tasks?.[selectedTaskIndex]) {
        return;
    }

    const selectedTask = currentPlan.tasks[selectedTaskIndex];

    try {
        await addDoc(collection(db, "users", currentUser.uid, "sessions"), {
            planId: currentPlan.id || "",
            taskTitle: selectedTask.title,
            taskOrder: selectedTask.order,
            mode: activeMode,
            durationMinutes: TIMER_MODES[activeMode].minutes,
            completedAt: serverTimestamp()
        });
        currentPlan.tasks[selectedTaskIndex].completed = true;
        await updateDoc(doc(db, "users", currentUser.uid, "plans", currentPlan.id), {
            tasks: currentPlan.tasks,
            updatedAt: serverTimestamp()
        });
        moveSelectionToNextTask();
        renderPlan(currentPlan);
        showStatus(`Session saved for ${selectedTask.title}.`, "success");
    } catch (error) {
        showStatus("Timer finished, but session could not be saved.", "error");
    }
}

function moveSelectionToNextTask() {
    const nextIncompleteIndex = currentPlan.tasks.findIndex((task) => !task.completed);
    selectedTaskIndex = nextIncompleteIndex === -1 ? selectedTaskIndex : nextIncompleteIndex;
}

function resetTimer() {
    stopTimer();
    remainingSeconds = TIMER_MODES[activeMode].minutes * 60;
    startTimerButton.textContent = "Start";
    renderTimer();
}

function stopTimer() {
    if (timerInterval) {
        window.clearInterval(timerInterval);
        timerInterval = null;
    }
}

function renderTimer() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    timerText.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    timerDurationLabel.textContent = `${TIMER_MODES[activeMode].minutes} min`;
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}

async function handleSignOut() {
    await signOut(auth);
    window.location.replace("/");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
