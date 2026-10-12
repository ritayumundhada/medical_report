// =====================================================
// Medical Report Management System - frontend logic
// The page only talks to FastAPI (never directly to PostgreSQL).
// =====================================================

const API = "http://127.0.0.1:8000";   // address of your FastAPI backend

// ---------- Small helper functions ----------
const $ = (id) => document.getElementById(id);   // shortcut for getElementById

// Escape text so database content can never be treated as HTML
function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Show a green (success) or red (error) message at the top of the page
function showMsg(text, ok = true) {
  $("msg").textContent = text;
  $("msg").className = ok ? "ok" : "error";
}
function clearMsg() { $("msg").className = "hidden"; }

const loadingRow = (cols) => `<tr><td colspan="${cols}" class="center">Loading...</td></tr>`;
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="center">${text}</td></tr>`;

// One function for EVERY call to the backend.
// It sends the request with fetch() and returns the JSON answer.
// If the backend sends an error, it throws it so the caller can show it.
async function api(path, method = "GET", body = null) {
  const options = { method: method, headers: {} };
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(API + path, options);
  } catch (err) {
    throw new Error("Cannot reach the server. Is FastAPI running at " + API + " ?");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = data.detail;
    // FastAPI sends a list for type errors (status 422), a text for database errors
    if (Array.isArray(message)) {
      message = message.map((d) => d.loc.slice(1).join(".") + ": " + d.msg).join("; ");
    }
    throw new Error(message || "Request failed (status " + response.status + ")");
  }
  return data;
}

// Lists loaded from the API (kept so Edit buttons can find a row by its id)
let patients = [], doctors = [], reports = [];

// =====================================================
// NAVIGATION
// =====================================================
const loaders = {
  dashboard: loadDashboard,
  patients: loadPatients,
  doctors: loadDoctors,
  reports: openReports,
  history: loadHistory,
};

function showSection(name) {
  clearMsg();
  document.querySelectorAll("section").forEach((s) => s.classList.toggle("active", s.id === name));
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.section === name));
  loaders[name]();
}
$("nav").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (button) showSection(button.dataset.section);
});

// =====================================================
// DASHBOARD
// =====================================================
async function loadDashboard() {
  try {
    // Ask for all four lists at the same time and count them
    const [p, d, r, h] = await Promise.all([api("/patients"), api("/doctors"), api("/reports"), api("/history")]);
    $("cPatients").textContent = p.length;
    $("cDoctors").textContent = d.length;
    $("cReports").textContent = r.length;
    $("cHistory").textContent = h.length;
  } catch (err) {
    showMsg(err.message, false);
  }
}

// =====================================================
// PATIENTS
// =====================================================
let editingPatientId = null;   // null = adding, a number = editing that patient

async function loadPatients() {
  $("patientRows").innerHTML = loadingRow(6);
  try {
    patients = await api("/patients");
    $("patientRows").innerHTML = patients.length
      ? patients.map((p) => `
        <tr>
          <td>${p.patient_id}</td><td>${esc(p.name)}</td><td>${p.age}</td>
          <td>${esc(p.gender)}</td><td>${esc(p.contact)}</td>
          <td>
            <button class="small" data-action="edit" data-id="${p.patient_id}">Edit</button>
            <button class="small danger" data-action="delete" data-id="${p.patient_id}">Delete</button>
          </td>
        </tr>`).join("")
      : emptyRow(6, "No patients yet. Add one above.");
    fillDropdowns();
  } catch (err) {
    showMsg(err.message, false);
    $("patientRows").innerHTML = emptyRow(6, "Could not load patients.");
  }
}

function resetPatientForm() {
  editingPatientId = null;
  $("patientForm").reset();
  $("patientFormTitle").textContent = "Add Patient";
  $("patientSave").textContent = "Add Patient";
  $("patientCancel").classList.add("hidden");
}

// Add (POST) or update (PUT) depending on editingPatientId
$("patientForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: $("pName").value,
    age: Number($("pAge").value),
    gender: $("pGender").value,
    contact: $("pContact").value,
  };
  try {
    const result = editingPatientId
      ? await api("/patients/" + editingPatientId, "PUT", data)
      : await api("/patients", "POST", data);
    showMsg(result.message);
    resetPatientForm();
    loadPatients();
  } catch (err) {
    showMsg(err.message, false);   // e.g. a CHECK or UNIQUE error from PostgreSQL
  }
});
$("patientCancel").addEventListener("click", () => { resetPatientForm(); clearMsg(); });

// Edit / Delete buttons inside the table
$("patientRows").addEventListener("click", async (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  const id = Number(button.dataset.id);

  if (button.dataset.action === "edit") {
    const p = patients.find((x) => x.patient_id === id);
    editingPatientId = id;
    $("pName").value = p.name;
    $("pAge").value = p.age;
    $("pGender").value = p.gender;
    $("pContact").value = p.contact;
    $("patientFormTitle").textContent = "Edit Patient #" + id;
    $("patientSave").textContent = "Save Changes";
    $("patientCancel").classList.remove("hidden");
    $("patientForm").scrollIntoView();
  }

  if (button.dataset.action === "delete") {
    if (!confirm("Delete patient #" + id + "?")) return;
    try {
      const result = await api("/patients/" + id, "DELETE");
      showMsg(result.message);
      loadPatients();
    } catch (err) {
      showMsg(err.message, false);   // e.g. "Cannot delete patient because medical reports exist"
    }
  }
});

// =====================================================
// DOCTORS
// =====================================================
async function loadDoctors() {
  $("doctorRows").innerHTML = loadingRow(3);
  try {
    doctors = await api("/doctors");
    $("doctorRows").innerHTML = doctors.length
      ? doctors.map((d) => `<tr><td>${d.doctor_id}</td><td>${esc(d.name)}</td><td>${esc(d.specialization)}</td></tr>`).join("")
      : emptyRow(3, "No doctors yet. Add one above.");
    fillDropdowns();
  } catch (err) {
    showMsg(err.message, false);
    $("doctorRows").innerHTML = emptyRow(3, "Could not load doctors.");
  }
}

$("doctorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const result = await api("/doctors", "POST", { name: $("dName").value, specialization: $("dSpec").value });
    showMsg(result.message);
    $("doctorForm").reset();
    loadDoctors();
  } catch (err) {
    showMsg(err.message, false);
  }
});

// =====================================================
// MEDICAL REPORTS
// =====================================================
let editingReportId = null;   // null = adding, a number = editing that report

// Fill the patient / doctor dropdowns from the loaded lists
function fillDropdowns() {
  const keepFilter = $("filterPatient").value;
  const patientOptions = patients.map((p) => `<option value="${p.patient_id}">${esc(p.name)} (ID ${p.patient_id})</option>`).join("");
  const doctorOptions = doctors.map((d) => `<option value="${d.doctor_id}">${esc(d.name)} - ${esc(d.specialization)}</option>`).join("");
  const keepPatient = $("rPatient").value, keepDoctor = $("rDoctor").value;

  $("rPatient").innerHTML = '<option value="">Select patient</option>' + patientOptions;
  $("rDoctor").innerHTML = '<option value="">Select doctor</option>' + doctorOptions;
  $("filterPatient").innerHTML = '<option value="">All patients</option>' + patientOptions;
  $("rPatient").value = keepPatient;
  $("rDoctor").value = keepDoctor;
  $("filterPatient").value = keepFilter;
}

// Opening the Reports section: load dropdown data first, then the reports
async function openReports() {
  if (!$("rDate").value) $("rDate").value = new Date().toLocaleDateString("en-CA");   // today as YYYY-MM-DD
  await Promise.all([loadPatients(), loadDoctors()]);
  loadReports();
}

// Load all reports, or only one patient's reports if the filter is used
async function loadReports() {
  $("reportRows").innerHTML = loadingRow(9);
  const patientId = $("filterPatient").value;
  try {
    reports = await api(patientId ? "/reports/patient/" + patientId : "/reports");
    $("reportRows").innerHTML = reports.length
      ? reports.map((r) => `
        <tr>
          <td>${r.report_id}</td>
          <td>${esc(r.patient_name)}<small>ID ${r.patient_id}</small></td>
          <td>${esc(r.doctor_name)}<small>${esc(r.doctor_specialization)} (ID ${r.doctor_id})</small></td>
          <td>${esc(r.symptoms)}</td><td>${esc(r.diagnosis)}</td>
          <td>${esc(r.medicines)}</td><td>${esc(r.test_result)}</td>
          <td>${esc(r.report_date)}</td>
          <td>
            <button class="small" data-action="edit" data-id="${r.report_id}">Edit</button>
            <button class="small danger" data-action="delete" data-id="${r.report_id}">Delete</button>
          </td>
        </tr>`).join("")
      : emptyRow(9, "No reports found.");
  } catch (err) {
    showMsg(err.message, false);
    $("reportRows").innerHTML = emptyRow(9, "Could not load reports.");
  }
}
$("filterPatient").addEventListener("change", loadReports);

function resetReportForm() {
  editingReportId = null;
  $("reportForm").reset();
  $("rDate").value = new Date().toLocaleDateString("en-CA");
  for (const id of ["rPatient", "rDoctor", "rDate"]) $(id).disabled = false;
  $("reportFormTitle").textContent = "Add Medical Report";
  $("reportSave").textContent = "Add Report";
  $("reportCancel").classList.add("hidden");
  $("rNote").classList.add("hidden");
}

// Add (POST) or update (PUT) depending on editingReportId
$("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = {
    symptoms: $("rSymptoms").value,
    diagnosis: $("rDiagnosis").value,
    medicines: $("rMedicines").value,
    test_result: $("rTest").value,
  };
  try {
    let result;
    if (editingReportId) {
      result = await api("/reports/" + editingReportId, "PUT", text);
      result.message += " The old version was saved in Report History.";
    } else {
      result = await api("/reports", "POST", {
        patient_id: Number($("rPatient").value),
        doctor_id: Number($("rDoctor").value),
        report_date: $("rDate").value,
        ...text,
      });
    }
    showMsg(result.message);
    resetReportForm();
    loadReports();
  } catch (err) {
    showMsg(err.message, false);
  }
});
$("reportCancel").addEventListener("click", () => { resetReportForm(); clearMsg(); });

// Edit / Delete buttons inside the reports table
$("reportRows").addEventListener("click", async (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  const id = Number(button.dataset.id);

  if (button.dataset.action === "edit") {
    const r = reports.find((x) => x.report_id === id);
    editingReportId = id;
    $("rPatient").value = r.patient_id;
    $("rDoctor").value = r.doctor_id;
    $("rDate").value = r.report_date;
    $("rSymptoms").value = r.symptoms;
    $("rDiagnosis").value = r.diagnosis;
    $("rMedicines").value = r.medicines || "";
    $("rTest").value = r.test_result || "";
    // The PostgreSQL update function only changes the four text fields
    for (const field of ["rPatient", "rDoctor", "rDate"]) $(field).disabled = true;
    $("reportFormTitle").textContent = "Edit Report #" + id;
    $("reportSave").textContent = "Save Changes";
    $("reportCancel").classList.remove("hidden");
    $("rNote").classList.remove("hidden");
    $("reportForm").scrollIntoView();
  }

  if (button.dataset.action === "delete") {
    if (!confirm("Delete report #" + id + "? A copy will be kept in Report History.")) return;
    try {
      const result = await api("/reports/" + id, "DELETE");
      showMsg(result.message + " A copy was saved in Report History.");
      loadReports();
    } catch (err) {
      showMsg(err.message, false);
    }
  }
});

// =====================================================
// REPORT HISTORY (read only)
// =====================================================
async function loadHistory() {
  $("historyRows").innerHTML = loadingRow(11);
  try {
    const history = await api("/history");
    $("historyRows").innerHTML = history.length
      ? history.map((h) => `
        <tr>
          <td>${h.history_id}</td><td>${h.report_id}</td><td>${h.patient_id}</td><td>${h.doctor_id}</td>
          <td>${esc(h.symptoms)}</td><td>${esc(h.diagnosis)}</td>
          <td>${esc(h.medicines)}</td><td>${esc(h.test_result)}</td>
          <td>${esc(h.report_date)}</td>
          <td><span class="badge ${esc(h.operation)}">${esc(h.operation)}</span></td>
          <td>${new Date(h.changed_at).toLocaleString()}</td>
        </tr>`).join("")
      : emptyRow(11, "No history yet. Update or delete a report to create a record.");
  } catch (err) {
    showMsg(err.message, false);
    $("historyRows").innerHTML = emptyRow(11, "Could not load history.");
  }
}

// Start on the dashboard
showSection("dashboard");
