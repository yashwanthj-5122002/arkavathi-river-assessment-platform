import {
  BarChart3,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  Database,
  FlaskConical,
  History,
  Home,
  KeyRound,
  Map,
  ShieldCheck,
  Waves,
} from 'lucide-react'

import type {
  AuthUser,
  PermissionProfile,
} from '../lib/types'

export type DashboardPage =
  | 'overview'
  | 'gis-map'
  | 'street-view'
  | 'industry-intelligence'
  | 'event-handler'
  | 'flight-explorer'
  | 'analytics'
  | 'data-readiness'
  | 'civil-modules'
  | 'scientific-modules'
  | 'verification'
  | 'department-data'
  | 'civil-review'
  | 'task-management'
  | 'review-centre'
  | 'approval-dashboard'
  | 'notifications'
  | 'audit-history'
  | 'cnnl-approved'
  | 'access-control'

const baseItems = [
  [Home, 'Overview', 'overview'],
  [Map, 'GIS Map', 'gis-map'],
  [BarChart3, 'Analysis', 'street-view'],
  [CalendarDays, 'Event Handler', 'event-handler'],
  [Database, 'Data Readiness', 'data-readiness'],
  [Waves, 'Civil Modules', 'civil-modules'],
  [FlaskConical, 'Scientific Modules', 'scientific-modules'],
] as const

export function Sidebar({
  user,
  permissions,
  activePage,
  onNavigate,
}: {
  user: AuthUser
  permissions: PermissionProfile | null
  activePage: DashboardPage
  onNavigate: (page: DashboardPage) => void
}) {
  const has = (permission: string) =>
    permissions?.permissions.includes(permission) ?? false

  const items: any[] = [...baseItems]

  if (
    has('TASK.VIEW_ALL') ||
    has('TASK.VIEW_ASSIGNED')
  ) {
    items.push([
      ClipboardList,
      user.organization_type === 'COMPANY'
        ? 'Task Management'
        : 'My Tasks',
      'task-management',
    ])
  }

  if (
    has('WORKFLOW.FINAL_APPROVE') ||
    has('WORKFLOW.INTEGRATE')
  ) {
    items.push([
      ShieldCheck,
      'Approval Dashboard',
      'approval-dashboard',
    ])
  }

  if (has('CNNL.VIEW_APPROVED')) {
    items.push([
      BadgeCheck,
      'Approved Data',
      'cnnl-approved',
    ])
  }

  if (has('AUDIT.VIEW')) {
    items.push([
      History,
      'Audit History',
      'audit-history',
    ])
  }

  if (user.role === 'COMPANY_ADMIN') {
    items.push([
      KeyRound,
      'Access Control',
      'access-control',
    ])
  }

  return (
    <aside
      className="
        ark-sidebar
        sticky
        top-0
        hidden
        h-screen
        shrink-0
        flex-col
        px-3
        text-white
        lg:flex
      "
    >
      {/* =====================================================
          GOVERNMENT BRAND HEADER
          Same 92px height as main header
          ===================================================== */}

      <div
        className="
          flex
          h-[92px]
          shrink-0
          items-center
          border-b
          border-white/10
        "
      >
        {/* CNNL LOGO - fixed optical box */}

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
            src="/branding/cnnl-logo.png"
            alt="Cauvery Neeravari Nigama Limited"
            className="h-[44px] w-[44px] object-contain"
          />
        </div>

        {/* CNNL NAME */}

        <div className="ml-2.5 min-w-0 flex-1">
          <div
            className="
              text-[11px]
              font-black
              leading-[13px]
              text-white
            "
          >
            Cauvery Neeravari
            <br />
            Nigama Limited
          </div>

          <div
            className="
              mt-1
              whitespace-nowrap
              text-[7.5px]
              font-semibold
              leading-[9px]
              text-blue-100
            "
          >
            Government of Karnataka
          </div>
        </div>

        {/* DIVIDER */}

        <div
          aria-hidden="true"
          className="
            mx-2.5
            h-[46px]
            w-px
            shrink-0
            bg-white/20
          "
        />

        {/* KARNATAKA LOGO
            Transparent PNG.
            Slightly larger optical size because PNG has
            transparent internal padding. */}

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
            src="/branding/karnataka-emblem-transparent.png"
            alt="Government of Karnataka"
            className="h-[46px] w-[46px] object-contain"
          />
        </div>
      </div>

      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <nav
        className="
          ark-sidebar-nav
          space-y-1
          overflow-y-auto
          pr-1
          pt-3
        "
      >
        {items.map(([Icon, label, page]) => (
          <button
            key={`${label}-${page}`}
            type="button"
            onClick={() =>
              onNavigate(page as DashboardPage)
            }
            aria-current={
              activePage === page
                ? 'page'
                : undefined
            }
            className={`
              ark-sidebar-link
              flex
              w-full
              items-center
              gap-3
              rounded-xl
              px-3
              py-3
              text-left
              text-sm
              transition

              ${
                activePage === page
                  ? 'bg-white/15 font-bold text-white shadow-sm'
                  : 'text-blue-50 hover:bg-white/10'
              }
            `}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      {/* =====================================================
          USER / ORGANISATION FOOTER
          ===================================================== */}

      <div
        className="
          ark-sidebar-foot
          mt-auto
          space-y-2
          pb-4
          pt-4
        "
      >
        <div
          className="
            rounded-xl
            border
            border-white/10
            bg-white/8
            p-3
            text-xs
            leading-5
            text-blue-100
          "
        >
          <div className="flex items-center gap-2.5">
            <img
              src="/branding/nakshatech-mark.png"
              alt="Nakshatech"
              className="h-8 w-8 shrink-0 object-contain"
            />

            <div className="min-w-0">
              <div className="font-bold text-white">
                {user.organization_name}
              </div>

              <div className="mt-0.5 text-[10px]">
                {user.role.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </div>

        <div
          className="
            rounded-xl
            border
            border-white/10
            bg-white/8
            p-3
            text-[11px]
            leading-5
            text-blue-100
          "
        >
          Task, review, approval, notifications and audit pages
          are permission-driven by the backend.
        </div>
      </div>
    </aside>
  )
}
