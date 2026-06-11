import { db } from "../src/db";
import { weekendOvertimeConfig, weekendOvertimeShifts, agents } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { GET as getConfig, POST as postConfig } from "../src/pages/api/cronograma/overtime/config";
import { GET as getShifts, POST as postShifts, DELETE as deleteShifts } from "../src/pages/api/cronograma/overtime/shifts";

async function runTests() {
  console.log("Starting weekend overtime API tests...");
  
  // 1. Get or create a valid agent ID
  const allAgents = await db.select().from(agents).limit(1);
  let agentId: number;
  let tempAgentCreated = false;

  if (allAgents.length > 0) {
    agentId = allAgents[0].id;
    console.log(`Using existing agent: ${allAgents[0].name} (ID: ${agentId})`);
  } else {
    console.log("No agents found, creating a temporary agent...");
    const result = await db.insert(agents).values({
      name: "Temp Test Agent",
      username: "temptestagent",
      location: "Monte Grande",
      horarioDefault: "08:00 - 17:00",
    }).returning({ id: agents.id });
    agentId = result[0].id;
    tempAgentCreated = true;
    console.log(`Created temporary agent ID: ${agentId}`);
  }

  const testWeekendStartDate = "2026-10-10";

  try {
    // ---- Test 1: GET Config (Should return default empty referente if not exists) ----
    console.log("\n--- Test 1: GET Config (not exists) ---");
    const getUrlNonExistent = new URL(`http://localhost/api/cronograma/overtime/config?weekendStartDate=${testWeekendStartDate}`);
    const getResNonExistent = await getConfig({ url: getUrlNonExistent } as any);
    const getDataNonExistent = await getResNonExistent.json();
    console.log("Response status:", getResNonExistent.status);
    console.log("Response body:", getDataNonExistent);
    if (getResNonExistent.status !== 200) throw new Error("Expected status 200");
    if (getDataNonExistent.referente !== "") throw new Error("Expected empty referente");

    // ---- Test 2: POST Config (Create new config) ----
    console.log("\n--- Test 2: POST Config (Create) ---");
    const postConfigReq = new Request("http://localhost/api/cronograma/overtime/config", {
      method: "POST",
      body: JSON.stringify({
        weekendStartDate: testWeekendStartDate,
        referente: "Arce Franco"
      })
    });
    const postConfigRes = await postConfig({ request: postConfigReq } as any);
    const postConfigData = await postConfigRes.json();
    console.log("Response status:", postConfigRes.status);
    console.log("Response body:", postConfigData);
    if (postConfigRes.status !== 200) throw new Error("Expected status 200");
    if (!postConfigData.success) throw new Error("Expected success true");

    // ---- Test 3: GET Config (Should return the created config) ----
    console.log("\n--- Test 3: GET Config (exists) ---");
    const getUrlExistent = new URL(`http://localhost/api/cronograma/overtime/config?weekendStartDate=${testWeekendStartDate}`);
    const getResExistent = await getConfig({ url: getUrlExistent } as any);
    const getDataExistent = await getResExistent.json();
    console.log("Response status:", getResExistent.status);
    console.log("Response body:", getDataExistent);
    if (getResExistent.status !== 200) throw new Error("Expected status 200");
    if (getDataExistent.referente !== "Arce Franco") throw new Error("Expected referente to be Arce Franco");

    // ---- Test 4: POST Config (Update existing config) ----
    console.log("\n--- Test 4: POST Config (Update) ---");
    const postConfigUpdateReq = new Request("http://localhost/api/cronograma/overtime/config", {
      method: "POST",
      body: JSON.stringify({
        weekendStartDate: testWeekendStartDate,
        referente: "Updated Referente Name"
      })
    });
    const postConfigUpdateRes = await postConfig({ request: postConfigUpdateReq } as any);
    const postConfigUpdateData = await postConfigUpdateRes.json();
    console.log("Response status:", postConfigUpdateRes.status);
    console.log("Response body:", postConfigUpdateData);
    if (postConfigUpdateRes.status !== 200) throw new Error("Expected status 200");

    // Verify update
    const getResUpdated = await getConfig({ url: getUrlExistent } as any);
    const getDataUpdated = await getResUpdated.json();
    console.log("Updated config in DB:", getDataUpdated);
    if (getDataUpdated.referente !== "Updated Referente Name") throw new Error("Expected updated referente");

    // ---- Test 5: GET Shifts (Should return empty array) ----
    console.log("\n--- Test 5: GET Shifts (empty) ---");
    const getShiftsUrl = new URL(`http://localhost/api/cronograma/overtime/shifts?weekendStartDate=${testWeekendStartDate}`);
    const getShiftsRes = await getShifts({ url: getShiftsUrl } as any);
    const getShiftsData = await getShiftsRes.json();
    console.log("Response status:", getShiftsRes.status);
    console.log("Response body:", getShiftsData);
    if (getShiftsRes.status !== 200) throw new Error("Expected status 200");
    if (!Array.isArray(getShiftsData) || getShiftsData.length !== 0) throw new Error("Expected empty shifts array");

    // ---- Test 6: POST Shifts (Create new shift) ----
    console.log("\n--- Test 6: POST Shifts (Create) ---");
    const postShiftReq = new Request("http://localhost/api/cronograma/overtime/shifts", {
      method: "POST",
      body: JSON.stringify({
        weekendStartDate: testWeekendStartDate,
        agentId,
        date: "2026-10-10",
        startTime: "09:00",
        endTime: "13:00"
      })
    });
    const postShiftRes = await postShifts({ request: postShiftReq } as any);
    const postShiftData = await postShiftRes.json();
    console.log("Response status:", postShiftRes.status);
    console.log("Response body:", postShiftData);
    if (postShiftRes.status !== 200) throw new Error("Expected status 200");
    if (!postShiftData.success) throw new Error("Expected success true");

    // ---- Test 7: GET Shifts (Should return the created shift) ----
    console.log("\n--- Test 7: GET Shifts (one shift) ---");
    const getShiftsRes2 = await getShifts({ url: getShiftsUrl } as any);
    const getShiftsData2 = await getShiftsRes2.json();
    console.log("Response status:", getShiftsRes2.status);
    console.log("Response body:", getShiftsData2);
    if (getShiftsRes2.status !== 200) throw new Error("Expected status 200");
    if (getShiftsData2.length !== 1) throw new Error("Expected exactly 1 shift");
    
    const createdShift = getShiftsData2[0];
    const createdShiftId = createdShift.id;
    if (createdShift.agentId !== agentId) throw new Error("Agent ID mismatch");
    if (createdShift.startTime !== "09:00") throw new Error("Start time mismatch");

    // ---- Test 8: POST Shifts (Update existing shift) ----
    console.log("\n--- Test 8: POST Shifts (Update) ---");
    const postShiftUpdateReq = new Request("http://localhost/api/cronograma/overtime/shifts", {
      method: "POST",
      body: JSON.stringify({
        id: createdShiftId,
        weekendStartDate: testWeekendStartDate,
        agentId,
        date: "2026-10-10",
        startTime: "10:00",
        endTime: "14:00"
      })
    });
    const postShiftUpdateRes = await postShifts({ request: postShiftUpdateReq } as any);
    const postShiftUpdateData = await postShiftUpdateRes.json();
    console.log("Response status:", postShiftUpdateRes.status);
    console.log("Response body:", postShiftUpdateData);
    if (postShiftUpdateRes.status !== 200) throw new Error("Expected status 200");

    // Verify shift update
    const getShiftsRes3 = await getShifts({ url: getShiftsUrl } as any);
    const getShiftsData3 = await getShiftsRes3.json();
    console.log("Updated shifts in DB:", getShiftsData3);
    if (getShiftsData3[0].startTime !== "10:00") throw new Error("Expected updated start time '10:00'");
    if (getShiftsData3[0].endTime !== "14:00") throw new Error("Expected updated end time '14:00'");

    // ---- Test 9: DELETE Shifts (Delete shift) ----
    console.log("\n--- Test 9: DELETE Shifts ---");
    const deleteShiftReq = new Request("http://localhost/api/cronograma/overtime/shifts", {
      method: "DELETE",
      body: JSON.stringify({ id: createdShiftId })
    });
    const deleteShiftRes = await deleteShifts({ request: deleteShiftReq } as any);
    const deleteShiftData = await deleteShiftRes.json();
    console.log("Response status:", deleteShiftRes.status);
    console.log("Response body:", deleteShiftData);
    if (deleteShiftRes.status !== 200) throw new Error("Expected status 200");

    // Verify deletion
    const getShiftsRes4 = await getShifts({ url: getShiftsUrl } as any);
    const getShiftsData4 = await getShiftsRes4.json();
    console.log("Shifts in DB after deletion:", getShiftsData4);
    if (getShiftsData4.length !== 0) throw new Error("Expected shifts to be empty after deletion");

    console.log("\nAll tests passed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
    process.exitCode = 1;
  } finally {
    console.log("\nCleaning up test data...");
    try {
      await db.delete(weekendOvertimeConfig).where(eq(weekendOvertimeConfig.weekendStartDate, testWeekendStartDate));
      await db.delete(weekendOvertimeShifts).where(eq(weekendOvertimeShifts.weekendStartDate, testWeekendStartDate));
      if (tempAgentCreated) {
        await db.delete(agents).where(eq(agents.id, agentId));
        console.log("Deleted temporary agent");
      }
      console.log("Cleanup complete!");
    } catch (cleanupError) {
      console.error("Error during cleanup:", cleanupError);
    }
  }
}

runTests();
