import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { db } from "./index"
import { titles, titleCategory } from "./schema";

const filePath = path.join(process.cwd(), "src/data/titulos.csv");
const csv = fs.readFileSync(filePath, "utf8");

type CsvRow = {
    name: string;
    category: string;
    icon: string;
    tone: string;
}

async function seedTitles() {

    console.log("Iniciando inserción de títulos...");
    const rows = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    }) as CsvRow[];

    const uniqueCategories = new Map<
        string,
        {
            icon: string;
            tone: string;
        }
    >();

    for (const row of rows) {
        if (!uniqueCategories.has(row.category)) {
            uniqueCategories.set(row.category, {
                icon: row.icon,
                tone: row.tone,
            });
        }
    }

    for (const [name, values] of uniqueCategories) {
        await db
            .insert(titleCategory)
            .values({
                name,
                icon: values.icon,
                tone: values.tone,
            })
            .onConflictDoNothing();
    }

    const categories = await db
        .select()
        .from(titleCategory);

    const categoryMap = new Map(
        categories.map(c => [
            c.name,
            c.id
        ])
    );

    for (const row of rows) {

        const categoryId = categoryMap.get(row.category);

        if (!categoryId) continue;

        await db.insert(titles).values({

            name: row.name,

            categoryId,

            route: null,

            description: null,

            articleOnKdb: null,
    

        }).onConflictDoNothing();
    }
}

seedTitles();