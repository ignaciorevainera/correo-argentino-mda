import { db } from "@db/index";
import type {
  OfficeDirectoryItem,
  OfficeAssetType,
} from "@/data/directorio_oficinas";

export async function getTelegrafiaOfficesFromDB(): Promise<
  OfficeDirectoryItem[]
> {
  const dbOffices = await db.query.offices.findMany({
    where: (offices, { eq }) => eq(offices.type, "telegrafia"),
    orderBy: (offices, { asc }) => [asc(offices.code), asc(offices.name)],
    with: {
      assets: true,
      contacts: { with: { contact: true } },
      province: { with: { region: true } },
    },
  });

  return dbOffices.map((office) => ({
    id: `teleg-${office.code.toLowerCase()}`,
    type: "telegrafia" as const,
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
