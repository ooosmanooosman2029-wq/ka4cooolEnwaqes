/* ======== CONFIG ======== */
let DB_URL = localStorage.getItem("fb-url") || "";
let USER_NAME = localStorage.getItem("fb-user") || "";
let db = null;
let items = {}; // keyed by Firebase push-key
let currentFilter = "all";
let dupKey = null;
let acIndex = -1;

/* ======== THEME ======== */
if (localStorage.getItem("saad-theme") === "light") applyLight();
function applyLight() {
  document.body.classList.add("light");
  document.getElementById("theme-icon").textContent = "🌙";
  document.getElementById("theme-label").textContent = "وضع الليل";
}
function applyDark() {
  document.body.classList.remove("light");
  document.getElementById("theme-icon").textContent = "☀️";
  document.getElementById("theme-label").textContent = "وضع الصباح";
}
function toggleTheme() {
  const l = document.body.classList.contains("light");
  if (l) {
    applyDark();
    localStorage.setItem("saad-theme", "dark");
  } else {
    applyLight();
    localStorage.setItem("saad-theme", "light");
  }
}

/* ======== SETUP ======== */
function saveSetup() {
  const url = document
    .getElementById("firebase-url-input")
    .value.trim()
    .replace(/\/$/, "");
  const name = document.getElementById("user-name-input").value.trim();
  if (!url || !url.startsWith("https://")) {
    showToast("⚠️ الرابط غلط — تأكد منه");
    return;
  }
  if (!name) {
    showToast("⚠️ اكتب اسمك أولاً");
    return;
  }
  localStorage.setItem("fb-url", url);
  localStorage.setItem("fb-user", name);
  DB_URL = url;
  USER_NAME = name;
  document.getElementById("setup-overlay").style.display = "none";
  initFirebase();
}

function resetSetup() {
  if (!confirm("هتقطع الاتصال وترجع لشاشة الإعداد — مؤكد؟")) return;
  localStorage.removeItem("fb-url");
  localStorage.removeItem("fb-user");
  location.reload();
}

/* ======== FIREBASE INIT ======== */
function initFirebase() {
  try {
    const app = firebase.initializeApp({ databaseURL: DB_URL }, "saad");
    db = firebase.database(app);
    setSyncStatus("syncing", "جاري الاتصال...");

    const ref = db.ref("shortages");

    // Real-time listener
    ref.on(
      "value",
      (snap) => {
        items = snap.val() || {};
        renderList();
        updateStats();
        setSyncStatus("online", "متصل — مزامنة فورية ✓");
      },
      (err) => {
        setSyncStatus("offline", "خطأ في الاتصال: " + err.message);
      },
    );

    // Connection state
    db.ref(".info/connected").on("value", (snap) => {
      if (snap.val()) setSyncStatus("online", "متصل — مزامنة فورية ✓");
      else setSyncStatus("offline", "غير متصل — تحقق من الإنترنت");
    });
  } catch (e) {
    setSyncStatus("offline", "خطأ: " + e.message);
    showToast("❌ فيه مشكلة في رابط Firebase");
  }
}

function setSyncStatus(state, msg) {
  const bar = document.getElementById("sync-bar");
  bar.className = "sync-bar " + state;
  document.getElementById("sync-text").textContent = msg;
}

