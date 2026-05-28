"use client";

import Link from "next/link";
import useSWR from "swr";
import { Loader } from "./helper/loader";

// Reusable DetailItem component
function DetailItem({
  label,
  value,
  type = "text",
}: {
  label: string;
  value: string | number | undefined;
  type?: "text" | "email" | "phone" | "link";
}) {
  return (
    <div>
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

const fetcher = (url: string) => fetch(url).then((res) => res.json());
export default function UserDetails({ userId }: { userId: string }) {
  const { data, error, isLoading } = useSWR(`/api/users/${userId}`, fetcher);
  const loading = !data && !error && isLoading;
  const user = data?.data;
  return (
    <div className="grid gap-6">
      {/* Organization Info */}
      {loading && (
        <div className="p-8 w-full h-64 justify-center items-center flex">
          <Loader className={""} />
        </div>
      )}

      {user && (
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              User Profile
            </h2>
            <p className="text-gray-500">
              View and manage the details of this user.
            </p>
          </div>
          <div className="space-y-6">
            {/* Main Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <DetailItem label="User" value={user.name} />
                <DetailItem
                  label="Email Address"
                  value={user.email}
                  type="email"
                />
                <DetailItem
                  label="Phone Number"
                  value={user.phone}
                  type="phone"
                />
              </div>

              <div className="space-y-4">
                <DetailItem label="Physical Address" value={user.address} />
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem label="Postal Code" value={user.postalCode} />
                  <DetailItem label="City" value={user.city} />
                  <DetailItem label="Country" value={user.country} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}