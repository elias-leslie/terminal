'use client'

import { clsx } from 'clsx'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import '@xterm/xterm/css/xterm.css'
import {
  PHOSPHOR_THEME,
  RESIZE_DEBOUNCE_MS,
  SCROLLBACK,
} from '../lib/constants/terminal'
import { setupTerminalMouseHandling } from '../lib/hooks/use-terminal-mouse-handling'
import { useTerminalScrolling } from '../lib/hooks/use-terminal-scrolling'
import { useTerminalWebSocket } from '../lib/hooks/use-terminal-websocket'
import { isMobileDevice } from '../lib/utils/device'
import type { TerminalHandle, TerminalProps } from './terminal.types'

export type {
  ConnectionStatus,
  TerminalHandle,
  TerminalProps,
} from './terminal.types'

// Dynamic imports for xterm (client-side only)
let Terminal: typeof import('@xterm/xterm').Terminal
let FitAddon: typeof import('@xterm/addon-fit').FitAddon
let WebLinksAddon: typeof import('@xterm/addon-web-links').WebLinksAddon
let ClipboardAddon: typeof import('@xterm/addon-clipboard').ClipboardAddon

export const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  function TerminalComponent(
    {
      sessionId,
      workingDir,
      className,
      onDisconnect,
      onStatusChange,
      fontFamily = "'JetBrains Mono', monospace",
      fontSize = 14,
      scrollback = SCROLLBACK,
      cursorStyle = 'block',
      cursorBlink = true,
      theme = PHOSPHOR_THEME,
      isVisible = true,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<InstanceType<typeof Terminal> | null>(null)
    const fitAddonRef = useRef<InstanceType<typeof FitAddon> | null>(null)
    const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null)
    const mouseCleanupRef = useRef<(() => void) | null>(null)
    const scrollCleanupRef = useRef<{
      wheelCleanup: () => void
      touchCleanup: () => void
    } | null>(null)
    const isFocusedRef = useRef(false)
    const focusCleanupRef = useRef<(() => void) | null>(null)
    const isVisibleRef = useRef(isVisible)

    // Keep isVisibleRef in sync with prop
    useEffect(() => {
      isVisibleRef.current = isVisible
    }, [isVisible])

    // WebSocket connection management via hook
    const { status, wsRef, reconnect, sendInput, connect, disconnect } =
      useTerminalWebSocket({
        sessionId,
        workingDir,
        onStatusChange,
        onDisconnect,
        onMessage: (data) => {
          if (!terminalRef.current) return
          // Skip write if terminal is not visible (prevents corruption in multi-pane)
          if (!isVisibleRef.current) return
          // Preserve scroll position if user is viewing history
          const buffer = terminalRef.current.buffer.active
          const distanceFromBottom = buffer.baseY - buffer.viewportY
          terminalRef.current.write(data)
          // Restore scroll position if user wasn't at bottom
          if (distanceFromBottom > 0) {
            terminalRef.current.scrollLines(-distanceFromBottom)
          }
        },
        onTerminalMessage: (message) => {
          terminalRef.current?.writeln(message)
        },
        getDimensions: () => fitAddonRef.current?.proposeDimensions() ?? null,
      })

    // Memoize mobile detection to prevent unnecessary re-renders
    // Only computed once on mount - window resize doesn't change device type
    const isMobile = useMemo(() => isMobileDevice(), [])

    // Scrolling management via hook (native xterm.js + alternate screen detection)
    const { setupScrolling } = useTerminalScrolling({
      wsRef,
      terminalRef,
      isMobile,
    })

    // Store scroll functions in refs to avoid re-init on scroll handler changes
    const setupScrollingRef = useRef(setupScrolling)
    useEffect(() => {
      setupScrollingRef.current = setupScrolling
    }, [setupScrolling])

    // Expose functions to parent
    useImperativeHandle(
      ref,
      () => ({
        reconnect,
        getContent: () => {
          if (!terminalRef.current) return ''
          // Select all text and get the selection
          terminalRef.current.selectAll()
          const content = terminalRef.current.getSelection()
          terminalRef.current.clearSelection()
          return content
        },
        getLastLine: () => {
          if (!terminalRef.current) return ''
          const term = terminalRef.current
          const buffer = term.buffer.active
          // Get the line at the cursor position
          const cursorY = buffer.cursorY + buffer.viewportY
          const line = buffer.getLine(cursorY)
          if (!line) return ''
          // Get text from the line, trimmed
          let text = line.translateToString(true)
          // Remove common prompt patterns (e.g., "user@host:~$ ")
          text = text.replace(/^.*?[#$%>]\s*/, '')
          return text.trim()
        },
        sendInput,
        status,
      }),
      [status, reconnect, sendInput],
    )

    // Handle resize - always fit the terminal, send dims only if WS connected
    const handleResize = useCallback(() => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()

        // Only send resize to backend if WS is connected
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            wsRef.current.send(
              JSON.stringify({
                resize: { cols: dims.cols, rows: dims.rows },
              }),
            )
          }
        }
      }
    }, [wsRef])

    // Initialize terminal
    useEffect(() => {
      let mounted = true

      async function initTerminal() {
        if (!containerRef.current) return

        // Dynamic import xterm modules
        const xtermModule = await import('@xterm/xterm')
        const fitModule = await import('@xterm/addon-fit')
        const webLinksModule = await import('@xterm/addon-web-links')
        const clipboardModule = await import('@xterm/addon-clipboard')

        if (!mounted) return

        Terminal = xtermModule.Terminal
        FitAddon = fitModule.FitAddon
        WebLinksAddon = webLinksModule.WebLinksAddon
        ClipboardAddon = clipboardModule.ClipboardAddon

        // Create terminal with configured theme and settings
        const term = new Terminal({
          cursorBlink: cursorBlink,
          cursorStyle: cursorStyle,
          fontSize: fontSize,
          fontFamily: fontFamily,
          scrollback: scrollback,
          allowProposedApi: true,
          rightClickSelectsWord: true,
          macOptionClickForcesSelection: true,
          altClickMovesCursor: false,
          theme: theme,
        })

        // Create and load addons
        const fitAddon = new FitAddon()
        const webLinksAddon = new WebLinksAddon()
        const clipboardAddon = new ClipboardAddon()

        term.loadAddon(fitAddon)
        term.loadAddon(webLinksAddon)
        term.loadAddon(clipboardAddon)

        // Open terminal in container
        term.open(containerRef.current)

        // Set up mouse handling to enable local selection when mouse reporting is active
        mouseCleanupRef.current = setupTerminalMouseHandling(
          term,
          containerRef.current,
        )

        terminalRef.current = term
        fitAddonRef.current = fitAddon

        // Set up scrolling via hook (handles wheel and touch events for tmux copy-mode)
        scrollCleanupRef.current = setupScrollingRef.current(
          containerRef.current,
        )

        // Mobile-specific setup: suppress native keyboard (we use custom keyboard)
        if (isMobileDevice()) {
          const textarea =
            containerRef.current.querySelector<HTMLTextAreaElement>(
              '.xterm-helper-textarea',
            )
          if (textarea) {
            textarea.inputMode = 'none'
            textarea.readOnly = true
          }

          // Prevent pull-to-refresh via CSS
          containerRef.current.style.overscrollBehavior = 'none'
          containerRef.current.style.touchAction = 'none'
        }

        // Initial fit (ResizeObserver handles subsequent resizes)
        fitAddon.fit()

        // Track focus state to prevent input duplication across multiple terminals
        const textarea = term.textarea
        if (textarea) {
          const handleFocus = () => {
            isFocusedRef.current = true
          }
          const handleBlur = () => {
            isFocusedRef.current = false
          }
          textarea.addEventListener('focus', handleFocus)
          textarea.addEventListener('blur', handleBlur)
          focusCleanupRef.current = () => {
            textarea.removeEventListener('focus', handleFocus)
            textarea.removeEventListener('blur', handleBlur)
          }
        }

        // Set up terminal input handler - forward to WebSocket
        onDataDisposableRef.current = term.onData((data) => {
          // Only send input if this terminal has focus (prevents grid duplication)
          if (!isFocusedRef.current) return
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(data)
          }
        })

        // Connect to WebSocket via hook
        connect()
      }

      initTerminal()

      return () => {
        mounted = false
        // Disconnect WebSocket first to prevent duplicate connections on re-init
        disconnect()
        // Dispose onData listener before terminal
        if (onDataDisposableRef.current) {
          onDataDisposableRef.current.dispose()
          onDataDisposableRef.current = null
        }
        // Clean up focus listeners
        if (focusCleanupRef.current) {
          focusCleanupRef.current()
          focusCleanupRef.current = null
        }
        // Clean up mouse listeners
        if (mouseCleanupRef.current) {
          mouseCleanupRef.current()
          mouseCleanupRef.current = null
        }
        // Clean up scroll listeners
        if (scrollCleanupRef.current) {
          scrollCleanupRef.current.wheelCleanup()
          scrollCleanupRef.current.touchCleanup()
          scrollCleanupRef.current = null
        }
        if (terminalRef.current) {
          terminalRef.current.dispose()
          terminalRef.current = null
        }
      }
      // Dependencies: only session/connection related - scroll refs update independently
      // Note: wsRef is a stable ref, don't include wsRef.current values (causes reconnect loops)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      connect,
      disconnect,
      cursorBlink,
      cursorStyle,
      fontFamily,
      fontSize,
      scrollback,
      theme,
    ])

    // Handle container resize with debounce
    useEffect(() => {
      if (!containerRef.current) return
      let resizeTimeout: ReturnType<typeof setTimeout> | null = null
      let lastWidth = 0
      let lastHeight = 0

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        if (width === lastWidth && height === lastHeight) return
        lastWidth = width
        lastHeight = height
        if (resizeTimeout) clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(() => handleResize(), RESIZE_DEBOUNCE_MS)
      })

      resizeObserver.observe(containerRef.current)
      return () => {
        if (resizeTimeout) clearTimeout(resizeTimeout)
        resizeObserver.disconnect()
      }
    }, [handleResize])

    // Update terminal settings when they change
    useEffect(() => {
      if (terminalRef.current) {
        terminalRef.current.options.fontFamily = fontFamily
        terminalRef.current.options.fontSize = fontSize
        terminalRef.current.options.scrollback = scrollback
        terminalRef.current.options.cursorStyle = cursorStyle
        terminalRef.current.options.cursorBlink = cursorBlink
        terminalRef.current.options.theme = theme
        if (fitAddonRef.current) {
          fitAddonRef.current.fit()
        }
      }
    }, [fontFamily, fontSize, scrollback, cursorStyle, cursorBlink, theme])

    return (
      <div className={clsx('relative overflow-hidden', className)}>
        {/* Terminal container */}
        <div
          ref={containerRef}
          className="w-full h-full overflow-hidden"
          style={{ backgroundColor: theme.background }}
        />
      </div>
    )
  },
)
