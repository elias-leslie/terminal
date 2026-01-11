"use client";

import { useMemo, useCallback, useRef } from "react";
import {
  Group,
  Panel,
  Separator,
  useGroupRef,
  type Layout,
  type GroupImperativeHandle,
} from "react-resizable-panels";
import { UnifiedTerminalHeader } from "./UnifiedTerminalHeader";
import {
  TerminalComponent,
  TerminalHandle,
  ConnectionStatus,
} from "./Terminal";
import {
  type TerminalSlot,
  type PaneSlot,
  getSlotSessionId,
  getSlotPanelId,
  getSlotWorkingDir,
  isPaneSlot,
  getPaneId,
} from "@/lib/utils/slot";
import { TerminalMode } from "./ModeToggle";
import { MAX_PANES } from "@/lib/constants/terminal";

// Minimum pane size in pixels (400x300 requirement)
const MIN_PANE_WIDTH_PX = 400;
const MIN_PANE_HEIGHT_PX = 300;

// Convert pixel minimum to percentage (approximate for typical viewport)
// These will be recalculated dynamically based on container size
const DEFAULT_MIN_SIZE_PERCENT = 20;

export interface ResizablePaneLayoutProps {
  slots: (TerminalSlot | PaneSlot)[];
  fontFamily: string;
  fontSize: number;
  scrollback?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  theme?: Parameters<typeof TerminalComponent>[0]["theme"];
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void;
  // Action handlers for per-pane header buttons
  onSwitch?: (slot: TerminalSlot | PaneSlot) => void;
  onSettings?: () => void;
  onReset?: (slot: TerminalSlot | PaneSlot) => void;
  onClose?: (slot: TerminalSlot | PaneSlot) => void;
  onUpload?: () => void;
  onClean?: (slot: TerminalSlot | PaneSlot) => void;
  /** Opens terminal manager modal */
  onOpenModal?: () => void;
  /** Whether new panes can be added (at limit = false) */
  canAddPane?: boolean;
  /** Mode switch handler for project slots */
  onModeSwitch?: (
    slot: TerminalSlot | PaneSlot,
    mode: TerminalMode,
  ) => void | Promise<void>;
  /** Whether mode switch is in progress */
  isModeSwitching?: boolean;
  isMobile?: boolean;
  /** Callback when layout changes (resize ends) */
  onLayoutChange?: (layouts: PaneLayout[]) => void;
  /** Initial layout configuration (percentages) */
  initialLayouts?: PaneLayout[];
  /** Swap two panes' positions */
  onSwapPanes?: (slotIdA: string, slotIdB: string) => void;
}

export interface PaneLayout {
  slotId: string;
  widthPercent: number;
  heightPercent: number;
  row: number;
  col: number;
}

/**
 * Custom separator with double-click to reset adjacent panels to equal sizes.
 */
interface ResizeSeparatorProps {
  orientation: "horizontal" | "vertical";
  groupRef: React.RefObject<GroupImperativeHandle | null>;
  adjacentPanelIds: [string, string];
}

function ResizeSeparator({
  orientation,
  groupRef,
  adjacentPanelIds,
}: ResizeSeparatorProps) {
  const handleDoubleClick = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;

    // Get current layout
    const currentLayout = group.getLayout();

    // Calculate equal size for the two adjacent panels
    const [panelA, panelB] = adjacentPanelIds;
    const totalSize =
      (currentLayout[panelA] ?? 50) + (currentLayout[panelB] ?? 50);
    const equalSize = totalSize / 2;

    // Set new layout with equal sizes
    const newLayout = {
      ...currentLayout,
      [panelA]: equalSize,
      [panelB]: equalSize,
    };

    group.setLayout(newLayout);
  }, [groupRef, adjacentPanelIds]);

  return (
    <Separator
      className={
        orientation === "horizontal"
          ? "resizable-handle-horizontal"
          : "resizable-handle-vertical"
      }
      onDoubleClick={handleDoubleClick}
    />
  );
}

// Helper component types
interface LayoutHelperProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  displaySlots: (TerminalSlot | PaneSlot)[];
  getMinSizePercent: (direction: "horizontal" | "vertical") => number;
  handleLayoutChange: (layout: Layout) => void;
  renderPane: (slot: TerminalSlot | PaneSlot, index: number) => React.ReactNode;
}

/**
 * Two-pane horizontal layout with double-click reset.
 */
