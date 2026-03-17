import {
  Activity,
  Brain,
  Cpu,
  DollarSign,
  Layers,
  type LucideIcon,
  Plus,
  Search,
  Store,
  Target,
} from "lucide-react";
import type { ReactElement } from "react";
import SidebarNavButton from "./SidebarNavButton";
import type { DexData, ViewMode } from "./types";

type SidebarItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  mode: ViewMode;
  addStyle?: boolean;
  index?: number;
};

const INSIGHTS_ITEMS: SidebarItem[] = [
  { key: "dashboard", icon: Activity, label: "Usage Dashboard", mode: "dashboard" },
  { key: "costs", icon: DollarSign, label: "AI Cost Center", mode: "costs" },
  { key: "marketplace", icon: Store, label: "MCP Marketplace", mode: "marketplace" },
];

const WORKSPACE_ITEMS: SidebarItem[] = [
  { key: "memory", icon: Brain, label: "Memory", mode: "memory" },
];

const CREATE_ITEMS: SidebarItem[] = [
  { key: "create_skill", icon: Target, label: "Create Skill", mode: "create_skill", addStyle: true },
];

const DISCOVER_ITEMS: SidebarItem[] = [
  { key: "global_search", icon: Search, label: "Find Skills", mode: "global_search" },
];

type AppSidebarProps = {
  dexData: DexData;
  viewMode: ViewMode;
  selectedIndex: number;
  onNavigate: (mode: ViewMode, index?: number) => void;
};

function AppSidebar({ dexData, viewMode, selectedIndex, onNavigate }: AppSidebarProps) {
  function renderNavItem(item: SidebarItem): ReactElement {
    const { key, icon: Icon, label, mode, addStyle = false, index } = item;
    const isActive = viewMode === mode && (index === undefined || index === selectedIndex);

    return (
      <SidebarNavButton
        key={key}
        active={isActive}
        onClick={() => onNavigate(mode, index)}
        addStyle={addStyle}
      >
        <Icon size={15} /> {label}
      </SidebarNavButton>
    );
  }

  const toolItems: SidebarItem[] = dexData.tools.map((tool, index) => ({
    key: `tool-${tool.name}`,
    icon: Cpu,
    label: tool.name,
    mode: "tools",
    index,
  }));

  const repoItems: SidebarItem[] = dexData.repos.map((repo, index) => ({
    key: `repo-${repo.name}`,
    icon: Layers,
    label: repo.name,
    mode: "repos",
    index,
  }));

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Insights</div>
      {INSIGHTS_ITEMS.map(renderNavItem)}

      <div className="sidebar-header">Workspace</div>
      {WORKSPACE_ITEMS.map(renderNavItem)}

      <div className="sidebar-header">Core Tools</div>
      {toolItems.map(renderNavItem)}

      <div className="sidebar-header">Skill Repositories</div>
      {repoItems.map(renderNavItem)}
      {renderNavItem({
        key: "add_repo",
        icon: Plus,
        label: "Add Repository",
        mode: "add_repo",
        addStyle: true,
      })}

      <div className="sidebar-header">Create</div>
      {CREATE_ITEMS.map(renderNavItem)}

      <div className="sidebar-header">Discover</div>
      {DISCOVER_ITEMS.map(renderNavItem)}
    </aside>
  );
}

export default AppSidebar;
