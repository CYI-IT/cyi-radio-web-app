import React, { useRef, useState, useSyncExternalStore } from 'react'
import { XIcon } from '@phosphor-icons/react/X'

const subscribers = new Set()
const android = /Android/i.test(navigator.userAgent)
const standalone = window.matchMedia('(display-mode: standalone)').matches
let availability = { prompt: null, installed: standalone }

function updateAvailability(next) {
  availability = next
  for (const notify of subscribers) notify()
}

function subscribe(notify) {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

const getAvailability = () => availability

// Keep the single-use event available if Chrome fires it before React mounts.
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  updateAvailability({ prompt: event, installed: false })
})

function markInstalled() {
  updateAvailability({ prompt: null, installed: true })
}

window.addEventListener('appinstalled', markInstalled)

export function InstallApp({ online }) {
  const { prompt, installed } = useSyncExternalStore(subscribe, getAvailability)
  const [busy, setBusy] = useState(false)
  const dialog = useRef(null)
  const hasInstallApi = typeof navigator.install === 'function'
  const canInstall = hasInstallApi || Boolean(prompt)

  async function install() {
    if (busy) return
    const pendingPrompt = availability.prompt
    if (!hasInstallApi && !pendingPrompt) {
      dialog.current?.showModal()
      return
    }

    setBusy(true)
    updateAvailability({ ...availability, prompt: null })
    try {
      if (hasInstallApi) {
        await navigator.install()
        markInstalled()
      } else {
        await pendingPrompt.prompt()
        const { outcome } = await pendingPrompt.userChoice
        if (outcome === 'accepted') markInstalled()
      }
    } catch (error) {
      if (error.name !== 'AbortError') dialog.current?.showModal()
    } finally {
      setBusy(false)
    }
  }

  if (standalone || installed || !online) return null

  return (
    <>
      {canInstall || android || busy ? (
        <button className="button button-quiet hero-install" type="button" onClick={install} aria-disabled={busy}>
          {canInstall || busy ? 'Install app' : 'Installation help'}
        </button>
      ) : null}
      <dialog className="listener-dialog" ref={dialog} aria-labelledby="install-help-heading">
        <form className="dialog-close" method="dialog">
          <button type="submit" className="icon-button" aria-label="Close installation help">
            <XIcon size={20} aria-hidden="true" />
          </button>
        </form>
        <h2 id="install-help-heading">Install CYI Radio</h2>
        {android ? (
          <p>Open CYI Radio directly in a regular Chrome tab. Tap the page and keep it open for about 30 seconds. Then look for <strong>Install app</strong> here or check Chrome’s menu. If you’ve already installed CYI Radio, open it from your apps.</p>
        ) : (
          <p>Check your browser’s menu for its installation option.</p>
        )}
      </dialog>
    </>
  )
}
