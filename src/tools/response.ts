import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { ToolDetails } from "../types.js";
import { defineTool } from "@mariozechner/pi-coding-agent";
import type { Static, TSchema } from "typebox";

export type { AgentToolResult } from "@mariozechner/pi-agent-core";
export type { TSchema, Static } from "typebox";

/**
 * Build a text result for a tool execution.
 */
export function textResult(
  text: string,
  details: Record<string, unknown> = {},
): AgentToolResult<ToolDetails> {
  return {
    content: [{ type: "text", text }],
    details: { ok: true, ...details },
  };
}

/**
 * Throw an error for tool failures.
 * pi tool errors should be thrown, not returned.
 */
export function throwToolError(message: string): never {
  throw new Error(message);
}

/**
 * Create a properly-typed ToolDefinition from a tool configuration.
 * Wraps with defineTool() from the pi SDK.
 */
export function createTool<T extends TSchema, D = ToolDetails>(config: {
  name: string;
  label: string;
  description: string;
  parameters: T;
  handler: (params: Static<T>) => Promise<AgentToolResult<D>>;
}): ToolDefinition<T, D> {
  return defineTool<T, D>({
    name: config.name,
    label: config.label,
    description: config.description,
    parameters: config.parameters,
    execute: async (
      _toolCallId: string,
      params: Static<T>,
       _signal: AbortSignal | undefined,
      _onUpdate: (p: AgentToolResult<D>) => void | undefined,
       _ctx: unknown,
    ) => {
      return config.handler(params);
    },
   });
}
