#!/bin/bash
#
# Terminal Backup Script
# Creates compressed backup archive and transfers to SMB share
# Includes selective DB dump of terminal-specific tables only
#
# Usage:
#   ./scripts/backup.sh              # Full backup (SMB only)
#   ./scripts/backup.sh --keep-local # Full backup + keep local copy
#   ./scripts/backup.sh --local      # Local only (no transfer)
#   ./scripts/backup.sh --status     # Show status only
#
# Destination: //192.168.8.128/davion-gem/project-backups/terminal/
# Local backups: ~/terminal/backups/
# Retention: 30 versions (SMB), 5 versions (local)
#
# Database: Backs up only terminal-specific tables from shared summitflow DB:
#   - terminal_sessions

set -eo pipefail

# Load utilities (which also detects PROJECT_DIR and PROJECT_NAME)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/backup-utils.sh"

# Local configuration - uses PROJECT_NAME from backup-utils.sh
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE_NAME="${PROJECT_NAME}-${TIMESTAMP}.tar.gz"
STAGING_DIR="/tmp/${PROJECT_NAME}-backup-$$"

# Terminal-specific tables to backup (add new tables here as needed)
TERMINAL_TABLES=(
    "terminal_sessions"
)

# Database config - terminal uses shared summitflow DB
TERMINAL_DB_NAME="summitflow"
TERMINAL_DB_USER="summitflow_app"
# Password loaded from ~/.env.local by backup-utils.sh

# Parse arguments
LOCAL_ONLY=false
STATUS_ONLY=false
KEEP_LOCAL=false
LOCAL_RETENTION=5

for arg in "$@"; do
    case $arg in
        --local) LOCAL_ONLY=true ;;
        --keep-local) KEEP_LOCAL=true ;;
        --status) STATUS_ONLY=true ;;
        --help|-h)
            echo "Usage: $0 [--local] [--keep-local] [--status]"
            echo ""
            echo "Options:"
            echo "  --local      Create archive locally only, skip SMB transfer"
            echo "  --keep-local Upload to SMB AND keep local copy (for fast restore)"
            echo "  --status     Show backup status only"
            echo ""
            echo "Destination: //$SMB_HOST/$SMB_SHARE/$SMB_PATH"
            echo "Local backups: $PROJECT_DIR/backups/"
            echo "Retention: $MAX_BACKUPS (SMB), $LOCAL_RETENTION (local)"
            echo ""
            echo "Database: Backs up terminal-specific tables only:"
            for table in "${TERMINAL_TABLES[@]}"; do
                echo "  - $table"
            done
            exit 0
            ;;
    esac
done

# Cleanup function
cleanup() {
    if [ -d "$STAGING_DIR" ]; then
        rm -rf "$STAGING_DIR"
    fi
}
trap cleanup EXIT

# Show status function
show_status() {
    echo ""
    echo "========================================"
    echo "$PROJECT_NAME Backup Status"
    echo "========================================"
    echo ""
    echo "Project: $PROJECT_NAME ($PROJECT_DIR)"
    echo ""

    if [ -f "$BACKUP_INDEX" ]; then
        local count=$(jq '.backups | length' "$BACKUP_INDEX")
        local latest=$(jq -r '.backups[0].name // "none"' "$BACKUP_INDEX")
        local latest_date=$(jq -r '.backups[0].timestamp // "never"' "$BACKUP_INDEX")
        local latest_size=$(jq -r '.backups[0].size_bytes // 0' "$BACKUP_INDEX")

        echo "Index file: $BACKUP_INDEX"
        echo "Total backups: $count"
        echo "Latest: $latest"
        echo "Date: $latest_date"
        echo "Size: $(numfmt --to=iec $latest_size 2>/dev/null || echo "$latest_size bytes")"
    else
        echo "No backup index found"
    fi

    echo ""

    if [ -f "$CREDENTIALS_FILE" ]; then
        echo "SMB Destination: //$SMB_HOST/$SMB_SHARE/$SMB_PATH"
        if test_smb_connection 2>/dev/null; then
            echo "Connection: OK"
            echo ""
            echo "Remote backups:"
            smb_list_backups | tail -5 | while read backup; do
                echo "  $backup"
            done
        else
            echo "Connection: FAILED"
        fi
    else
        echo "SMB credentials not configured"
        echo "Run backup once to set up credentials"
    fi

    echo ""
}

