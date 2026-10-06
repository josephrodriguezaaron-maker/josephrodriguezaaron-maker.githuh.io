"use strict";

const STORAGE_KEY = "pulso-campus.students.v1";
const INCIDENTS_KEY = "pulso-campus.incidents.v1";
const panels = [...document.querySelectorAll(".view-panel")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const notice = document.querySelector("#notice");
const form = document.querySelector("#student-form");
const searchInput = document.querySelector("#student-search");
const lookupForm = document.querySelector("#lookup-form");
const incidentForm = document.querySelector("#incident-form");
let students = [];
let incidents = [];
let selectedEmergencyStudent = null;
let noticeTimer;
let storageReadError = false;
let incidentStorageReadError = false;

function showNotice(message, isError = false) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

function loadStudents() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    storageReadError = false;
    if (saved === null) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.some((student) => !student || typeof student.id !== "string" || typeof student.code !== "string")) {
      throw new Error("El contenido guardado no tiene el formato esperado.");
    }
    return parsed;
  } catch (error) {
    storageReadError = true;
    showNotice(`No se pudieron leer los registros guardados: ${error.message}`, true);
    return [];
  }
}

function createUniqueCode(existingStudents) {
  if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
    throw new Error("Este navegador no permite generar un identificador seguro. Abre la aplicación desde localhost en un navegador actualizado.");
  }
  const existingCodes = new Set(existingStudents.map((student) => student.code));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `EST-${window.crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    if (!existingCodes.has(code)) return code;
  }
  throw new Error("No fue posible crear un identificador único. Inténtalo de nuevo.");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function studentRow(student, includeBloodType = false) {
  const name = escapeHtml(student.name);
  const document = escapeHtml(student.document);
  const program = escapeHtml(student.program || "No especificado");
  return `<tr>
    <td><div class="student-cell"><span class="student-avatar">${escapeHtml(initials(student.name))}</span><div><div class="student-name">${name}</div><div class="student-sub">Doc. ${document}</div></div></div></td>
    <td><span class="code-pill">${escapeHtml(student.code)}</span></td>
    <td>${program}</td>
    ${includeBloodType ? `<td>${escapeHtml(student.bloodType || "No especificado")}</td>` : ""}
    <td class="date-cell">${escapeHtml(formatDate(student.createdAt))}</td>
  </tr>`;
}

function renderDashboard() {
  const newest = [...students].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  document.querySelector("#student-count").textContent = students.length;
  document.querySelector("#code-count").textContent = students.length;
  document.querySelector("#recent-list").innerHTML = newest.map((student) => studentRow(student)).join("");
  document.querySelector("#recent-empty").hidden = students.length > 0;
  document.querySelector("#recent-list").parentElement.hidden = students.length === 0;
}

function renderDirectory() {
  const query = (searchInput?.value ?? "").trim().toLocaleLowerCase("es");
  const filtered = [...students]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .filter((student) => `${student.name} ${student.document} ${student.code} ${student.program ?? ""}`.toLocaleLowerCase("es").includes(query));
  document.querySelector("#directory-count").textContent = filtered.length;
  document.querySelector("#student-list").innerHTML = filtered.map((student) => studentRow(student, true)).join("");
  const empty = document.querySelector("#directory-empty");
  empty.hidden = filtered.length > 0;
  document.querySelector("#directory-empty-title").textContent = students.length === 0
    ? "No hay estudiantes registrados"
    : "No encontramos coincidencias";
  document.querySelector("#directory-empty-description").textContent = students.length === 0
    ? "Registra un estudiante para generar su primer identificador."
    : "Prueba con otro nombre, documento o identificador.";
  empty.querySelector("a").hidden = students.length > 0;
}

function loadIncidents() {
  try {
    const saved = localStorage.getItem(INCIDENTS_KEY);
    incidentStorageReadError = false;
    if (saved === null) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.some((incident) => !incident || typeof incident.id !== "string" || typeof incident.studentId !== "string" || typeof incident.type !== "string")) {
      throw new Error("El contenido de incidencias guardado no tiene el formato esperado.");
    }
    return parsed;
  } catch (error) {
    incidentStorageReadError = true;
    showNotice(`No se pudieron leer las incidencias guardadas: ${error.message}`, true);
    return [];
  }
}

function renderBars(container, counts, emptyElement) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  emptyElement.hidden = total > 0;
  container.hidden = total === 0;
  container.innerHTML = Object.entries(counts).map(([label, count]) => {
    const percentage = total ? Math.round((count / total) * 100) : 0;
    return `<div class="report-bar-row"><div class="report-bar-label"><span>${escapeHtml(label)}</span><strong>${count}</strong></div><div class="report-bar-track"><span style="width:${percentage}%"></span></div></div>`;
  }).join("");
}

function renderReports() {
  const knownBloodStudents = students.filter((student) => student.bloodType && student.bloodType !== "No sabe");
  const bloodCounts = Object.fromEntries(["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((type) => [
    type, knownBloodStudents.filter((student) => student.bloodType === type).length,
  ]));
  const incidentCounts = Object.fromEntries(["Desmayo", "Alergia", "Traumatismo", "Otra emergencia"].map((type) => [
    type, incidents.filter((incident) => incident.type === type).length,
  ]));
  document.querySelector("#report-students").textContent = students.length;
  document.querySelector("#report-blood-known").textContent = knownBloodStudents.length;
  document.querySelector("#report-incidents").textContent = incidents.length;
  renderBars(document.querySelector("#blood-report"), bloodCounts, document.querySelector("#blood-empty"));
  renderBars(document.querySelector("#incident-report"), incidentCounts, document.querySelector("#incident-empty"));

  const newestIncidents = [...incidents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  document.querySelector("#incident-list").innerHTML = newestIncidents.map((incident) => `
    <tr>
      <td>${escapeHtml(incident.studentName)}</td>
      <td>${escapeHtml(incident.type)}</td>
      <td>${escapeHtml(incident.location || "No especificado")}</td>
      <td class="date-cell">${escapeHtml(formatDate(incident.createdAt))}</td>
    </tr>`).join("");
  document.querySelector("#incident-history-empty").hidden = newestIncidents.length > 0;
}

function render() {
  renderDashboard();
  renderDirectory();
  renderReports();
}

function navigate(view) {
  const selectedView = panels.some((panel) => panel.id === `view-${view}`) ? view : "inicio";
  panels.forEach((panel) => { panel.hidden = panel.id !== `view-${selectedView}`; });
  navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === selectedView));
  const names = {
    inicio: "Resumen",
    registro: "Registrar estudiante",
    estudiantes: "Estudiantes",
    emergencia: "Identificación de emergencia",
    reportes: "Reportes y estadísticas",
  };
  document.querySelector("#page-name").textContent = names[selectedView];
  if (window.location.hash !== `#${selectedView}`) window.history.replaceState(null, "", `#${selectedView}`);
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-view]");
  if (!link) return;
  event.preventDefault();
  navigate(link.dataset.view);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("hashchange", () => navigate(window.location.hash.slice(1)));
