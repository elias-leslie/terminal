"""Migration: Create terminal_panes table and migrate sessions.

This migration introduces the pane architecture:
- Each pane contains 1-2 sessions (ad-hoc: 1 shell, project: shell + claude)
- Max 4 panes enforced at application level
- Pane order persisted for layout restoration

Run with: python -m terminal.storage.migrations.001_create_panes
"""

from __future__ import annotations

import os
import sys
import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import psycopg


def get_connection() -> psycopg.Connection[tuple[Any, ...]]:
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


def check_already_migrated(conn: psycopg.Connection[tuple[Any, ...]]) -> bool:
    """Check if migration has already been applied."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'terminal_panes'
            )"""
        )
        row = cur.fetchone()
        return bool(row[0]) if row else False


def create_panes_table(conn: psycopg.Connection[tuple[Any, ...]]) -> None:
    """Create terminal_panes table."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE terminal_panes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                pane_type VARCHAR(10) NOT NULL CHECK (pane_type IN ('project', 'adhoc')),
                project_id VARCHAR(64),
                pane_order INTEGER NOT NULL DEFAULT 0,
                pane_name VARCHAR(255) NOT NULL,
                active_mode VARCHAR(16) NOT NULL DEFAULT 'shell' CHECK (active_mode IN ('shell', 'claude')),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        print("Created terminal_panes table")

        # Add constraint: project_id required for project panes, NULL for adhoc
        cur.execute("""
            ALTER TABLE terminal_panes ADD CONSTRAINT chk_project_pane_id
            CHECK (
                (pane_type = 'adhoc' AND project_id IS NULL) OR
                (pane_type = 'project' AND project_id IS NOT NULL)
            )
        """)
        print("Added project_id constraint")


def add_pane_id_column(conn: psycopg.Connection[tuple[Any, ...]]) -> None:
    """Add pane_id column to terminal_sessions."""
    with conn.cursor() as cur:
        # Check if column already exists
        cur.execute(
            """SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'terminal_sessions' AND column_name = 'pane_id'
            )"""
        )
        row = cur.fetchone()
        if row and row[0]:
            print("pane_id column already exists")
            return

        cur.execute("""
            ALTER TABLE terminal_sessions
            ADD COLUMN pane_id UUID REFERENCES terminal_panes(id) ON DELETE CASCADE
        """)
        print("Added pane_id column to terminal_sessions")


def migrate_existing_sessions(
    conn: psycopg.Connection[tuple[Any, ...]],
) -> dict[str, int]:
    """Migrate existing sessions to panes.

    Strategy:
    - For project sessions: group by (project_id, session_number) to pair shell+claude
    - For ad-hoc sessions: one pane per session

    Returns dict with migration stats.
    """
    stats: dict[str, int] = {"panes_created": 0, "sessions_updated": 0, "orphaned": 0}

    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, name, project_id, mode, session_number, is_alive
            FROM terminal_sessions
            WHERE is_alive = true
            ORDER BY project_id NULLS FIRST, session_number, mode
        """)
        sessions = cur.fetchall()

        project_groups: dict[tuple[str, int], list[tuple[Any, ...]]] = {}
        adhoc_sessions = []
        project_names: dict[str, str] = {}  # project_id -> display name

        for session in sessions:
            _sid, name, project_id, _mode, session_number, _is_alive = session
            if project_id is None:
                adhoc_sessions.append(session)
            else:
                key = (project_id, session_number)
                if key not in project_groups:
                    project_groups[key] = []
                project_groups[key].append(session)
                # Extract project display name from session name
                if project_id not in project_names:
                    # "Project: foo" -> "Foo" (capitalize)
                    if name.startswith("Project: "):
                        project_names[project_id] = name[9:].title()
                    else:
                        project_names[project_id] = project_id.title()

        # Count panes per project for naming
        project_pane_counts: dict[str, int] = {}

        # 2. Create panes for project session groups
        pane_order = 0
        for (project_id, _session_number), group_sessions in sorted(project_groups.items()):
            # Get or increment pane counter for this project
            if project_id not in project_pane_counts:
                project_pane_counts[project_id] = 0
            project_pane_counts[project_id] += 1
            count = project_pane_counts[project_id]

            # Generate pane name with badge for duplicates
            base_name = project_names.get(project_id, project_id.title())
            pane_name = base_name if count == 1 else f"{base_name} [{count}]"

            # Create pane
            pane_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO terminal_panes (id, pane_type, project_id, pane_order, pane_name)
                VALUES (%s, 'project', %s, %s, %s)
                """,
                (pane_id, project_id, pane_order, pane_name),
            )
            pane_order += 1
            stats["panes_created"] += 1

            # Link sessions to pane
            for session in group_sessions:
                session_id = str(session[0])
                cur.execute(
                    "UPDATE terminal_sessions SET pane_id = %s WHERE id = %s",
                    (pane_id, session_id),
                )
                stats["sessions_updated"] += 1

        # 3. Create panes for ad-hoc sessions
        for adhoc_count, session in enumerate(adhoc_sessions, start=1):
            session_id, name, _, _, _, _ = session

            pane_name = (
                "Ad-Hoc Terminal" if adhoc_count == 1 else f"Ad-Hoc Terminal [{adhoc_count}]"
            )

            pane_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO terminal_panes (id, pane_type, project_id, pane_order, pane_name)
                VALUES (%s, 'adhoc', NULL, %s, %s)
                """,
                (pane_id, pane_order, pane_name),
            )
            pane_order += 1
            stats["panes_created"] += 1

            cur.execute(
                "UPDATE terminal_sessions SET pane_id = %s WHERE id = %s",
                (pane_id, str(session_id)),
            )
            stats["sessions_updated"] += 1

    return stats


