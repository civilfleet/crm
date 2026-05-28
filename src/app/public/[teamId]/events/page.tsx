import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import PublicEventsExplorer from "@/components/public/public-events-explorer";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

export default async function PublicEventsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  return (
    <div
      className={`${display.variable} ${body.variable} min-h-screen bg-[#f7f4ef] font-[var(--font-body)] text-emerald-950`}
      style={{
        backgroundImage:
          "radial-gradient(circle at top, rgba(16,185,129,0.18), transparent 50%), radial-gradient(circle at 20% 20%, rgba(251,191,36,0.12), transparent 35%)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <PublicEventsExplorer teamId={teamId} />
      </div>
    </div>
  );
}
