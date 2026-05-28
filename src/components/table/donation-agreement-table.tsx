"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import TableLoadingState from "@/components/loading/table-loading-state";
import { columns } from "@/components/table/donation-agreement-columns";
import { useToast } from "@/hooks/use-toast";
import ButtonControl from "../helper/button-control";
import FormInputControl from "../helper/form-input-control";
import { Form } from "../ui/form";

const querySchema = z.object({
  query: z.string(),
});
interface IDonationAgreementsProps {
  teamId: string;
  organizationId: string;
}

export default function DonationAgreementTable({
  teamId,
  organizationId,
}: IDonationAgreementsProps) {
  const { toast } = useToast();

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: {
      query: "",
    },
  });

  const fetcher = (url: string) => fetch(url).then((res) => res.json());
  const query = form.watch("query");

  const { data, error, isLoading, isValidating } = useSWR(
    `/api/donation-agreements/?query=${query}&teamId=${teamId}&organizationId=${organizationId}`,
    fetcher,
  );
  const loading = isLoading || !data;
  async function onSubmit(values: z.infer<typeof querySchema>) {
    form.setValue("query", values.query); // Triggers SWR to re-fetch
  }
  if (error) {
    toast({
      title: "Error",
      description: "Error fetching funding requests",
      variant: "destructive",
    });
  }
  return (
    <div className="flex flex-col my-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-1/2">
          <div className="flex-1">
            <FormInputControl
              form={form}
              name="query"
              placeholder="Search..."
            />
          </div>

          <ButtonControl type="submit" label="Submit" className="mx-2" />
        </form>
      </Form>

      <div className="relative rounded-md border my-2 flex justify-center items-center grow h-full">
        {isValidating && !loading ? (
          <p className="absolute right-4 top-4 text-xs text-muted-foreground">
            Refreshing...
          </p>
        ) : null}
        {loading ? (
          <TableLoadingState />
        ) : (
          <DataTable columns={columns} data={data?.data} />
        )}
      </div>
    </div>
  );
}