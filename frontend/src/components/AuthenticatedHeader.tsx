import {
  Bell,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import type { AuthUser } from '../lib/types'

function portalLabel(user: AuthUser) {
  if (user.organization_type === 'COMPANY') {
    return 'Nakshatech Project Administration'
  }

  if (user.organization_type === 'CNNL') {
    return 'CNNL Officials Monitoring Portal'
  }

  return `${user.organization_name} Portal`
}

/* ============================================================
   NAKSHATECH BRAND
   ============================================================ */

function NakshatechBrandBlock() {
  return (
    <div
      className="
        flex
        h-[64px]
        w-[225px]
        shrink-0
        items-center
        gap-3
      "
    >
      <div
        className="
          flex
          h-[46px]
          w-[46px]
          shrink-0
          items-center
          justify-center
        "
      >
        <img
          src="/branding/nakshatech-mark.png"
          alt="NakshaTech"
          className="h-[44px] w-[44px] object-contain"
        />
      </div>

      <div className="min-w-0">
        <div
          className="
            whitespace-nowrap
            text-[18px]
            font-semibold
            leading-none
            tracking-[0.14em]
            text-white
          "
        >
          NAKSHATECH
        </div>

        <div
          className="
            mt-1.5
            whitespace-nowrap
            text-[6.5px]
            font-semibold
            uppercase
            leading-none
            tracking-[0.13em]
            text-blue-100
          "
        >
          INSPIRING GEOSPATIAL STANDARDS
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   LEADERSHIP BLOCK

   All normal leader blocks use the same:
   - 64px visual height
   - 56x56 image box
   - same vertical centering
   ============================================================ */

function LeadershipBlock({
  portrait,
  title,
  name,
  widthClass,
}: {
  portrait: string
  title: string
  name: string
  widthClass: string
}) {
  return (
    <div
      className={`
        flex
        h-[64px]
        ${widthClass}
        shrink-0
        items-center
        gap-3
      `}
    >
      {/* Portrait */}

      <div
        className="
          flex
          h-[56px]
          w-[56px]
          shrink-0
          items-center
          justify-center
          overflow-hidden
          rounded-xl
          bg-white
          shadow-sm
          ring-1
          ring-white/70
        "
      >
        <img
          src={portrait}
          alt={name}
          className="
            h-full
            w-full
            object-cover
            object-top
          "
        />
      </div>

      {/* Text */}

      <div
        className="
          flex
          min-w-0
          flex-1
          flex-col
          justify-center
        "
      >
        <div
          className="
            max-w-full
            text-[11px]
            font-black
            leading-[13px]
            text-white
          "
        >
          {title}
        </div>

        <div
          className="
            mt-[2px]
            text-[8px]
            font-semibold
            leading-[10px]
            text-blue-100
          "
        >
          Government of Karnataka
        </div>

        <div
          className="
            mt-[2px]
            text-[9px]
            font-bold
            leading-[11px]
            text-white/95
          "
        >
          {name}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   DR. K. JAIPRAKASH
   ============================================================ */

function JaiprakashLeadershipBlock() {
  return (
    <div
      className="
        flex
        h-[64px]
        w-[320px]
        shrink-0
        items-center
        gap-3
      "
    >
      <div
        className="
          flex
          h-[56px]
          w-[56px]
          shrink-0
          items-center
          justify-center
          overflow-hidden
          rounded-xl
          bg-white
          shadow-sm
          ring-1
          ring-white/70
        "
      >
        <img
          src="/branding/dr-k-jaiprakash.png"
          alt="Dr. K. Jaiprakash"
          className="
            h-full
            w-full
            object-cover
            object-top
          "
        />
      </div>

      <div
        className="
          flex
          min-w-0
          flex-1
          flex-col
          justify-center
        "
      >
        <div
          className="
            text-[11px]
            font-black
            leading-[13px]
            text-white
          "
        >
          Dr. K. Jaiprakash
        </div>

        <div
          className="
            mt-[3px]
            max-w-[245px]
            text-[8px]
            font-semibold
            leading-[10px]
            text-blue-100
          "
        >
         Technical Advisor to the Chief Minister, Government of Karnataka,
          Chairman of the Committee for Studies on the Arkavathi River Basin.
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   DIVIDER
   ============================================================ */

function HeaderDivider() {
  return (
    <div
      aria-hidden="true"
      className="
        h-[52px]
        w-px
        shrink-0
        bg-white/15
      "
    />
  )
}

/* ============================================================
   NOTIFICATION
   ============================================================ */

function ProjectNotificationButton({
  onNotifications,
}: {
  onNotifications: () => void
}) {
  return (
    <button
      type="button"
      onClick={onNotifications}
      aria-label="Notifications"
      title="Notifications"
      className="
        grid
        h-[44px]
        w-[44px]
        shrink-0
        place-items-center
        rounded-xl
        text-white
        transition
        hover:bg-white/10
        focus:outline-none
        focus:ring-2
        focus:ring-cyan-200/70
      "
    >
      <Bell
        size={22}
        strokeWidth={2}
      />
    </button>
  )
}

/* ============================================================
   LOGOUT
   ============================================================ */

function ProjectLogoutButton({
  onLogout,
}: {
  onLogout: () => void
}) {
  return (
    <button
      type="button"
      onClick={onLogout}
      aria-label="Logout"
      title="Logout"
      className="
        grid
        h-[44px]
        w-[44px]
        shrink-0
        place-items-center
        rounded-xl
        text-white
        transition
        hover:bg-white/10
        focus:outline-none
        focus:ring-2
        focus:ring-cyan-200/70
      "
    >
      <img
        src="/branding/logout-icon.png"
        alt=""
        className="h-7 w-7 object-contain"
      />
    </button>
  )
}

/* ============================================================
   AUTHENTICATED HEADER
   ============================================================ */

export function AuthenticatedHeader({
  user,
  onLogout,
  onNotifications,
  subtitle,
  projectBranding = false,
}: {
  user: AuthUser
  onLogout: () => void
  onNotifications?: () => void
  subtitle: string
  projectBranding?: boolean
}) {
if (projectBranding) {
  return (
    <header
      className="
        ark-auth-header
        ark-project-header
        h-[92px]
        w-full
        border-b
        border-white/10
        px-5
        text-white
      "
    >
      <div className="flex h-full w-full min-w-0 items-center">

        {/* ==================================================
            NAKSHATECH
            ================================================== */}

        <div className="shrink-0">
          <NakshatechBrandBlock />
        </div>


        {/* ==================================================
            CONTROLLED FLEXIBLE SPACE

            This gives breathing room after NakshaTech,
            but keeps all ministers together as one group.
            ================================================== */}

        <div className="min-w-[36px] flex-1" />


        {/* ==================================================
            LEADERSHIP GROUP

            CM -> Minister -> Dr J -> Bell -> Logout

            These remain close and consistently spaced.
            ================================================== */}

        <div
          className="
            flex
            shrink-0
            items-center
            gap-3.5
          "
        >

          {/* CHIEF MINISTER */}

          <LeadershipBlock
            portrait="/branding/chief-minister.jpeg"
            title="Hon'ble Chief Minister"
            name="Shri D. K. Shivakumar"
            widthClass="w-[205px]"
          />


          <HeaderDivider />


          {/* WATER RESOURCES MINISTER */}

          <LeadershipBlock
            portrait="/branding/water-resources-m.png"
            title="Hon'ble Minister for Water Resources"
            name="Shri Cheluvaraya Swami"
            widthClass="w-[245px]"
          />


          <HeaderDivider />


          {/* DR. K. JAIPRAKASH */}

          <JaiprakashLeadershipBlock />


          <HeaderDivider />


          {/* NOTIFICATION + LOGOUT */}

          <div
            className="
              flex
              shrink-0
              items-center
              gap-1.5
            "
          >
            {onNotifications && (
              <ProjectNotificationButton
                onNotifications={onNotifications}
              />
            )}

            <ProjectLogoutButton
              onLogout={onLogout}
            />
          </div>

        </div>

      </div>
    </header>
  )
}

  /* ==========================================================
     STANDARD HEADER
     ========================================================== */

  return (
    <header
      className="
        ark-auth-header
        px-4
        py-4
        text-white
        md:px-6
      "
    >
      <div
        className="
          mx-auto
          flex
          max-w-[1700px]
          flex-col
          gap-3
          md:flex-row
          md:items-center
          md:justify-between
        "
      >
        <div>
          <div
            className="
              flex
              items-center
              gap-2
              text-sm
              font-semibold
              text-cyan-200
            "
          >
            <ShieldCheck size={15} />
            {portalLabel(user)}
          </div>

          <h1
            className="
              mt-1
              text-2xl
              font-black
              md:text-3xl
            "
          >
            Arkavati River Pollution Assessment Project
          </h1>

          <p className="text-sm text-blue-100">
            {subtitle}
          </p>
        </div>

        <div
          className="
            ark-auth-profile
            flex
            items-center
            gap-3
            rounded-2xl
            border
            border-white/10
            bg-white/10
            px-3
            py-2.5
          "
        >
          <div
            className="
              grid
              h-9
              w-9
              place-items-center
              rounded-xl
              bg-white/10
            "
          >
            <UserRound size={18} />
          </div>

          <div className="min-w-0">
            <div
              className="
                max-w-[220px]
                truncate
                text-xs
                font-black
              "
            >
              {user.display_name}
            </div>

            <div
              className="
                max-w-[220px]
                truncate
                text-[10px]
                text-blue-100
              "
            >
              {user.organization_name}
              {' · '}
              {user.role.replace(/_/g, ' ')}
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            className="
              ml-1
              rounded-lg
              border
              border-white/10
              p-2
              text-blue-100
              transition
              hover:bg-white/10
              hover:text-white
            "
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}