"use client";

import { Radio } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { FORM_COUNT_PATH, formCountSubject } from "@/lib/public-forms/counts";

type FormCounterSettingsProps = {
  teamId: string;
  formId: string;
  people: number;
  initialPublicCount: boolean;
  initialGoal: number | null;
  /** The public API the website calls, e.g. https://api.sea.watch. */
  publicApiUrl?: string;
};

/**
 * Whether the website may show how many people sent this form, and the goal
 * it counts toward. The CRM publishes the number; the public API serves it.
 */
export const FormCounterSettings = ({
  teamId,
  formId,
  people,
  initialPublicCount,
  initialGoal,
  publicApiUrl,
}: FormCounterSettingsProps) => {
  const { toast } = useToast();
  const switchId = useId();
  const goalId = useId();
  const [publicCount, setPublicCount] = useState(initialPublicCount);
  const [goal, setGoal] = useState(initialGoal ? String(initialGoal) : "");
  const [savedGoal, setSavedGoal] = useState(initialGoal);
  const [isSaving, setIsSaving] = useState(false);
  const canPublish = formCountSubject(teamId, formId) !== null;

  const save = async (settings: {
    publicCount?: boolean;
    goal?: number | null;
  }) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/forms/${encodeURIComponent(formId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, ...settings }),
      });
      if (!response.ok) throw new Error();
      return true;
    } catch {
      toast({
        title: "Not saved",
        description: "The counter settings could not be saved. Try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublic = async (checked: boolean) => {
    setPublicCount(checked);
    if (!(await save({ publicCount: checked }))) setPublicCount(!checked);
  };

  const parsedGoal = goal.trim() === "" ? null : Number(goal);
  const isGoalValid =
    parsedGoal === null || (Number.isInteger(parsedGoal) && parsedGoal > 0);

  const handleSaveGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (!isGoalValid) return;
    if (await save({ goal: parsedGoal })) setSavedGoal(parsedGoal);
  };

  const countUrl = `${publicApiUrl ?? ""}${FORM_COUNT_PATH}?team=${teamId}&form=${encodeURIComponent(formId)}`;

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Radio aria-hidden="true" className="size-5" />
          Public counter
        </CardTitle>
        <CardDescription>
          Lets the website show how many people sent this form. Only the number
          is public, never who.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        {canPublish ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={switchId} className="text-sm font-medium">
                Show the number on the website
              </Label>
              <Switch
                id={switchId}
                checked={publicCount}
                disabled={isSaving}
                onCheckedChange={handleTogglePublic}
              />
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-2">
              <Label htmlFor={goalId} className="text-sm font-medium">
                Goal
              </Label>
              <div className="flex gap-2">
                <Input
                  id={goalId}
                  inputMode="numeric"
                  placeholder="No goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  aria-invalid={!isGoalValid}
                  className="max-w-40"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    isSaving || !isGoalValid || parsedGoal === savedGoal
                  }
                >
                  Save goal
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {isGoalValid
                  ? "The website shows progress toward it. Leave empty for none."
                  : "A goal is a whole number above zero."}
              </p>
            </form>

            <p className="text-sm text-muted-foreground">
              {publicCount
                ? `${people.toLocaleString()} ${people === 1 ? "person" : "people"} so far. The website sees changes within about a minute.`
                : "Off: the website shows no number."}
            </p>
            {publicCount ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  The website reads it from
                </p>
                <code className="block break-all rounded-md bg-muted px-2 py-1.5 text-xs">
                  {countUrl}
                </code>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This form&apos;s id has characters the public API cannot carry, so
            it cannot have a counter. Forms built in the website&apos;s form
            builder always can.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
