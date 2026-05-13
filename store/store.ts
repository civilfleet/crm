import { create } from "zustand";
import { persist } from "zustand/middleware";

type TeamState = {
  teamId: string;
  setTeamId: (value: string) => void;
};

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      teamId: "",
      setTeamId: (teamId) => set({ teamId }),
    }),
    {
      name: "team-store", // Local storage key
    },
  ),
);
type OrganizationState = {
  organizationId: string;
  setOrganizationId: (value: string) => void;
};

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set) => ({
      organizationId: "",
      setOrganizationId: (organizationId) => set({ organizationId }),
    }),
    {
      name: "organization-store", // Local storage key
    },
  ),
);