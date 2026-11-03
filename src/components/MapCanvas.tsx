"use client";

import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { SwapHub } from "@/data/mock";

export default function MapCanvas({ hubs, center }: { hubs: SwapHub[]; center: [number, number] }) {
  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapCenter center={center} />
      <CircleMarker center={center} radius={7} pathOptions={{ color: "var(--color-info)", fillColor: "var(--color-info)", fillOpacity: 1, weight: 5 }}>
        <Tooltip>Universitas Prasetiya Mulya</Tooltip>
      </CircleMarker>
      {hubs.map((hub) => (
        <Marker key={hub.id} position={hub.position} icon={divIcon({ className: "swap-hub-marker", html: '<span class="swap-hub-heart">♥</span>', iconSize: [34, 34], iconAnchor: [17, 17] })}>
          <Tooltip>
            <strong>{hub.name}</strong><br />{hub.distance}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 14, { duration: 0.75 });
  }, [center, map]);
  return null;
}
