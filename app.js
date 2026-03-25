const DEFAULT_GRADE_PCT = {
  patron: 20,
  copatron: 18,
  chefdequipe: 16,
  experimente: 14,
  novice: 12,
  recrue: 10,
  stagiaire: 8,
};

const GRADE_LABELS = {
  patron: "Patron",
  copatron: "Co-Patron",
  chefdequipe: "Chef d'Équipe",
  experimente: "Expérimenté",
  novice: "Novice",
  recrue: "Recrue",
  stagiaire: "Stagiaire",
};

function getGradePct(role) {
  return store.gradePct?.[role] ?? DEFAULT_GRADE_PCT[role] ?? 10;
}

let store = JSON.parse(localStorage.getItem("autoexotic_store") || "null") || {
  employees: [],
  catalogue: [],
  sales: [],
  sessions: [],
  depenses: [],
  gradePct: { ...DEFAULT_GRADE_PCT },
  nextEmpId: 1,
};

// Migrations
if (!store.sessions) store.sessions = [];
if (!store.depenses) store.depenses = [];
if (!store.gradePct) store.gradePct = { ...DEFAULT_GRADE_PCT };

let currentUser = null;
let newEmpPhotoData = null;
let timerInterval = null;
let sessionStartTs = null;
let currentSaleMode = "custom";

function saveStore() {
  localStorage.setItem("autoexotic_store", JSON.stringify(store));
}

function switchLoginTab(tab) {
  document
    .querySelectorAll(".login-tab")
    .forEach((t, i) =>
      t.classList.toggle(
        "active",
        (tab === "employe" && i === 0) || (tab === "patron" && i === 1),
      ),
    );
  document.getElementById("tab-employe").style.display =
    tab === "employe" ? "" : "none";
  document.getElementById("tab-patron").style.display =
    tab === "patron" ? "" : "none";
  const sel = document.getElementById("emp-select");
  sel.innerHTML = '<option value="">-- Choisir --</option>';
  store.employees
    .filter((e) => e.role !== "patron" && e.role !== "copatron")
    .forEach((e) => {
      sel.innerHTML += `<option value="${e.id}">${e.name} — ${GRADE_LABELS[e.role] || e.role}</option>`;
    });
}

function loginEmployee() {
  const id = document.getElementById("emp-select").value;
  const pw = document.getElementById("emp-password").value;
  const emp = store.employees.find((e) => e.id === id);
  if (!emp || emp.password !== pw) {
    showLoginError();
    return;
  }
  enterApp(emp);
}

function loginBoss() {
  const login = document
    .getElementById("boss-login")
    .value.trim()
    .toLowerCase();
  const pw = document.getElementById("boss-password").value;
  const user = store.employees.find(
    (e) => e.name.toLowerCase() === login || e.role === login,
  );
  if (
    !user ||
    user.password !== pw ||
    (user.role !== "patron" && user.role !== "copatron")
  ) {
    showLoginError();
    return;
  }
  enterApp(user);
}

function showLoginError() {
  const el = document.getElementById("login-error");
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 3000);
}

