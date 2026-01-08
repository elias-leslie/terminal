"use client";

import { useCallback, useRef, useEffect } from "react";
import { clsx } from "clsx";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, Terminal as TerminalIcon } from "lucide-react";
import { ClaudeIndicator } from "./ClaudeIndicator";
import {
  type TerminalSlot,
  getSlotPanelId,
  getSlotName,
  getSlotSessionId,
} from "@/lib/utils/slot";

interface SessionTabProps {
  slot: TerminalSlot;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
  isDraggable?: boolean;
}

function SessionTab({
  slot,
  isActive,
  onClick,
  onClose,
  isDraggable = true,
}: SessionTabProps) {
  const panelId = getSlotPanelId(slot);
  const name = getSlotName(slot);
  const isProject = slot.type === "project";
  const isClaude = isProject && slot.activeMode === "claude";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: panelId,
    disabled: !isDraggable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 150ms ease",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        "group relative flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer",
        "border-b-2 transition-all duration-150 select-none",
        isActive
          ? "border-[var(--term-accent)] bg-[var(--term-bg-elevated)]"
          : "border-transparent hover:bg-[var(--term-bg-elevated)] hover:border-[var(--term-border)]",
      )}
      style={{
        ...style,
        color: isActive ? "var(--term-text-primary)" : "var(--term-text-muted)",
      }}
      title={name}
    >
      {/* Icon */}
      {isClaude ? (
        <ClaudeIndicator
          state={slot.claudeState === "running" ? "active" : "idle"}
        />
      ) : (
        <TerminalIcon
          className="w-3 h-3 flex-shrink-0"
          style={{
            color: isActive ? "var(--term-accent)" : "var(--term-text-muted)",
          }}
        />
      )}

      {/* Tab name */}
      <span className="truncate max-w-[100px]">{name}</span>

      {/* Close button - visible on hover */}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={clsx(
            "ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-[var(--term-bg-deep)]",
          )}
          style={{ color: "var(--term-text-muted)" }}
          title="Close session"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export interface SessionTabBarProps {
  slots: TerminalSlot[];
  activeSessionId: string | null;
  orderedSlotIds: string[];
  onReorder: (newOrder: string[]) => void;
  onSelectSlot: (slot: TerminalSlot) => void;
  onCloseSlot?: (slot: TerminalSlot) => void;
  onNewTerminal: () => void;
  className?: string;
}

export function SessionTabBar({
  slots,
  activeSessionId,
  orderedSlotIds,
  onReorder,
  onSelectSlot,
  onCloseSlot,
  onNewTerminal,
  className,
}: SessionTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Configure dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Sort slots by orderedSlotIds
  const sortedSlots = [...slots].sort((a, b) => {
    const aIndex = orderedSlotIds.indexOf(getSlotPanelId(a));
    const bIndex = orderedSlotIds.indexOf(getSlotPanelId(b));
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  const sortableIds = sortedSlots.map(getSlotPanelId);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = sortableIds.indexOf(active.id as string);
        const newIndex = sortableIds.indexOf(over.id as string);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(sortableIds, oldIndex, newIndex);
          onReorder(newOrder);
        }
      }
    },
    [sortableIds, onReorder],
  );

  // Keyboard navigation: Ctrl+Tab cycles, Ctrl+1-9 jumps to tab N
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Tab or Ctrl+Shift+Tab to cycle tabs
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const currentIndex = sortedSlots.findIndex(
          (slot) => getSlotSessionId(slot) === activeSessionId,
        );
        if (currentIndex === -1 && sortedSlots.length > 0) {
          onSelectSlot(sortedSlots[0]);
          return;
        }
        const direction = e.shiftKey ? -1 : 1;
        const nextIndex =
          (currentIndex + direction + sortedSlots.length) % sortedSlots.length;
        onSelectSlot(sortedSlots[nextIndex]);
      }

      // Ctrl+1-9 to jump to tab N
      if (e.ctrlKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const tabIndex = parseInt(e.key, 10) - 1;
        if (tabIndex < sortedSlots.length) {
          onSelectSlot(sortedSlots[tabIndex]);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sortedSlots, activeSessionId, onSelectSlot]);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!scrollRef.current || !activeSessionId) return;
    const activeSlot = sortedSlots.find(
      (slot) => getSlotSessionId(slot) === activeSessionId,
    );
    if (!activeSlot) return;

    const activeId = getSlotPanelId(activeSlot);
    const activeElement = scrollRef.current.querySelector(
      `[data-slot-id="${activeId}"]`,
    );
    activeElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeSessionId, sortedSlots]);

  if (slots.length === 0) {
    return null;
  }

  return (
    <div
      className={clsx(
        "flex items-center gap-0 border-b overflow-hidden",
        className,
      )}
      style={{
        backgroundColor: "var(--term-bg-surface)",
        borderColor: "var(--term-border)",
      }}
    >
      {/* Scrollable tab container */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-[var(--term-border)] scrollbar-track-transparent"
        style={{ scrollbarWidth: "thin" }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortableIds}
            strategy={horizontalListSortingStrategy}
          >
            {sortedSlots.map((slot) => {
              const sessionId = getSlotSessionId(slot);
              const isActive = sessionId === activeSessionId;

              return (
                <div
                  key={getSlotPanelId(slot)}
                  data-slot-id={getSlotPanelId(slot)}
                >
                  <SessionTab
                    slot={slot}
                    isActive={isActive}
                    onClick={() => onSelectSlot(slot)}
                    onClose={onCloseSlot ? () => onCloseSlot(slot) : undefined}
                    isDraggable={sortedSlots.length > 1}
                  />
                </div>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      {/* Add button */}
      <button
        onClick={onNewTerminal}
        className="flex-shrink-0 p-2 transition-colors hover:bg-[var(--term-bg-elevated)]"
        style={{ color: "var(--term-text-muted)" }}
        title="New terminal"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