/* ======== CRUD ======== */
async function addItem() {
  if (!db) {
    showToast("⚠️ لم يتم الاتصال بعد");
    return;
  }
  const name = document.getElementById("inp-name").value.trim();
  const qty = document.getElementById("inp-qty").value.trim();
  const cat = document.getElementById("inp-cat").value;
  const note = document.getElementById("inp-note").value.trim();
  if (!name) {
    showToast("⚠️ اكتب اسم الصنف أولاً");
    return;
  }
  if (findDuplicate(name)) {
    showToast("⚠️ الصنف موجود بالفعل!");
    scrollToDuplicate();
    return;
  }

  setSyncStatus("syncing", "جاري الحفظ...");
  try {
    await db.ref("shortages").push({
      name,
      qty: qty || "—",
      cat: cat || "أخرى",
      note: note || "",
      done: false,
      addedBy: USER_NAME,
      date: new Date().toLocaleDateString("ar-EG", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      ts: Date.now(),
    });
    clearForm();
    showToast("✅ تمت الإضافة");
  } catch (e) {
    showToast("❌ فشل الحفظ: " + e.message);
  }
}

async function toggleDone(key) {
  if (!db) return;
  const item = items[key];
  if (!item) return;
  try {
    await db.ref("shortages/" + key).update({ done: !item.done });
    showToast(item.done ? "↩️ أُعيد للنواقص" : "✅ تم الطلب");
  } catch (e) {
    showToast("❌ " + e.message);
  }
}

async function deleteItem(key) {
  if (!db) return;
  try {
    await db.ref("shortages/" + key).remove();
    showToast("🗑️ تم الحذف");
  } catch (e) {
    showToast("❌ " + e.message);
  }
}

async function clearDone() {
  const doneKeys = Object.keys(items).filter((k) => items[k].done);
  if (!doneKeys.length) {
    showToast("لا توجد أصناف مطلوبة");
    return;
  }
  if (!confirm(`هتحذف ${doneKeys.length} صنف تم طلبهم — مؤكد؟`)) return;
  const updates = {};
  doneKeys.forEach((k) => (updates["shortages/" + k] = null));
  try {
    await db.ref().update(updates);
    showToast(`🗑️ تم حذف ${doneKeys.length} صنف`);
  } catch (e) {
    showToast("❌ " + e.message);
  }
}

/* ======== DUPLICATE ======== */
function normalize(s) {
  return s
    .trim()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[يى]/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function findDuplicate(name) {
  if (!name) return null;
  const n = normalize(name);
  const key = Object.keys(items).find((k) => normalize(items[k].name) === n);
  return key ? { key, ...items[key] } : null;
}

function onNameInput() {
  const val = document.getElementById("inp-name").value;
  checkDuplicate(val);
  showAutocomplete(val);
}

function checkDuplicate(val) {
  const dup = findDuplicate(val);
  dupKey = dup ? dup.key : null;
  const w = document.getElementById("dup-warning");
  if (dup) {
    document.getElementById("dup-msg").textContent =
      `"${dup.name}" موجود بالفعل (${dup.done ? "تم الطلب" : "ناقص"}) — أضافه ${dup.addedBy || "شخص ما"}`;
    w.classList.add("show");
  } else {
    w.classList.remove("show");
  }
}

function scrollToDuplicate() {
  if (!dupKey) return;
  currentFilter = "all";
  document
    .querySelectorAll(".filter-btn")
    .forEach((b, i) => b.classList.toggle("active", i === 0));
  renderList();
  setTimeout(() => {
    const el = document.getElementById("card-" + dupKey);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid var(--yellow)";
      setTimeout(() => (el.style.outline = ""), 2000);
    }
  }, 100);
}

/* ======== AUTOCOMPLETE ======== */
function showAutocomplete(val) {
  const list = document.getElementById("ac-list");
  if (!val) {
    list.classList.remove("open");
    return;
  }
  const n = normalize(val);
  const matches = Object.entries(items)
    .filter(([, i]) => normalize(i.name).includes(n))
    .slice(0, 6);
  if (!matches.length) {
    list.classList.remove("open");
    return;
  }
  list.innerHTML = matches
    .map(
      ([key, item], idx) => `
    <div class="ac-item" data-idx="${idx}" onmousedown="pickAC('${item.name.replace(/'/g, "\\'")}')">
      <span class="ac-name">${item.name}</span>
      <span class="ac-badge">${item.done ? "✅ تم الطلب" : "⏳ ناقص"}</span>
    </div>`,
    )
    .join("");
  acIndex = -1;
  list.classList.add("open");
}

function pickAC(name) {
  document.getElementById("inp-name").value = name;
  document.getElementById("ac-list").classList.remove("open");
  checkDuplicate(name);
}

function onNameKey(e) {
  const list = document.getElementById("ac-list");
  const rows = list.querySelectorAll(".ac-item");
  if (!list.classList.contains("open")) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, rows.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, -1);
  } else if (e.key === "Enter" && acIndex >= 0) {
    e.preventDefault();
    e.stopPropagation();
    rows[acIndex].dispatchEvent(new MouseEvent("mousedown"));
    return;
  } else if (e.key === "Escape") {
    list.classList.remove("open");
    return;
  }
  rows.forEach(
    (r, i) => (r.style.background = i === acIndex ? "var(--highlight)" : ""),
  );
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap"))
    document.getElementById("ac-list").classList.remove("open");
});

