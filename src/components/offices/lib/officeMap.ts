import { getBaseNoSlash } from "@lib/baseUrl";
import { escapeHtml } from "@lib/sanitize";

let map: any = null;
let isInitializing = false;
let regionsDataCache: any[] = [];

export function invalidateMapSize(): void {
  if (map) {
    map.invalidateSize();
  }
}

export function toggleRegionReferents(
  regionId: string,
  toggleBtn: HTMLButtonElement,
): void {
  const collapseContent = document.querySelector(
    `.referents-collapse-content[data-region-id="${regionId}"]`,
  ) as HTMLElement | null;
  if (!collapseContent) return;

  const isHidden = collapseContent.classList.contains("hidden");

  if (isHidden) {
    const openCollapses = document.querySelectorAll(
      ".referents-collapse-content:not(.hidden)",
    );
    openCollapses.forEach((el) => {
      el.classList.add("hidden");
      const rId = el.getAttribute("data-region-id");
      if (rId) {
        const btn = document.querySelector(
          `.btn-toggle-referents[data-region-id="${rId}"]`,
        );
        if (btn) {
          btn.setAttribute("aria-expanded", "false");
          const openIcon = btn.querySelector("[data-chevron-open]");
          const closedIcon = btn.querySelector("[data-chevron-closed]");
          openIcon?.classList.add("hidden");
          closedIcon?.classList.remove("hidden");
        }
      }
    });

    collapseContent.classList.remove("hidden");
    toggleBtn.setAttribute("aria-expanded", "true");
    const openIcon = toggleBtn.querySelector("[data-chevron-open]");
    const closedIcon = toggleBtn.querySelector("[data-chevron-closed]");
    openIcon?.classList.remove("hidden");
    closedIcon?.classList.add("hidden");
    renderRegionDetailsInline(regionId);
  } else {
    collapseContent.classList.add("hidden");
    toggleBtn.setAttribute("aria-expanded", "false");
    const openIcon = toggleBtn.querySelector("[data-chevron-open]");
    const closedIcon = toggleBtn.querySelector("[data-chevron-closed]");
    openIcon?.classList.add("hidden");
    closedIcon?.classList.remove("hidden");
  }
}

export function renderRegionDetailsInline(regionId: string): void {
  const collapseContent = document.querySelector(
    `.referents-collapse-content[data-region-id="${regionId}"]`,
  ) as HTMLElement | null;
  if (!collapseContent) return;

  const listContainer = collapseContent.querySelector(
    ".referents-list-container",
  ) as HTMLElement | null;
  if (!listContainer) return;

  const region = regionsDataCache.find((r) => r.id === regionId);
  if (!region) return;

  const techMembers = region.techMembers;
  const referents = region.referents;

  if (Array.isArray(techMembers) && techMembers.length > 0) {
    listContainer.innerHTML = `
      <ul class="list-disc list-inside space-y-1">
        ${techMembers
          .map(
            (m: any) => `
          <li class="text-xs font-medium text-base-content">${escapeHtml(m.name)}</li>
        `,
          )
          .join("")}
      </ul>
    `;
  } else if (referents && referents.length > 0) {
    listContainer.innerHTML = `
      <ul class="list-disc list-inside space-y-1">
        ${referents
          .map(
            (ref: any) => `
          <li class="text-xs font-medium text-base-content">${escapeHtml(ref.firstName)} ${escapeHtml(ref.lastName)}</li>
        `,
          )
          .join("")}
      </ul>
    `;
  } else {
    listContainer.innerHTML = `<p class="text-xs text-base-content/60 italic">Sin técnicos asignados</p>`;
  }
}

