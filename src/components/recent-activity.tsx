"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Building,
  CreditCard,
  DollarSign,
  FileText,
  Users,
} from "lucide-react";
import useSWR from "swr";
import { Loader } from "@/components/helper/loader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ActivityItem {
  id: string;
  type: "user" | "organization" | "funding_request" | "transaction" | "file";
  action: "created" | "updated";
  title: string;
  description: string;
  timestamp: string;
  entityId: string;
}

export type ActivityScope = "admin" | "team" | "organization";

interface RecentActivityProps {
  scope?: ActivityScope;
  scopeId?: string;
  title?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const activityIcons = {
  user: Users,
  organization: Building,
  funding_request: DollarSign,
  transaction: CreditCard,
  file: FileText,
};

const activityColors = {
  user: "bg-blue-500",
  organization: "bg-green-500",
  funding_request: "bg-yellow-500",
  transaction: "bg-purple-500",
  file: "bg-gray-500",
};

export default function RecentActivity({
  scope = "admin",
  scopeId,
  title = "Recent Activity",
}: RecentActivityProps) {
  // Build API URL based on scope
  const getApiUrl = () => {
    switch (scope) {
      case "team":
        return scopeId
          ? `/api/teams/${scopeId}/recent-activity`
          : "/api/admin/recent-activity";
      case "organization":
        return scopeId
          ? `/api/organizations/${scopeId}/recent-activity`
          : "/api/admin/recent-activity";
      default:
        return "/api/admin/recent-activity";
    }
  };

  const { data, error, isLoading } = useSWR(getApiUrl(), fetcher);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center py-8">
            <Loader className={""} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 py-8">
            Error loading recent activity
          </div>
        </CardContent>
      </Card>
    );
  }

  const activities: ActivityItem[] = data?.activities || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No recent activity to display
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type];
              const colorClass = activityColors[activity.type];

              return (
                <div key={activity.id} className="flex items-start space-x-3">
                  <div className={`p-2 rounded-full ${colorClass} text-white`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {activity.title}
                      </p>
                      <Badge
                        variant={
                          activity.action === "created"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {activity.action}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(activity.timestamp), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