function enterApp(user) {
  currentUser = user;
  document.getElementById("screen-login").classList.remove("active");
  document.getElementById("screen-app").classList.add("active");
  document.getElementById("sidebar-name").textContent = user.name;
  document.getElementById("sidebar-role").textContent =
    GRADE_LABELS[user.role] || user.role;
  document.getElementById("sidebar-avatar").textContent =
    user.name[0].toUpperCase();
  if (user.photo) {
    document.getElementById("sidebar-avatar").innerHTML =
      `<img src="${user.photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
  }
  const isAdmin = user.role === "patron" || user.role === "copatron";
  document.getElementById("nav-admin").style.display = isAdmin ? "" : "none";
  if (isAdmin) {
    document.getElementById("hist-col-emp").style.display = "";
    document.getElementById("hist-col-grade").style.display = "";
    document.getElementById("historique-subtitle").textContent =
      "Toutes les opérations du garage";
  } else {
    document.getElementById("hist-col-emp").style.display = "none";
    document.getElementById("hist-col-grade").style.display = "none";
  }
  if (user.status === "online" && user.sessionStart)
    startTimer(user.sessionStart);
  showPanel("dashboard");
}

function logout() {
  if (currentUser) {
    const emp = store.employees.find((e) => e.id === currentUser.id);
    if (emp && emp.status === "online") {
      const now = Date.now(),
        start = emp.sessionStart || now,
        dMs = now - start;
      const sd = new Date(start),
        ed = new Date(now);
      store.sessions.push({
        id: "sess" + now,
        empId: currentUser.id,
        startTs: start,
        endTs: now,
        durationMs: dMs,
        date: sd.toLocaleDateString("fr-FR"),
        startStr: sd.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        endStr:
          ed.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }) + " (auto)",
        durationStr: formatDuration(dMs),
      });
      emp.status = "offline";
      emp.sessionStart = null;
      saveStore();
    }
    stopTimer();
  }
  currentUser = null;
  document.getElementById("screen-app").classList.remove("active");
  document.getElementById("screen-login").classList.add("active");
  document.getElementById("emp-password").value = "";
  document.getElementById("boss-password").value = "";
}

function formatDuration(ms) {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function startTimer(startTs) {
  sessionStartTs = startTs;
  clearInterval(timerInterval);
  const update = () => {
    const str = formatDuration(Date.now() - sessionStartTs);
    const c1 = document.getElementById("timer-clock");
    const c2 = document.getElementById("current-session-live");
    if (c1) c1.textContent = str;
    if (c2) c2.textContent = str;
  };
  update();
  timerInterval = setInterval(update, 1000);
  document.getElementById("timer-display").classList.add("running");
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  const el = document.getElementById("timer-display");
  if (el) el.classList.remove("running");
}

function setStatus(status) {
  const emp = store.employees.find((e) => e.id === currentUser.id);
  if (!emp) return;
  if (status === "online") {
    if (emp.status === "online") {
      notify("Vous êtes déjà en service !");
      return;
    }
    const now = Date.now();
    emp.status = "online";
    emp.sessionStart = now;
    currentUser.status = "online";
    currentUser.sessionStart = now;
    saveStore();
    startTimer(now);
    notify(
      "✅ Prise de service à " +
        new Date(now).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    );
  } else {
    if (emp.status !== "online") {
      notify("Vous n'êtes pas en service.", true);
      return;
    }
    const now = Date.now(),
      start = emp.sessionStart || now,
      dMs = now - start;
    const sd = new Date(start),
      ed = new Date(now);
    store.sessions.push({
      id: "sess" + now,
      empId: currentUser.id,
      startTs: start,
      endTs: now,
      durationMs: dMs,
      date: sd.toLocaleDateString("fr-FR"),
      startStr: sd.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      endStr: ed.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      durationStr: formatDuration(dMs),
    });
    emp.status = "offline";
    emp.sessionStart = null;
    currentUser.status = "offline";
    currentUser.sessionStart = null;
    saveStore();
    stopTimer();
    notify("🔴 Fin de service — Durée: " + formatDuration(dMs));
  }
  renderDashboard();
}

function showPanel(name) {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.remove("active"));
  const panel = document.getElementById("panel-" + name);
  if (panel) panel.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((ni) => {
    if (ni.getAttribute("onclick")?.includes(name)) ni.classList.add("active");
  });
  if (name === "dashboard") renderDashboard();
  if (name === "equipe") renderEquipe();
  if (name === "catalogue") renderCatalogue();
  if (name === "historique") renderHistorique();
  if (name === "heures") renderHeures();
  if (name === "admin") renderAdmin();
  if (name === "profil") renderProfil();
}

function renderDashboard() {
  document.getElementById("dashboard-date").textContent =
    new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const onlineEmps = store.employees.filter((e) => e.status === "online");
  const mySales = store.sales.filter((s) => s.empId === currentUser.id);
  const myCA = mySales.reduce((a, s) => a + s.facture, 0);
  const mySalaire = mySales.reduce((a, s) => a + s.salaire, 0);
  const totalCA = store.sales.reduce((a, s) => a + s.facture, 0);
  const isAdmin =
    currentUser.role === "patron" || currentUser.role === "copatron";
  const myHoursMs = store.sessions
    .filter((s) => s.empId === currentUser.id)
    .reduce((a, s) => a + s.durationMs, 0);

  const stats = [
    { val: onlineEmps.length, label: "En Service" },
    {
      val: store.employees.filter((e) => e.role !== "patron").length,
      label: "Employés Total",
    },
    { val: "$" + myCA.toLocaleString(), label: "Mon CA" },
    { val: "$" + mySalaire.toLocaleString(), label: "Mon Salaire" },
    { val: formatDuration(myHoursMs), label: "Mes Heures" },
  ];
  if (isAdmin)
    stats.splice(2, 0, {
      val: "$" + totalCA.toLocaleString(),
      label: "CA Garage Total",
    });

  document.getElementById("stats-row").innerHTML = stats
    .map(
      (s) => `
    <div class="stat-card">
      <div class="stat-val" style="${s.val.toString().includes(":") ? "font-size:20px;" : ""}">${s.val}</div>
      <div class="stat-label">${s.label}</div>
    </div>`,
    )
    .join("");

  const ol = document.getElementById("online-employees-list");
  if (onlineEmps.length === 0) {
    ol.innerHTML =
      "<div style=\"color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:13px;padding:12px 0;\">Aucun employé en service</div>";
  } else {
    ol.innerHTML = onlineEmps
      .map(
        (e) => `
      <div class="service-log-row">
        <div style="display:flex;align-items:center;gap:12px;">
          ${
            e.photo
              ? `<img src="${e.photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--blue);">`
              : `<div style="width:36px;height:36px;border-radius:50%;background:var(--dark4);border:2px solid var(--blue);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;color:var(--blue);">${e.name[0]}</div>`
          }
          <div>
            <div style="font-weight:700;">${e.name}</div>
            <span class="tag ${e.role}">${GRADE_LABELS[e.role] || e.role}</span>
          </div>
        </div>
        <div style="width:10px;height:10px;border-radius:50%;background:var(--blue);animation:blink 1s infinite;"></div>
      </div>`,
      )
      .join("");
  }

  const mr = document.getElementById("my-recent-sales");
  const recent = mySales.slice(-5).reverse();
  if (recent.length === 0) {
    mr.innerHTML =
      "<div style=\"color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:13px;padding:12px 0;\">Aucune vente enregistrée</div>";
  } else {
    mr.innerHTML = `<table class="history-table">
      <thead><tr><th>Date</th><th>Prestation</th><th>Facture</th><th>%</th><th>Salaire</th></tr></thead>
      <tbody>${recent
        .map(
          (s) => `<tr>
        <td style="font-family:'Share Tech Mono',monospace;font-size:12px;">${s.date}</td>
        <td>${s.service} x${s.qty}</td>
        <td class="amount">$${s.facture.toLocaleString()}</td>
        <td style="color:var(--blue);font-family:'Share Tech Mono',monospace;">${s.pct || "?"}%</td>
        <td class="salary">$${s.salaire.toLocaleString()}</td>
      </tr>`,
        )
        .join("")}</tbody>
    </table>`;
  }
}

function renderEquipe() {
  const isAdmin =
    currentUser.role === "patron" || currentUser.role === "copatron";
  document.getElementById("employees-grid").innerHTML = store.employees
    .map((e) => {
      const photo = e.photo
        ? `<img class="emp-photo" src="${e.photo}">`
        : `<div class="emp-photo-placeholder">${e.name[0]}</div>`;
      return `<div class="employee-card">
      <div class="emp-photo-wrap">${photo}<div class="emp-status-dot ${e.status || "offline"}"></div></div>
      <div class="emp-name">${e.name}</div>
      <div class="emp-role"><span class="tag ${e.role}">${GRADE_LABELS[e.role] || e.role}</span></div>
      <div class="emp-service-badge ${e.status || "offline"}">${e.status === "online" ? "🟢 En service" : "🔴 Hors service"}</div>
      ${
        isAdmin
          ? `<div class="emp-actions">
        <button class="btn-sm" onclick="openEditEmp('${e.id}')">✏️ Modifier</button>
        <button class="btn-sm danger" onclick="deleteEmployee('${e.id}')">🗑</button>
      </div>`
          : ""
      }
    </div>`;
    })
    .join("");
}

function renderCatalogue() {
  document.getElementById("catalogue-grid").innerHTML = store.catalogue
    .map(
      (c) => `
    <div class="catalogue-item">
      <div class="cat-service">${c.name}</div>
      <div class="cat-price">$${c.price.toLocaleString()}</div>
    </div>`,
    )
    .join("");
}

function renderHistorique() {
  const isAdmin =
    currentUser.role === "patron" || currentUser.role === "copatron";
  const sales = isAdmin
    ? store.sales
    : store.sales.filter((s) => s.empId === currentUser.id);
  const totalCA = sales.reduce((a, s) => a + s.facture, 0);
  const totalSal = sales.reduce((a, s) => a + s.salaire, 0);

  document.getElementById("historique-totals").innerHTML = `
    <div class="stat-card" style="padding:12px 20px;flex:1;min-width:150px;"><div class="stat-val" style="font-size:26px;">$${totalCA.toLocaleString()}</div><div class="stat-label">CA Total</div></div>
    <div class="stat-card" style="padding:12px 20px;flex:1;min-width:150px;"><div class="stat-val" style="font-size:26px;color:var(--blue);">$${totalSal.toLocaleString()}</div><div class="stat-label">Salaires Total</div></div>
    <div class="stat-card" style="padding:12px 20px;flex:1;min-width:150px;"><div class="stat-val" style="font-size:26px;">${sales.length}</div><div class="stat-label">Opérations</div></div>`;

  const tbody = document.getElementById("historique-body");
  if (sales.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:20px;">Aucune vente</td></tr>';
    return;
  }
  tbody.innerHTML = [...sales]
    .reverse()
    .map((s) => {
      const emp = store.employees.find((e) => e.id === s.empId);
      return `<tr>
      <td style="font-family:'Share Tech Mono',monospace;font-size:12px;">${s.date}</td>
      ${isAdmin ? `<td>${emp?.name || "?"}</td><td><span class="tag ${emp?.role || ""}">${GRADE_LABELS[emp?.role]?.split(" ")[1] || emp?.role || "?"}</span></td>` : ""}
      <td>${s.service}</td>
      <td style="text-align:center;">${s.qty}</td>
      <td class="amount">$${s.facture.toLocaleString()}</td>
      <td style="color:var(--blue);font-family:'Share Tech Mono',monospace;">${s.pct || "?"}%</td>
      <td class="salary">$${s.salaire.toLocaleString()}</td>
    </tr>`;
    })
    .join("");
}

function renderProfil() {
  const user = store.employees.find((e) => e.id === currentUser.id);
  if (user?.photo) {
    const p = document.getElementById("profile-photo-preview");
    p.src = user.photo;
    p.style.display = "block";
    document.getElementById("photo-upload-text").style.display = "none";
  }
  const pct = getGradePct(currentUser.role);
  document.getElementById("my-grade-badge").innerHTML =
    `<span class="tag ${currentUser.role}">${GRADE_LABELS[currentUser.role] || currentUser.role}</span>`;
  document.getElementById("my-grade-pct").textContent = pct + "%";
  currentSaleMode = "custom";
}

function updateSalePreview() {
  const pct = getGradePct(currentUser.role);
  const price =
    parseFloat(document.getElementById("sale-custom-price").value) || 0;
  const qty = parseInt(document.getElementById("sale-custom-qty").value) || 1;
  if (!price) {
    document.getElementById("sale-preview").style.display = "none";
    return;
  }
  const total = price * qty;
  const salary = Math.floor((total * pct) / 100);
  document.getElementById("preview-total").textContent =
    "$" + total.toLocaleString();
  document.getElementById("preview-salary").textContent =
    "$" + salary.toLocaleString();
  document.getElementById("preview-pct-label").textContent =
    `MON SALAIRE (${pct}%)`;
  document.getElementById("sale-preview").style.display = "";
}

function addSale() {
  const pct = getGradePct(currentUser.role);
  const serviceName =
    document.getElementById("sale-custom-name").value.trim() || "Custom";
  const price =
    parseFloat(document.getElementById("sale-custom-price").value) || 0;
  const qty = parseInt(document.getElementById("sale-custom-qty").value) || 1;
  if (!price) {
    notify("Entre un prix pour la prestation", true);
    return;
  }
  const facture = price * qty;
  const salaire = Math.floor((facture * pct) / 100);
  const now = new Date();
  store.sales.push({
    id: "s" + Date.now(),
    empId: currentUser.id,
    service: serviceName,
    isCustom: true,
    qty,
    facture,
    salaire,
    pct,
    date:
      now.toLocaleDateString("fr-FR") +
      " " +
      now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  });
  saveStore();
  notify(
    `✅ Vente: $${facture.toLocaleString()} | Salaire (${pct}%): $${salaire.toLocaleString()}`,
  );
  document.getElementById("sale-custom-name").value = "";
  document.getElementById("sale-custom-price").value = "";
  document.getElementById("sale-custom-qty").value = 1;
  document.getElementById("sale-preview").style.display = "none";
}

function handleProfilePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const data = ev.target.result;
    const p = document.getElementById("profile-photo-preview");
    p.src = data;
    p.style.display = "block";
    document.getElementById("photo-upload-text").style.display = "none";
    const emp = store.employees.find((e) => e.id === currentUser.id);
    if (emp) {
      emp.photo = data;
      currentUser.photo = data;
      saveStore();
    }
    document.getElementById("sidebar-avatar").innerHTML =
      `<img src="${data}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
    notify("✅ Photo de profil mise à jour");
  };
  reader.readAsDataURL(file);
}

function handleNewEmpPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    newEmpPhotoData = ev.target.result;
    const p = document.getElementById("new-emp-photo-preview");
    p.src = newEmpPhotoData;
    p.style.display = "block";
    document.getElementById("new-emp-photo-text").style.display = "none";
  };
  reader.readAsDataURL(file);
}

function renderHeures() {
  const isAdmin =
    currentUser.role === "patron" || currentUser.role === "copatron";
  document.getElementById("heures-subtitle").textContent = isAdmin
    ? "Toutes les sessions"
    : "Mes sessions";
  document.getElementById("hcol-emp").style.display = isAdmin ? "" : "none";
  document.getElementById("heures-filter-row").style.display = isAdmin
    ? ""
    : "none";

  if (isAdmin) {
    const sel = document.getElementById("heures-emp-filter");
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tous</option>';
    store.employees.forEach((e) => {
      sel.innerHTML += `<option value="${e.id}" ${cur === e.id ? "selected" : ""}>${e.name}</option>`;
    });
  }

  const filterEmpId = isAdmin
    ? document.getElementById("heures-emp-filter")?.value || null
    : currentUser.id;
  const toShow =
    isAdmin && !filterEmpId
      ? store.sessions
      : store.sessions.filter((s) => s.empId === filterEmpId);
  const mySessions = isAdmin
    ? store.sessions
    : store.sessions.filter((s) => s.empId === currentUser.id);
  const totalMs = mySessions.reduce((a, s) => a + s.durationMs, 0);
  const emp = store.employees.find((e) => e.id === currentUser.id);

  const card = document.getElementById("current-session-card");
  if (emp?.status === "online" && emp?.sessionStart && !isAdmin) {
    card.style.display = "";
    const sd = new Date(emp.sessionStart);
    document.getElementById("current-session-start").textContent =
      sd.toLocaleDateString("fr-FR") +
      " à " +
      sd.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } else {
    card.style.display = "none";
  }

  const statsData = isAdmin
    ? [
        { val: store.sessions.length, label: "Sessions Total" },
        {
          val: formatDuration(
            store.sessions.reduce((a, s) => a + s.durationMs, 0),
          ),
          label: "Heures Totales",
        },
        {
          val: store.employees.filter((e) => e.status === "online").length,
          label: "En Service Now",
        },
      ]
    : [
        { val: mySessions.length, label: "Mes Sessions" },
        { val: formatDuration(totalMs), label: "Mes Heures" },
        {
          val: emp?.status === "online" ? "🟢 EN SERVICE" : "🔴 HORS SERVICE",
          label: "Statut",
        },
      ];

  document.getElementById("heures-stats-row").innerHTML = statsData
    .map(
      (s) => `
    <div class="stat-card">
      <div class="stat-val" style="${s.val.toString().includes(":") ? "font-size:20px;" : ""}">${s.val}</div>
      <div class="stat-label">${s.label}</div>
    </div>`,
    )
    .join("");

  const tbody = document.getElementById("heures-body");
  if (toShow.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:20px;">Aucune session</td></tr>';
    return;
  }
  tbody.innerHTML = [...toShow]
    .sort((a, b) => b.startTs - a.startTs)
    .map((s) => {
      const empName =
        store.employees.find((e) => e.id === s.empId)?.name || "?";
      return `<tr>
      ${isAdmin ? `<td style="font-weight:700;">${empName}</td>` : ""}
      <td style="font-family:'Share Tech Mono',monospace;font-size:12px;">${s.date}</td>
      <td style="color:var(--blue);font-family:'Share Tech Mono',monospace;">${s.startStr}</td>
      <td style="color:var(--blue);font-family:'Share Tech Mono',monospace;">${s.endStr}</td>
      <td class="hours-val">${s.durationStr}</td>
    </tr>`;
    })
    .join("");
}

