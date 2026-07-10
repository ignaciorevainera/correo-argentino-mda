import "dotenv/config";
import pLimit from "p-limit";

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
    if (!response.ok) return null;
    return await response.json();
  }

  const locations = await get("locations");
  const populatedLocations = locations.filter((l: any) => l.total > 0);
  console.log(`Total locations: ${locations.length}`);
  console.log(`Populated locations: ${populatedLocations.length}`);

}

main().catch(console.error);
