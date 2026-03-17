import type { ReactNode } from "react";

type SidebarNavButtonProps = {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  addStyle?: boolean;
};

function SidebarNavButton({ active, onClick, children, addStyle = false }: SidebarNavButtonProps) {
  const className = [
    "sidebar-item",
    addStyle ? "sidebar-item-add" : "",
    active ? "active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default SidebarNavButton;
