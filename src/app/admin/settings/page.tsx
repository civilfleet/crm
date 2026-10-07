import { Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GlobalSettingsForm } from "@/components/forms/global-settings";
import { getGlobalSettings } from "@/lib/global-settings";
import { Roles } from "@/types";

export const dynamic = "force-dynamic";

export default async function GlobalAdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.roles?.includes(Roles.Admin)) {
    redirect("/");
  }

  const settings = await getGlobalSettings();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="space-y-3 border-b pb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Settings2 className="size-4" aria-hidden="true" />
          Global administration
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Global settings</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Manage application-wide defaults that affect every team and the
            public entry points into the CRM.
          </p>
        </div>
      </header>

      <GlobalSettingsForm
        initialContactUrl={settings.accountCreationContactUrl}
      />
    </main>
  );
}
