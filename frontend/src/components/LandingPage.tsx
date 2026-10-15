import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { ArrowDown, ArrowUpRight, Check, Compass, Droplets, Layers3, MapPinned, Pause, Play, ScanLine, ShieldCheck, Sprout } from 'lucide-react'
import '../styles/landing-page.css'

const DRONE_VIDEO = '/videos/Dashboard_Drone_Video.mp4'
const DRONE_POSTER = '/project/landing/arkavathi-drone-poster.jpg'

const signals = [
  { icon: ScanLine, title: 'Integrated survey', text: 'Field observations, drone footage and survey records bring the river corridor into view.', tag: '01 / FIELD EVIDENCE' },
  { icon: MapPinned, title: 'Spatial intelligence', text: 'River networks, catchments and mapped locations connect each observation to its landscape.', tag: '02 / GEOGRAPHY' },
  { icon: Droplets, title: 'Pollution assessment', text: 'Outfall surveys, sampling and laboratory evidence help examine environmental pressures.', tag: '03 / WATER QUALITY' },
  { icon: Sprout, title: 'Environmental context', text: 'Hydrology, drainage and the surrounding landscape give individual findings a wider context.', tag: '04 / RIVER SYSTEMS' },
  { icon: Layers3, title: 'Industry context', text: 'River-corridor observations and industry records support a more informed assessment.', tag: '05 / LAND USE' },
  { icon: Compass, title: 'Decision support', text: 'Reviewed project evidence supports planning, prioritisation and river revitalisation.', tag: '06 / PURPOSE' },
]

