#!/bin/bash
#
# Terminal Restore Script
# Restores code from backup archives
# NOTE: No database restore - terminal uses shared summitflow database
#
# Usage:
#   ./scripts/restore.sh --list              # List available backups
#   ./scripts/restore.sh --latest            # Restore from latest backup
#   ./scripts/restore.sh --file <archive>    # Restore from specific archive
#   ./scripts/restore.sh --dry-run           # Show what would be restored
#
# Sources (checked in order):
#   1. Local: ~/terminal/backups/
#   2. Pending: ~/.local/share/backup-pending/
#   3. SMB: //192.168.8.128/davion-gem/project-backups/terminal/

set -eo pipefail

# Load utilities (which also detects PROJECT_DIR and PROJECT_NAME)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/backup-utils.sh"

# Configuration - uses PROJECT_NAME from backup-utils.sh
LOCAL_BACKUP_DIR="$PROJECT_DIR/backups"
RESTORE_STAGING="/tmp/${PROJECT_NAME}-restore-$$"

# Parse arguments
RESTORE_MODE=""
TARGET_FILE=""
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
            echo "  --dry-run      Show what would be restored without doing it"
            echo ""
            echo "Sources checked (in order):"
            echo "  1. Local: $LOCAL_BACKUP_DIR/"
            echo "  2. Pending: $PENDING_BACKUP_DIR/"
            echo "  3. SMB: //$SMB_HOST/$SMB_SHARE/$SMB_PATH/"
            echo ""
            echo "NOTE: Terminal uses shared database - no DB restore needed"
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

    echo "  Terminal backend: $([ "$has_terminal" -gt 0 ] && echo "✓" || echo "✗")"
    echo "  Frontend code: $([ "$has_frontend" -gt 0 ] && echo "✓" || echo "✗")"
    echo "  Scripts: $([ "$has_scripts" -gt 0 ] && echo "✓" || echo "✗")"

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
    echo "NOTE: No database restore (uses shared summitflow DB)"
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

    # Restore files
    restore_files "$archive" "$RESTORE_STAGING"

    echo ""
    echo "========================================"
    log_success "Restore complete!"
    echo "========================================"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo "  (This was a dry run - no changes made)"
    else
        echo "  Source: $(basename "$archive")"
        echo "  Files: restored"
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
