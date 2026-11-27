import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarBlankIcon } from "@phosphor-icons/react/CalendarBlank";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import { HeadphonesIcon } from "@phosphor-icons/react/Headphones";
import { LinkSimpleIcon } from "@phosphor-icons/react/LinkSimple";
import { ShareNetworkIcon } from "@phosphor-icons/react/ShareNetwork";
import { XIcon } from "@phosphor-icons/react/X";
import { InstallApp } from "./install-app.jsx";
import { ListenerSchedule } from "./listener-schedule.jsx";
import { ListenerChat } from "./listener-chat.jsx";
import { SchedulePage } from "./schedule-page.jsx";
import { programmesOnDate, stationTimezone, useStationToday } from "./schedule-dates.js";
import {
  LiveStatus,
  PlayButton,
  PlayerDock,
  useRadioPlayer,
} from "./radio-player.jsx";
import { useOnlineStatus, usePublicFeed } from "./public-feed.js";
import broadcastPattern from "./broadcast-pattern.webp";
import "./styles.css";

const stationLogo = "/assets/CYI-radio-original-2.png";
const offlineShell = document.documentElement.hasAttribute("data-offline-shell");
const schedulePath = "/schedule";

const sections = [
  { id: "listen", label: "Listen", Icon: HeadphonesIcon },
  { id: "chat", label: "Chat", Icon: ChatCircleDotsIcon },
  { id: "schedule", label: "Schedule", Icon: CalendarBlankIcon },
];

function currentSection() {
  if ([schedulePath, `${schedulePath}/`].includes(window.location.pathname)) return "schedule";
  return window.location.hash === "#chat" ? "chat" : "listen";
}

function StationBrand({ href, onNavigate }) {
  return (
    <a className="station-brand" href={href} onClick={onNavigate}>
      <img src={stationLogo} alt="CYI Radio" width="710" height="327" />
    </a>
  );
}

function ShareStation() {
  const dialog = useRef(null);
  const link = useRef(null);
  const [feedback, setFeedback] = useState("");
  const url = new URL("/#listen", window.location.origin).href;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Link copied.");
    } catch {
      link.current.focus();
      link.current.select();
      setFeedback("Select and copy the station link.");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "CYI Radio",
        text: "Listen live to CYI Radio",
        url,
      });
      dialog.current.close();
    } catch (error) {
      if (error.name !== "AbortError")
        setFeedback("You can copy the station link to share it.");
    }
  }

  return (
    <>
      <button
        className="button button-quiet share-button"
        type="button"
        onClick={() => {
          setFeedback("");
          dialog.current.showModal();
        }}
      >
        <ShareNetworkIcon size={18} aria-hidden="true" /> Share station
      </button>
      <dialog
        className="listener-dialog"
        ref={dialog}
        aria-labelledby="share-heading"
      >
        <form className="dialog-close" method="dialog">
          <button
            type="submit"
            className="icon-button"
            aria-label="Close sharing"
          >
            <XIcon size={20} aria-hidden="true" />
          </button>
        </form>
        <h2 id="share-heading">Share CYI Radio</h2>
        <label className="visually-hidden" htmlFor="station-link">
          Station link
        </label>
        <input id="station-link" ref={link} value={url} readOnly />
        <div className="dialog-actions">
          <button
            className="button button-accent"
            type="button"
            onClick={copyLink}
          >
            <LinkSimpleIcon size={18} aria-hidden="true" /> Copy link
          </button>
          {typeof navigator.share === "function" ? (
            <button
              className="button button-quiet"
              type="button"
              onClick={share}
            >
              Share via…
            </button>
          ) : null}
        </div>
        <p className="share-feedback" role="status">
          {feedback}
        </p>
      </dialog>
    </>
  );
}

