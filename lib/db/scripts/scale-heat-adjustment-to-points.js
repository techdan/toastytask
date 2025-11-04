#!/usr/bin/env node

/**
 * Heat Adjustment Scaling Script
 *
 * Converts existing heat_adjustment values from the legacy ±0.45 scale
 * to the new ±45 point scale and updates the column constraint/comment.
 *
 * Usage:
 *   node lib/db/scripts/scale-heat-adjustment-to-points.js
 */

let dotenv;
try {
  dotenv = require("dotenv");
} catch {
  // dotenv optional
}

if (dotenv) {
  dotenv.config();
  if (!process.env.DATABASE_URL) {
    const altEnvs = [".env.local", ".env.development", ".env.example"];
    for (const path of altEnvs) {
      try {
        dotenv.config({ path, override: false });
        if (process.env.DATABASE_URL) break;
      } catch {
        // ignore missing files
      }
    }
  }
}

const { Pool } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    const constraintResult = await client.query(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'tasks_heat_adjustment_check'
       LIMIT 1`
    );
    const constraintDefinition = constraintResult.rows[0]?.definition ?? "";
    const constraintUsesLegacyScale = constraintDefinition.includes("0.45");

    const maxResult = await client.query(
      `SELECT MAX(ABS(heat_adjustment)) AS max_abs
       FROM tasks
       WHERE heat_adjustment IS NOT NULL`
    );
    const maxAbs = Number(maxResult.rows[0]?.max_abs ?? 0);
    const valuesUseLegacyScale = Number.isFinite(maxAbs) && maxAbs <= 0.45;

    if (!constraintUsesLegacyScale && !valuesUseLegacyScale) {
      console.log("Heat adjustment constraint and values already use point scale. No changes made.");
      return;
    }

    await client.query("BEGIN");

    if (constraintUsesLegacyScale) {
      console.log("Dropping legacy heat adjustment constraint...");
      await client.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_adjustment_check;`);
    }

    if (valuesUseLegacyScale) {
      console.log("Scaling heat_adjustment values from ±0.45 to ±45 (x100)...");
      await client.query(`UPDATE tasks SET heat_adjustment = heat_adjustment * 100;`);
    }

    if (constraintUsesLegacyScale) {
      console.log("Adding updated heat adjustment constraint (±45)...");
      await client.query(
        `ALTER TABLE tasks
         ADD CONSTRAINT tasks_heat_adjustment_check
         CHECK (heat_adjustment >= -45 AND heat_adjustment <= 45);`
      );

      console.log("Updating heat_adjustment column comment...");
      await client.query(
        `COMMENT ON COLUMN tasks.heat_adjustment IS 'Heat v4: Direct heat adjustment in points (-45 to +45).'`
      );
    }

    await client.query("COMMIT");
    console.log("Heat adjustment scaling completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to scale heat adjustment values:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Unexpected error running heat adjustment scaling script:", error);
  process.exitCode = 1;
});