export async function initializeMap(): Promise<void> {
  if (map || isInitializing) return;
  if (!document.getElementById("mapa-sucursales")) return;

  isInitializing = true;
  try {
    const L = (await import("leaflet")).default;
  const { feature } = (await import("topojson-client")) as any;

  let dataMap: any[] = [];
  let provincesData: Record<string, any[]> = {};
  const regionColorMap: Record<string, string> = {};

  try {
    const baseUrl = getBaseNoSlash();
    const mapRes = await fetch(`${baseUrl}/api/offices-map-data`);
    if (mapRes.ok) {
      const json = await mapRes.json();
      dataMap = json.sucursales || [];
      provincesData = json.provincesByRegion || {};
      regionsDataCache = json.regions || [];
      for (const r of json.regions || []) {
        regionColorMap[r.name] = r.color;
      }
    }

    fetch(`${baseUrl}/api/invgate/region-tech-members`)
      .then((res) => (res.ok ? res.json() : null))
      .then((techJson) => {
        if (!techJson) return;
        const membersByRegion = new Map(
          (techJson.regions || []).map((r: any) => [r.regionId, r.members]),
        );
        for (const r of regionsDataCache) {
          r.techMembers = membersByRegion.get(r.id) || [];
        }
        document
          .querySelectorAll<HTMLElement>(
            ".referents-collapse-content:not(.hidden)",
          )
          .forEach((el) => {
            const rid = el.getAttribute("data-region-id");
            if (rid) renderRegionDetailsInline(rid);
          });
      })
      .catch((err) => {
        console.error("Error fetching tech members:", err);
      });
  } catch (err) {
    console.error("Error fetching map data:", err);
  }

  const provinceToRegion: Record<string, string> = {};
  for (const [regionName, provs] of Object.entries(provincesData)) {
    for (const p of provs as any[]) {
      provinceToRegion[p.name] = regionName;
    }
  }

  const normalizeProvinceName = (geoName: string) => {
    if (geoName === "Tierra del Fuego, Antártida e Islas del Atlántico Sur")
      return "Tierra del Fuego";
    if (geoName === "Ciudad Autónoma de Buenos Aires") return "CABA";
    return geoName;
  };

  const getRegionColor = (provinceName: string) => {
    const dbName = normalizeProvinceName(provinceName);
    const region = provinceToRegion[dbName];
    return regionColorMap[region] || "#7F8C8D";
  };

  const bounds = [
    [-56.0, -74.0],
    [-21.0, -53.0],
  ];

  if (!document.getElementById("mapa-sucursales") || map) return;

  map = L.map("mapa-sucursales", {
    maxBounds: bounds as any,
    maxBoundsViscosity: 1.0,
  }).setView([-38.5, -64.0], 4);

  L.tileLayer(
    "https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png",
    {
      maxZoom: 18,
      minZoom: 3,
    },
  ).addTo(map);

  const grupoPoligonos = L.layerGroup().addTo(map);
  const grupoEtiquetas = L.layerGroup().addTo(map);
  const grupoSucursales = L.layerGroup().addTo(map);

  const regionLayers: Record<string, any[]> = {};

  const chkPolygons = document.getElementById(
    "chk-polygons",
  ) as HTMLInputElement | null;
  const chkLabels = document.getElementById(
    "chk-labels",
  ) as HTMLInputElement | null;

  if (chkPolygons) {
    chkPolygons.addEventListener("change", () => {
      if (chkPolygons.checked) {
        map.addLayer(grupoPoligonos);
      } else {
        map.removeLayer(grupoPoligonos);
      }
    });
  }

  if (chkLabels) {
    chkLabels.addEventListener("change", () => {
      if (chkLabels.checked) {
        map.addLayer(grupoEtiquetas);
        setTimeout(updateLabelsScale, 0);
      } else {
        map.removeLayer(grupoEtiquetas);
      }
    });
  }

  function updateLabelsScale() {
    const z = map.getZoom();
    let scale = 0;
    let opacity = 0;
    if (z >= 5) {
      scale = Math.min(Math.max(0.45, (z - 5) * 0.2 + 0.45), 0.8);
      opacity = z >= 6 ? 0.9 : 0.7;
    }
    document.querySelectorAll<HTMLElement>(".polygon-label").forEach((el) => {
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
      el.style.opacity = opacity.toString();
      el.style.pointerEvents = scale > 0.3 ? "auto" : "none";
      el.style.visibility = z < 5 ? "hidden" : "visible";
    });
  }
  map.on("zoomend", updateLabelsScale);
  map.on("zoom", updateLabelsScale);

  const sucursalMarkerIcon = L.divIcon({
    className: "bg-transparent",
    html: `
          <div class="relative group cursor-pointer animate-fade-in" style="margin-top: -10px; margin-left: -10px;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" 
                 class="w-10 h-10 transition-transform hover:scale-110 text-secondary drop-shadow-lg"
                 style="filter: drop-shadow(0 4px 4px rgba(0,0,0,0.4));">
              <path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
          </div>
        `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -38],
  });

  const provinceLetters: Record<string, string> = {
    "Ciudad Autónoma de Buenos Aires": "C",
    "Buenos Aires": "B",
    Catamarca: "K",
    Chaco: "H",
    Chubut: "U",
    Córdoba: "X",
    Corrientes: "W",
    "Entre Ríos": "E",
    Formosa: "P",
    Jujuy: "Y",
    "La Pampa": "L",
    "La Rioja": "F",
    Mendoza: "M",
    Misiones: "N",
    Neuquén: "Q",
    "Río Negro": "R",
    Salta: "A",
    "San Juan": "J",
    "San Luis": "D",
    "Santa Cruz": "Z",
    "Santa Fe": "S",
    "Santiago del Estero": "G",
    "Tierra del Fuego, Antártida e Islas del Atlántico Sur": "V",
    Tucumán: "T",
  };

  const labelOverrides: Record<string, [number, number]> = {
    "Santa Fe": [-30.8, -61.6],
    "Buenos Aires": [-36.8, -60.1],
    "Tierra del Fuego, Antártida e Islas del Atlántico Sur": [-54.3, -67.0],
  };

  fetch(`${getBaseNoSlash()}/data/argentina_provincias.topojson`)
    .then((res) => res.json())
    .then((topoData) => {
      const geoData = feature(
        topoData,
        topoData.objects.argentina_provincias,
      );
      L.geoJSON(geoData, {
        style: function (featureItem: any) {
          const name = featureItem.properties.nombre;
          const color = getRegionColor(name);
          return {
            color: color,
            weight: 1.5,
            fillColor: color,
            fillOpacity:
              name === "Ciudad Autónoma de Buenos Aires" ? 0.35 : 0.15,
          };
        },
        onEachFeature: function (featureItem: any, layer: any) {
          const name = featureItem.properties.nombre;
          const dbName = normalizeProvinceName(name);
          const regionName = provinceToRegion[dbName] || "Sin región";
          if (!regionLayers[regionName]) regionLayers[regionName] = [];
          regionLayers[regionName].push(layer);
          const color = getRegionColor(name);
          layer.bindPopup(
            `<div class='text-center p-1'><b style='color: ${color};'>${escapeHtml(name)}</b><br/><span class='text-xs text-base-content/60'>${escapeHtml(regionName)}</span></div>`,
            { className: "custom-popup" },
          );

          const letter = provinceLetters[name];
          if (letter) {
            const centroid = featureItem.properties.centroide;
            const pos = labelOverrides[name] || [centroid.lat, centroid.lon];
            const color = getRegionColor(name);
            let fontSize = "3.5rem";
            if (letter === "C") fontSize = "2rem";
            if (["B", "S", "X"].includes(letter)) fontSize = "4.2rem";
            L.marker(pos as any, {
              icon: L.divIcon({
                className: "bg-transparent",
                html: `<div class="polygon-label font-black text-secondary opacity-80 pointer-events-none transition-all duration-300" style="transform: translate(-50%, -50%); line-height: 1; color: ${color}; font-size: ${fontSize};">${letter}</div>`,
                iconSize: [0, 0],
              }),
              interactive: false,
            }).addTo(grupoEtiquetas);
          }
        },
      }).addTo(grupoPoligonos);
      updateLabelsScale();

      const legendEl = document.getElementById("map-legend");
      if (legendEl) {
        const highlightRegion = (
          regionName: string | undefined,
          highlight: boolean,
        ) => {
          if (!regionName || !regionLayers[regionName]) return;
          regionLayers[regionName].forEach((layer: any) => {
            if (highlight) {
              layer.setStyle({ fillOpacity: 0.45, weight: 2.5 });
              if (map && map.hasLayer(layer)) {
                layer.bringToFront();
              }
            } else {
              const name = layer.feature?.properties?.nombre;
              const opacity =
                name === "Ciudad Autónoma de Buenos Aires" ? 0.35 : 0.15;
              layer.setStyle({ fillOpacity: opacity, weight: 1.5 });
            }
          });
        };

        legendEl.addEventListener("mouseover", (e) => {
          const item = (e.target as HTMLElement).closest(
            ".legend-item-group",
          );
          if (!item) return;
          highlightRegion(
            item.getAttribute("data-region") ?? undefined,
            true,
          );
        });

        legendEl.addEventListener("mouseout", (e) => {
          const item = (e.target as HTMLElement).closest(
            ".legend-item-group",
          );
          if (!item) return;
          highlightRegion(
            item.getAttribute("data-region") ?? undefined,
            false,
          );
        });

        legendEl.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;

          const toggleBtn = target.closest(".btn-toggle-referents");
          if (toggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            const regionId = toggleBtn.getAttribute("data-region-id");
            if (regionId) {
              toggleRegionReferents(regionId, toggleBtn as HTMLButtonElement);
            }
            return;
          }

          if (target.closest(".referents-collapse-content")) {
            return;
          }

          const item = target.closest(".legend-item-group");
          if (!item) return;
          const regionName = item.getAttribute("data-region");
          if (!regionName || !regionLayers[regionName]) return;

          if (chkPolygons && !chkPolygons.checked) {
            chkPolygons.checked = true;
            chkPolygons.dispatchEvent(new Event("change"));
          }

          const group = L.featureGroup(regionLayers[regionName]);
          map.fitBounds(group.getBounds(), { padding: [40, 40] });
        });
      }
    });

  dataMap.forEach((sucursal: any) => {
    const { lat, lng, nombre, nis, direccion } = sucursal;
    const popupContent = `<div class="px-1 py-1 min-w-56"><div class="border-b border-base-300 pb-2 mb-2"><h3 class="font-bold text-base-content text-sm m-0">${escapeHtml(nombre || "")}</h3><span class="inline-block mt-1.5 px-2 py-0.5 bg-primary/10 text-primary text-xs font-black rounded uppercase tracking-wider">NIS: ${escapeHtml(nis || "")}</span></div><div class="text-xs text-base-content/85 space-y-1.5"><div class="flex flex-col gap-0.5"><span class="font-semibold text-base-content/60">Dirección</span><span class="text-base-content/90 font-medium">${escapeHtml(direccion || "")}</span></div></div></div>`;
    L.marker([lat, lng], { icon: sucursalMarkerIcon })
      .addTo(grupoSucursales)
      .bindPopup(popupContent, { className: "custom-popup" });
  });
  } finally {
    isInitializing = false;
  }
}