function renderAdmin() {
  renderGradeSettings();
  renderAdminCatalogue();
  renderAdminEmpList();
  renderAdminStats();
  renderDepenses();
}

function renderGradeSettings() {
  const grades = [
    "patron",
    "copatron",
    "chefdequipe",
    "experimente",
    "novice",
    "recrue",
    "stagiaire",
  ];
  document.getElementById("grade-settings-body").innerHTML = grades
    .map(
      (g) => `
    <tr>
      <td><span class="tag ${g}">${GRADE_LABELS[g] || g}</span></td>
      <td><input type="number" class="grade-pct-input" id="gpct-${g}" value="${getGradePct(g)}" min="0" max="100"> %</td>
      <td style="font-size:13px;color:var(--text-dim);font-family:'Share Tech Mono',monospace;">Pour 10 000$ → Salaire: $<span id="gpct-preview-${g}">${Math.round((10000 * getGradePct(g)) / 100).toLocaleString()}</span></td>
    </tr>`,
    )
    .join("");
  grades.forEach((g) => {
    const input = document.getElementById("gpct-" + g);
    if (input)
      input.oninput = () => {
        const preview = document.getElementById("gpct-preview-" + g);
        if (preview)
          preview.textContent = Math.round(
            (10000 * (parseInt(input.value) || 0)) / 100,
          ).toLocaleString();
      };
  });
}

