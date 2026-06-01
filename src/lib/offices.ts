import { db } from "@db/index";
import type {
  OfficeDirectoryItem,
  OfficeAssetType,
  OfficeType,
} from "@/data/directorio_oficinas";

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
    costCenter: "",
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