const stages = [
  { title: 'Observe', text: 'Begin with the landscape. Capture what is happening along the river, on the ground and from above.' },
  { title: 'Verify', text: 'Check the source. Review observations, location references and supporting project evidence.' },
  { title: 'Interpret', text: 'Connect the signals. Read water, land use and environmental pressures together.' },
  { title: 'Act', text: 'Inform the next step. Bring reviewed findings into planning and environmental decisions.' },
]

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
        <a href="#ark-intelligence" onClick={event => explore(event, 'ark-intelligence')}>Intelligence</a>
        <a href="#ark-study" onClick={event => explore(event, 'ark-study')}>Study area</a>
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

      <section id="ark-river" tabIndex={-1} className="ark-story ark-section" aria-labelledby="ark-story-title">
        <div className="ark-container">
          <div className="ark-section-marker" data-reveal><span>01</span><p className="ark-eyebrow">THE RIVER, IN CONTEXT</p><span className="ark-marker-line" /></div>
          <div className="ark-story-layout">
            <div data-reveal>
              <h2 id="ark-story-title">A river is more<br />than a line<br /><em>on a map.</em></h2>
              <p className="ark-story-intro">It is the land it passes through.<br />The lives it touches.<br />The pressures it carries.</p>
            </div>
            <div className="ark-story-right" data-reveal>
              <div className="ark-river-diagram" aria-hidden="true">
                <svg viewBox="0 0 440 330" fill="none">
                  <path className="ark-river-bank" d="M208 -20C84 54 323 77 231 145S106 211 189 257S338 296 252 356" />
                  <path className="ark-river-thread" d="M208 -20C84 54 323 77 231 145S106 211 189 257S338 296 252 356" />
                  <path className="ark-river-tributary" d="M25 60C100 58 119 117 233 127M417 190C334 169 292 196 159 205M35 292C115 264 134 273 197 262" />
                  <circle cx="233" cy="127" r="5" /><circle cx="159" cy="205" r="5" /><circle cx="197" cy="262" r="5" />
                </svg>
                <span className="ark-diagram-label ark-label-land">LAND & SETTLEMENTS</span>
                <span className="ark-diagram-label ark-label-water">WATER & ECOLOGY</span>
                <span className="ark-diagram-label ark-label-pressure">INFRASTRUCTURE & INDUSTRY</span>
                <span className="ark-diagram-caption">CONNECTED BY THE CURRENT</span>
              </div>
              <p>Understanding the Arkavathi means reading a connected landscape: water and ecology, settlements and infrastructure, industries and environmental pressures.</p>
              <p>This project brings those perspectives together, building a clearer picture of the river through field evidence, spatial analysis and reviewed information.</p>
            </div>
          </div>
          <div className="ark-landscape-words" data-reveal aria-label="Connected landscape themes"><span>Water</span><span>Land</span><span>People</span><span>Ecology</span><span>Industry</span></div>
        </div>
      </section>

      <section className="ark-process ark-section" aria-labelledby="ark-process-title">
        <div className="ark-container">
          <div className="ark-section-marker" data-reveal><span>02</span><p className="ark-eyebrow">FROM LANDSCAPE TO INTELLIGENCE</p><span className="ark-marker-line" /></div>
          <div className="ark-section-heading" data-reveal><h2 id="ark-process-title">Look closer.<br /><em>See the connections.</em></h2><p>Every useful decision begins with an observation. A careful process turns that observation into evidence people can work with.</p></div>
          <ol className="ark-stages">
            {stages.map((stage, index) => <li key={stage.title} data-reveal>
              <div className="ark-stage-track"><span className="ark-stage-number">0{index + 1}</span>{index < stages.length - 1 && <ArrowUpRight size={20} aria-hidden="true" />}</div>
              <h3>{stage.title}</h3><p>{stage.text}</p>
            </li>)}
          </ol>
          <p className="ark-process-note" data-reveal><Check size={16} aria-hidden="true" /> A continuous thread from field observation to informed action.</p>
        </div>
      </section>

      <section id="ark-intelligence" tabIndex={-1} className="ark-intelligence ark-section" aria-labelledby="ark-signals-title">
        <div className="ark-container">
          <div className="ark-section-marker" data-reveal><span>03</span><p className="ark-eyebrow">ONE BASIN. MANY SIGNALS.</p><span className="ark-marker-line" /></div>
          <div className="ark-section-heading" data-reveal><h2 id="ark-signals-title">Different perspectives.<br /><em>A shared understanding.</em></h2><p>No single dataset tells the whole river story. The project connects complementary fields of evidence.</p></div>
          <div className="ark-signals">
            {signals.map(({ icon: Icon, title, text, tag }) => <article className="ark-signal" key={title} data-reveal>
              <div className="ark-signal-top"><Icon size={26} strokeWidth={1.3} aria-hidden="true" /><span>{tag}</span></div>
              <h3>{title}</h3><p>{text}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section id="ark-study" tabIndex={-1} className="ark-study ark-section" aria-labelledby="ark-study-title">
        <div className="ark-container">
          <div className="ark-section-marker" data-reveal><span>04</span><p className="ark-eyebrow">THE STUDY AREA</p><span className="ark-marker-line" /></div>
          <div className="ark-study-layout">
            <div className="ark-study-copy" data-reveal>
              <h2 id="ark-study-title">One river.<br />An entire<br /><em>living landscape.</em></h2>
              <p>The study-area map places the Arkavathi river system within its catchment, showing the connected geography that gives project observations their context.</p>
              <dl className="ark-map-facts"><div><dt>Perspective</dt><dd>River system & catchment</dd></div><div><dt>Location</dt><dd>Karnataka, India</dd></div><div><dt>Source</dt><dd>Project study-area map</dd></div></dl>
              <a className="ark-text-link" href="/project/arkavathi-study-area-map.png" target="_blank" rel="noreferrer">View the full map <ArrowUpRight size={17} aria-hidden="true" /><span className="ark-sr-only"> (opens in a new tab)</span></a>
            </div>
            <figure className="ark-map-frame" data-reveal>
              <div className="ark-map-top"><span><span className="ark-status-dot" /> SPATIAL CONTEXT</span><span>ARKAVATHI / KA</span></div>
              <div className="ark-map-image"><img src="/project/arkavathi-study-area-map.png" alt="Arkavathi river system study-area map showing the catchment, drainage network and tributary areas within Karnataka" width="698" height="491" loading="lazy" decoding="async" /><span className="ark-map-scan" aria-hidden="true" /></div>
              <figcaption><span>THE BASIN IN VIEW</span><span>Original project map · Naksha Tech</span></figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="ark-current ark-section" aria-labelledby="ark-current-title">
        <div className="ark-container">
          <p className="ark-eyebrow" data-reveal>EVERY OBSERVATION HAS A WAY FORWARD</p>
          <h2 id="ark-current-title" data-reveal>Let evidence<br /><em>shape the next chapter.</em></h2>
          <ol className="ark-evidence-flow" data-reveal>{['Field', 'Data', 'Context', 'Intelligence', 'Action'].map((step, index) => <li key={step}><span>0{index + 1}</span><strong>{step}</strong>{index < 4 && <ArrowUpRight size={18} aria-hidden="true" />}</li>)}</ol>
          <p className="ark-current-copy" data-reveal>From a location in the field to a reviewed finding. From a finding to a wider understanding. From understanding to a more informed response.</p>
        </div>
      </section>

      <section className="ark-portal" aria-labelledby="ark-portal-title">
        <img className="ark-portal-image" src={DRONE_POSTER} alt="" loading="lazy" decoding="async" width="1600" height="900" />
        <div className="ark-portal-shade" aria-hidden="true" />
        <div className="ark-portal-content ark-container" data-reveal>
          <p className="ark-eyebrow">THE WORK CONTINUES</p>
          <h2 id="ark-portal-title">The river story continues<br /><em>inside the project platform.</em></h2>
          <p>Access the Arkavathi workspace for project evidence,<br className="ark-desktop-break" /> institutional collaboration and environmental intelligence.</p>
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
              href="#ark-intelligence"
              onClick={event => explore(event, 'ark-intelligence')}
            >
              Intelligence
            </a>

            <a
              href="#ark-study"
              onClick={event => explore(event, 'ark-study')}
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
