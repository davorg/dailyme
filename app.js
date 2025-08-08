import {
  signIn,
  signOutUser,
  onUserChanged,
  saveTasks as saveRemoteTasks,
  loadTasks as loadRemoteTasks
} from "./firebase.js";

let currentUser = null;

const storageKey = "dailyme-tasks";
const taskList = document.getElementById("task-list");
const progressBar = document.getElementById("progress");
const addBtn = document.getElementById("add-btn");
const addDialog = document.getElementById("add-dialog");
const addForm = document.getElementById("add-form");
const nameInput = document.getElementById("task-name");

// Header buttons
const signInBtn = document.getElementById("sign-in-btn");
const signOutBtn = document.getElementById("sign-out-btn");

// --- Runtime-created UI helpers (so we don’t have to edit index.html) ---
function ensureSyncIndicator() {
  let el = document.getElementById("sync-indicator");
  if (!el) {
    el = document.createElement("div");
    el.id = "sync-indicator";
    el.className = "sync hidden";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

function ensureInstallBanner() {
  let el = document.getElementById("install-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "install-banner";
    el.className = "install hidden";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-live", "polite");

    el.innerHTML = `
      <span>Install Daily Me?</span>
      <div class="actions">
        <button id="install-accept" class="btn">Install</button>
        <button id="install-dismiss" class="btn btn-ghost">Not now</button>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

const syncEl = ensureSyncIndicator();
ensureInstallBanner();

function setSync(status, autoHideMs = 1200) {
  if (!syncEl) return;
  syncEl.textContent = status;
  syncEl.classList.remove("hidden");
  if (autoHideMs != null) {
    clearTimeout(setSync._t);
    setSync._t = setTimeout(() => syncEl.classList.add("hidden"), autoHideMs);
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadLocalTasks() {
  return JSON.parse(localStorage.getItem(storageKey) || "[]");
}

function saveLocalTasks(tasks) {
  localStorage.setItem(storageKey, JSON.stringify(tasks));
}

function calculateStreak(dates) {
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const str = d.toISOString().slice(0, 10);
    if (dates.includes(str)) {
      streak++;
    } else {
      if (i === 0) continue;
      break;
    }
  }

  return streak;
}

function render() {
  const tasks = loadLocalTasks();
  taskList.innerHTML = "";
  let completedToday = 0;

  tasks.forEach((task) => {
    const done = task.done_dates.includes(todayStr());
    if (done) completedToday++;

    const div = document.createElement("div");
    div.className = `task${done ? " done" : ""}`;
    div.onclick = () => {
      const today = todayStr();
      if (done) {
        task.done_dates = task.done_dates.filter(d => d !== today);
      } else {
        task.done_dates.push(today);
      }
      saveTasks(tasks);
      render();
    };

    const name = document.createElement("span");
    name.className = "task-name";
    name.textContent = task.name;

    const streakCount = calculateStreak(task.done_dates);
    const streak = document.createElement("span");
    streak.className = "streak";
    streak.innerHTML = `<span class="chain-icon"><i class="fa-solid fa-link"></i></span> ${streakCount} day${streakCount !== 1 ? "s" : ""}`;
    if (streakCount >= 7) streak.innerHTML += ' 🔥';

    div.appendChild(name);
    div.appendChild(streak);
    taskList.appendChild(div);
  });

  progressBar.textContent = `You’ve marked ${completedToday} of ${tasks.length} today.`;
}

addBtn.onclick = () => {
  addDialog.showModal();
  nameInput.focus();
};

addForm.onsubmit = e => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    addForm.classList.remove("shake");
    void addForm.offsetWidth;
    addForm.classList.add("shake");
    return;
  }

  const tasks = loadLocalTasks();
  tasks.push({ id: Date.now(), name, done_dates: [] });
  saveTasks(tasks);
  nameInput.value = "";
  addDialog.close();
  render();
  showToast("Task added!");
};

addDialog.addEventListener("click", event => {
  const rect = addDialog.getBoundingClientRect();
  const isInDialog =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  if (!isInDialog) {
    addDialog.close();
  }
});

let touchStartY = null;

addDialog.addEventListener("touchstart", e => {
  touchStartY = e.touches[0].clientY;
});

addDialog.addEventListener("touchmove", e => {
  if (touchStartY === null) return;
  const touchEndY = e.touches[0].clientY;
  if (touchEndY - touchStartY > 100) {
    addDialog.close();
    touchStartY = null;
  }
});

addDialog.addEventListener("touchend", () => {
  touchStartY = null;
});

document.getElementById("close-dialog").onclick = () => {
  addDialog.close();
};

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// --- Sign-in / out with loading feedback ---
signInBtn.onclick = async () => {
  try {
    signInBtn.disabled = true;
    signInBtn.classList.add("btn-loading");
    await signIn();
  } catch (e) {
    console.error(e);
    showToast("Sign-in failed");
  } finally {
    signInBtn.classList.remove("btn-loading");
    signInBtn.disabled = false;
  }
};

signOutBtn.onclick = async () => {
  try {
    await signOutUser();
    setSync("Signed out");
  } catch (e) {
    console.error(e);
    showToast("Sign-out failed");
  }
};

// --- Save pipeline (local always; cloud debounced when signed in) ---
let _saveDebounce;
function saveTasks(tasks) {
  saveLocalTasks(tasks);
  if (!currentUser) return;

  setSync("Saving…", null);
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(async () => {
    try {
      await saveRemoteTasks(currentUser.uid, tasks);
      setSync("Synced ✓");
    } catch (e) {
      console.error(e);
      setSync("Save failed", 2000);
    }
  }, 400);
}

// --- Auth state / first sync (unchanged logic, just using setSync) ---
onUserChanged(async user => {
  currentUser = user;
  document.getElementById("sign-in-btn").hidden = !!user;
  document.getElementById("sign-out-btn").hidden = !user;

  if (!user) return;

  const remoteTasks = await loadRemoteTasks(user.uid);
  const localTasks = loadLocalTasks();

  if (remoteTasks.length === 0 && localTasks.length > 0) {
    console.log("Syncing local tasks to Firestore (first-time login)");
    await saveRemoteTasks(user.uid, localTasks);
    setSync("Synced ✓");
  } else if (remoteTasks.length > 0 && localTasks.length === 0) {
    console.log("Populating localStorage from Firestore");
    saveLocalTasks(remoteTasks);
    setSync("Loaded from cloud");
  } else if (remoteTasks.length > 0 && localTasks.length > 0) {
    console.warn("Both local and remote tasks exist — no sync performed.");
    showToast("  Local and remote tasks both exist. No sync performed.");
  }

  render();
});

// --- PWA install prompt (banner created at runtime) ---
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  if (sessionStorage.getItem("install-dismissed") === "1") return;
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById("install-banner");
  if (banner) banner.classList.remove("hidden");
});

document.addEventListener("click", async (e) => {
  const t = e.target;
  if (t && t.id === "install-accept") {
    const banner = document.getElementById("install-banner");
    if (banner) banner.classList.add("hidden");
    const evt = deferredPrompt;
    deferredPrompt = null;
    if (evt) await evt.prompt();
    sessionStorage.setItem("install-dismissed", "1");
  }
  if (t && t.id === "install-dismiss") {
    const banner = document.getElementById("install-banner");
    if (banner) banner.classList.add("hidden");
    sessionStorage.setItem("install-dismissed", "1");
  }
});

// --- SW registration (as-is) ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(() => {
    console.log("Service Worker registered");
  });
}

render();