function App() {
  const [activeSection, setActiveSection] = useState(currentSection);
  const [chatOpen, setChatOpen] = useState(() => currentSection() === "chat");
  const deviceOnline = useOnlineStatus();
  const radio = useRadioPlayer();
  const schedule = usePublicFeed("/api/v1/schedule?day=today");
  const schedulePage = activeSection === "schedule";
  const timezone = schedule.data?.timezone ?? stationTimezone;
  const today = useStationToday(timezone);
  const online = deviceOnline && (!offlineShell || radio.reachable || schedule.state === "ready");
  const player = online ? radio : { ...radio, disconnected: true, status: "disconnected" };
  const scheduledNow = online && schedule.state === "ready" ? schedule.data?.current : null;
  const current = scheduledNow ? programmesOnDate([scheduledNow], today)[0] ?? null : null;
  const [description, setDescription] = useState("Music, shows and conversations on CYI Radio.");
  const focusOnNavigation = useRef(false);

  useEffect(() => {
    if (!online || schedulePage) return;
    const controller = new AbortController();
    fetch("/api/v1/station", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((station) => {
        if (typeof station?.description === "string") setDescription(station.description);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [online, schedulePage]);

  useEffect(() => {
    function syncNavigation() {
      const section = currentSection();
      setActiveSection(section);
      if (section === "chat") setChatOpen(true);
    }
    window.addEventListener("hashchange", syncNavigation);
    window.addEventListener("popstate", syncNavigation);
    return () => {
      window.removeEventListener("hashchange", syncNavigation);
      window.removeEventListener("popstate", syncNavigation);
    };
  }, []);

  useEffect(() => {
    document.title = schedulePage ? "Programme schedule | CYI Radio" : "CYI Radio";
    const anchor = window.location.hash.slice(1);
    if (!schedulePage && sections.some((section) => section.id === anchor)) {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "instant" });
    } else if (focusOnNavigation.current) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    if (focusOnNavigation.current) {
      document.getElementById("main").focus({ preventScroll: true });
      focusOnNavigation.current = false;
    }
  }, [schedulePage]);

  function hrefFor(section) {
    if (section === "schedule") return schedulePath;
    return `${schedulePage ? "/" : ""}#${section}`;
  }

  function navigate(event, section) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((section === "schedule") !== schedulePage) {
      event.preventDefault();
      window.history.pushState(null, "", event.currentTarget.href);
      focusOnNavigation.current = true;
    } else if (section === "schedule") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    setActiveSection(section);
    if (section === "chat") setChatOpen(true);
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <header className="station-header">
          <StationBrand href={hrefFor("listen")} onNavigate={(event) => navigate(event, "listen")} />
          <nav className="station-nav" aria-label="Listener navigation">
            {sections.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={hrefFor(id)}
                aria-current={activeSection === id ? (schedulePage ? "page" : "location") : undefined}
                onClick={(event) => navigate(event, id)}
              >
                <Icon
                  size={21}
                  weight={activeSection === id ? "fill" : "regular"}
                  aria-hidden="true"
                />
                {label}
              </a>
            ))}
          </nav>
        </header>
        <main className="site-frame" id="main" tabIndex={-1}>
          {online ? null : <p className="offline-notice" role="status">You’re offline. Reconnect to listen live, check the schedule, or chat.</p>}
          <div className="topbar">
            <ShareStation />
          </div>
          {schedulePage ? <SchedulePage today={today} timezone={timezone} offline={!online} /> : (
            <>
              <section id="listen" className="listen-hero" aria-labelledby="listen-heading">
                <img className="hero-pattern" src={broadcastPattern} alt="" fetchPriority="high" />
                <div className="listen-content">
                  <LiveStatus status={player.status} />
                  <h1 id="listen-heading">
                    Reach Up, Reach Out
                    <br /> <span>Reach In</span>
                  </h1>
                  <p className="hero-description">{description}</p>
                  <div className="hero-actions">
                    <PlayButton radio={player} />
                    <InstallApp online={online} />
                  </div>
                </div>
              </section>
              <div className="listener-grid">
                <ListenerChat open={chatOpen} online={online} onToggle={() => setChatOpen((previous) => !previous)} />
                <ListenerSchedule feed={schedule} current={current} today={today} offline={!online}
                  onNavigate={(event) => navigate(event, "schedule")} />
              </div>
            </>
          )}
        </main>
      </div>
      <PlayerDock radio={player} current={current} logoUrl={stationLogo} />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // The public listener page remains usable if the browser cannot install the worker.
  });
}