function saveGradeSettings() {
  const grades = [
    "patron",
    "copatron",
    "chefdequipe",
    "experimente",
    "novice",
    "recrue",
    "stagiaire",
  ];
  grades.forEach((g) => {
    const val = parseInt(document.getElementById("gpct-" + g)?.value) || 0;
    store.gradePct[g] = Math.max(0, Math.min(100, val));
  });
  saveStore();
  notify("✅ Pourcentages de commission sauvegardés !");
}

function renderAdminCatalogue() {
  document.getElementById("admin-catalogue-list").innerHTML = store.catalogue
    .map(
      (c) => `
    <div class="service-log-row">
      <div><span style="font-weight:600;">${c.name}</span></div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--blue);">$${c.price.toLocaleString()}</span>
        <button class="btn-sm danger" onclick="deleteCatalogueItem('${c.id}')">🗑</button>
      </div>
    </div>`,
    )
    .join("");
}

function renderAdminEmpList() {
  document.getElementById("admin-emp-list").innerHTML = store.employees
    .map(
      (e) => `
    <div class="service-log-row">
      <div style="display:flex;align-items:center;gap:10px;">
        ${
          e.photo
            ? `<img src="${e.photo}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--border);">`
            : `<div style="width:36px;height:36px;border-radius:50%;background:var(--dark4);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;color:var(--blue);">${e.name[0]}</div>`
        }
        <div>
          <div style="font-weight:700;">${e.name}</div>
          <span class="tag ${e.role}">${GRADE_LABELS[e.role] || e.role}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-sm" onclick="openEditEmp('${e.id}')">✏️ Modifier</button>
        <button class="btn-sm danger" onclick="deleteEmployee('${e.id}')">🗑</button>
      </div>
    </div>`,
    )
    .join("");
}

