import { invgateGet } from "../src/lib/invgateClient";

async function main() {
  const locationId = 3895;

  console.log(`\n=== Fetching locations.users?id=${locationId} ===`);
  const locResult = await invgateGet<any>(`locations.users?id=${locationId}`);
  console.log("ok:", locResult.ok);
  console.log("status:", locResult.status);
  if (!locResult.ok) {
    console.log("error:", (locResult as any).message);
    return;
  }

  const data = (locResult as any).data;
  console.log("data type:", typeof data, Array.isArray(data) ? "array" : "not-array");
  console.log("data keys:", data ? Object.keys(data) : "null");
  console.log("data sample (first 2):", JSON.stringify(Array.isArray(data) ? data.slice(0, 2) : data).substring(0, 2000));

  let rawUsers: any[] = [];
  if (Array.isArray(data)) {
    rawUsers = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.users)) rawUsers = data.users;
    else if (Array.isArray(data.data)) rawUsers = data.data;
  }

  console.log(`\nrawUsers count: ${rawUsers.length}`);
  if (rawUsers.length > 0) {
    const first = rawUsers[0];
    console.log("first item type:", typeof first, Array.isArray(first) ? "array" : "");
    console.log("first item value:", JSON.stringify(first).substring(0, 500));

    const isIdOnly = typeof first === "number" || typeof first === "string" ||
      (typeof first === "object" && first !== null && !("role_name" in first) && "id" in first);
    console.log("isIdOnly:", isIdOnly);

    if (isIdOnly && typeof first === "object") {
      console.log("Fetching single user by id...");
      const usrResult = await invgateGet<any>(`user?id=${first.id}`);
      if (usrResult.ok) {
        console.log("user data:", JSON.stringify((usrResult as any).data).substring(0, 1000));
      } else {
        console.log("user fetch error:", (usrResult as any).message);
      }
    }
  }
}

main().catch(console.error);