# Dump terminal-specific tables only
dump_terminal_tables() {
    local dump_file="$1"

    log "Dumping terminal-specific tables..."

    # Load DB password from env
    if [ -f "$HOME/.env.local" ]; then
        local db_url=$(grep "^SUMMITFLOW_DB_URL=" "$HOME/.env.local" 2>/dev/null | cut -d'=' -f2- || true)
        if [ -n "$db_url" ]; then
            local db_pass=$(echo "$db_url" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
            export PGPASSWORD="$db_pass"
        fi
    fi

    # Build table list for pg_dump
    local table_args=""
    for table in "${TERMINAL_TABLES[@]}"; do
        table_args="$table_args -t $table"
    done

    # Dump only specified tables (schema + data)
    if pg_dump -U "$TERMINAL_DB_USER" -h localhost "$TERMINAL_DB_NAME" $table_args | gzip > "$dump_file"; then
        local dump_size=$(du -h "$dump_file" | cut -f1)
        log_success "Table dump created ($dump_size): ${TERMINAL_TABLES[*]}"
    else
        log_error "Table dump failed"
        unset PGPASSWORD
        return 1
    fi

    unset PGPASSWORD
}

# Create archive function
create_archive() {
    local archive_path="$1"
    local db_dump="$2"
    local tar_path="${archive_path%.gz}"

    log "Creating archive..."

    cd "$PROJECT_DIR"

    # Build tar exclusion args
    local exclude_args=()
    for ex in "${BACKUP_EXCLUDES[@]}"; do
        exclude_args+=(--exclude="$ex")
    done

    # Also exclude node_modules and .venv (terminal-specific structure)
    exclude_args+=(--exclude=".venv")
    exclude_args+=(--exclude="frontend/node_modules")
    exclude_args+=(--exclude="frontend/.next")

    # Create archive of entire project (minus exclusions)
    tar --create \
        --file="$tar_path" \
        "${exclude_args[@]}" \
        --transform="s|^|${PROJECT_NAME}/|" \
        . 2>/dev/null || true

    # Add database dump to archive
    if [ -n "$db_dump" ] && [ -f "$db_dump" ]; then
        tar --append \
            --file="$tar_path" \
            --transform="s|^|${PROJECT_NAME}/|" \
            -C "$(dirname "$db_dump")" "$(basename "$db_dump")"
    fi

    # Compress
    gzip -f "$tar_path"

    log_success "Archive created: $(du -h "$archive_path" | cut -f1)"
}

# Verify backup archive
verify_backup_terminal() {
    local archive_path="$1"

    if ! tar -tzf "$archive_path" > /dev/null 2>&1; then
        echo '{"verified":false,"verified_at":"'"$(date -Iseconds)"'","errors":["Archive integrity check failed"],"tree":{}}'
        return 1
    fi

    # Check for table dump
    local has_db=$(tar -tzf "$archive_path" | grep -c "terminal_tables.sql.gz" || echo "0")

    local tree_json
    tree_json=$(tar -tzf "$archive_path" 2>/dev/null | \
        sed "s|^${PROJECT_NAME}/\./||;s|^${PROJECT_NAME}/||" | \
        grep -v '/$' | grep -v '^$' | \
        awk -F'/' '
        {
            if (NF == 1) {
                files[$1] = 1
            } else {
                dirs[$1]++
            }
        }
        END {
            printf "{"
            first = 1
            for (d in dirs) {
                if (!first) printf ","
                printf "\"%s\":{\"count\":%d}", d, dirs[d]
                first = 0
            }
            for (f in files) {
                if (!first) printf ","
                printf "\"%s\":{\"count\":1}", f
                first = 0
            }
            printf "}"
        }')

    local total_files checksum
    total_files=$(tar -tzf "$archive_path" | grep -v '/$' | wc -l | tr -d ' ')
    checksum=$(sha256sum "$archive_path" | cut -d' ' -f1)

    local verified="true"
    local errors="[]"
    if [ "$has_db" -eq 0 ]; then
        errors='["Warning: terminal_tables.sql.gz missing"]'
    fi

    echo "{\"verified\":$verified,\"verified_at\":\"$(date -Iseconds)\",\"errors\":$errors,\"tree\":$tree_json,\"total_files\":$total_files,\"checksum\":\"sha256:$checksum\",\"has_db\":$([ "$has_db" -gt 0 ] && echo "true" || echo "false")}"
}

# Display verification results
display_verification() {
    local verification="$1"

    local verified
    verified=$(echo "$verification" | jq -r '.verified')

    if [ "$verified" = "true" ]; then
        log_success "Archive integrity verified!"
    else
        log_error "Verification FAILED!"
        echo "$verification" | jq -r '.errors[]' | while read -r err; do
            log_error "  - $err"
        done
    fi

    echo ""
    echo "  Contents by directory:"
    echo "$verification" | jq -r '.tree | to_entries | sort_by(-.value.count) | .[] | "    \(.key): \(.value.count) files"'

    local total_files checksum
    total_files=$(echo "$verification" | jq -r '.total_files')
    checksum=$(echo "$verification" | jq -r '.checksum')
    echo "  ─────────────────────────────────────"
    echo "  Total: $total_files files"
    echo "  Checksum: $checksum"
}

# Main function
main() {
    if [ "$STATUS_ONLY" = true ]; then
        show_status
        exit 0
    fi

    echo ""
    echo "========================================"
    echo "$PROJECT_NAME Backup"
    echo "========================================"
    echo ""
    echo "Project: $PROJECT_NAME ($PROJECT_DIR)"
    echo "Tables: ${TERMINAL_TABLES[*]}"
    echo ""

    # Setup
    mkdir -p "$STAGING_DIR"
    local db_dump="$STAGING_DIR/terminal_tables.sql.gz"
    local archive_path="$STAGING_DIR/$ARCHIVE_NAME"

    # Dump terminal-specific tables
    dump_terminal_tables "$db_dump"
    local db_size
    db_size=$(stat -c%s "$db_dump" 2>/dev/null || stat -f%z "$db_dump" 2>/dev/null || echo "0")

    # Create archive
    log "Creating archive (this may take a moment)..."
    create_archive "$archive_path" "$db_dump"
    local archive_size
    archive_size=$(stat -c%s "$archive_path" 2>/dev/null || stat -f%z "$archive_path" 2>/dev/null || echo "0")

    # Verify archive
    log "Verifying backup..."
    local verification
    verification=$(verify_backup_terminal "$archive_path")

    display_verification "$verification"

    # Local only mode
    if [ "$LOCAL_ONLY" = true ]; then
        local final_path="$PROJECT_DIR/backups/$ARCHIVE_NAME"
        mkdir -p "$PROJECT_DIR/backups"
        cp "$archive_path" "$final_path"
        echo ""
        log_success "Local backup created: $final_path"
        echo ""
        echo "Archive: $final_path"
        echo "Size: $(du -h "$final_path" | cut -f1)"
        return 0
    fi

    # Setup SMB credentials if needed
    ensure_smb_credentials

    # Upload with retry and local fallback
    if upload_with_retry "$archive_path" "$ARCHIVE_NAME" "$PROJECT_NAME"; then
        # Apply retention policy (only if upload succeeded)
        apply_retention

        # Keep local copy if requested
        if [ "$KEEP_LOCAL" = true ]; then
            local local_backup_dir="$PROJECT_DIR/backups"
            mkdir -p "$local_backup_dir"
            cp "$archive_path" "$local_backup_dir/$ARCHIVE_NAME"
            log_success "Local copy saved: $local_backup_dir/$ARCHIVE_NAME"

            # Apply local retention (keep only latest N)
            local local_count=$(ls -1 "$local_backup_dir"/*.tar.gz 2>/dev/null | wc -l)
            if [ "$local_count" -gt "$LOCAL_RETENTION" ]; then
                ls -1t "$local_backup_dir"/*.tar.gz | tail -n +$((LOCAL_RETENTION + 1)) | xargs rm -f
                log "Local retention applied: keeping $LOCAL_RETENTION backups"
            fi
        fi

        # Update backup index
        update_backup_index "$ARCHIVE_NAME" "$archive_size" "$db_size" "ok" "$verification"

        echo ""
        echo "========================================"
        log_success "Backup complete!"
        echo "========================================"
        echo ""
        echo "  Archive: $ARCHIVE_NAME"
        echo "  Size: $(numfmt --to=iec $archive_size 2>/dev/null || echo "$archive_size bytes")"
        echo "  Location: //$SMB_HOST/$SMB_SHARE/$SMB_PATH/$ARCHIVE_NAME"
        if [ "$KEEP_LOCAL" = true ]; then
            echo "  Local: $PROJECT_DIR/backups/$ARCHIVE_NAME"
        fi
        echo ""
        echo "  Index updated: $BACKUP_INDEX"
        echo ""
    else
        # Backup saved to pending - update index with pending status
        update_backup_index "$ARCHIVE_NAME" "$archive_size" 0 "pending" "$verification"

        echo ""
        echo "========================================"
        log_warn "Backup saved locally (SMB unavailable)"
        echo "========================================"
        echo ""
        echo "  Archive: $ARCHIVE_NAME"
        echo "  Size: $(numfmt --to=iec $archive_size 2>/dev/null || echo "$archive_size bytes")"
        echo "  Pending: $PENDING_BACKUP_DIR/$ARCHIVE_NAME"
        echo ""
        echo "  Will auto-upload when SMB is available"
        echo ""
        # Exit 0 - backup was created successfully, just not uploaded yet
        exit 0
    fi
}

main "$@"