function renderAdminStats() {
  const totalCA = store.sales.reduce((a, s) => a + s.facture, 0);
  const totalSalaire = store.sales.reduce((a, s) => a + s.salaire, 0);
  const totalDep = store.depenses.reduce((a, d) => a + d.amount, 0);
  const bilanNet = totalCA - totalDep;
  const byEmp = {};
  store.sales.forEach((s) => {
    if (!byEmp[s.empId]) byEmp[s.empId] = { ca: 0, sal: 0 };
    byEmp[s.empId].ca += s.facture;
    byEmp[s.empId].sal += s.salaire;
  });

  document.getElementById("admin-global-stats").innerHTML =
    `
    <div class="stat-card" style="padding:12px 20px;"><div class="stat-val">$${totalCA.toLocaleString()}</div><div class="stat-label">CA Total</div></div>
    <div class="stat-card" style="padding:12px 20px;"><div class="stat-val" style="color:var(--blue);">$${totalSalaire.toLocaleString()}</div><div class="stat-label">Salaires Versés</div></div>
    <div class="stat-card" style="padding:12px 20px;"><div class="stat-val" style="color:var(--blue);">$${totalDep.toLocaleString()}</div><div class="stat-label">Dépenses</div></div>
    <div class="stat-card" style="padding:12px 20px;"><div class="stat-val" style="font-size:20px;color:var(--blue);">${formatDuration(store.sessions.reduce((a, s) => a + s.durationMs, 0))}</div><div class="stat-label">Heures Totales</div></div>
    <div class="stat-card" style="padding:12px 20px;"><div class="stat-val">${store.sales.length}</div><div class="stat-label">Opérations</div></div>` +
    Object.entries(byEmp)
      .map(([id, data]) => {
        const emp = store.employees.find((e) => e.id === id);
        const empH = formatDuration(
          store.sessions
            .filter((s) => s.empId === id)
            .reduce((a, s) => a + s.durationMs, 0),
        );
        return `<div class="stat-card" style="padding:12px 20px;">
        <div style="font-size:12px;color:var(--text-dim);font-family:'Share Tech Mono',monospace;margin-bottom:4px;">${emp?.name || "?"}</div>
        <div class="stat-val" style="font-size:22px;">$${data.ca.toLocaleString()}</div>
        <div class="stat-label">CA Perso</div>
        <div style="margin-top:6px;font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--blue);">⏱ ${empH}</div>
      </div>`;
      })
      .join("");

  const bilanEl = document.getElementById("admin-bilan-net");
  if (bilanEl) {
    const depByCat = {};
    store.depenses.forEach((d) => {
      depByCat[d.cat] = (depByCat[d.cat] || 0) + d.amount;
    });
    const catLabels = {
      pieces: "🔩 Pièces/Stock",
      salaire: "💰 Salaires",
      autre: "📦 Autre",
    };
    bilanEl.innerHTML = `
      <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:var(--text-dim);margin-bottom:12px;">BILAN FINANCIER</div>
      <div class="bilan-line"><span>💰 Chiffre d'Affaires</span><span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--blue);">+$${totalCA.toLocaleString()}</span></div>
      <div class="bilan-line"><span>👷 Salaires versés</span><span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--blue);">-$${totalSalaire.toLocaleString()}</span></div>
      ${Object.entries(depByCat)
        .map(
          ([cat, amt]) =>
            `<div class="bilan-line"><span>${catLabels[cat] || cat}</span><span style="font-family:'Bebas Neue',sans-serif;font-size:18px;color:var(--blue);">-$${amt.toLocaleString()}</span></div>`,
        )
        .join("")}
      <div style="margin-top:12px;padding-top:12px;border-top:2px solid var(--blue);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;">BILAN NET</span>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:32px;color:${bilanNet >= 0 ? "var(--blue)" : "var(--blue)"};">${bilanNet >= 0 ? "+" : ""} $${Math.abs(bilanNet).toLocaleString()}</span>
      </div>`;
  }
}

