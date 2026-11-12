import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type InitialsAvatarProps = {
  name?: string | null;
  /** Used for initials when there is no name. */
  email?: string | null;
  image?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

export const getInitials = (name?: string | null, email?: string | null) => {
  const trimmedName = name?.trim() ?? "";
  const source = trimmedName || email?.trim() || "";
  const words = source.split(/[\s.@_-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1 || !trimmedName) return words[0][0].toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

/** A person: their photo if there is one, otherwise their initials. */
export const InitialsAvatar = ({
  name,
  email,
  image,
  size = "md",
  className,
}: InitialsAvatarProps) => (
  <Avatar className={cn(sizeClasses[size], className)}>
    {image ? <AvatarImage src={image} alt="" /> : null}
    <AvatarFallback className="bg-sidebar-active font-semibold text-sidebar-active-foreground">
      {getInitials(name, email)}
    </AvatarFallback>
  </Avatar>
);
