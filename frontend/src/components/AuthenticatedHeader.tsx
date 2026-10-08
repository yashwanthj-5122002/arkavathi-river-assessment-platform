import { Bell, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import type { AuthUser } from '../lib/types'

function portalLabel(user: AuthUser) {
  if (user.organization_type === 'COMPANY') return 'Nakshatech Project Administration'
  if (user.organization_type === 'CNNL') return 'CNNL Officials Monitoring Portal'
  return `${user.organization_name} Portal`
}

function NakshatechBrandBlock() {
  return (
    <div className="flex h-[78px] w-[235px] shrink-0 items-center gap-3 px-3">
      <img
        src="/branding/nakshatech-mark.png"
        alt="Nakshatech"
        className="h-9 w-9 shrink-0 object-contain"
      />

      <div className="min-w-0">
        <div className="whitespace-nowrap text-[19px] font-semibold leading-none tracking-[0.15em] text-white">
          NAKSHATECH
        </div>

        <div className="mt-1 whitespace-nowrap text-[6px] font-semibold uppercase leading-none tracking-[0.12em] text-blue-100">
          GEOSPATIAL TECHNOLOGY PARTNER
        </div>
      </div>
    </div>
  )
}

function LeadershipBlock({
  portrait,
  title,
  name,
}: {
  portrait: string
  title: string
  name: string
}) {
  return (
    <div className="ark-header-leader flex items-center">
      <div className="ark-header-portrait grid shrink-0 place-items-center overflow-hidden bg-white shadow-sm ring-1 ring-white/70">
        <img src={portrait} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="ml-1 min-w-0 flex-1">
        <div className="text-[11px] font-black leading-[14px] text-white">{title}</div>
        <div className="mt-0.5 text-[9px] font-semibold leading-3 text-blue-100">Government of Karnataka</div>
        <div className="mt-0.5 text-[9px] font-bold leading-3 text-white/95">{name}</div>
      </div>
    </div>
  )
}

function JaiprakashLeadershipBlock() {
  return (
    <div className="ark-header-leader ark-header-leader-long flex items-center">
      <div className="ark-header-portrait grid shrink-0 place-items-center overflow-hidden bg-white shadow-sm ring-1 ring-white/70">
        <img
          src="/branding/dr-k-jaiprakash.png"
          alt="Dr. K. Jaiprakash"
          className="h-full w-full object-cover object-top"
        />
      </div>
      <div className="ml-0.5 min-w-0 flex-0.5">
        <div className="text-[11px] font-black leading-[14px] text-white">Dr. K. Jaiprakash</div>
        <div className="mt-0.5 text-[8.5px] font-semibold leading-[11px] text-blue-100">
         <p> Former Secretary, Government of Karnataka and Chairman,</p> 
         <p> Committee for Studies on Arkavathi River Basin</p>
        </div>
      </div>
    </div>
  )
}
function HeaderDivider() {
  return <div aria-hidden="true" className="ark-header-divider" />
}

function ProjectNotificationButton({ onNotifications }: { onNotifications: () => void }) {
  return (
    <button
      type="button"
      onClick={onNotifications}
      aria-label="Notifications"
      title="Notifications"
      className="ark-button-icon ark-header-logout grid shrink-0 place-items-center text-white transition focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
    >
      <Bell size={24} strokeWidth={2} />
    </button>
  )
}

function ProjectLogoutButton({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      aria-label="Logout"
      title="Logout"
      className="ark-button-icon ark-header-logout grid shrink-0 place-items-center text-white transition focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
    >
      <img src="/branding/logout-icon.png" alt="" className="h-7 w-7 object-contain" />
    </button>
  )
}

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
      <header className="ark-auth-header ark-project-header px-1 py-3 text-white md:px-0">
        <div className="ark-project-header-inner mx-auto max-w-[1700px]">
          <div className="ark-project-identity">
            <NakshatechBrandBlock />
          </div>

          <div className="ark-project-leadership">
            <HeaderDivider />
            <LeadershipBlock
              portrait="/branding/chief-minister.png"
              title="Hon'ble Chief Minister"
              name="Shri D. K. Shivakumar"
            />
            <HeaderDivider />
            <LeadershipBlock
              portrait="/branding/water-resources-minister.png"
              title="Hon'ble Minister for Water Resources"
              name="Shri Cheluvaraya Swami"
            />
            <HeaderDivider />
            <JaiprakashLeadershipBlock />
            <HeaderDivider />
            <div className="ark-project-logout-slot flex items-center gap-1">
              {onNotifications && (
                <ProjectNotificationButton onNotifications={onNotifications} />
              )}
              <ProjectLogoutButton onLogout={onLogout} />
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="ark-auth-header px-4 py-4 text-white md:px-6">
      <div className="mx-auto flex max-w-[1700px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
            <ShieldCheck size={15} />
            {portalLabel(user)}
          </div>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">Arkavati River Population Assessment Project</h1>
          <p className="text-sm text-blue-100">{subtitle}</p>
        </div>
        <div className="ark-auth-profile flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10">
            <UserRound size={18} />
          </div>
          <div className="min-w-0">
            <div className="max-w-[220px] truncate text-xs font-black">{user.display_name}</div>
            <div className="max-w-[220px] truncate text-[10px] text-blue-100">
              {user.organization_name} Â· {user.role.replace(/_/g, ' ')}
            </div>
          </div>
          <button
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            className="ml-1 rounded-lg border border-white/10 p-2 text-blue-100 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
