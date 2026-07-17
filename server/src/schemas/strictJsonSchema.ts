/**
 * Normalize JSON Schema for Groq strict mode:
 * - additionalProperties: false on all objects
 * - all property keys listed in required
 */
export function normalizeForStrictMode(
  schema: Record<string, unknown>
): Record<string, unknown> {
  return normalizeNode(schema) as Record<string, unknown>;
}

function normalizeNode(node: unknown): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return node;
  }

  const obj = { ...(node as Record<string, unknown>) };

  if (obj.type === "object" && obj.properties) {
    const properties = obj.properties as Record<string, unknown>;
    const normalizedProps: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      normalizedProps[key] = normalizeNode(value);
    }

    obj.properties = normalizedProps;
    obj.additionalProperties = false;
    obj.required = Object.keys(normalizedProps);
  }

  if (obj.type === "array" && obj.items) {
    obj.items = normalizeNode(obj.items);
  }

  if (Array.isArray(obj.anyOf)) {
    obj.anyOf = obj.anyOf.map(normalizeNode);
  }
  if (Array.isArray(obj.oneOf)) {
    obj.oneOf = obj.oneOf.map(normalizeNode);
  }
  if (Array.isArray(obj.allOf)) {
    obj.allOf = obj.allOf.map(normalizeNode);
  }

  return obj;
}