function TwoPaneLayout({
  containerRef,
  displaySlots,
  getMinSizePercent,
  handleLayoutChange,
  renderPane,
}: LayoutHelperProps) {
  const groupRef = useGroupRef();
  const panelIds: [string, string] = [
    getSlotPanelId(displaySlots[0]),
    getSlotPanelId(displaySlots[1]),
  ];

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-1"
      style={{ backgroundColor: "var(--term-bg-deep)" }}
    >
      <Group
        orientation="horizontal"
        onLayoutChange={handleLayoutChange}
        groupRef={groupRef}
        className="h-full"
      >
        <Panel
          id={panelIds[0]}
          minSize={`${getMinSizePercent("horizontal")}%`}
          defaultSize="50%"
          className="h-full"
        >
          {renderPane(displaySlots[0], 0)}
        </Panel>

        <ResizeSeparator
          orientation="horizontal"
          groupRef={groupRef}
          adjacentPanelIds={panelIds}
        />

        <Panel
          id={panelIds[1]}
          minSize={`${getMinSizePercent("horizontal")}%`}
          defaultSize="50%"
          className="h-full"
        >
          {renderPane(displaySlots[1], 1)}
        </Panel>
      </Group>
    </div>
  );
}

/**
 * Three-pane 2+1 layout with double-click reset.
 */
function ThreePaneLayout({
  containerRef,
  displaySlots,
  getMinSizePercent,
  handleLayoutChange,
  renderPane,
}: LayoutHelperProps) {
  const verticalGroupRef = useGroupRef();
  const horizontalGroupRef = useGroupRef();

  const topRowPanelIds: [string, string] = [
    getSlotPanelId(displaySlots[0]),
    getSlotPanelId(displaySlots[1]),
  ];

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-1"
      style={{ backgroundColor: "var(--term-bg-deep)" }}
    >
      <Group
        orientation="vertical"
        groupRef={verticalGroupRef}
        className="h-full"
      >
        {/* Top row: 2 panes side by side */}
        <Panel
          id="top-row"
          minSize={`${getMinSizePercent("vertical")}%`}
          defaultSize="50%"
        >
          <Group
            orientation="horizontal"
            onLayoutChange={handleLayoutChange}
            groupRef={horizontalGroupRef}
            className="h-full"
          >
            <Panel
              id={topRowPanelIds[0]}
              minSize={`${getMinSizePercent("horizontal")}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[0], 0)}
            </Panel>

            <ResizeSeparator
              orientation="horizontal"
              groupRef={horizontalGroupRef}
              adjacentPanelIds={topRowPanelIds}
            />

            <Panel
              id={topRowPanelIds[1]}
              minSize={`${getMinSizePercent("horizontal")}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[1], 1)}
            </Panel>
          </Group>
        </Panel>

        <ResizeSeparator
          orientation="vertical"
          groupRef={verticalGroupRef}
          adjacentPanelIds={["top-row", getSlotPanelId(displaySlots[2])]}
        />

        {/* Bottom row: 1 full-width pane */}
        <Panel
          id={getSlotPanelId(displaySlots[2])}
          minSize={`${getMinSizePercent("vertical")}%`}
          defaultSize="50%"
        >
          {renderPane(displaySlots[2], 2)}
        </Panel>
      </Group>
    </div>
  );
}

/**
 * Four-pane 2x2 layout with double-click reset.
 */
