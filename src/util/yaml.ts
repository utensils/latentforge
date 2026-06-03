import yaml from "yaml";

/**
 * Serialize to YAML string (equivalent to Python yaml.dump()).
 */
export function dump(
  obj: Record<string, unknown>,
  opts?: { defaultFlowStyle?: boolean; sortKeys?: boolean },
): string {
  return yaml.stringify(obj, { lineWidth: opts?.defaultFlowStyle === false ? 0 : 80 });
}

export const { stringify } = yaml;
