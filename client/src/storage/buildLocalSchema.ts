import { FieldDefinition } from "../types/index";

export function buildLocalSchemaPayload(
  id: string,
  name: string,
  description: string,
  fieldDefinitions: FieldDefinition[],
  prompt: string
) {
  return {
    id,
    name,
    description,
    jsonSchema: buildMinimalJsonSchema(fieldDefinitions),
    prompt,
    fieldDefinitions,
    isBuiltin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function fieldJsonType(field: FieldDefinition): Record<string, unknown> {
  switch (field.type) {
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      if (field.itemType === "number") return { type: "array", items: { type: "number" } };
      if (field.itemType === "string") return { type: "array", items: { type: "string" } };
      if (field.items?.length) {
        return {
          type: "array",
          items: {
            type: "object",
            properties: Object.fromEntries(
              field.items.map((item) => [item.key, fieldJsonType(item)])
            ),
          },
        };
      }
      return { type: "array", items: { type: "string" } };
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          (field.properties ?? []).map((prop) => [prop.key, fieldJsonType(prop)])
        ),
      };
    default:
      return { type: "string" };
  }
}

function buildMinimalJsonSchema(
  fieldDefinitions: FieldDefinition[]
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of fieldDefinitions) {
    properties[field.key] = fieldJsonType(field);
    if (field.required !== false) {
      required.push(field.key);
    }
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
