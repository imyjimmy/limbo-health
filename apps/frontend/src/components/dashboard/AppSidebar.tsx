import { AuthState } from '@/types'
import { NavUser } from '@/components/dashboard/nav-user'

import { BriefcaseMedical, CalendarCheck, CreditCard ,FolderOpen, Video, Settings, Database } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const providerItems = [
  {
    id: "repositories",
    title: "Patients", 
    icon: FolderOpen,
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: CalendarCheck,
  },
  {
    id: "webrtc",
    title: "Telehealth",
    icon: Video,
  },
  {
    id: "billing",
    title: "Billing",
    icon: CreditCard,
  },
  {
    id: "services",
    title: "Services",
    icon: BriefcaseMedical,
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
  },
  {
    id: "database",
    title: "Database",
    icon: Database,
  }
]

const patientItems = [
  {
    id: "repositories",
    title: "Records",
    icon: FolderOpen,
  },
  {
    id: "calendar",
    title: "Appointments",
    icon: CalendarCheck,
  },
  {
    id: "billing",
    title: "Billing",
    icon: CreditCard,
  },
]

interface AppSidebarProps {
  authState: AuthState
  activeSection: string
  onSectionChange: (section: string) => void
  onLogout: () => void
}

export function AppSidebar({ authState, activeSection, onSectionChange, onLogout }: AppSidebarProps) {
  const items = authState.role === 'patient' ? patientItems : providerItems;
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="p-4">
          <h1 className="text-lg font-bold text-primary">Limbo Health {authState.role}</h1>
          <p className="text-sm text-muted-foreground">Server Dashboard</p>
        </div>
        <>{console.log('role: ', authState.role)}</>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton 
                    onClick={() => onSectionChange(item.id)}
                    isActive={activeSection === item.id}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <NavUser authState={authState} onLogout={onLogout} />
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 bg-green-500 rounded-full" />
            <span className="text-xs font-medium">SERVER ONLINE</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Status: 123</div>
            <div>Port: 3003</div>
            <div>{ process.env.NODE_ENV }</div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}