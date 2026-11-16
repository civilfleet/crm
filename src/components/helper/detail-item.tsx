import Link from "next/link";

// Reusable DetailItem component
function DetailItem({
  label,
  value,
  type = "text",
  className = "",
}: {
  label: string;
  value: string | number | undefined;
  className?: string;
  type?: "text" | "email" | "phone" | "link";
}) {
  return (
    <div className={`${className}`}>
      <dt className="text-sm font-medium text-muted-foreground mb-1">
        {label}
      </dt>
      <dd className="text-foreground">
        {type === "link" ? (
          <Link
            href={value as string}
            className="text-info hover:text-info-strong font-medium underline hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {value}
          </Link>
        ) : (
          <span className="font-medium">{value || "N/A"}</span>
        )}
      </dd>
    </div>
  );
}
export default DetailItem;
