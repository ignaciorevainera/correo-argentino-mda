import "dotenv/config";

async function main() {
  const apiKey = process.env.INVGATE_API_KEY;
  const baseUrl = process.env.INVGATE_BASE_URL;
  const username = process.env.INVGATE_API_USERNAME || "portalmda";

  const credentials = btoa(username + ":" + apiKey);
  
  const headers = {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  async function get(path: string) {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    return await response.json();
  }

  console.log("Groups:");
  const groups = await get("groups");
  console.log("Groups count:", groups.length);
  
  if (groups.length > 0) {
    console.log("Sample group:", groups[0]);
    const group5478 = groups.find((g: any) => g.id === 5478);
    console.log("Group 5478:", group5478);
  }

}

main().catch(console.error);