function renderDepenses() {
  const el = document.getElementById("depenses-list");
  if (!el) return;
  if (store.depenses.length === 0) {
    el.innerHTML =
      "<div style=\"color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:13px;padding:10px 0;\">Aucune dépense enregistrée</div>";
    return;
  }
  const catLabels = {
    pieces: "🔩 Pièces/Stock",
    salaire: "💰 Salaires",
    autre: "📦 Autre",
  };
  el.innerHTML = [...store.depenses]
    .reverse()
    .map(
      (d) => `
    <div class="dep-row">
      <div>
        <span style="font-weight:600;">${d.name}</span>
        <span class="dep-cat-badge">${catLabels[d.cat] || d.cat}</span>
        <div style="font-size:12px;color:var(--text-dim);font-family:'Share Tech Mono',monospace;margin-top:3px;">${d.date}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--blue);">-$${d.amount.toLocaleString()}</span>
        <button class="btn-sm danger" onclick="deleteDepense('${d.id}')">🗑</button>
      </div>
    </div>`,
    )
    .join("");
}

function addEmployee() {
  const name = document.getElementById("new-emp-name").value.trim();
  const role = document.getElementById("new-emp-role").value;
  const password = document.getElementById("new-emp-password").value.trim();
  if (!name || !password) {
    notify("Remplis tous les champs", true);
    return;
  }
  store.employees.push({
    id: "emp" + Date.now(),
    name,
    role,
    password,
    photo: newEmpPhotoData || null,
    status: "offline",
  });
  saveStore();
  newEmpPhotoData = null;
  document.getElementById("new-emp-name").value = "";
  document.getElementById("new-emp-password").value = "";
  document.getElementById("new-emp-photo-preview").style.display = "none";
  document.getElementById("new-emp-photo-text").style.display = "";
  document.getElementById("new-emp-photo-input").value = "";
  notify("✅ Employé " + name + " ajouté");
  renderAdmin();
  switchLoginTab("employe");
}

