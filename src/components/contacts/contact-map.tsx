"use client";

import type { LayerGroup, Map as LeafletMap } from "leaflet";
import {
  circleMarker,
  map as createMap,
  latLngBounds,
  layerGroup,
  tileLayer,
} from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import type { ContactRow } from "@/components/table/contact-columns";
import { Card } from "@/components/ui/card";

type ContactMapProps = {
  contacts: ContactRow[];
};

type ContactPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
};

const DEFAULT_CENTER: [number, number] = [52.52, 13.405];

const getBounds = (points: ContactPoint[]) => {
  const bounds = latLngBounds(
    points.map((point) => [point.latitude, point.longitude]),
  );
  return bounds;
};

export default function ContactMap({ contacts }: ContactMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const points = useMemo<ContactPoint[]>(() => {
    return contacts
      .filter(
        (contact) =>
          typeof contact.latitude === "number" &&
          typeof contact.longitude === "number",
      )
      .map((contact) => ({
        id: contact.id,
        name: contact.name,
        latitude: contact.latitude as number,
        longitude: contact.longitude as number,
        city: contact.city,
        country: contact.country,
        postalCode: contact.postalCode,
      }));
  }, [contacts]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    if ("_leaflet_id" in container) {
      (container as { _leaflet_id?: number })._leaflet_id = undefined;
    }

    const mapInstance = createMap(container, {
      center: DEFAULT_CENTER,
      zoom: 5,
      scrollWheelZoom: true,
    });
    mapRef.current = mapInstance;

    tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstance);

    return () => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      const container = map.getContainer();
      map.off();
      map.remove();
      if (container && "_leaflet_id" in container) {
        (container as { _leaflet_id?: number })._leaflet_id = undefined;
      }
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  const bounds = useMemo(() => {
    return points.length > 0 ? getBounds(points) : null;
  }, [points]);
  const popupLocations = useMemo(() => {
    return new Map(
      points.map((point) => [
        point.id,
        [point.postalCode, point.city, point.country]
          .filter(Boolean)
          .join(" - ") || "Location unknown",
      ]),
    );
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds || points.length === 0) {
      return;
    }

    if (layerRef.current) {
      layerRef.current.clearLayers();
      layerRef.current.remove();
    }

    const group = layerGroup();
    points.forEach((point) => {
      const location = popupLocations.get(point.id) ?? "Location unknown";
      const marker = circleMarker([point.latitude, point.longitude], {
        radius: 6,
        color: "hsl(212 100% 45%)",
        fillColor: "hsl(212 100% 45%)",
        fillOpacity: 0.85,
        weight: 2,
      });
      marker.bindPopup(
        `<div style="font-size: 0.875rem; line-height: 1.25rem;">
           <a href="./contacts/${encodeURIComponent(point.id)}/edit" style="font-weight: 600; text-decoration: underline;">
             ${escapeHtml(point.name)}
           </a>
           <div style="font-size: 0.75rem; color: hsl(215 15% 45%); margin-top: 0.25rem;">
             ${escapeHtml(location)}
           </div>
         </div>`,
      );
      marker.addTo(group);
    });

    group.addTo(map);
    layerRef.current = group;
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [bounds, points, popupLocations]);

  if (points.length === 0) {
    return (
      <Card className="flex min-h-[360px] items-center justify-center border-dashed">
        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <div>No contacts with location data yet.</div>
          <div>Add postal code and country on a contact to show them here.</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/20">
      <div ref={containerRef} className="h-[520px] w-full" />
    </div>
  );
}

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};
