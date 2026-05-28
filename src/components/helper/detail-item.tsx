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
      <dt className="text-sm font-medium text-gray-500 mb-1">{label}</dt>
      <dd className="text-gray-800">
        {type === "link" ? (
          <Link
            href={value as string}
            className="text-blue-600 hover:text-blue-800 font-medium underline hover:no-underline"
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