searchInput?.addEventListener("input", renderDirectory);

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = lookupForm.elements.code.value.trim().toUpperCase();
  const student = students.find((item) => item.code.toUpperCase() === code);
  const profile = document.querySelector("#emergency-profile");
  const empty = document.querySelector("#lookup-empty");
  if (!student) {
    selectedEmergencyStudent = null;
    profile.hidden = true;
    empty.hidden = false;
    showNotice("No encontramos ese código entre los estudiantes registrados en este navegador.", true);
    return;
  }

  selectedEmergencyStudent = student;
  document.querySelector("#emergency-initials").textContent = initials(student.name);
  document.querySelector("#emergency-name").textContent = student.name;
  document.querySelector("#emergency-program").textContent = student.program || "Programa no especificado";
  document.querySelector("#emergency-code").textContent = student.code;
  document.querySelector("#emergency-blood").textContent = student.bloodType || "No especificado";
  document.querySelector("#emergency-eps").textContent = student.eps || "No especificada";
  document.querySelector("#emergency-allergies").textContent = student.allergies || "Sin información registrada";
  document.querySelector("#emergency-conditions").textContent = student.conditions || "Sin información registrada";
  document.querySelector("#emergency-contact").textContent = student.emergencyName || "No registrado";
  document.querySelector("#emergency-phone").textContent = student.emergencyPhone || "No registrado";
  incidentForm.reset();
  profile.hidden = false;
  empty.hidden = true;
});

incidentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!incidentForm.reportValidity()) return;
  if (!selectedEmergencyStudent) {
    showNotice("Busca primero un estudiante para asociar la incidencia.", true);
    return;
  }
  if (incidentStorageReadError) {
    showNotice("No se puede guardar de forma segura porque las incidencias existentes no se pudieron leer.", true);
    return;
  }
  try {
    const values = new FormData(incidentForm);
    const incident = {
      id: window.crypto.randomUUID(),
      studentId: selectedEmergencyStudent.id,
      studentName: selectedEmergencyStudent.name,
      type: String(values.get("type")),
      location: String(values.get("location")).trim(),
      createdAt: new Date().toISOString(),
    };
    const updatedIncidents = [...incidents, incident];
    localStorage.setItem(INCIDENTS_KEY, JSON.stringify(updatedIncidents));
    incidents = updatedIncidents;
    renderReports();
    incidentForm.reset();
    showNotice("Incidencia registrada en este navegador. No se enviaron notificaciones externas.");
  } catch (error) {
    showNotice(`No se pudo registrar la incidencia: ${error.message}`, true);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (storageReadError) {
    showNotice("No se puede guardar de forma segura porque los registros existentes no se pudieron leer.", true);
    return;
  }

  const values = Object.fromEntries(new FormData(form).entries());
  if (!values.name.trim() || !values.document.trim()) {
    showNotice("Escribe el nombre y el documento de identidad sin dejar estos campos en blanco.", true);
    form.elements[!values.name.trim() ? "name" : "document"].focus();
    return;
  }
  const normalizedDocument = values.document.trim().toLocaleLowerCase("es");
  if (students.some((student) => student.document.trim().toLocaleLowerCase("es") === normalizedDocument)) {
    showNotice("Ya existe un perfil con ese documento de identidad.", true);
    form.elements.document.focus();
    return;
  }

  try {
    const student = {
      id: window.crypto.randomUUID(),
      code: createUniqueCode(students),
      createdAt: new Date().toISOString(),
      name: values.name.trim(),
      document: values.document.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      program: values.program.trim(),
      bloodType: values.bloodType,
      eps: values.eps.trim(),
      allergies: values.allergies.trim(),
      conditions: values.conditions.trim(),
      emergencyName: values.emergencyName.trim(),
      emergencyPhone: values.emergencyPhone.trim(),
    };
    const updatedStudents = [...students, student];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedStudents));
    students = updatedStudents;
    render();
    form.reset();
    document.querySelector("#success-code").textContent = student.code;
    document.querySelector("#success-card").hidden = false;
    showNotice("Perfil guardado y código único generado.");
    window.scrollTo({ top: document.querySelector("#success-card").offsetTop, behavior: "smooth" });
  } catch (error) {
    showNotice(`No se pudo guardar el perfil: ${error.message}`, true);
  }
});

document.querySelector("#copy-code").addEventListener("click", async () => {
  const code = document.querySelector("#success-code").textContent;
  try {
    await navigator.clipboard.writeText(code);
    showNotice("Identificador copiado al portapapeles.");
  } catch (error) {
    showNotice(`No se pudo copiar el identificador: ${error.message}. Puedes seleccionarlo y copiarlo manualmente.`, true);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) students = loadStudents();
  if (event.key === INCIDENTS_KEY) incidents = loadIncidents();
  if (event.key === STORAGE_KEY || event.key === INCIDENTS_KEY) render();
});

students = loadStudents();
incidents = loadIncidents();
render();
navigate(window.location.hash.slice(1) || "inicio");
