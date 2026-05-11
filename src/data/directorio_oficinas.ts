export type OfficeType =
  | "comercial"
  | "telegrafia"
  | "distribucion"
  | "paqueteria";

export type OfficeAssetType = "server" | "printer" | "desktop" | "client";

export interface OfficeContact {
  name: string;
  timeSlot: string;
  phone: string;
}

export interface OfficeAsset {
  type: OfficeAssetType;
  hostname: string;
  ip: string;
  status?: "online";
}

export interface OfficeDirectoryItem {
  id: string;
  type: OfficeType;
  code: string;
  name: string;
  location: string;
  costCenter: string;
  postalCode: string;
  region: string;
  address: string;
  email: string;
  notes: string;
  contacts: OfficeContact[];
  assets: OfficeAsset[];
}

type OfficeDirectoryBaseItem = Omit<
  OfficeDirectoryItem,
  "costCenter" | "postalCode" | "email" | "notes"
>;

const officeDirectoryBaseItems: OfficeDirectoryBaseItem[] = [
  {
    id: "of-001",
    type: "comercial",
    code: "COM-001",
    name: "Sucursal Microcentro",
    location: "CABA - Microcentro",
    region: "AMBA",
    address: "Av. Corrientes 1312, Ciudad Autonoma de Buenos Aires",
    contacts: [
      {
        name: "Mariana Duarte",
        timeSlot: "08:00 a 16:00",
        phone: "011 4321-1122",
      },
      {
        name: "Pablo Carrizo",
        timeSlot: "12:00 a 20:00",
        phone: "011 4321-1130",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-com001-core",
        ip: "10.20.1.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-com001-atencion",
        ip: "10.20.1.41",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com001-jefatura",
        ip: "10.20.1.72",
        status: "online",
      },
    ],
  },
  {
    id: "of-002",
    type: "comercial",
    code: "COM-014",
    name: "Sucursal San Isidro",
    location: "San Isidro",
    region: "Buenos Aires Norte",
    address: "Belgrano 318, San Isidro, Buenos Aires",
    contacts: [
      {
        name: "Adrian Ferreyra",
        timeSlot: "08:00 a 14:00",
        phone: "011 4743-1820",
      },
      {
        name: "Micaela Benitez",
        timeSlot: "14:00 a 20:00",
        phone: "011 4743-1828",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-com014-sucursal",
        ip: "10.20.14.12",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-com014-ventanilla",
        ip: "10.20.14.32",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com014-backoffice",
        ip: "10.20.14.66",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com014-cajas",
        ip: "10.20.14.67",
        status: "online",
      },
    ],
  },
  {
    id: "of-009",
    type: "comercial",
    code: "COM-027",
    name: "Sucursal Mar del Plata Centro",
    location: "Mar del Plata Centro",
    region: "Costa Atlantica",
    address: "San Martin 2541, Mar del Plata, Buenos Aires",
    contacts: [
      {
        name: "Valeria Ledesma",
        timeSlot: "08:00 a 16:00",
        phone: "0223 495-7710",
      },
      {
        name: "Javier Sarmiento",
        timeSlot: "10:00 a 18:00",
        phone: "0223 495-7718",
      },
      {
        name: "Cintia Robles",
        timeSlot: "12:00 a 20:00",
        phone: "0223 495-7721",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-com027-core",
        ip: "10.20.27.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-com027-mostrador",
        ip: "10.20.27.35",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-com027-backoffice",
        ip: "10.20.27.36",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com027-supervision",
        ip: "10.20.27.61",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com027-atencion-01",
        ip: "10.20.27.62",
        status: "online",
      },
    ],
  },
  {
    id: "of-003",
    type: "telegrafia",
    code: "TEL-003",
    name: "Telegrafia Retiro",
    location: "CABA - Retiro",
    region: "AMBA",
    address: "Ramos Mejia 1358, Ciudad Autonoma de Buenos Aires",
    contacts: [
      {
        name: "Lucia Peralta",
        timeSlot: "09:00 a 17:00",
        phone: "011 4310-2201",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-tel003-msg",
        ip: "10.30.3.12",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-tel003-operador",
        ip: "10.30.3.51",
        status: "online",
      },
    ],
  },
  {
    id: "of-004",
    type: "telegrafia",
    code: "TEL-021",
    name: "Telegrafia La Plata",
    location: "La Plata",
    region: "Buenos Aires Sur",
    address: "Calle 49 738, La Plata, Buenos Aires",
    contacts: [
      {
        name: "Ruben Sosa",
        timeSlot: "07:00 a 15:00",
        phone: "0221 429-7100",
      },
      {
        name: "Natalia Gomez",
        timeSlot: "15:00 a 21:00",
        phone: "0221 429-7108",
      },
      {
        name: "Paula Iturbe",
        timeSlot: "09:00 a 17:00",
        phone: "0221 429-7115",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-tel021-mensajeria",
        ip: "10.30.21.15",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-tel021-operador-01",
        ip: "10.30.21.54",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-tel021-operador-02",
        ip: "10.30.21.55",
        status: "online",
      },
    ],
  },
  {
    id: "of-010",
    type: "telegrafia",
    code: "TEL-034",
    name: "Telegrafia Tucuman",
    location: "San Miguel de Tucuman",
    region: "NOA",
    address: "San Martin 812, San Miguel de Tucuman, Tucuman",
    contacts: [
      {
        name: "Ricardo Funes",
        timeSlot: "07:00 a 13:00",
        phone: "0381 450-2204",
      },
      {
        name: "Eliana Paz",
        timeSlot: "13:00 a 19:00",
        phone: "0381 450-2209",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-tel034-core",
        ip: "10.30.34.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-tel034-despacho",
        ip: "10.30.34.31",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-tel034-operador",
        ip: "10.30.34.52",
        status: "online",
      },
    ],
  },
  {
    id: "of-005",
    type: "distribucion",
    code: "DIS-008",
    name: "Centro de Distribucion Barracas",
    location: "CABA - Barracas",
    region: "AMBA Logistica",
    address: "Av. Australia 2800, Barracas, Ciudad Autonoma de Buenos Aires",
    contacts: [
      {
        name: "Diego Molinari",
        timeSlot: "06:00 a 14:00",
        phone: "011 4302-4410",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-dis008-wms",
        ip: "10.40.8.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-dis008-etiquetas",
        ip: "10.40.8.34",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis008-despacho",
        ip: "10.40.8.59",
        status: "online",
      },
    ],
  },
  {
    id: "of-006",
    type: "distribucion",
    code: "DIS-019",
    name: "Planta Operativa Rosario",
    location: "Rosario",
    region: "Litoral",
    address: "Av. Ovidio Lagos 4625, Rosario, Santa Fe",
    contacts: [
      {
        name: "Federico Mena",
        timeSlot: "06:00 a 14:00",
        phone: "0341 462-9011",
      },
      {
        name: "Paola Ibarra",
        timeSlot: "14:00 a 22:00",
        phone: "0341 462-9019",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-dis019-core",
        ip: "10.40.19.11",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-dis019-remitos",
        ip: "10.40.19.38",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis019-logistica",
        ip: "10.40.19.56",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis019-monitoreo",
        ip: "10.40.19.57",
        status: "online",
      },
    ],
  },
  {
    id: "of-011",
    type: "distribucion",
    code: "DIS-031",
    name: "Centro Logistico Neuquen",
    location: "Neuquen",
    region: "Patagonia",
    address: "Ruta 22 Km 1237, Neuquen",
    contacts: [
      {
        name: "Leandro Farias",
        timeSlot: "05:00 a 13:00",
        phone: "0299 448-7101",
      },
      {
        name: "Rocio Mendez",
        timeSlot: "13:00 a 21:00",
        phone: "0299 448-7107",
      },
      {
        name: "Gabriel Ocampo",
        timeSlot: "21:00 a 05:00",
        phone: "0299 448-7112",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-dis031-core",
        ip: "10.40.31.10",
        status: "online",
      },
      {
        type: "server",
        hostname: "srv-dis031-wms",
        ip: "10.40.31.11",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-dis031-picking",
        ip: "10.40.31.33",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-dis031-expedicion",
        ip: "10.40.31.34",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis031-supervision",
        ip: "10.40.31.58",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis031-turno-noche",
        ip: "10.40.31.59",
        status: "online",
      },
    ],
  },
  {
    id: "of-007",
    type: "paqueteria",
    code: "PAQ-006",
    name: "Paqueteria Cordoba",
    location: "Cordoba Capital",
    region: "Centro",
    address: "Bv. San Juan 620, Cordoba",
    contacts: [
      {
        name: "Sofia Acosta",
        timeSlot: "08:00 a 16:00",
        phone: "0351 421-6020",
      },
      {
        name: "Matias Herrera",
        timeSlot: "16:00 a 22:00",
        phone: "0351 421-6025",
      },
    ],
    assets: [
      {
        type: "desktop",
        hostname: "pc-paq006-operaciones",
        ip: "10.50.6.44",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-paq006-zebra",
        ip: "10.50.6.47",
        status: "online",
      },
    ],
  },
  {
    id: "of-008",
    type: "paqueteria",
    code: "PAQ-012",
    name: "Nodo Paqueteria Mendoza",
    location: "Mendoza Capital",
    region: "Cuyo",
    address: "San Martin 1420, Mendoza",
    contacts: [
      {
        name: "Carolina Quiroga",
        timeSlot: "09:00 a 18:00",
        phone: "0261 429-8811",
      },
      {
        name: "Emiliano Ruiz",
        timeSlot: "12:00 a 20:00",
        phone: "0261 429-8819",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-paq012-core",
        ip: "10.50.12.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-paq012-etiquetas",
        ip: "10.50.12.39",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-paq012-operaciones",
        ip: "10.50.12.60",
        status: "online",
      },
    ],
  },
  {
    id: "of-012",
    type: "paqueteria",
    code: "PAQ-020",
    name: "Hub Paqueteria Salta",
    location: "Salta Capital",
    region: "NOA",
    address: "Av. Chile 1450, Salta",
    contacts: [
      {
        name: "Noelia Cruz",
        timeSlot: "08:00 a 16:00",
        phone: "0387 431-5502",
      },
      {
        name: "Damian Vega",
        timeSlot: "16:00 a 00:00",
        phone: "0387 431-5510",
      },
      {
        name: "Julieta Cardenas",
        timeSlot: "00:00 a 08:00",
        phone: "0387 431-5515",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-paq020-trazabilidad",
        ip: "10.50.20.12",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-paq020-sorter",
        ip: "10.50.20.41",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-paq020-carga",
        ip: "10.50.20.42",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-paq020-control-01",
        ip: "10.50.20.63",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-paq020-control-02",
        ip: "10.50.20.64",
        status: "online",
      },
    ],
  },
  {
    id: "of-013",
    type: "comercial",
    code: "COM-041",
    name: "Sucursal Lomas de Zamora",
    location: "Lomas de Zamora - Edificio Laprida 1246",
    region: "GBA Sur",
    address: "Laprida 1246, Lomas de Zamora, Buenos Aires",
    contacts: [
      {
        name: "Lorena Quiroz",
        timeSlot: "08:00 a 14:00",
        phone: "011 4244-8101",
      },
      {
        name: "Marcos Villalba",
        timeSlot: "14:00 a 20:00",
        phone: "011 4244-8108",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-com041-core",
        ip: "10.20.41.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-com041-cajas",
        ip: "10.20.41.35",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com041-atencion-01",
        ip: "10.20.41.60",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-com041-atencion-02",
        ip: "10.20.41.61",
        status: "online",
      },
    ],
  },
  {
    id: "of-014",
    type: "telegrafia",
    code: "TEL-041",
    name: "Telegrafia Lomas de Zamora",
    location: "Lomas de Zamora - Edificio Laprida 1246",
    region: "GBA Sur",
    address: "Laprida 1246, Piso 1, Lomas de Zamora, Buenos Aires",
    contacts: [
      {
        name: "Nadia Salvatierra",
        timeSlot: "07:00 a 13:00",
        phone: "011 4244-8120",
      },
      {
        name: "Julio Ferreyra",
        timeSlot: "13:00 a 19:00",
        phone: "011 4244-8126",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-tel041-mensajeria",
        ip: "10.30.41.10",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-tel041-despacho",
        ip: "10.30.41.33",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-tel041-operador-01",
        ip: "10.30.41.54",
        status: "online",
      },
    ],
  },
  {
    id: "of-015",
    type: "distribucion",
    code: "DIS-041",
    name: "CDD Lomas de Zamora",
    location: "Lomas de Zamora - Edificio Laprida 1246",
    region: "GBA Sur",
    address: "Laprida 1246, Contrafrente, Lomas de Zamora, Buenos Aires",
    contacts: [
      {
        name: "Gustavo Nieva",
        timeSlot: "06:00 a 14:00",
        phone: "011 4244-8142",
      },
      {
        name: "Yesica Toledo",
        timeSlot: "14:00 a 22:00",
        phone: "011 4244-8148",
      },
      {
        name: "Carlos Medina",
        timeSlot: "22:00 a 06:00",
        phone: "011 4244-8153",
      },
    ],
    assets: [
      {
        type: "server",
        hostname: "srv-dis041-core",
        ip: "10.40.41.10",
        status: "online",
      },
      {
        type: "server",
        hostname: "srv-dis041-wms",
        ip: "10.40.41.11",
        status: "online",
      },
      {
        type: "printer",
        hostname: "prt-dis041-remitos",
        ip: "10.40.41.37",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis041-monitoreo-01",
        ip: "10.40.41.58",
        status: "online",
      },
      {
        type: "desktop",
        hostname: "pc-dis041-monitoreo-02",
        ip: "10.40.41.59",
        status: "online",
      },
    ],
  },
  {
    id: "of-016",
    type: "comercial",
    code: "COM-055",
    name: "Sucursal Posadas",
    location: "Posadas Capital",
    region: "NEA",
    address: "Bolivar 2410, Posadas, Misiones",
    contacts: [
      {
        name: "Lilian Benitez",
        timeSlot: "08:00 a 16:00",
        phone: "0376 444-1234",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-com055-core", ip: "10.20.55.10", status: "online" },
      { type: "desktop", hostname: "pc-com055-caja1", ip: "10.20.55.41", status: "online" },
    ],
  },
  {
    id: "of-017",
    type: "telegrafia",
    code: "TEL-012",
    name: "Telegrafia Bahia Blanca",
    location: "Bahia Blanca",
    region: "Buenos Aires Sur",
    address: "Moreno 34, Bahia Blanca, Buenos Aires",
    contacts: [
      {
        name: "Esteban Quiroga",
        timeSlot: "07:00 a 15:00",
        phone: "0291 455-8800",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-tel012-msg", ip: "10.30.12.12", status: "online" },
      { type: "desktop", hostname: "pc-tel012-op", ip: "10.30.12.51", status: "online" },
    ],
  },
  {
    id: "of-018",
    type: "distribucion",
    code: "DIS-022",
    name: "Centro Logistico Santa Fe",
    location: "Santa Fe Capital",
    region: "Litoral",
    address: "Av. Peñaloza 5600, Santa Fe",
    contacts: [
      {
        name: "Marcelo Lopez",
        timeSlot: "06:00 a 14:00",
        phone: "0342 455-1122",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-dis022-wms", ip: "10.40.22.10", status: "online" },
      { type: "printer", hostname: "prt-dis022-rem", ip: "10.40.22.34", status: "online" },
    ],
  },
  {
    id: "of-019",
    type: "paqueteria",
    code: "PAQ-008",
    name: "Nodo Paqueteria Resistencia",
    location: "Resistencia",
    region: "NEA",
    address: "Sarmiento 120, Resistencia, Chaco",
    contacts: [
      {
        name: "Gisela Vargas",
        timeSlot: "08:00 a 18:00",
        phone: "0362 442-3344",
      },
    ],
    assets: [
      { type: "desktop", hostname: "pc-paq008-op", ip: "10.50.8.44", status: "online" },
    ],
  },
  {
    id: "of-020",
    type: "comercial",
    code: "COM-062",
    name: "Sucursal San Juan",
    location: "San Juan Capital",
    region: "Cuyo",
    address: "Av. Jose Ignacio de la Roza 223, San Juan",
    contacts: [
      {
        name: "Fabian Castro",
        timeSlot: "08:00 a 13:00",
        phone: "0264 421-1100",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-com062-core", ip: "10.20.62.10", status: "online" },
    ],
  },
  {
    id: "of-021",
    type: "telegrafia",
    code: "TEL-045",
    name: "Telegrafia San Luis",
    location: "San Luis Capital",
    region: "Cuyo",
    address: "Av. Illia 345, San Luis",
    contacts: [
      {
        name: "Beatriz Sosa",
        timeSlot: "09:00 a 17:00",
        phone: "0266 442-2211",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-tel045-msg", ip: "10.30.45.12", status: "online" },
    ],
  },
  {
    id: "of-022",
    type: "distribucion",
    code: "DIS-050",
    name: "CDD Avellaneda",
    location: "Avellaneda",
    region: "GBA Sur",
    address: "Av. Mitre 540, Avellaneda, Buenos Aires",
    contacts: [
      {
        name: "Ruben Martinez",
        timeSlot: "06:00 a 22:00",
        phone: "011 4222-3344",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-dis050-core", ip: "10.40.50.10", status: "online" },
    ],
  },
  {
    id: "of-023",
    type: "paqueteria",
    code: "PAQ-031",
    name: "Hub Paqueteria Corrientes",
    location: "Corrientes Capital",
    region: "NEA",
    address: "Av. 3 de Abril 1200, Corrientes",
    contacts: [
      {
        name: "Hugo Espinoza",
        timeSlot: "08:00 a 16:00",
        phone: "0379 443-3322",
      },
    ],
    assets: [
      { type: "printer", hostname: "prt-paq031-sorter", ip: "10.50.31.41", status: "online" },
    ],
  },
  {
    id: "of-024",
    type: "comercial",
    code: "COM-070",
    name: "Sucursal Ushuaia",
    location: "Ushuaia",
    region: "Patagonia",
    address: "San Martin 412, Ushuaia, Tierra del Fuego",
    contacts: [
      {
        name: "Karina Torres",
        timeSlot: "10:00 a 18:00",
        phone: "02901 422-1100",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-com070-core", ip: "10.20.70.10", status: "online" },
    ],
  },
  {
    id: "of-025",
    type: "telegrafia",
    code: "TEL-018",
    name: "Telegrafia Rio Gallegos",
    location: "Rio Gallegos",
    region: "Patagonia",
    address: "Av. Kirchner 812, Rio Gallegos, Santa Cruz",
    contacts: [
      {
        name: "Oscar Ruiz",
        timeSlot: "09:00 a 17:00",
        phone: "02966 422-3344",
      },
    ],
    assets: [
      { type: "desktop", hostname: "pc-tel018-op", ip: "10.30.18.51", status: "online" },
    ],
  },
  {
    id: "of-026",
    type: "distribucion",
    code: "DIS-012",
    name: "Planta Operativa Quilmes",
    location: "Quilmes",
    region: "GBA Sur",
    address: "Av. Hipolito Yrigoyen 245, Quilmes, Buenos Aires",
    contacts: [
      {
        name: "Micaela Ordoñez",
        timeSlot: "06:00 a 14:00",
        phone: "011 4253-1122",
      },
    ],
    assets: [
      { type: "server", hostname: "srv-dis012-core", ip: "10.40.12.10", status: "online" },
    ],
  },
  {
    id: "of-027",
    type: "paqueteria",
    code: "PAQ-015",
    name: "Nodo Paqueteria Formosa",
    location: "Formosa Capital",
    region: "NEA",
    address: "Av. 25 de Mayo 1100, Formosa",
    contacts: [
      {
        name: "Anibal Mendez",
        timeSlot: "08:00 a 16:00",
        phone: "0370 443-3344",
      },
    ],
    assets: [
      { type: "desktop", hostname: "pc-paq015-op", ip: "10.50.15.60", status: "online" },
    ],
  },
];

const officeSiteMetaById: Record<
  OfficeDirectoryBaseItem["id"],
  Pick<OfficeDirectoryItem, "costCenter" | "postalCode">
> = {
  "of-001": { costCenter: "CC-1102", postalCode: "1043" },
  "of-002": { costCenter: "CC-1214", postalCode: "1642" },
  "of-003": { costCenter: "CC-2303", postalCode: "1104" },
  "of-004": { costCenter: "CC-2321", postalCode: "1900" },
  "of-005": { costCenter: "CC-3408", postalCode: "1284" },
  "of-006": { costCenter: "CC-3419", postalCode: "2000" },
  "of-007": { costCenter: "CC-4506", postalCode: "5000" },
  "of-008": { costCenter: "CC-4512", postalCode: "5500" },
  "of-009": { costCenter: "CC-1227", postalCode: "7600" },
  "of-010": { costCenter: "CC-2334", postalCode: "4000" },
  "of-011": { costCenter: "CC-3431", postalCode: "8300" },
  "of-012": { costCenter: "CC-4520", postalCode: "4400" },
  "of-013": { costCenter: "CC-1241", postalCode: "1832" },
  "of-014": { costCenter: "CC-2341", postalCode: "1832" },
  "of-015": { costCenter: "CC-3441", postalCode: "1832" },
  "of-016": { costCenter: "CC-1155", postalCode: "3300" },
  "of-017": { costCenter: "CC-2312", postalCode: "8000" },
  "of-018": { costCenter: "CC-3422", postalCode: "3000" },
  "of-019": { costCenter: "CC-4508", postalCode: "3500" },
  "of-020": { costCenter: "CC-1162", postalCode: "5400" },
  "of-021": { costCenter: "CC-2345", postalCode: "5700" },
  "of-022": { costCenter: "CC-3450", postalCode: "1870" },
  "of-023": { costCenter: "CC-4531", postalCode: "3400" },
  "of-024": { costCenter: "CC-1170", postalCode: "9410" },
  "of-025": { costCenter: "CC-2318", postalCode: "9400" },
  "of-026": { costCenter: "CC-3412", postalCode: "1878" },
  "of-027": { costCenter: "CC-4515", postalCode: "3600" },
};

// Datos mock de oficinas no-telegráficas (con metadata completa)
const mockOfficeDirectoryItems: OfficeDirectoryItem[] =
  officeDirectoryBaseItems.map((office) => ({
    ...office,
    email: "",
    notes: "",
    ...officeSiteMetaById[office.id],
  }));

// Datos reales de oficinas telegráficas importados del CSV
import { mockTelegrafia } from "./mock_telegrafia";

const telegrafiaDirectoryItems: OfficeDirectoryItem[] = mockTelegrafia.map(
  (t) => ({
    id: t.id,
    type: "telegrafia" as const,
    code: t.code,
    name: t.name,
    location: t.region,
    costCenter: "",
    postalCode: "",
    region: t.region,
    address: t.address,
    email: t.email,
    notes: t.notes,
    contacts: t.contacts,
    assets: t.assets.map((a) => ({ ...a, status: "online" as const })),
  }),
);

// Combinar ambas fuentes: mock genérico + telegrafía real
// Filtrar las oficinas telegráficas de los datos mock para evitar duplicados
export const officeDirectoryItems: OfficeDirectoryItem[] = [
  ...mockOfficeDirectoryItems.filter((o) => o.type !== "telegrafia"),
  ...telegrafiaDirectoryItems,
];
