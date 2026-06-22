import { runIncidentWorkflow } from "./agents/incidentWorkflow";

async function main() {
  // Test 1: Complete report — should converge
  console.log("=== TEST 1: Complete incident report ===");
  const result1 = await runIncidentWorkflow({
    reportedBy: "Nurse Jane Smith",
    residentName: "Margaret Johnson",
    dateTime: "2026-06-22T14:30:00Z",
    description:
      "Resident was found on the floor next to her bed. She attempted to get up without her walker.",
    witnessNames: "CNA Robert Torres",
    immediateActionTaken:
      "Assisted resident back to bed, checked for injuries, vital signs taken and stable, physician notified.",
  });

  console.log("\n--- AUDIT TRAIL TEST 1 ---");
  console.log(JSON.stringify(result1, null, 2));

  // Test 2: Incomplete report — should hit loop guard
  console.log(
    "\n\n=== TEST 2: Incomplete incident report (loop guard test) ===",
  );
  const result2 = await runIncidentWorkflow({
    reportedBy: "Staff Member",
    residentName: "John Doe",
    dateTime: "2026-06-22T10:00:00Z",
    description: "Something happened.",
  });

  console.log("\n--- AUDIT TRAIL TEST 2 ---");
  console.log(JSON.stringify(result2, null, 2));
}

main();
