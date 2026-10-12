from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2

from database import run_query

app = FastAPI(title="Medical Report Management System")

# Allow the HTML/JavaScript frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------
# Request shapes (only check data TYPES; PostgreSQL checks the RULES)
# ------------------------------------------------------------
class PatientIn(BaseModel):
    name: str
    age: int
    gender: str
    contact: str


# ------------------------------------------------------------
# Turn a PostgreSQL error into a simple HTTP error
# ------------------------------------------------------------
def raise_http_error(e, delete_message=None):
    # Cannot reach the database at all
    if isinstance(e, psycopg2.OperationalError):
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to the database. Check database.py and make sure PostgreSQL is running.",
        )

    code = e.pgcode or ""
    message = e.diag.message_primary or str(e)
    if e.diag.message_detail:
        message += " - " + e.diag.message_detail

    if code == "23505":                                  # UNIQUE violation
        raise HTTPException(status_code=409, detail="Duplicate value: " + message)

    if code == "23503":                                  # FOREIGN KEY violation
        if delete_message:                               # happened while deleting
            raise HTTPException(status_code=409, detail=delete_message)
        raise HTTPException(status_code=400, detail="Invalid patient/doctor: " + message)

    if code.startswith("23") or code.startswith("22"):   # CHECK, NOT NULL, bad data
        raise HTTPException(status_code=400, detail="Invalid data: " + message)

    raise HTTPException(status_code=500, detail="Database error: " + message)
# ============================================================
# PATIENTS
# ============================================================
@app.post("/patients")
def create_patient(patient: PatientIn):
    try:
        row = run_query(
            "SELECT add_patient(%s, %s, %s, %s) AS patient_id",
            (patient.name, patient.age, patient.gender, patient.contact),
            fetch="one",
        )
    except psycopg2.Error as e:
        raise_http_error(e)
    return {"message": "Patient added successfully", "patient_id": row["patient_id"]}


@app.get("/patients")
def list_patients():
    try:
        return run_query("SELECT * FROM patients ORDER BY patient_id")
    except psycopg2.Error as e:
        raise_http_error(e)


@app.put("/patients/{patient_id}")
def update_patient(patient_id: int, patient: PatientIn):
    try:
        changed = run_query(
            "UPDATE patients SET name = %s, age = %s, gender = %s, contact = %s "
            "WHERE patient_id = %s",
            (patient.name, patient.age, patient.gender, patient.contact, patient_id),
            fetch="none",
        )
    except psycopg2.Error as e:
        raise_http_error(e)
    if changed == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient updated successfully"}


@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: int):
    try:
        changed = run_query(
            "DELETE FROM patients WHERE patient_id = %s",
            (patient_id,),
            fetch="none",
        )
    except psycopg2.Error as e:
        raise_http_error(e, delete_message="Cannot delete patient because medical reports exist")
    if changed == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient deleted successfully"}
# ============================================================
# BASIC TEST
# ============================================================

@app.get("/")
def home():
    return {
        "message": "Medical Report Management System API is running"
    }
# ============================================================
# DOCTORS
# ============================================================

class DoctorIn(BaseModel):
    name: str
    specialization: str


@app.get("/doctors")
def list_doctors():
    try:
        return run_query(
            "SELECT * FROM doctors ORDER BY doctor_id"
        )
    except psycopg2.Error as e:
        raise_http_error(e)


@app.post("/doctors")
def create_doctor(doctor: DoctorIn):
    try:
        row = run_query(
            """
            INSERT INTO doctors (name, specialization)
            VALUES (%s, %s)
            RETURNING doctor_id
            """,
            (doctor.name, doctor.specialization),
            fetch="one",
        )
    except psycopg2.Error as e:
        raise_http_error(e)

    return {
        "message": "Doctor added successfully",
        "doctor_id": row["doctor_id"]
    }
# ============================================================
# MEDICAL REPORTS
# ============================================================

class ReportIn(BaseModel):
    patient_id: int
    doctor_id: int
    symptoms: str
    diagnosis: str
    medicines: str | None = None
    test_result: str | None = None


class ReportUpdateIn(BaseModel):
    symptoms: str
    diagnosis: str
    medicines: str | None = None
    test_result: str | None = None


@app.post("/reports")
def create_report(report: ReportIn):
    try:
        row = run_query(
            """
            SELECT add_medical_report(
                %s, %s, %s, %s, %s, %s
            ) AS report_id
            """,
            (
                report.patient_id,
                report.doctor_id,
                report.symptoms,
                report.diagnosis,
                report.medicines,
                report.test_result,
            ),
            fetch="one",
        )
    except psycopg2.Error as e:
        raise_http_error(e)

    return {
        "message": "Medical report added successfully",
        "report_id": row["report_id"]
    }


@app.get("/reports")
def list_reports():
    try:
        return run_query(
            """
            SELECT *
            FROM v_full_reports
            ORDER BY report_id
            """
        )
    except psycopg2.Error as e:
        raise_http_error(e)


@app.get("/reports/patient/{patient_id}")
def list_patient_reports(patient_id: int):
    try:
        return run_query(
            """
            SELECT *
            FROM v_full_reports
            WHERE patient_id = %s
            ORDER BY report_id
            """,
            (patient_id,),
        )
    except psycopg2.Error as e:
        raise_http_error(e)
@app.put("/reports/{report_id}")
def update_report(report_id: int, report: ReportUpdateIn):
    try:
        row = run_query(
            """
            SELECT update_medical_report(
                %s, %s, %s, %s, %s
            ) AS updated
            """,
            (
                report_id,
                report.symptoms,
                report.diagnosis,
                report.medicines,
                report.test_result,
            ),
            fetch="one",
        )
    except psycopg2.Error as e:
        raise_http_error(e)

    if not row["updated"]:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "message": "Medical report updated successfully"
    }
@app.delete("/reports/{report_id}")
def delete_report(report_id: int):
    try:
        changed = run_query(
            """
            DELETE FROM medical_reports
            WHERE report_id = %s
            """,
            (report_id,),
            fetch="none",
        )
    except psycopg2.Error as e:
        raise_http_error(e)

    if changed == 0:
        raise HTTPException(status_code=404, detail="Report not found")

    return {
        "message": "Medical report deleted successfully"
    }
@app.get("/history")
def list_history():
    try:
        return run_query(
            """
            SELECT *
            FROM report_history
            ORDER BY history_id
            """
        )
    except psycopg2.Error as e:
        raise_http_error(e)
