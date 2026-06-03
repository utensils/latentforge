import type { ToolDefinition, AgentToolResult } from "@mariozechner/pi-coding-agent";

export type { AgentToolResult } from "@mariozechner/pi-coding-agent";

/** Tool result details shape */
export interface ToolResultDetails {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Create a pi SDK ToolDefinition from a function.
 * Wraps plain functions into proper ToolDefinition objects.
 */
export function createTool<TParams extends Record<string, unknown>>(
  name: string,
  label: string,
  description: string,
  paramsSchema: Record<string, unknown>,
  handler: (params: TParams) => Promise<AgentToolResult<ToolResultDetails>>,
): ToolDefinition {
  return {
    name,
    label,
    description,
    parameters: paramsSchema as any,
    execute: async (
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: unknown,
      _onUpdate: unknown,
      _ctx: unknown,
    ) => {
      return handler(params as TParams);
    },
  };
}

/**
 * Build a text result for a tool execution.
 */
export function textResult(
  text: string,
  details: Record<string, unknown> = {},
): AgentToolResult<ToolResultDetails> {
  return {
    content: [{ type: "text" as const, text }],
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
