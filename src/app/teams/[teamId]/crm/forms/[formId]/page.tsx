import { ClipboardList } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { FormCounterSettings } from "@/components/forms/form-counter-settings";
import { formatRecordDate } from "@/components/records/record-cells";
import { RecordTopBar } from "@/components/records/record-page";
import { FormSubmissionsTable } from "@/components/table/form-submissions-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  parseTablePageSize,
  RECORDS_PAGE_SIZE,
  TABLE_PAGE_SIZE_COOKIE,
} from "@/lib/table-page-size";
import { getForm } from "@/services/forms";
import { getTeamAdminAccess } from "@/services/teams/access";
import type { Roles } from "@/types";

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; formId: string }>;
}) {
  const [{ teamId, formId: rawFormId }, session, cookieStore] =
    await Promise.all([params, auth(), cookies()]);
  const formId = decodeURIComponent(rawFormId);
  const form = await getForm(teamId, formId, {
    userId: session?.user?.userId,
    roles: (session?.user?.roles ?? []) as Roles[],
  });
  if (!form) notFound();
  const canDelete = session?.user?.userId
    ? (
        await getTeamAdminAccess(
          session.user.userId,
          teamId,
          session.user.roles,
        )
      ).allowed
    : false;
  const initialPageSize = parseTablePageSize(
    cookieStore.get(TABLE_PAGE_SIZE_COOKIE)?.value,
    RECORDS_PAGE_SIZE,
  );

  const facts = [
    { label: "People", value: form.people.toLocaleString() },
    { label: "Confirmed", value: form.confirmedPeople.toLocaleString() },
    { label: "Submissions", value: form.submissions.toLocaleString() },
    { label: "Last received", value: formatRecordDate(form.lastReceivedAt) },
    { label: "Form id", value: form.formId },
  ];

  return (
    <>
      <RecordTopBar
        list={{
          href: `/teams/${teamId}/crm/forms`,
          label: "Forms",
          icon: ClipboardList,
        }}
        title={form.title}
      />
      <div className="space-y-6 p-4">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <Card className="w-full shadow-sm lg:col-span-8">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-xl font-semibold">
                {form.title}
              </CardTitle>
              <CardDescription>
                Website form. People counts each person once, however often they
                sent it.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {facts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {fact.label}
                    </dt>
                    <dd
                      className="truncate text-base font-medium"
                      title={fact.value}
                    >
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <div className="lg:col-span-4">
            <FormCounterSettings
              teamId={teamId}
              formId={form.formId}
              people={form.people}
              confirmedPeople={form.confirmedPeople}
              initialPublicCount={form.publicCount}
              initialCountConfirmedOnly={form.countConfirmedOnly}
              initialGoal={form.goal}
              publicApiUrl={
                process.env.PUBLIC_API_URL ?? "https://api.sea.watch"
              }
            />
          </div>
        </div>
        <FormSubmissionsTable
          teamId={teamId}
          formId={form.formId}
          initialPageSize={initialPageSize}
          canDelete={canDelete}
        />
      </div>
    </>
  );
}
