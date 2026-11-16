import {
  ArrowLeftRight,
  BookUser,
  Building2,
  Calendar,
  ClipboardList,
  FilePenLine,
  Files,
  FolderOpen,
  HandCoins,
  HandHeart,
  Hash,
  Inbox,
  List,
  type LucideIcon,
  Mail,
  ScrollText,
  Settings,
  ShieldCheck,
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
  badge?: number | string;
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
      icon: Building2,
      isActive: true,
    },
    {
      title: "Settings",
      url: "settings",
      icon: Settings,
    },
  ],
  team: [
    {
      title: "Tags",
      url: "tags",
      icon: Hash,
      module: "CRM",
    },
    {
      type: "separator",
      label: "Funding",
      module: "FUNDING",
    },
    {
      title: "Organizations",
      url: "funding/organizations",
      icon: HandHeart,
      isActive: true,
      module: "FUNDING",
    },
    {
      title: "Funding Requests",
      url: "funding/funding-requests",
      icon: HandCoins,
      module: "FUNDING",
    },
    {
      title: "Donation Agreements",
      url: "funding/donation-agreements",
      icon: FilePenLine,
      module: "FUNDING",
    },
    {
      title: "Transactions",
      url: "funding/transactions",
      icon: ArrowLeftRight,
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
      title: "Activity Inbox",
      url: "crm/activity-inbox",
      icon: Inbox,
      module: "CRM",
    },
    {
      title: "Organizations",
      url: "crm/organizations",
      icon: Building2,
      module: "CRM",
    },
    {
      title: "Contacts",
      url: "crm/contacts",
      icon: Users,
      module: "CRM",
    },
    {
      title: "Lists",
      url: "crm/lists",
      icon: List,
      module: "CRM",
    },
    {
      title: "Forms",
      url: "crm/forms",
      icon: ClipboardList,
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
      icon: Files,
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
      title: "Logs",
      url: "admin/logs",
      icon: ScrollText,
      module: "ADMIN",
    },
    {
      title: "Contact Access",
      url: "admin/contact-access-reviews",
      icon: ShieldCheck,
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
      icon: Building2,
      isActive: true,
    },

    {
      title: "Funding Requests",
      url: "funding-requests",
      icon: HandCoins,
    },
    {
      title: "Donation Agreements",
      url: "donation-agreements",
      icon: FilePenLine,
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
      icon: ArrowLeftRight,
    },
  ],
};

export default navItems;
