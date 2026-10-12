import psycopg2
from psycopg2.extras import RealDictCursor

# ------------------------------------------------------------
# DATABASE SETTINGS
# ------------------------------------------------------------
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "root123",
    "host": "localhost",
    "port": 5432,
}


def get_connection():
    return psycopg2.connect(
        **DB_CONFIG,
        cursor_factory=RealDictCursor
    )


def run_query(sql, params=None, fetch="all"):
    """
    Runs ONE SQL statement.

    fetch="all"  -> returns a list of rows
    fetch="one"  -> returns a single row
    fetch="none" -> returns number of changed rows
    """

    conn = get_connection()

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)

                if fetch == "all":
                    return cur.fetchall()

                if fetch == "one":
                    return cur.fetchone()

                return cur.rowcount

    finally:
        conn.close()