/* ======== RENDER ======== */
function setFilter(f, btn) {
  currentFilter = f;
  document
    .querySelectorAll(".filter-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderList();
}

function renderList() {
  const q = document.getElementById("search-inp").value.trim().toLowerCase();
  let entries = Object.entries(items).sort(
    (a, b) => (b[1].ts || 0) - (a[1].ts || 0),
  );
  if (currentFilter === "pending") entries = entries.filter(([, i]) => !i.done);
  if (currentFilter === "done") entries = entries.filter(([, i]) => i.done);
  if (q)
    entries = entries.filter(
      ([, i]) =>
        i.name.toLowerCase().includes(q) ||
        i.cat.toLowerCase().includes(q) ||
        (i.note && i.note.toLowerCase().includes(q)),
    );

  const list = document.getElementById("items-list");
  if (!entries.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>${Object.keys(items).length === 0 ? "الكشكول فاضي — ابدأ بإضافة أصناف ناقصة" : "لا توجد نتائج مطابقة"}</p></div>`;
    return;
  }

  list.innerHTML = entries
    .map(
      ([key, item]) => `
    <div class="item-card ${item.done ? "done" : ""}" id="card-${key}">
      <div class="custom-check" onclick="toggleDone('${key}')" title="${item.done ? "إلغاء" : "تم الطلب"}">${item.done ? "✓" : ""}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">
          <span class="meta-tag tag-qty">🔢 ${item.qty}</span>
          ${item.cat ? `<span class="meta-tag tag-cat">${item.cat}</span>` : ""}
          ${item.addedBy ? `<span class="meta-tag tag-by">👤 ${item.addedBy}</span>` : ""}
          ${item.note ? `<span class="meta-tag tag-note" title="${item.note}">📝 ${item.note}</span>` : ""}
        </div>
      </div>
      <div class="item-date">${item.date}</div>
      <div class="item-actions">
        <button class="btn-icon" onclick="deleteItem('${key}')" title="حذف">✕</button>
      </div>
    </div>`,
    )
    .join("");
}

function updateStats() {
  const vals = Object.values(items);
  const total = vals.length,
    done = vals.filter((i) => i.done).length;
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-pending").textContent = total - done;
  document.getElementById("stat-done").textContent = done;
}

/* ======== HELPERS ======== */
function clearForm() {
  ["inp-name", "inp-qty", "inp-note"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  document.getElementById("inp-cat").value = "";
  document.getElementById("dup-warning").classList.remove("show");
  document.getElementById("ac-list").classList.remove("open");
  document.getElementById("inp-name").focus();
}

function exportCSV() {
  const vals = Object.values(items);
  if (!vals.length) {
    showToast("الكشكول فاضي!");
    return;
  }
  const header = "الصنف,الكمية,التصنيف,ملاحظة,أضافه,الحالة,التاريخ\n";
  const rows = vals
    .map(
      (i) =>
        `"${i.name}","${i.qty}","${i.cat}","${i.note || ""}","${i.addedBy || ""}","${i.done ? "تم الطلب" : "ناقص"}","${i.date}"`,
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `نواقص-صيدلية-السعد-${new Date().toLocaleDateString("ar-EG")}.csv`;
  a.click();
  showToast("📥 تم التصدير");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    ["inp-qty", "inp-cat", "inp-note"].includes(e.target.id)
  )
    addItem();
  if (e.key === "Enter" && e.target.id === "inp-name") {
    const l = document.getElementById("ac-list");
    if (!l.classList.contains("open")) addItem();
  }
});

/* ======== BOOT ======== */
if (DB_URL && USER_NAME) {
  document.getElementById("setup-overlay").style.display = "none";
  initFirebase();
} else {
  // pre-fill if partial
  if (DB_URL) document.getElementById("firebase-url-input").value = DB_URL;
  if (USER_NAME) document.getElementById("user-name-input").value = USER_NAME;
}
