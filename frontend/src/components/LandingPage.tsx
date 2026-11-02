import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { ArrowDown, ArrowUpRight, Pause, Play, ShieldCheck } from 'lucide-react'
import '../styles/landing-page.css'
import { ArkavathiStory } from './ArkavathiStory'

const DRONE_VIDEO = '/videos/Dashboard_Drone_Video.mp4'
const DRONE_POSTER = '/project/landing/arkavathi-drone-poster.jpg'

export function LandingPage({ onAccessPortal }: { onAccessPortal: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [motionPaused, setMotionPaused] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root || reducedMotion || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('ark-is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })
    root.setAttribute('data-reveal-ready', '')
    root.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element))
    return () => {
      observer.disconnect()
      root.removeAttribute('data-reveal-ready')
    }
  }, [reducedMotion])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (reducedMotion || motionPaused) {
      video.pause()
      if (reducedMotion) video.load()
      return
    }
    let visible = true
    let active = true
    const updatePlayback = () => {
      if (visible && !document.hidden) {
        void video.play().then(() => {
          if (!active || !visible || document.hidden) video.pause()
        }).catch(() => { /* The real-footage poster remains visible if autoplay is unavailable. */ })
      } else video.pause()
    }
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updatePlayback() }, { threshold: 0.1 })
      : null
    observer?.observe(video)
    document.addEventListener('visibilitychange', updatePlayback)
    updatePlayback()
    return () => {
      active = false
      observer?.disconnect()
      document.removeEventListener('visibilitychange', updatePlayback)
      video.pause()
    }
  }, [reducedMotion, motionPaused])

  function explore(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id)
    if (!section) return
    event.preventDefault()
    section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
    section.focus({ preventScroll: true })
  }

  function toggleMotion() {
    if (videoPlaying) setMotionPaused(true)
    else {
      setMotionPaused(false)
      void videoRef.current?.play().catch(() => { /* Keep the poster when playback is unavailable. */ })
    }
  }

  return <div ref={rootRef} className="ark-landing" data-motion-paused={motionPaused || reducedMotion ? 'true' : 'false'}>
    <a className="ark-skip" href="#ark-river" onClick={event => explore(event, 'ark-river')}>Skip to the river story</a>

    <header className="ark-header">

      <a
        className="ark-brand ark-institution-brand"
        href="#ark-home"
        onClick={event => explore(event, 'ark-home')}
        aria-label="Cauvery Neeravari Nigama Limited - Arkavathi River Intelligence home"
      >
        <img
          className="ark-brand-cnnl-logo"
          src="/branding/cnnl-logo.png"
          alt="Cauvery Neeravari Nigama Limited logo"
          width="52"
          height="52"
        />

        <span className="ark-brand-copy">
          <strong>Cauvery Neeravari Nigama Limited</strong>
          <small>Government of Karnataka</small>
        </span>

        <span className="ark-brand-divider" aria-hidden="true" />

        <img
          className="ark-brand-karnataka-logo"
          src="/branding/karnataka-emblem-transparent.png"
          alt="Government of Karnataka emblem"
          width="42"
          height="52"
        />

        <span
          className="ark-brand-divider ark-brand-partner-divider"
          aria-hidden="true"
        />

        <span
          className="ark-header-naksha"
          aria-label="NakshaTech, Geospatial Technology and Survey Partner"
        >
          <img
            className="ark-header-naksha-mark"
            src="/branding/nakshatech-mark.png"
            alt=""
            width="32"
            height="32"
          />

          <span className="ark-header-naksha-copy">
            <strong>NAKSHATECH</strong>
            <small>GEOSPATIAL TECHNOLOGY PARTNER</small>
          </span>
        </span>
      </a>

      <nav aria-label="Public website navigation" className="ark-nav">
        <a href="#ark-river" onClick={event => explore(event, 'ark-river')}>The river</a>
        <a href="#ark-chapter-7" onClick={event => explore(event, 'ark-chapter-7')}>Intelligence</a>
        <a href="#ark-chapter-1" onClick={event => explore(event, 'ark-chapter-1')}>Study area</a>
      </nav>

      <button
        type="button"
        className="ark-header-access"
        onClick={onAccessPortal}
      >
        Access portal
        <ArrowUpRight size={16} aria-hidden="true" />
      </button>

    </header>

    <main>
      <section id="ark-home" tabIndex={-1} className="ark-hero" aria-labelledby="ark-hero-title">
        <div className="ark-hero-media" style={{ backgroundImage: `url(${DRONE_POSTER})` }}>
          <video ref={videoRef} src={reducedMotion ? undefined : DRONE_VIDEO} poster={DRONE_POSTER} muted playsInline loop preload="none" aria-hidden="true" onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} />
        </div>
        <div className="ark-hero-shade" aria-hidden="true" />
        <div className="ark-hero-content ark-container">
          <p className="ark-eyebrow"><span className="ark-status-dot" /> A landscape. A living system. A shared future.</p>
          <h1 id="ark-hero-title">Understanding the river.<br /><em>Protecting its future.</em></h1>
          <p className="ark-hero-description">Integrated survey. Pollution intelligence.<br />Environmental decision support for the Arkavathi.</p>
          <div className="ark-actions">
            <a className="ark-button ark-button-light" href="#ark-river" onClick={event => explore(event, 'ark-river')}>Explore the river <ArrowDown size={17} aria-hidden="true" /></a>
            <button type="button" className="ark-button ark-button-outline" onClick={onAccessPortal}>Access Project Portal <ArrowUpRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="ark-hero-foot ark-container">
          <div className="ark-hero-wordmark" aria-hidden="true">ARKAVATHI</div>
          <div className="ark-hero-caption">
            <span>KARNATAKA, INDIA <span aria-hidden="true"> / </span> A RIVER IN FOCUS</span>
            <span className="ark-footage-label">REAL PROJECT FOOTAGE · DRONE SURVEY</span>
            {reducedMotion ? <span className="ark-motion-note">Reduced motion enabled</span> : <button type="button" className="ark-motion-control" aria-label={videoPlaying ? 'Pause background motion' : 'Play background motion'} onClick={toggleMotion}>{videoPlaying ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />} {videoPlaying ? 'Pause motion' : 'Play motion'}</button>}
          </div>
        </div>
      </section>

      <ArkavathiStory />

      <section id="ark-closing" tabIndex={-1} className="ark-portal" aria-labelledby="ark-portal-title">
        <img className="ark-portal-image" src={DRONE_POSTER} alt="" loading="lazy" decoding="async" width="1600" height="900" />
        <div className="ark-portal-shade" aria-hidden="true" />
        <div className="ark-portal-content ark-container" data-reveal>
          <p className="ark-eyebrow">THE STORY CONTINUES</p>
          <h2 id="ark-portal-title" className="ark-closing-title">The Story of Arkavathi<br /><em>Is Not Over.</em></h2>
          <div className="ark-closing-subheads">
            <h3>She Was Here Before Us.</h3>
            <h3><em>Let Her Flow Long After Us.</em></h3>
          </div>
          <div className="ark-closing-copy">
            <p>Long before our cities grew and our roads crossed the land, Arkavathi was flowing through these landscapes, giving water to fields, homes and generations of life.</p>
            <p>Today, her waters carry the marks of a changing world. Yet her story is not over. Every effort to understand her, every step to reduce pollution, and every action to protect her brings hope for a healthier tomorrow.</p>
          </div>
          <blockquote className="ark-closing-quote">“For generations, she gave us water. The least we can give her is a future.”</blockquote>
          <button type="button" className="ark-button ark-button-light" onClick={onAccessPortal}>Access Project Portal <ArrowUpRight size={18} aria-hidden="true" /></button>
          <span className="ark-secure-note"><ShieldCheck size={14} aria-hidden="true" /> Authorised project access</span>
        </div>
      </section>
    </main>

    <footer className="ark-footer ark-footer-expanded">

      <div className="ark-container">

        <div className="ark-footer-grid">

          <section
            className="ark-footer-authority"
            aria-label="Arkavathi project authority"
          >

            <div className="ark-footer-authority-row">

              <img
                className="ark-footer-cnnl-logo"
                src="/branding/cnnl-logo.png"
                alt="Cauvery Neeravari Nigama Limited logo"
                width="72"
                height="72"
                loading="lazy"
              />

              <div className="ark-footer-authority-copy">
                <span className="ark-footer-label">Project Authority</span>

                <h3>Cauvery Neeravari Nigama Limited</h3>

                <p>Government of Karnataka</p>
              </div>

              <img
                className="ark-footer-state-logo"
                src="/branding/karnataka-emblem-transparent.png"
                alt="Government of Karnataka emblem"
                width="58"
                height="70"
                loading="lazy"
              />

            </div>

            <div className="ark-footer-project-identity">
              <span className="ark-footer-name">ARKAVATHI</span>
              <strong>River Intelligence Project</strong>
              <p>Understanding the river. Protecting its future.</p>
            </div>

          </section>


          <nav
            className="ark-footer-links"
            aria-label="Arkavathi project footer navigation"
          >

            <span className="ark-footer-label">Explore</span>

            <a
              href="#ark-river"
              onClick={event => explore(event, 'ark-river')}
            >
              The river
            </a>

            <a
              href="#ark-chapter-7"
              onClick={event => explore(event, 'ark-chapter-7')}
            >
              Intelligence
            </a>

            <a
              href="#ark-chapter-1"
              onClick={event => explore(event, 'ark-chapter-1')}
            >
              Study area
            </a>

            <button
              type="button"
              className="ark-footer-portal-link"
              onClick={onAccessPortal}
            >
              Access Project Portal
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>

          </nav>


          <section
            className="ark-footer-partner"
            aria-label="Project geospatial technology and survey partner"
          >

            <span className="ark-footer-label">
              Geospatial Technology &amp; Survey Partner
            </span>

            <a
              className="ark-footer-naksha-brand"
              href="https://nakshatech.com/"
              target="_blank"
              rel="noreferrer"
              aria-label="Visit NakshaTech website"
            >
              <img
                className="ark-footer-naksha-mark"
                src="/branding/nakshatech-mark.png"
                alt=""
                width="58"
                height="58"
                loading="lazy"
              />

              <span className="ark-footer-naksha-copy">
                <strong>NAKSHATECH</strong>
                <small>INSPIRING GEOSPATIAL STANDARDS</small>
              </span>
            </a>

            <div className="ark-footer-contact">

              <a href="mailto:info@nakshatech.com">
                info@nakshatech.com
              </a>

              <a href="tel:+919972031704">
                +91 9972031704
              </a>

              <a
                href="https://nakshatech.com/"
                target="_blank"
                rel="noreferrer"
              >
                nakshatech.com
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>

            </div>

            <address className="ark-footer-address">
              R.K Chambers, 4th Floor, 5th Main,<br />
              Chamarajpet, Bengaluru, Karnataka,<br />
              India - 560018
            </address>

          </section>

        </div>


        <div className="ark-footer-bottom">

          <span>
            ? {new Date().getFullYear()} Cauvery Neeravari Nigama Limited
            <span aria-hidden="true"> ? </span>
            Arkavathi River Intelligence Project
          </span>

          <a
            href="#ark-home"
            onClick={event => explore(event, 'ark-home')}
          >
            Back to the beginning
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>

          <span>KARNATAKA, INDIA</span>

        </div>

      </div>

    </footer>
  </div>
}
