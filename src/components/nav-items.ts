import {
  BookOpen,
  BookUser,
  Building,
  Calendar,
  FolderOpen,
  List,
  type LucideIcon,
  Mail,
  Scroll,
  Settings,
  UserCircle2,
  Users,
  UsersRound,
} from "lucide-react";
import type { AppModule } from "@/types";

type NavItemBase = {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  module?: AppModule;
};

type NavItemSeparator = {
  type: "separator";
  label?: string;
  module?: AppModule;
};

type NavItem = NavItemBase | NavItemSeparator;

const navItems: {
  admin: NavItem[];
  team: NavItem[];
  organization: NavItem[];
} = {
  admin: [
    {
      title: "Teams",
      url: "teams",
      icon: Users,
      isActive: true,
    },
    {
      title: "Organizations",
      url: "organizations",
      icon: Building,
      isActive: true,
    },
  ],
  team: [
    {
      type: "separator",
      label: "Funding",
      module: "FUNDING",
    },
    {
      title: "Organizations",
      url: "funding/organizations",
      icon: Building,
      isActive: true,
      module: "FUNDING",
    },
    {
      title: "Funding Requests",
      url: "funding/funding-requests",
      icon: BookOpen,
      module: "FUNDING",
    },
    {
      title: "Donation Agreements",
      url: "funding/donation-agreements",
      icon: Scroll,
      module: "FUNDING",
    },
    {
      title: "Transactions",
      url: "funding/transactions",
      icon: Scroll,
      module: "FUNDING",
    },
    {
      title: "Files",
      url: "funding/files",
      icon: FolderOpen,
      module: "FUNDING",
    },
    {
      type: "separator",
      label: "CRM",
      module: "CRM",
    },
    {
      title: "Organizations",
      url: "crm/organizations",
      icon: Building,
      module: "CRM",
    },
    {
      title: "Contacts",
      url: "crm/contacts",
      icon: UserCircle2,
      module: "CRM",
    },
    {
      title: "Lists",
      url: "crm/lists",
      icon: List,
      module: "CRM",
    },
    {
      title: "Emails",
      url: "crm/emails",
      icon: Mail,
      module: "CRM",
    },
    {
      title: "Events",
      url: "crm/events",
      icon: Calendar,
      module: "CRM",
    },
    {
      title: "Files",
      url: "crm/files",
      icon: FolderOpen,
      module: "CRM",
    },
    {
      type: "separator",
      label: "Admin",
      module: "ADMIN",
    },
    {
      title: "Users",
      url: "users",
      icon: BookUser,
      module: "ADMIN",
    },
    {
      title: "Groups",
      url: "admin/groups",
      icon: UsersRound,
      module: "ADMIN",
    },
    {
      title: "Settings",
      url: "settings",
      icon: Settings,
      module: "ADMIN",
    },
  ],
  organization: [
    {
      title: "Organization Profile",
      url: "profile",
      icon: Building,
      isActive: true,
    },

    {
      title: "Funding Requests",
      url: "funding-requests",
      icon: BookOpen,
    },
    {
      title: "Donation Agreements",
      url: "donation-agreements",
      icon: Scroll,
    },

    {
      title: "Users",
      url: "users",
      icon: BookUser,
    },
    {
      title: "Files",
      url: "files",
      icon: FolderOpen,
    },
    {
      title: "Transactions",
      url: "transactions",
      icon: Scroll,
    },
  ],
};

export default navItems;