function FourPaneLayout({
  containerRef,
  displaySlots,
  getMinSizePercent,
  handleLayoutChange,
  renderPane,
}: LayoutHelperProps) {
  const verticalGroupRef = useGroupRef();
  const topRowGroupRef = useGroupRef();
  const bottomRowGroupRef = useGroupRef();

  const topRowPanelIds: [string, string] = [
    getSlotPanelId(displaySlots[0]),
    getSlotPanelId(displaySlots[1]),
  ];
  const bottomRowPanelIds: [string, string] = [
    getSlotPanelId(displaySlots[2]),
    getSlotPanelId(displaySlots[3]),
  ];

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-1"
      style={{ backgroundColor: "var(--term-bg-deep)" }}
    >
      <Group
        orientation="vertical"
        groupRef={verticalGroupRef}
        className="h-full"
      >
        {/* Top row: 2 panes */}
        <Panel
          id="top-row"
          minSize={`${getMinSizePercent("vertical")}%`}
          defaultSize="50%"
        >
          <Group
            orientation="horizontal"
            onLayoutChange={handleLayoutChange}
            groupRef={topRowGroupRef}
            className="h-full"
          >
            <Panel
              id={topRowPanelIds[0]}
              minSize={`${getMinSizePercent("horizontal")}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[0], 0)}
            </Panel>

            <ResizeSeparator
              orientation="horizontal"
              groupRef={topRowGroupRef}
              adjacentPanelIds={topRowPanelIds}
            />

            <Panel
              id={topRowPanelIds[1]}
              minSize={`${getMinSizePercent("horizontal")}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[1], 1)}
            </Panel>
          </Group>
        </Panel>

        <ResizeSeparator
          orientation="vertical"
          groupRef={verticalGroupRef}
          adjacentPanelIds={["top-row", "bottom-row"]}
        />

        {/* Bottom row: 2 panes */}
        <Panel
          id="bottom-row"
          minSize={`${getMinSizePercent("vertical")}%`}
          defaultSize="50%"
        >
          <Group
            orientation="horizontal"
            onLayoutChange={handleLayoutChange}
            groupRef={bottomRowGroupRef}
            className="h-full"
          >
            <Panel
              id={bottomRowPanelIds[0]}
              minSize={`${getMinSizePercent("horizontal")}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[2], 2)}
            </Panel>

            <ResizeSeparator
              orientation="horizontal"
              groupRef={bottomRowGroupRef}
              adjacentPanelIds={bottomRowPanelIds}
            />

            <Panel
              id={bottomRowPanelIds[1]}
              minSize={`${getMinSizePercent("horizontal")}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[3], 3)}
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  );
}

/**
 * Resizable pane layout using react-resizable-panels.
 * Dynamically adapts grid based on pane count:
 * - 1 pane: full size
 * - 2 panes: vertical split (side by side)
 * - 3 panes: 2+1 layout
 * - 4 panes: 2x2 grid
 */
