import { Users } from "lucide-react";
import TeamForm from "@/components/forms/team";
import { RecordTopBar } from "@/components/records/record-page";

export default async function team() {
  return (
    <>
      <RecordTopBar
        list={{ href: "/admin/teams", label: "Teams", icon: Users }}
        title="New team"
      />
      <div className="m-2 w-full">
        <TeamForm />
      </div>
    </>
  );
}
