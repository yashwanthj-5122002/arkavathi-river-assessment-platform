import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../lib/types'
import './secure-screen.css'

type ShieldReason =
  | 'window-blur'
  | 'tab-hidden'
  | 'page-hidden'
  | 'print'
  | 'capture-key'
  | null

type Props = {
  user: AuthUser
  children: ReactNode
}

const RESTORE_DELAY_MS = 700
const CAPTURE_HOLD_MS = 1600

function makeSessionCode(userId: number) {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(4)
      crypto.getRandomValues(bytes)

      const suffix = Array.from(bytes)
        .map(value => value.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()

      return `${userId}-${suffix}`
    }
  } catch {
    // fallback below
  }

  return `${userId}-${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`
}

function formatTime(value: Date) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
      timeZoneName: 'short',
    }).format(value)
  } catch {
    return value.toLocaleString()
  }
}

export function SecureScreenProvider({ user, children }: Props) {
  
  // LOCAL DEVELOPMENT SECURITY TOGGLE
  const protectionPausedRef = useRef(false)
const [shieldReason, setShieldReason] =
    useState<ShieldReason>(null)

  const [now, setNow] =
    useState(() => new Date())

  const restoreTimer =
    useRef<number | null>(null)

  const captureTimer =
    useRef<number | null>(null)

  const sessionCode =
    useMemo(() => makeSessionCode(user.id), [user.id])

  const protectedNow = shieldReason !== null

  const clearRestoreTimer = () => {
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current)
      restoreTimer.current = null
    }
  }

  const clearCaptureTimer = () => {
    if (captureTimer.current !== null) {
      window.clearTimeout(captureTimer.current)
      captureTimer.current = null
    }
  }

  const showPreemptiveShield = () => {
    
    if (protectionPausedRef.current) return
document.documentElement.classList.add(
      'ark-secure-preempt'
    )
  }

  const hidePreemptiveShield = () => {
    document.documentElement.classList.remove(
      'ark-secure-preempt'
    )
  }

  const protect = (
    reason: Exclude<ShieldReason, null>
  ) => {
    
    if (protectionPausedRef.current) return
clearRestoreTimer()

    // Imperative class is intentional:
    // it gets the privacy layer into the DOM immediately,
    // without waiting for React state rendering.
    showPreemptiveShield()

    setShieldReason(reason)
  }

  const restoreWhenSafe = () => {
    clearRestoreTimer()

    restoreTimer.current = window.setTimeout(() => {
      const visible =
        document.visibilityState === 'visible'

      const focused =
        typeof document.hasFocus === 'function'
          ? document.hasFocus()
          : true

      if (visible && focused) {
        setShieldReason(null)
        hidePreemptiveShield()
      }

      restoreTimer.current = null
    }, RESTORE_DELAY_MS)
  }

  const protectCaptureAttempt = () => {
    clearCaptureTimer()
    protect('capture-key')

    captureTimer.current = window.setTimeout(() => {
      restoreWhenSafe()
      captureTimer.current = null
    }, CAPTURE_HOLD_MS)
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        protect('tab-hidden')
      } else {
        restoreWhenSafe()
      }
    }

    const handleBlur = () => {
      protect('window-blur')
    }

    const handleFocus = () => {
      restoreWhenSafe()
    }

    const handlePageHide = () => {
      protect('page-hidden')
    }

    const handleBeforePrint = () => {
      protect('print')
    }

    const handleAfterPrint = () => {
      restoreWhenSafe()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      
      if (protectionPausedRef.current) return
const key = event.key.toLowerCase()

      const printScreen =
        event.key === 'PrintScreen'

      /*
       * On Windows, Snipping Tool may consume Win+Shift+S
       * before the final S key reaches the browser.
       *
       * Pre-empt on the Windows/Meta key itself so the
       * privacy shield gets the earliest possible chance
       * to paint before Windows freezes the desktop frame.
       */
      const windowsMetaLead =
        event.key === 'Meta' ||
        event.key === 'OS'

      if (windowsMetaLead) {
        protectCaptureAttempt()
        return
      }

      const ctrlPrint =
        event.ctrlKey &&
        key === 'p'

      const windowsSnip =
        event.metaKey &&
        event.shiftKey &&
        key === 's'

      const macCapture =
        event.metaKey &&
        event.shiftKey &&
        ['3', '4', '5'].includes(key)

      if (ctrlPrint) {
        event.preventDefault()
        protectCaptureAttempt()
        return
      }

      if (
        printScreen ||
        windowsSnip ||
        macCapture
      ) {
        protectCaptureAttempt()
      }
    }

    const handleContextMenu = (
      event: MouseEvent
    ) => {
      if (
        event.shiftKey ||
        event.ctrlKey
      ) {
        return
      }
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    )

    window.addEventListener(
      'blur',
      handleBlur
    )

    window.addEventListener(
      'focus',
      handleFocus
    )

    window.addEventListener(
      'pagehide',
      handlePageHide
    )

    window.addEventListener(
      'beforeprint',
      handleBeforePrint
    )

    window.addEventListener(
      'afterprint',
      handleAfterPrint
    )

    window.addEventListener(
      'keydown',
      handleKeyDown,
      true
    )

    window.addEventListener(
      'contextmenu',
      handleContextMenu
    )

    return () => {
      clearRestoreTimer()
      clearCaptureTimer()

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      )

      window.removeEventListener(
        'blur',
        handleBlur
      )

      window.removeEventListener(
        'focus',
        handleFocus
      )

      window.removeEventListener(
        'pagehide',
        handlePageHide
      )

      window.removeEventListener(
        'beforeprint',
        handleBeforePrint
      )

      window.removeEventListener(
        'afterprint',
        handleAfterPrint
      )

      window.removeEventListener(
        'keydown',
        handleKeyDown,
        true
      )

      window.removeEventListener(
        'contextmenu',
        handleContextMenu
      )
    }
  }, [])

  const timeLabel = formatTime(now)

  /*
   * ==========================================================
   * LOCAL DEVELOPMENT SECURITY TOGGLE
   *
   * Visible ONLY when:
   * - Vite development mode is active
   * - hostname is localhost or 127.0.0.1
   *
   * Production / Cloudflare builds do not expose this control.
   * ==========================================================
   */
  useEffect(() => {
    const isLocalDevelopment =
      import.meta.env.DEV &&
      (
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === 'localhost'
      )

    if (!isLocalDevelopment) {
      return
    }

    const button = document.createElement('button')

    button.type = 'button'
    button.className = 'ark-security-dev-toggle'

    const updateButton = () => {
      const paused = protectionPausedRef.current

      button.dataset.paused =
        paused ? 'true' : 'false'

      button.textContent =
        paused
          ? 'Resume screen protection'
          : 'Pause screen protection'

      button.setAttribute(
        'aria-pressed',
        paused ? 'true' : 'false'
      )

      button.title =
        paused
          ? 'Resume secure-screen protection'
          : 'Pause protection for local UI testing'
    }

    const handleToggle = () => {
      protectionPausedRef.current =
        !protectionPausedRef.current

      if (protectionPausedRef.current) {
        /*
         * PAUSE:
         * immediately reveal the page and cancel pending
         * secure-screen timers.
         */
        clearRestoreTimer()
        clearCaptureTimer()

        setShieldReason(null)

        document.documentElement.classList.remove(
          'ark-secure-preempt'
        )
      }

      updateButton()
    }

    updateButton()

    button.addEventListener(
      'click',
      handleToggle
    )

    document.body.appendChild(button)

    return () => {
      button.removeEventListener(
        'click',
        handleToggle
      )

      button.remove()

      protectionPausedRef.current = false
    }
  }, [])


return (
    <div
      className="ark-secure-root"
      data-protected={protectedNow ? 'true' : 'false'}
    >
      <div
        className="ark-secure-content"
        aria-hidden={protectedNow ? true : undefined}
      >
        {children}
      </div>


      <div
        className="ark-privacy-shield"
        aria-hidden={!protectedNow}
      >
        <div className="ark-privacy-shield-content">

          <div className="ark-privacy-label">
            CONFIDENTIAL
          </div>

          <h1>Screen Protected</h1>

          <p className="ark-privacy-project">
            Arkavathi River Intelligence Project
          </p>

          <div className="ark-privacy-rule" />

          <div className="ark-privacy-details">

            <div>
              <span>User</span>
              <strong>{user.display_name}</strong>
            </div>

            <div>
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>

            <div>
              <span>Organisation</span>
              <strong>
                {user.organization_name}
              </strong>
            </div>

            <div>
              <span>Session</span>
              <strong>{sessionCode}</strong>
            </div>

            <div>
              <span>Time</span>
              <strong>{timeLabel}</strong>
            </div>

          </div>

          <div className="ark-privacy-footer">
            Authorised project access only
          </div>

        </div>
      </div>
    </div>
  )
}
