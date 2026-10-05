"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type Suppression = {
  id: string;
  email: string;
  reason: "HARD_BOUNCE" | "SPAM" | "UNSUBSCRIBED" | "MANUAL";
  detail?: string | null;
  updatedAt: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error || response.statusText);
  return (json.data ?? []) as Suppression[];
};

export default function EmailSuppressions({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const endpoint = `/api/teams/${teamId}/email-suppressions`;
  const { data = [], error, isLoading, mutate } = useSWR(endpoint, fetcher);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<"UNSUBSCRIBED" | "MANUAL">(
    "UNSUBSCRIBED",
  );
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const addSuppression = async () => {
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason, detail: detail || undefined }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || response.statusText);
      setEmail("");
      setDetail("");
      await mutate();
      toast({ title: "Email suppressed" });
    } catch (error) {
      toast({
        title: "Unable to suppress email",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const removeSuppression = async (suppression: Suppression) => {
    if (
      !window.confirm(
        `Allow future CRM email to ${suppression.email}? This does not establish consent.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `${endpoint}?id=${encodeURIComponent(suppression.id)}`,
        { method: "DELETE" },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || response.statusText);
      await mutate();
      toast({ title: "Suppression removed" });
    } catch (error) {
      toast({
        title: "Unable to remove suppression",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email suppression</CardTitle>
        <CardDescription>
          Hard bounces and spam reports are added automatically. Record every
          unsubscribe request here before another CRM send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_2fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="suppression-email">Email</Label>
            <Input
              id="suppression-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select
              value={reason}
              onValueChange={(value: "UNSUBSCRIBED" | "MANUAL") =>
                setReason(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNSUBSCRIBED">Unsubscribed</SelectItem>
                <SelectItem value="MANUAL">Manual block</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="suppression-detail">Note (optional)</Label>
            <Input
              id="suppression-detail"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
          <Button onClick={addSuppression} disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Suppress
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-20">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((suppression) => (
              <TableRow key={suppression.id}>
                <TableCell>{suppression.email}</TableCell>
                <TableCell>{suppression.reason.replaceAll("_", " ")}</TableCell>
                <TableCell>{suppression.detail || "-"}</TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove suppression for ${suppression.email}`}
                    disabled={busy}
                    onClick={() => removeSuppression(suppression)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No suppressed email addresses.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
