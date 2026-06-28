import { db } from "@db/index";
import type {
  OfficeDirectoryItem,
  OfficeAssetType,
  OfficeType,
} from "@types/offices";

export async function getAllOfficesFromDB(): Promise<
  OfficeDirectoryItem[]
> {
  const dbOffices = await db.query.offices.findMany({
    orderBy: (offices, { asc }) => [asc(offices.code), asc(offices.name)],
    with: {
      assets: true,
      contacts: { with: { contact: true } },
      province: { with: { region: true } },
    },
  });

  return dbOffices.map((office) => ({
    id: `office-${office.code.toLowerCase()}`,
    dbId: office.id,
    type: office.type as OfficeType,
    code: office.code,
    name: office.name,
    provinceCode: office.provinceCode,
    provinceName: office.province?.name ?? "",
    location: office.province?.name ?? "",
    costCenter: [
      office.cctAdminOffice,
      office.ccCommercial,
      office.ccCommercialCorp,
      office.ccElectoral,
      office.ccNetworkMgmt,
      office.ccOperations,
      office.ccOperational,
      office.ccHr,
      office.ccSecurity,
      office.ccAdmin,
      office.ccAdmission,
      office.ccCtp,
      office.ccCtt,
      office.ccTransport,
      office.ccLogistics
    ].find((val) => val && val.trim() !== "") || "—",
    postalCode: "",
    region: office.province?.region?.name ?? "",
    address: office.address ?? "",
    email: office.email ?? "",
    notes: office.notes ?? "",
    officeType: office.officeType,
    parentNis: office.parentNis,
    contacts: office.contacts.map((oc) => ({
      name: oc.contact.name,
      phone: oc.contact.phone ?? "",
      timeSlot: oc.timeSlot ?? "",
    })),
    assets: office.assets.map((a) => ({
      type: a.type as OfficeAssetType,
      hostname: a.hostname ?? "",
      ip: a.ip ?? "",
    })),
  }));
}

export async function getOfficeDirectoryItems(): Promise<
  OfficeDirectoryItem[]
> {
  const allItems = await getAllOfficesFromDB();

  return allItems.sort((a, b) => {
    const codeComp = a.code.localeCompare(b.code, undefined, { numeric: true });
    if (codeComp !== 0) return codeComp;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}
