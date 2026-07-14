export const TInvoiceSchema = {
  type: "object",
  properties: {
    invoiceNumber: { type: "string" },
    invoiceDate: { type: "string" },
    dueDate: { type: "string" },
    vendor: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
      },
      required: ["name", "email", "address"],
      additionalProperties: false,
    },
    customer: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
      },
      required: ["name", "email", "address"],
      additionalProperties: false,
    },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          total: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice", "total"],
        additionalProperties: false,
      },
    },
    subtotal: { type: "number" },
    gstRate: { type: "number" },
    tax: { type: "number" },
    total: { type: "number" },
    currency: { type: "string" },
    notes: { type: "string" },
  },
  required: [
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "vendor",
    "customer",
    "lineItems",
    "subtotal",
    "gstRate",
    "tax",
    "total",
    "currency",
    "notes",
  ],
  additionalProperties: false,
};

export const TResumeSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    location: { type: "string" },
    summary: { type: "string" },
    links: {
      type: "object",
      properties: {
        linkedin: { type: "string" },
        github: { type: "string" },
      },
      required: ["linkedin", "github"],
      additionalProperties: false,
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          position: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          description: { type: "string" },
        },
        required: [
          "company",
          "position",
          "startDate",
          "endDate",
          "description",
        ],
        additionalProperties: false,
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" },
          degree: { type: "string" },
          graduationDate: { type: "string" },
        },
        required: ["school", "degree", "graduationDate"],
        additionalProperties: false,
      },
    },
    skills: { type: "array", items: { type: "string" } },
  },
  required: [
    "name",
    "email",
    "phone",
    "location",
    "summary",
    "links",
    "experience",
    "education",
    "skills",
  ],
  additionalProperties: false,
};

export const TMeetingNotesSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    date: { type: "string" },
    attendees: { type: "array", items: { type: "string" } },
    agenda: { type: "array", items: { type: "string" } },
    keyPoints: { type: "array", items: { type: "string" } },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          task: { type: "string" },
          owner: { type: "string" },
          dueDate: { type: "string" },
        },
        required: ["task", "owner", "dueDate"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: [
    "title",
    "date",
    "attendees",
    "agenda",
    "keyPoints",
    "actionItems",
    "notes",
  ],
  additionalProperties: false,
};
