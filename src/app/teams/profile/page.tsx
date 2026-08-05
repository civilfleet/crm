import { Building2, CheckCircle2, Shield, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUserProfile } from "@/services/users";
import { APP_MODULES, type AppModule, Roles } from "@/types";

const moduleLabels: Record<AppModule, string> = {
  CRM: "CRM",
  FUNDING: "Funding",
  ADMIN: "Admin",
};

const formatValue = (value?: string | null) => value || "Not set";

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);

export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    return redirect("/");
  }

  const userId = session.user?.userId;

  if (!userId) {
    return redirect("/");
  }

  const profile = await getCurrentUserProfile(
    userId,
    Boolean(session.user?.roles?.includes(Roles.Admin)),
  );

  if (!profile) {
    return redirect("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Signed in as
          </p>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">
            {formatValue(profile.name)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatValue(profile.email)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(profile.roles ?? []).map((role) => (
            <Badge key={role} variant="secondary">
              {role}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="rounded-lg shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{formatValue(profile.name)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{formatValue(profile.email)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{formatValue(profile.phone)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium">
                  {formatValue(profile.address)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Postal code</dt>
                <dd className="font-medium">
                  {formatValue(profile.postalCode)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">City</dt>
                <dd className="font-medium">{formatValue(profile.city)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Country</dt>
                <dd className="font-medium">
                  {formatValue(profile.country)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-primary" />
              Organization memberships
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.organizations.length ? (
              <div className="grid gap-3">
                {profile.organizations.map((organization) => (
                  <div
                    key={organization.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {organization.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {organization.email || "No email"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No organization memberships found.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4 text-primary" />
            Team access
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile.teams.length ? (
            <div className="grid gap-4">
              {profile.teams.map((team) => (
                <div key={team.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">
                        {team.name}
                      </h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {team.email || "No team email"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {APP_MODULES.map((module) => {
                        const hasAccess = team.modules.includes(module);

                        return (
                          <Badge
                            key={module}
                            variant={hasAccess ? "default" : "outline"}
                            className={
                              hasAccess ? "" : "text-muted-foreground"
                            }
                          >
                            {hasAccess && (
                              <CheckCircle2 className="mr-1 size-3" />
                            )}
                            {moduleLabels[module]}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <h3 className="text-sm font-medium">Groups</h3>
                    {team.memberships.length ? (
                      <div className="mt-2 grid gap-2">
                        {team.memberships.map((membership) => (
                          <div
                            key={membership.id}
                            className="flex flex-col gap-2 rounded-md bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="text-sm font-medium">
                                {membership.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Joined {formatDate(membership.joinedAt)}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {membership.isDefaultGroup && (
                                <Badge variant="secondary">Default</Badge>
                              )}
                              {membership.canAccessAllContacts && (
                                <Badge variant="secondary">All contacts</Badge>
                              )}
                              {membership.modules.map((module) => (
                                <Badge key={module} variant="outline">
                                  {moduleLabels[module]}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No group memberships recorded for this team.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No team memberships found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
