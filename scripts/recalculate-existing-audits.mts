import { db } from "../src/db/index.js";
import { qualityAudits, auditScores, auditParameters } from "../src/db/schema.js";
import { calculateMultiChannelAuditScores } from "../src/lib/qualityCalculator.js";
import type { ChannelType } from "../src/types/quality.js";
import { eq, and } from "drizzle-orm";

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== RECALCULATE EXISTING AUDITS (${isApply ? "APPLY MODE" : "DRY RUN"}) ===\n`);

  const audits = await db.select().from(qualityAudits);
  const allDbParams = await db.select().from(auditParameters);
  const paramById = new Map(allDbParams.map((p) => [p.id, p]));

  for (const audit of audits) {
    const channel = (audit.channelType || "wise_call") as ChannelType;
    let hasSection2 = true;
    if (channel === "wise_call") {
      hasSection2 = audit.appliesMda ?? true;
    } else if (channel === "wise_email") {
      hasSection2 = Boolean(audit.appliesMda);
    } else if (channel === "invgate_ticket") {
      hasSection2 = Boolean(audit.staysInMda);
    }

    const channelParams = await db
      .select()
      .from(auditParameters)
      .where(
        and(
          eq(auditParameters.channel, channel),
          eq(auditParameters.active, true),
        ),
      )
      .orderBy(auditParameters.order);

    const existingScores = await db
      .select()
      .from(auditScores)
      .where(eq(auditScores.auditId, audit.id));

    const codeScores = new Map<string, boolean>();
    for (const s of existingScores) {
      const p = paramById.get(s.parameterId);
      if (p) {
        codeScores.set(p.code, Boolean(s.score));
      }
    }

    const compliantCodes = new Set<string>();
    const newScoresToInsert: { parameterId: number; score: boolean; comment: string | null }[] = [];

    const applicableParams = hasSection2
      ? channelParams
      : channelParams.filter((p) => p.section === "items");

    for (const p of applicableParams) {
      let isCompliant = true;
      if (codeScores.has(p.code)) {
        isCompliant = codeScores.get(p.code)!;
      } else {
        // If not in codeScores:
        // In Section 2, if old audit had section2Score = 100, then all ticket params were PASS
        if (p.section !== "items") {
          isCompliant = audit.section2Score === 100;
        } else {
          isCompliant = true;
        }
      }

      if (isCompliant) {
        compliantCodes.add(p.code);
      }
      newScoresToInsert.push({
        parameterId: p.id,
        score: isCompliant,
        comment: null,
      });
    }

    const { section1Score, section2Score, totalScore } =
      calculateMultiChannelAuditScores(
        channel,
        channelParams,
        compliantCodes,
        hasSection2,
        audit.isReclamoNovedad,
      );

    console.log(`Audit #${audit.id} (Call: ${audit.callId}, Ch: ${channel}):`);
    console.log(`  BEFORE: S1=${audit.section1Score}, S2=${audit.section2Score}, Total=${audit.totalScore}, OldScoresCount=${existingScores.length}`);
    console.log(`  AFTER:  S1=${section1Score}, S2=${section2Score}, Total=${totalScore}, NewScoresCount=${newScoresToInsert.length}`);
    console.log(`  Params:`);
    for (const s of newScoresToInsert) {
      const p = paramById.get(s.parameterId);
      console.log(`    ${p?.code} (${p?.name}): ${s.score ? "PASS" : "FAIL"}`);
    }

    if (isApply) {
      await db.transaction((tx) => {
        tx.update(qualityAudits)
          .set({
            section1Score,
            section2Score,
            totalScore,
            appliesMda: channel === "wise_call" ? hasSection2 : audit.appliesMda,
          })
          .where(eq(qualityAudits.id, audit.id))
          .run();

        tx.delete(auditScores)
          .where(eq(auditScores.auditId, audit.id))
          .run();

        for (const item of newScoresToInsert) {
          tx.insert(auditScores)
            .values({
              auditId: audit.id,
              parameterId: item.parameterId,
              score: item.score,
              comment: item.comment,
            })
            .run();
        }
      });
      console.log(`  [APPLIED] Audit #${audit.id} successfully updated in DB.\n`);
    } else {
      console.log(`  [DRY-RUN] No changes written to DB.\n`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