function deleteEmployee(id) {
  if (!confirm("Supprimer cet employé ?")) return;
  store.employees = store.employees.filter((e) => e.id !== id);
  saveStore();
  notify("Employé supprimé");
  renderAdmin();
  switchLoginTab("employe");
}

function openEditEmp(id) {
  const emp = store.employees.find((e) => e.id === id);
  if (!emp) return;
  document.getElementById("edit-emp-id").value = id;
  document.getElementById("edit-emp-name").value = emp.name;
  document.getElementById("edit-emp-role").value = emp.role;
  document.getElementById("edit-emp-password").value = "";
  document.getElementById("modal-edit-emp").classList.add("open");
}

function saveEditEmployee() {
  const id = document.getElementById("edit-emp-id").value;
  const emp = store.employees.find((e) => e.id === id);
  if (!emp) return;
  emp.name = document.getElementById("edit-emp-name").value.trim() || emp.name;
  emp.role = document.getElementById("edit-emp-role").value;
  const pw = document.getElementById("edit-emp-password").value.trim();
  if (pw) emp.password = pw;
  saveStore();
  closeModal("modal-edit-emp");
  notify("✅ Employé modifié");
  renderAdmin();
  switchLoginTab("employe");
}

function addCatalogueItem() {
  const name = document.getElementById("new-cat-name").value.trim();
  const price = parseInt(document.getElementById("new-cat-price").value);
  if (!name || !price) {
    notify("Remplis tous les champs", true);
    return;
  }
  store.catalogue.push({ id: "c" + Date.now(), name, price });
  saveStore();
  document.getElementById("new-cat-name").value = "";
  document.getElementById("new-cat-price").value = "";
  notify("✅ Prestation ajoutée");
  renderAdminCatalogue();
}

function deleteCatalogueItem(id) {
  store.catalogue = store.catalogue.filter((c) => c.id !== id);
  saveStore();
  notify("Prestation supprimée");
  renderAdminCatalogue();
}

function addDepense() {
  const name = document.getElementById("new-dep-name").value.trim();
  const amount =
    parseFloat(document.getElementById("new-dep-amount").value) || 0;
  const cat = document.getElementById("new-dep-cat").value;
  if (!name || !amount) {
    notify("Remplis tous les champs", true);
    return;
  }
  const now = new Date();
  store.depenses.push({
    id: "dep" + Date.now(),
    name,
    amount,
    cat,
    date:
      now.toLocaleDateString("fr-FR") +
      " " +
      now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  });
  saveStore();
  document.getElementById("new-dep-name").value = "";
  document.getElementById("new-dep-amount").value = "";
  notify("✅ Dépense: -$" + amount.toLocaleString());
  renderAdmin();
}

function deleteDepense(id) {
  store.depenses = store.depenses.filter((d) => d.id !== id);
  saveStore();
  notify("Dépense supprimée");
  renderAdmin();
}

function resetSales() {
  if (!confirm("Reset toutes les ventes ?")) return;
  store.sales = [];
  saveStore();
  notify("✅ Ventes reset");
  renderAdmin();
}
function resetSessions() {
  if (!confirm("Reset tout l'historique des heures ?")) return;
  store.sessions = [];
  saveStore();
  notify("✅ Sessions reset");
  renderAdmin();
}
function resetDepenses() {
  if (!confirm("Reset toutes les dépenses ?")) return;
  store.depenses = [];
  saveStore();
  notify("✅ Dépenses reset");
  renderAdmin();
}
function resetAll() {
  if (
    !confirm(
      "⚠️ RESET COMPLET — Ventes, Heures ET Dépenses effacées. Continuer ?",
    )
  )
    return;
  store.sales = [];
  store.sessions = [];
  store.depenses = [];
  saveStore();
  notify("💥 Reset complet effectué");
  renderAdmin();
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function notify(msg, isError = false) {
  const n = document.getElementById("notif");
  n.textContent = msg;
  n.style.borderLeftColor = isError ? "var(--blue)" : "var(--blue)";
  n.classList.add("show");
  setTimeout(() => n.classList.remove("show"), 3500);
}

switchLoginTab("employe");
