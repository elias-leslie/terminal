"""Migration: Add layout fields to terminal_panes for resizable grid.

This migration adds:
- width_percent: Pane width as percentage of total grid width
- height_percent: Pane height as percentage of total grid height
- grid_row: Row position in the grid (0-indexed)
- grid_col: Column position in the grid (0-indexed)

These fields enable the resizable dynamic pane grid system.

Run with: python -m terminal.storage.migrations.002_add_layout_fields
"""

from __future__ import annotations

import os
import sys


def get_connection():
    """Get database connection using psycopg."""
    import psycopg

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        env_file = os.path.expanduser("~/.env.local")
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    if line.startswith("DATABASE_URL="):
                        db_url = line.split("=", 1)[1].strip()
                        break
    if not db_url:
        raise ValueError("DATABASE_URL not set")
    return psycopg.connect(db_url)


def check_already_migrated(conn) -> bool:
    """Check if migration has already been applied."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'terminal_panes' AND column_name = 'width_percent'
            )"""
        )
        return cur.fetchone()[0]


def add_layout_columns(conn) -> None:
    """Add layout columns to terminal_panes."""
    with conn.cursor() as cur:
        cur.execute("""
            ALTER TABLE terminal_panes
            ADD COLUMN width_percent FLOAT DEFAULT 100.0,
            ADD COLUMN height_percent FLOAT DEFAULT 100.0,
            ADD COLUMN grid_row INTEGER DEFAULT 0,
            ADD COLUMN grid_col INTEGER DEFAULT 0
        """)
        print("Added layout columns: width_percent, height_percent, grid_row, grid_col")


def set_initial_layout(conn) -> int:
    """Set initial layout values for existing panes.

    Strategy: All existing panes get full width/height (will be recalculated by frontend).
    Returns number of panes updated.
    """
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE terminal_panes
            SET width_percent = 100.0,
                height_percent = 100.0,
                grid_row = 0,
                grid_col = pane_order
            WHERE width_percent IS NULL OR grid_row IS NULL
        """)
        return cur.rowcount


def run_migration():
    """Run the migration."""
    print("Starting migration: 002_add_layout_fields")
    conn = get_connection()

    try:
        if check_already_migrated(conn):
            print("Migration already applied (width_percent column exists)")
            return True

        add_layout_columns(conn)
        updated = set_initial_layout(conn)
        print(f"Set initial layout for {updated} existing panes")

        conn.commit()
        print("\nMigration committed successfully!")
        return True

    except Exception as e:
        conn.rollback()
        print(f"\nMigration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