def create_indexes(conn: psycopg.Connection[tuple[Any, ...]]) -> None:
    """Create indexes for efficient queries."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_terminal_panes_project_id
            ON terminal_panes(project_id) WHERE project_id IS NOT NULL
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_terminal_panes_order
            ON terminal_panes(pane_order)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_terminal_sessions_pane_id
            ON terminal_sessions(pane_id) WHERE pane_id IS NOT NULL
        """)
        print("Created indexes")


def verify_migration(conn: psycopg.Connection[tuple[Any, ...]]) -> bool:
    """Verify migration completed correctly."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM terminal_sessions
            WHERE is_alive = true AND pane_id IS NULL
        """)
        row = cur.fetchone()
        orphaned = row[0] if row else 0
        if orphaned > 0:
            print(f"WARNING: {orphaned} alive sessions without pane_id")
            return False

        cur.execute("SELECT COUNT(*) FROM terminal_panes")
        row = cur.fetchone()
        pane_count = row[0] if row else 0

        cur.execute("""
            SELECT COUNT(*) FROM terminal_sessions
            WHERE is_alive = true AND pane_id IS NOT NULL
        """)
        row = cur.fetchone()
        linked_sessions = row[0] if row else 0

        print(f"Verification: {pane_count} panes, {linked_sessions} linked sessions")
        return True


def run_migration() -> bool:
    """Run the migration."""
    print("Starting migration: 001_create_panes")
    conn = get_connection()

    try:
        if check_already_migrated(conn):
            print("Migration already applied (terminal_panes table exists)")
            return True

        create_panes_table(conn)
        add_pane_id_column(conn)
        stats = migrate_existing_sessions(conn)
        create_indexes(conn)

        print("\nMigration stats:")
        print(f"  Panes created: {stats['panes_created']}")
        print(f"  Sessions updated: {stats['sessions_updated']}")

        if verify_migration(conn):
            conn.commit()
            print("\nMigration committed successfully!")
            return True
        else:
            conn.rollback()
            print("\nMigration rolled back due to verification failure")
            return False

    except Exception as e:
        conn.rollback()
        print(f"\nMigration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
