#!/bin/bash
#
# Terminal Restore Script
# Restores code and terminal-specific tables from backup archives
#
# Usage:
#   ./scripts/restore.sh --list              # List available backups
#   ./scripts/restore.sh --latest            # Restore from latest backup
#   ./scripts/restore.sh --file <archive>    # Restore from specific archive
#   ./scripts/restore.sh --db-only           # Restore tables only
#   ./scripts/restore.sh --files-only        # Restore files only (no tables)
#   ./scripts/restore.sh --dry-run           # Show what would be restored
#
# Sources (checked in order):
#   1. Local: ~/terminal/backups/
#   2. Pending: ~/.local/share/backup-pending/
#   3. SMB: //192.168.8.128/davion-gem/project-backups/terminal/
#
# Database: Restores terminal-specific tables to shared summitflow DB:
#   - terminal_sessions

set -eo pipefail

# Load utilities (which also detects PROJECT_DIR and PROJECT_NAME)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/backup-utils.sh"

# Configuration - uses PROJECT_NAME from backup-utils.sh
LOCAL_BACKUP_DIR="$PROJECT_DIR/backups"
RESTORE_STAGING="/tmp/${PROJECT_NAME}-restore-$$"

# Terminal-specific tables (must match backup.sh)
TERMINAL_TABLES=(
    "terminal_sessions"
)

# Database config - terminal uses shared summitflow DB
TERMINAL_DB_NAME="summitflow"
TERMINAL_DB_USER="summitflow_app"

# Parse arguments
RESTORE_MODE=""
TARGET_FILE=""
DB_ONLY=false
FILES_ONLY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --list)
            RESTORE_MODE="list"
            shift
            ;;
        --latest)
            RESTORE_MODE="latest"
            shift
            ;;
        --file)
            RESTORE_MODE="file"
            TARGET_FILE="$2"
            shift 2
            ;;
        --db-only)
            DB_ONLY=true
            shift
            ;;
        --files-only)
            FILES_ONLY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --list         List available backups (local, pending, SMB)"
            echo "  --latest       Restore from most recent backup"
            echo "  --file <path>  Restore from specific archive file"
            echo "  --db-only      Restore terminal tables only, skip files"
            echo "  --files-only   Restore files only, skip tables"
            echo "  --dry-run      Show what would be restored without doing it"
            echo ""
            echo "Sources checked (in order):"
            echo "  1. Local: $LOCAL_BACKUP_DIR/"
            echo "  2. Pending: $PENDING_BACKUP_DIR/"
            echo "  3. SMB: //$SMB_HOST/$SMB_SHARE/$SMB_PATH/"
            echo ""
            echo "Database: Restores terminal-specific tables:"
            for table in "${TERMINAL_TABLES[@]}"; do
                echo "  - $table"
            done
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Cleanup function
cleanup() {
    if [ -d "$RESTORE_STAGING" ]; then
        rm -rf "$RESTORE_STAGING"
    fi
}
trap cleanup EXIT

