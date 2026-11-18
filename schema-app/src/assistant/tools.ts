// SPDX-License-Identifier: AGPL-3.0-or-later
// The one tool the model gets: a list of operations (the same vocabulary as `cli ops`), applied atomically.
import { z } from 'zod';
import { opSchema } from '../ops/ops.ts';
import type { ToolDef } from './client.ts';

export const TOOL_NAME = 'apply_operations';

function parameters(): object {
  const j = z.toJSONSchema(z.object({ ops: z.array(opSchema).min(1) }), {
    io: 'input',
    target: 'draft-7',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete j.$schema;
  // Some providers reject "oneOf"; "anyOf" means the same here (the op field tells the cases apart).
  return JSON.parse(JSON.stringify(j).replaceAll('"oneOf"', '"anyOf"'));
}

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME,
      description:
        'Applies a list of operations to the schema, atomically: the first invalid operation aborts the whole list ' +
        'and nothing changes. Returns the new IDs and the validation result. Call it again to fix errors.',
      parameters: parameters(),
    },
  },
];
