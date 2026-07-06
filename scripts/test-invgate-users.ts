import "dotenv/config";

async function main() {
  const apiKey = process.env.INVGATE_API_KEY;
  const baseUrl = process.env.INVGATE_BASE_URL;
  const username = process.env.INVGATE_API_USERNAME || "portalmda";

  const credentials = btoa(username + ":" + apiKey);
  const url = `${baseUrl}users`;
  
  const headers = {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, { headers });
  const data = await response.json();
  
  const sample = data.filter((u: any) => u.office || u.city || u.department || u.location).slice(100, 115);
  
  console.log("| Usuario | `location` | `city` | `office` | `department` | Comb: `office` - `city` |");
  console.log("|---|---|---|---|---|---|");
  for (const u of sample) {
    const comb1 = [u.office, u.city].filter(Boolean).join(" - ");
    const name = `${u.name} ${u.lastname}`;
    console.log(`| ${name} | ${u.location || '-'} | ${u.city || '-'} | ${u.office || '-'} | ${u.department || '-'} | ${comb1 || '-'} |`);
  }
}

main().catch(console.error);