# List available backups
list_backups() {
    echo ""
    echo "========================================"
    echo "Available Backups"
    echo "========================================"
    echo ""

    # Local backups
    echo "LOCAL ($LOCAL_BACKUP_DIR/):"
    if [ -d "$LOCAL_BACKUP_DIR" ]; then
        local local_backups=$(ls -1t "$LOCAL_BACKUP_DIR"/*.tar.gz 2>/dev/null || true)
        if [ -n "$local_backups" ]; then
            echo "$local_backups" | while read f; do
                local size=$(du -h "$f" | cut -f1)
                local date=$(basename "$f" | sed "s/${PROJECT_NAME}-\([0-9-]*\)\.tar\.gz/\1/")
                echo "  $(basename "$f")  ($size)"
            done
        else
            echo "  (none)"
        fi
    else
        echo "  (directory not found)"
    fi
    echo ""

    # Pending backups
    echo "PENDING ($PENDING_BACKUP_DIR/):"
    if [ -d "$PENDING_BACKUP_DIR" ]; then
        local pending_backups=$(ls -1t "$PENDING_BACKUP_DIR"/*.tar.gz 2>/dev/null || true)
        if [ -n "$pending_backups" ]; then
            echo "$pending_backups" | while read f; do
                local size=$(du -h "$f" | cut -f1)
                echo "  $(basename "$f")  ($size)"
            done
        else
            echo "  (none)"
        fi
    else
        echo "  (directory not found)"
    fi
    echo ""

    # SMB backups
    echo "SMB (//$SMB_HOST/$SMB_SHARE/$SMB_PATH/):"
    if [ -f "$CREDENTIALS_FILE" ] && test_smb_connection 2>/dev/null; then
        smb_list_backups | tail -10 | while read backup; do
            echo "  $backup"
        done
    else
        echo "  (not connected or credentials missing)"
    fi
    echo ""
}

# Find latest backup across all sources
find_latest_backup() {
    local latest=""
    local latest_time=0

    # Check local
    if [ -d "$LOCAL_BACKUP_DIR" ]; then
        local local_latest=$(ls -1t "$LOCAL_BACKUP_DIR"/*.tar.gz 2>/dev/null | head -1)
        if [ -n "$local_latest" ] && [ -f "$local_latest" ]; then
            local mtime=$(stat -c %Y "$local_latest" 2>/dev/null || stat -f %m "$local_latest" 2>/dev/null)
            if [ "$mtime" -gt "$latest_time" ]; then
                latest="$local_latest"
                latest_time="$mtime"
            fi
        fi
    fi

    # Check pending
    if [ -d "$PENDING_BACKUP_DIR" ]; then
        local pending_latest=$(ls -1t "$PENDING_BACKUP_DIR"/*.tar.gz 2>/dev/null | head -1)
        if [ -n "$pending_latest" ] && [ -f "$pending_latest" ]; then
            local mtime=$(stat -c %Y "$pending_latest" 2>/dev/null || stat -f %m "$pending_latest" 2>/dev/null)
            if [ "$mtime" -gt "$latest_time" ]; then
                latest="$pending_latest"
                latest_time="$mtime"
            fi
        fi
    fi

    echo "$latest"
}

# Verify archive contents
verify_archive() {
    local archive="$1"

    log "Verifying archive contents..."

    if ! tar -tzf "$archive" >/dev/null 2>&1; then
        log_error "Archive is corrupted or invalid"
        return 1
    fi

    # Check for expected components
    local has_terminal=$(tar -tzf "$archive" | grep -c "${PROJECT_NAME}/terminal/" || true)
    local has_frontend=$(tar -tzf "$archive" | grep -c "${PROJECT_NAME}/frontend/" || true)
    local has_scripts=$(tar -tzf "$archive" | grep -c "${PROJECT_NAME}/scripts/" || true)
    local has_db=$(tar -tzf "$archive" | grep -c "terminal_tables.sql.gz" || true)

    echo "  Terminal backend: $([ "$has_terminal" -gt 0 ] && echo "✓" || echo "✗")"
    echo "  Frontend code: $([ "$has_frontend" -gt 0 ] && echo "✓" || echo "✗")"
    echo "  Scripts: $([ "$has_scripts" -gt 0 ] && echo "✓" || echo "✗")"
    echo "  Table dump: $([ "$has_db" -gt 0 ] && echo "✓" || echo "✗")"

    # Check for required components based on mode
    if [ "$DB_ONLY" = true ] && [ "$has_db" -eq 0 ]; then
        log_error "Archive does not contain table dump (terminal_tables.sql.gz)"
        return 1
    fi

    return 0
}

# Restore terminal-specific tables
restore_tables() {
    local dump_file="$1"

    log "Restoring terminal-specific tables..."

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would restore tables from: $dump_file"
        log_info "[DRY RUN] Tables: ${TERMINAL_TABLES[*]}"
        return 0
    fi

    # Load DB password from env (DATABASE_URL for summitflow)
    if [ -f "$HOME/.env.local" ]; then
        local db_url=$(grep "^DATABASE_URL=" "$HOME/.env.local" 2>/dev/null | cut -d'=' -f2- || true)
        if [ -n "$db_url" ]; then
            local db_pass=$(echo "$db_url" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
            export PGPASSWORD="$db_pass"
        fi
    fi

    # Stop terminal service before restoring tables
    log "Stopping terminal service..."
    systemctl --user stop summitflow-terminal 2>/dev/null || true

    # Drop existing tables (will be recreated from dump)
    log "Dropping existing tables..."
    for table in "${TERMINAL_TABLES[@]}"; do
        psql -U "$TERMINAL_DB_USER" -h localhost "$TERMINAL_DB_NAME" \
            -c "DROP TABLE IF EXISTS $table CASCADE;" 2>/dev/null || true
    done

    # Restore from dump
    log "Restoring from dump..."
    if gunzip -c "$dump_file" | psql -U "$TERMINAL_DB_USER" -h localhost "$TERMINAL_DB_NAME" >/dev/null 2>&1; then
        log_success "Tables restored successfully: ${TERMINAL_TABLES[*]}"
    else
        log_error "Table restore failed"
        unset PGPASSWORD
        return 1
    fi

    unset PGPASSWORD

    # Restart terminal service
    log "Restarting terminal service..."
    systemctl --user start summitflow-terminal 2>/dev/null || true

    return 0
}

# Restore files
restore_files() {
    local archive="$1"
    local staging="$2"

    log "Restoring files..."

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would restore files from: $archive"
        log_info "[DRY RUN] Files to restore:"
        tar -tzf "$archive" | head -20
        echo "  ... (truncated)"
        return 0
    fi

    # Extract to staging
    log "Extracting archive..."
    tar -xzf "$archive" -C "$staging"

    # Stop services
    log "Stopping services..."
    systemctl --user stop summitflow-terminal summitflow-terminal-frontend 2>/dev/null || true

    # Backup current state (just in case)
    local pre_restore_backup="$PROJECT_DIR/backups/.pre-restore-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$pre_restore_backup"

    # Restore terminal backend (excluding venv)
    if [ -d "$staging/${PROJECT_NAME}/terminal" ]; then
        log "Restoring terminal backend..."
        rsync -a --delete \
            --exclude='__pycache__' \
            --exclude='.pytest_cache' \
            --exclude='.mypy_cache' \
            --exclude='.ruff_cache' \
            "$staging/${PROJECT_NAME}/terminal/" "$PROJECT_DIR/terminal/"
    fi

    # Restore frontend (excluding node_modules and .next)
    if [ -d "$staging/${PROJECT_NAME}/frontend" ]; then
        log "Restoring frontend..."
        rsync -a --delete \
            --exclude='node_modules' \
            --exclude='.next' \
            "$staging/${PROJECT_NAME}/frontend/" "$PROJECT_DIR/frontend/"
    fi

    # Restore other directories
    for dir in scripts; do
        if [ -d "$staging/${PROJECT_NAME}/$dir" ]; then
            log "Restoring $dir..."
            rsync -a "$staging/${PROJECT_NAME}/$dir/" "$PROJECT_DIR/$dir/"
        fi
    done

    # Restore root files
    for file in CLAUDE.md pyproject.toml; do
        if [ -f "$staging/${PROJECT_NAME}/$file" ]; then
            cp "$staging/${PROJECT_NAME}/$file" "$PROJECT_DIR/$file"
        fi
    done

    log_success "Files restored successfully"

    # Restart services
    log "Restarting services..."
    bash "$PROJECT_DIR/scripts/restart.sh" 2>/dev/null || true

    return 0
}

# Main restore function
do_restore() {
    local archive="$1"

    echo ""
    echo "========================================"
    echo "$PROJECT_NAME Restore"
    echo "========================================"
    echo ""
    echo "Project: $PROJECT_NAME ($PROJECT_DIR)"
    echo "Tables: ${TERMINAL_TABLES[*]}"
    echo ""

    if [ ! -f "$archive" ]; then
        log_error "Archive not found: $archive"
        exit 1
    fi

    log "Archive: $archive"
    log "Size: $(du -h "$archive" | cut -f1)"
    echo ""

    # Verify archive
    if ! verify_archive "$archive"; then
        exit 1
    fi
    echo ""

    # Create staging directory
    mkdir -p "$RESTORE_STAGING"

    local tables_restored=false
    local files_restored=false

    # Restore tables if needed
    if [ "$FILES_ONLY" != true ]; then
        log "Extracting table dump..."
        tar -xzf "$archive" -C "$RESTORE_STAGING" --wildcards "*/terminal_tables.sql.gz" 2>/dev/null || true

        local dump_file=$(find "$RESTORE_STAGING" -name "terminal_tables.sql.gz" | head -1)
        if [ -n "$dump_file" ] && [ -f "$dump_file" ]; then
            restore_tables "$dump_file"
            tables_restored=true
        else
            log_warn "No table dump found in archive"
        fi
    fi

    # Restore files if needed
    if [ "$DB_ONLY" != true ]; then
        restore_files "$archive" "$RESTORE_STAGING"
        files_restored=true
    fi

    echo ""
    echo "========================================"
    log_success "Restore complete!"
    echo "========================================"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo "  (This was a dry run - no changes made)"
    else
        echo "  Source: $(basename "$archive")"
        [ "$tables_restored" = true ] && echo "  Tables: restored (${TERMINAL_TABLES[*]})"
        [ "$files_restored" = true ] && echo "  Files: restored"
        echo ""
        echo "  Verify with:"
        echo "    bash $PROJECT_DIR/scripts/status.sh"
    fi
    echo ""
}

# Main
case "$RESTORE_MODE" in
    list)
        list_backups
        ;;
    latest)
        latest=$(find_latest_backup)
        if [ -z "$latest" ]; then
            log_error "No backups found"
            echo ""
            echo "Run backup first: bash $PROJECT_DIR/scripts/backup.sh --keep-local"
            exit 1
        fi
        log "Found latest backup: $latest"
        do_restore "$latest"
        ;;
    file)
        if [ -z "$TARGET_FILE" ]; then
            log_error "No file specified"
            exit 1
        fi
        do_restore "$TARGET_FILE"
        ;;
    *)
        echo "Usage: $0 --list | --latest | --file <archive>"
        echo ""
        echo "Run '$0 --help' for more options"
        exit 1
        ;;
esac
