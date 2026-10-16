import os
from datetime import datetime, timezone
from flask import Flask, jsonify
import psycopg2

app = Flask(__name__)
DB_URL = os.environ.get("DATABASE_URL")

def db_ok():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT 1")
    cur.close()
    conn.close()
    return True

@app.route("/")
def index():
    return jsonify(service="api-python", runtime="Python 3.11 + Flask", message="Hello from Python!")

@app.route("/health")
def health():
    try:
        db_ok()
        return jsonify(service="api-python", status="ok", db="connected",
                       time=datetime.now(timezone.utc).isoformat())
    except Exception as e:
        return jsonify(service="api-python", status="error", db=str(e)), 500

@app.route("/api/users")
def users():
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("INSERT INTO visits (service) VALUES ('api-python')")
        conn.commit()
        cur.execute("SELECT id, service, created_at FROM visits ORDER BY id DESC LIMIT 5")
        rows = [{"id": r[0], "service": r[1], "created_at": str(r[2])} for r in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify(service="api-python", count=len(rows), visits=rows)
    except Exception as e:
        return jsonify(error=str(e)), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