export function ResizablePaneLayout({
  slots,
  fontFamily,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  theme,
  onTerminalRef,
  onStatusChange,
  onSwitch,
  onSettings,
  onReset,
  onClose,
  onUpload,
  onClean,
  onOpenModal,
  canAddPane,
  onModeSwitch,
  isModeSwitching,
  isMobile,
  onLayoutChange,
  initialLayouts,
  onSwapPanes,
}: ResizablePaneLayoutProps) {
  // Cap at max panes
  const displaySlots = useMemo(() => slots.slice(0, MAX_PANES), [slots]);

  const paneCount = displaySlots.length;

  // Track container size for min size calculations
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate min size percentage based on container dimensions
  const getMinSizePercent = useCallback(
    (direction: "horizontal" | "vertical") => {
      if (!containerRef.current) return DEFAULT_MIN_SIZE_PERCENT;

      const rect = containerRef.current.getBoundingClientRect();
      if (direction === "horizontal") {
        // Minimum width percentage
        const percent = (MIN_PANE_WIDTH_PX / rect.width) * 100;
        return Math.max(percent, 10); // At least 10%
      } else {
        // Minimum height percentage
        const percent = (MIN_PANE_HEIGHT_PX / rect.height) * 100;
        return Math.max(percent, 10); // At least 10%
      }
    },
    [],
  );

  // Handle layout change (resize ends)
  // Layout is a map of panel id to size percentage
  const handleLayoutChange = useCallback(
    (layout: Layout) => {
      if (!onLayoutChange) return;

      // Build layout info from the layout map
      // Use getPaneId for persistence (database pane UUID) when available
      // Use getSlotPanelId for panel identification within react-resizable-panels
      const layouts: PaneLayout[] = displaySlots.map((slot, index) => {
        const panelId = getSlotPanelId(slot);
        // Use actual pane ID for persistence if available (PaneSlot has paneId)
        const persistenceId = isPaneSlot(slot) ? getPaneId(slot) : panelId;
        return {
          slotId: persistenceId,
          widthPercent: layout[panelId] ?? 100 / paneCount,
          heightPercent: 100, // TODO: compute for nested groups
          row: 0,
          col: index,
        };
      });

      onLayoutChange(layouts);
    },
    [displaySlots, onLayoutChange, paneCount],
  );

  // Render a single pane (terminal with header)
  const renderPane = useCallback(
    (slot: TerminalSlot | PaneSlot, index: number) => {
      const sessionId = getSlotSessionId(slot);
      const workingDir = getSlotWorkingDir(slot);
      const panelId = getSlotPanelId(slot);

      const paneContent = (
        <div
          className="flex flex-col h-full min-h-0 overflow-hidden rounded-md"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            border: "1px solid var(--term-border)",
          }}
        >
          <UnifiedTerminalHeader
            slot={slot}
            showCleanButton={
              slot.type === "project" && slot.activeMode === "claude"
            }
            onSwitch={onSwitch ? () => onSwitch(slot) : undefined}
            onSettings={onSettings}
            onReset={onReset ? () => onReset(slot) : undefined}
            onClose={onClose ? () => onClose(slot) : undefined}
            onUpload={onUpload}
            onClean={onClean ? () => onClean(slot) : undefined}
            onOpenModal={onOpenModal}
            canAddPane={canAddPane}
            onModeSwitch={
              onModeSwitch ? (mode) => onModeSwitch(slot, mode) : undefined
            }
            isModeSwitching={isModeSwitching}
            isMobile={isMobile}
            allSlots={paneCount > 1 ? displaySlots : undefined}
            onSwapWith={
              onSwapPanes && paneCount > 1
                ? (otherSlotId) => onSwapPanes(panelId, otherSlotId)
                : undefined
            }
          />

          <div
            className="flex-1 min-h-0 overflow-hidden relative"
            style={{ backgroundColor: "var(--term-bg-deep)" }}
          >
            {sessionId ? (
              <TerminalComponent
                ref={(handle) => onTerminalRef?.(sessionId, handle)}
                sessionId={sessionId}
                workingDir={workingDir || undefined}
                className="h-full"
                fontFamily={fontFamily}
                fontSize={fontSize}
                scrollback={scrollback}
                cursorStyle={cursorStyle}
                cursorBlink={cursorBlink}
                theme={theme}
                onStatusChange={(status) => onStatusChange?.(sessionId, status)}
              />
            ) : (
              <div
                className="flex items-center justify-center h-full text-xs"
                style={{ color: "var(--term-text-muted)" }}
              >
                Click tab to start session
              </div>
            )}
          </div>
        </div>
      );

      return paneContent;
    },
    [
      onSwitch,
      onSettings,
      onReset,
      onClose,
      onUpload,
      onClean,
      onOpenModal,
      canAddPane,
      onModeSwitch,
      isModeSwitching,
      isMobile,
      displaySlots,
      paneCount,
      onSwapPanes,
      onTerminalRef,
      fontFamily,
      fontSize,
      scrollback,
      cursorStyle,
      cursorBlink,
      theme,
      onStatusChange,
    ],
  );

  // Empty state - show placeholder to add terminal
  if (paneCount === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center p-4"
        style={{ backgroundColor: "var(--term-bg-deep)" }}
      >
        <div
          onClick={onOpenModal}
          className="flex flex-col items-center gap-3 p-6 rounded-lg cursor-pointer transition-all hover:scale-105"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            border: "1px dashed var(--term-border)",
          }}
        >
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full"
            style={{
              backgroundColor: "var(--term-bg-elevated)",
              border: "1px solid var(--term-border)",
            }}
          >
            <span
              className="text-2xl font-light"
              style={{ color: "var(--term-accent)" }}
            >
              +
            </span>
          </div>
          <span className="text-sm" style={{ color: "var(--term-text-muted)" }}>
            Open terminal
          </span>
        </div>
      </div>
    );
  }

  // 1 pane: full size (no resize handles)
  if (paneCount === 1) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full p-1"
        style={{ backgroundColor: "var(--term-bg-deep)" }}
      >
        {renderPane(displaySlots[0], 0)}
      </div>
    );
  }

  // 2 panes: horizontal split (side by side)
  if (paneCount === 2) {
    return (
      <TwoPaneLayout
        containerRef={containerRef}
        displaySlots={displaySlots}
        getMinSizePercent={getMinSizePercent}
        handleLayoutChange={handleLayoutChange}
        renderPane={renderPane}
      />
    );
  }

  // 3 panes: 2+1 layout (two on top, one on bottom spanning full width)
  if (paneCount === 3) {
    return (
      <ThreePaneLayout
        containerRef={containerRef}
        displaySlots={displaySlots}
        getMinSizePercent={getMinSizePercent}
        handleLayoutChange={handleLayoutChange}
        renderPane={renderPane}
      />
    );
  }

  // 4 panes: 2x2 grid
  return (
    <FourPaneLayout
      containerRef={containerRef}
      displaySlots={displaySlots}
      getMinSizePercent={getMinSizePercent}
      handleLayoutChange={handleLayoutChange}
      renderPane={renderPane}
    />
  );
}
