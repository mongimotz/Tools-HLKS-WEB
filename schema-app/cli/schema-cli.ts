// SPDX-License-Identifier: AGPL-3.0-or-later
// schema-cli: validate, render, ops, notes, resolve, new. Same model, renderer and ops as the editor.
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseText } from '../src/model/migrate.ts';
import { SchemaError } from '../src/model/schema.ts';
import { serialize } from '../src/model/serialize.ts';
import { validate } from '../src/model/validate.ts';
import { renderSchema } from '../src/render/render.ts';
import { parseStyle, setActiveStyle } from '../src/render/style.ts';
import { TEMPLATES } from '../src/model/templates.ts';
import { svgToPng } from './png.ts';
import { checkDrawing } from '../src/layout/check.ts';
import { applyOps, parseOps } from '../src/ops/ops.ts';
import type { Issue } from '../src/model/types.ts';

const USAGE = `schema-cli <command>
  validate <file>                       check file and topology (exit 1 on errors)
  render <file> -o <out.png|.svg> [--mono] [--grid] [--style style.json] [--dpi 150] [--crop x,y,w,h (mm)]
  ops <file> <ops.json> [--dry-run]     apply operations (atomic), then layout + validation; writes the file
  notes <file> [--open]                 list notes
  resolve <file> <noteId> "Antwort"     mark a note as done with a reply
  new <file> [--template ${Object.keys(TEMPLATES).join('|')}] [--title "…"]
`;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function load(file: string) {
  return parseText(await readFile(file, 'utf8'));
}

function printIssues(issues: Issue[]) {
  for (const i of issues) console.log(`${i.severity === 'error' ? 'FEHLER ' : 'WARNUNG'} ${i.path}: ${i.message}`);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, file, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(USAGE);
    return 0;
  }
  if (!file) {
    console.error(USAGE);
    return 2;
  }
  switch (cmd) {
    case 'validate': {
      const s = await load(file);
      const issues = validate(s);
      issues.push(...checkDrawing(renderSchema(s)));
      printIssues(issues);
      const n = issues.filter((i) => i.severity === 'error').length;
      console.log(`${n} Fehler, ${issues.length - n} Warnungen.`);
      return n ? 1 : 0;
    }
    case 'render': {
      const s = await load(file);
      const styleFile = arg(rest, '--style');
      if (styleFile) setActiveStyle(parseStyle(JSON.parse(await readFile(styleFile, 'utf8'))));
      const out = arg(rest, '-o') ?? file.replace(/\.schema$/, '') + '.png';
      const r = renderSchema(s, { mono: rest.includes('--mono'), grid: rest.includes('--grid') });
      const crop = arg(rest, '--crop');
      if (crop) {
        const [x, y, w, h] = crop.split(',').map(Number);
        r.svg = r.svg.replace(
          /width="[^"]+" height="[^"]+" viewBox="[^"]+"/,
          `width="${w}mm" height="${h}mm" viewBox="${x} ${y} ${w} ${h}"`,
        );
      }
      const ext = extname(out).toLowerCase();
      if (ext === '.svg') await writeFile(out, r.svg);
      else if (ext === '.png') await writeFile(out, svgToPng(r.svg, Number(arg(rest, '--dpi') ?? 150)));
      else throw new Error(`Unbekanntes Ausgabeformat ${ext} (png, svg)`);
      console.log(`→ ${out}`);
      return 0;
    }
    case 'ops': {
      const opsFile = rest[0];
      if (!opsFile) throw new Error('ops: Datei mit Operationen fehlt.');
      const s = await load(file);
      const r = applyOps(s, parseOps(JSON.parse(await readFile(opsFile, 'utf8'))));
      const issues = [...validate(r.schema), ...checkDrawing(renderSchema(r.schema))];
      printIssues(issues);
      const n = issues.filter((i) => i.severity === 'error').length;
      if (r.suggestion) console.log(`HINWEIS ${r.suggestion}`);
      if (n) {
        console.log(`${n} Fehler: Datei nicht geschrieben.`);
        return 1;
      }
      if (!rest.includes('--dry-run')) await writeFile(file, serialize(r.schema));
      console.log(
        `${rest.includes('--dry-run') ? '(Probelauf) ' : ''}neu: ${r.added.join(', ') || '–'} | geändert: ${r.changed.join(', ') || '–'} | entfernt: ${r.removed.join(', ') || '–'}`,
      );
      return 0;
    }
    case 'notes': {
      const s = await load(file);
      const list = s.notes.filter((n) => !rest.includes('--open') || n.status === 'open');
      for (const n of list) {
        const at =
          'component' in n.anchor
            ? n.anchor.component
            : 'connection' in n.anchor
              ? n.anchor.connection
              : `[${n.anchor.pos.join(', ')}]`;
        console.log(
          `${n.id} [${n.status === 'open' ? 'offen' : 'erledigt'}] @${at}: ${n.text}${n.reply ? `\n    → ${n.reply}` : ''}`,
        );
      }
      console.log(`${list.length} Anmerkung(en).`);
      return 0;
    }
    case 'resolve': {
      const [id, reply] = rest;
      if (!id) throw new Error('resolve: ID der Anmerkung fehlt.');
      const s = await load(file);
      const r = applyOps(s, [{ op: 'resolve_note', id, reply }]);
      await writeFile(file, serialize(r.schema));
      console.log(`${id} erledigt.`);
      return 0;
    }
    case 'new': {
      const t = arg(rest, '--template') ?? 'empty';
      const make = TEMPLATES[t];
      if (!make) throw new Error(`Unbekannte Vorlage "${t}". Vorhanden: ${Object.keys(TEMPLATES).join(', ')}`);
      const s = make(arg(rest, '--title'));
      await writeFile(file, serialize(s), { flag: rest.includes('--force') ? 'w' : 'wx' });
      console.log(`→ ${file}`);
      return 0;
    }
    default:
      console.error(`Unbekannter Befehl "${cmd}".\n${USAGE}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    if (e instanceof SchemaError) {
      console.error(`FEHLER ${e.message}`);
      for (const i of e.issues) console.error(`  ${i.path}: ${i.message}`);
    } else console.error(`FEHLER ${(e as Error).message}`);
    process.exit(1);
  },
);
