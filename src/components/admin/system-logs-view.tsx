"use client";

import {
  AlertTriangle,
  Bug,
  Clock3,
  Info,
  RefreshCw,
  Search,
  ServerCog,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type SystemLog = {
  id: string;
  teamId?: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  event: string;
  message: string;
  workerId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
  createdAt: string;
};

type SystemLogsViewProps = {
  teamId: string;
};

const fetchLogs = async (url: string): Promise<SystemLog[]> => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || response.statusText);
  }
  return json.data as SystemLog[];
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));

const levelConfig = {
  INFO: {
    icon: Info,
    className: "border-blue-200 bg-blue-50 text-blue-900",
  },
  WARN: {
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-950",
  },
  ERROR: {
    icon: Bug,
    className: "border-red-200 bg-red-50 text-red-900",
  },
};

const metadataPreview = (value: unknown) => {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export default function SystemLogsView({ teamId }: SystemLogsViewProps) {
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");

  const url = useMemo(() => {
    const params = new URLSearchParams({ limit: "150" });
    if (level !== "all") params.set("level", level);
    if (source !== "all") params.set("source", source);
    if (query.trim()) params.set("query", query.trim());
    return `/api/teams/${teamId}/admin/logs?${params.toString()}`;
  }, [teamId, level, source, query]);

  const {
    data: logs = [],
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(url, fetchLogs, { refreshInterval: 15_000 });

  const sources = useMemo(
    () => Array.from(new Set(logs.map((log) => log.source))).sort(),
    [logs],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-pretty text-3xl font-bold">Logs</h1>
          <p className="mt-1 text-pretty text-muted-foreground">
            Worker, sync, and integration activity for this team.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isValidating}
          onClick={() => void mutate()}
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${isValidating ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          {isValidating ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog aria-hidden="true" className="h-4 w-4" />
            Activity Stream
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_220px]">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              />
              <Input
                aria-label="Search logs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search logs…"
              />
            </div>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger aria-label="Filter by log level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
                <SelectItem value="WARN">Warning</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger aria-label="Filter by log source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              {(error as Error).message}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[190px]">Time</TableHead>
                  <TableHead className="w-[110px]">Level</TableHead>
                  <TableHead className="w-[170px]">Source</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[220px]">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <span aria-live="polite">Loading logs…</span>
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const LevelIcon = levelConfig[log.level].icon;
                    const metadata = metadataPreview(log.metadata);

                    return (
                      <TableRow key={log.id} className="align-top">
                        <TableCell className="whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <Clock3
                              aria-hidden="true"
                              className="h-3.5 w-3.5 text-muted-foreground"
                            />
                            {formatDateTime(log.createdAt)}
                          </div>
                          {log.workerId ? (
                            <div className="mt-1 max-w-[170px] truncate text-xs text-muted-foreground">
                              {log.workerId}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={levelConfig[log.level].className}
                          >
                            <LevelIcon
                              aria-hidden="true"
                              className="mr-1 h-3.5 w-3.5"
                            />
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{log.source}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.event}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xl space-y-2">
                            <p className="break-words text-sm">{log.message}</p>
                            {metadata ? (
                              <details className="rounded-md bg-muted/40 p-2 text-xs">
                                <summary className="cursor-pointer text-muted-foreground">
                                  Metadata
                                </summary>
                                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
                                  {metadata}
                                </pre>
                              </details>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.entityType || log.entityId ? (
                            <div className="space-y-1">
                              <div>{log.entityType || "Entity"}</div>
                              <div className="break-all font-mono text-xs text-muted-foreground">
                                {log.entityId}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
